// The online Top 100's request handling, kept separate from Netlify and the database
// so it can be tested with an in-memory store (tests/server/handlers.test.mjs).
//
// Each handler returns { status, body }. netlify/functions/top100.mjs turns that into a Response.

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { compareEntries, LIMIT } from '../../engine/js/game/ranking.js';
import { checkResult, cleanName, cleanTown, MIN_MS_PER_ROUND } from './validate.js';

// Change this to start a fresh, empty board. Older entries stay in the database under their old board name.
export const BOARD = 'launch';

const HOUR = 3600 * 1000;
export const LIMITS = {
  runsPerHourPerIp: 120,   // different games one connection can enter in an hour
  submitsPerRun: 20,       // a champion's entry is updated after each season
  runMaxAgeMs: 3 * 24 * HOUR,
  pruneRunsAfterMs: 7 * 24 * HOUR,
  timeSlackMs: 5000,       // network delay between the game starting and the token being made
};

// A run token is "<run id>.<start time in ms>.<signature>". The signature proves the server issued it, so starting
// a game needs no database: the database is billed for the time it's awake, and most games never reach the board.
const RUN_TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{13})\.([A-Za-z0-9_-]{43})$/;

const MESSAGES = {
  name: "That name or town can't be used on the Top 100. Please choose another.",
  characters: "Names and towns can only use letters, numbers, spaces and - ' . & , ( )",
  link: "Names and towns can't include links.",
  invalid: "That result doesn't look right, so it can't be added.",
  'no-run': "This game couldn't connect to the online Top 100 when it started, so it can't be added.",
  expired: 'This game is too old to add to the Top 100.',
  busy: 'Too many attempts. Please wait a while and try again.',
};

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error, extra = {}) => ({ status, body: { ok: false, error, message: MESSAGES[error], ...extra } });

export function createHandlers({ store, wordFilter, editions, adminKey = '', ipSalt = '', now = () => Date.now(), log = () => {} }) {
  const hashIp = (ip) => createHash('sha256').update(`${ipSalt}:${ip ?? 'unknown'}`).digest('hex').slice(0, 32);
  const isoAgo = (ms) => new Date(now() - ms).toISOString();

  const tokenSecret = ipSalt || adminKey;
  const signRun = (id, edition, startedAt) => createHmac('sha256', `run-token:${tokenSecret}`)
    .update(`${id}.${edition}.${startedAt}`).digest('base64url');

  /** The run a token stands for, as { id, startedAt }, or null if this server didn't issue it for this edition. */
  function readRunToken(token, edition) {
    const m = tokenSecret && typeof token === 'string' ? RUN_TOKEN.exec(token) : null;
    if (!m) return null;
    const [, id, startedAt, signature] = m;
    const given = Buffer.from(signature);
    const want = Buffer.from(signRun(id, edition, startedAt));
    return given.length === want.length && timingSafeEqual(given, want) ? { id, startedAt: Number(startedAt) } : null;
  }

  const nameProblem = (entry, edition) => {
    for (const field of ['name', 'town']) {
      const c = wordFilter.check(entry[field], edition);
      if (!c.ok) return { field, reason: c.reason };
    }
    return null;
  };

  const toPublic = (row, ed) => ({
    id: row.id,
    name: row.name,
    town: row.town,
    date: row.updatedAt,
    result: row.result,
    cups: row.cups,
    season: row.season,
    stageKey: row.stageKey,
    stageReachedIndex: row.stageReachedIndex,
    stageReachedLabel: ed.stages[row.stageReachedIndex]?.label ?? null,
    correctCount: row.correctCount,
    roundsPlayed: row.roundsPlayed,
    lifelineUsed: row.lifelineUsed,
    durationMs: row.durationMs,
  });

  /** The visible board: not hidden by the admin, and passing the current word list. */
  async function visibleBoard(edition) {
    const ed = editions[edition];
    const rows = await store.listEntries(edition, BOARD, { includeHidden: false, limit: LIMIT * 3 });
    return rows
      .filter((row) => !nameProblem(row, edition))
      .map((row) => toPublic(row, ed))
      .sort(compareEntries)
      .slice(0, LIMIT);
  }

  return {
    /** GET /api/top100?edition=celtic */
    async board({ query }) {
      const edition = query.edition;
      if (!editions[edition]) return fail(400, 'edition');
      return ok({ board: await visibleBoard(edition) });
    },

    /** POST /api/top100/start { edition } → { token } */
    async start({ body, ip }) {
      const edition = body?.edition;
      if (!editions[edition]) return fail(400, 'edition');
      if (!tokenSecret) {
        log('run tokens are off', { why: 'set TOP100_IP_SALT' });
        return fail(503, 'no-run');
      }
      const id = randomUUID();
      const startedAt = now();
      return ok({ token: `${id}.${startedAt}.${signRun(id, edition, startedAt)}` });
    },

    /** POST /api/top100 { edition, token, entry } → { rank, id, board } */
    async submit({ body, ip }) {
      const edition = body?.edition;
      const ed = editions[edition];
      if (!ed) return fail(400, 'edition');
      const run = readRunToken(body?.token, edition);
      if (!run) return fail(403, 'no-run');
      const elapsed = now() - run.startedAt;
      if (elapsed > LIMITS.runMaxAgeMs) return fail(403, 'expired');

      const name = cleanName(body.entry?.name);
      const town = cleanTown(body.entry?.town);
      if (!name || !town) return fail(400, 'name', { field: !name ? 'name' : 'town' });
      const problem = nameProblem({ name, town }, edition);
      if (problem) {
        log('blocked name', { edition, field: problem.field, reason: problem.reason });
        return fail(400, problem.reason === 'word' ? 'name' : problem.reason, { field: problem.field });
      }

      const checked = checkResult(body.entry, ed);
      if (!checked.ok) {
        log('rejected result', { edition, why: checked.why });
        return fail(400, 'invalid');
      }
      // The run must really have lasted long enough for the questions answered.
      if (elapsed + LIMITS.timeSlackMs < checked.entry.roundsPlayed * MIN_MS_PER_ROUND) {
        log('rejected result', { edition, why: 'faster than the run token' });
        return fail(400, 'invalid');
      }

      // Everything above is checked without the database, so a refused entry doesn't wake it.
      const ipHash = hashIp(ip);
      const seen = await store.getRun(run.id);
      const busy = seen
        ? seen.submits >= LIMITS.submitsPerRun
        : await store.countRecentRuns(ipHash, isoAgo(HOUR)) >= LIMITS.runsPerHourPerIp;
      if (busy) return fail(429, 'busy');
      await store.recordSubmit({ token: run.id, edition, ipHash, createdAt: new Date(now()).toISOString() });
      if (Math.random() < 0.02) await store.pruneRuns(isoAgo(LIMITS.pruneRunsAfterMs));

      const entry = { ...checked.entry, name, town, updatedAt: new Date(now()).toISOString() };
      const old = await store.getEntryByToken(run.id);
      let id = old?.id ?? null;
      // A champion who plays on and does worse keeps their earlier, better entry.
      if (!old || compareEntries({ ...old, date: old.updatedAt }, { ...entry, date: entry.updatedAt }) > 0) {
        id = await store.saveEntry({ ...entry, edition, board: BOARD, runToken: run.id, ipHash });
      }

      const board = await visibleBoard(edition);
      const i = board.findIndex((e) => e.id === id);
      return ok({ id, rank: i === -1 ? null : i + 1, board });
    },

    /**
     * GET  /api/top100/admin?edition=celtic          → every entry, with hidden/blocked flags
     * POST /api/top100/admin { id, hidden: boolean } → hide or show an entry
     * Needs the x-admin-key header to match the TOP100_ADMIN_KEY environment variable.
     */
    async admin({ method, query, body, headers }) {
      if (!adminKey) return fail(503, 'admin-off', { message: 'Set TOP100_ADMIN_KEY in Netlify to use the admin page.' });
      const given = Buffer.from(String(headers['x-admin-key'] ?? ''));
      const want = Buffer.from(adminKey);
      if (given.length !== want.length || !timingSafeEqual(given, want)) return fail(401, 'admin-key', { message: 'Wrong admin key.' });

      if (method === 'POST') {
        const id = body?.id;
        if (!Number.isInteger(id) || typeof body.hidden !== 'boolean') return fail(400, 'bad-request');
        await store.setHidden(id, body.hidden);
        return ok({});
      }

      const edition = query.edition;
      const ed = editions[edition];
      if (!ed) return fail(400, 'edition');
      const rows = await store.listEntries(edition, BOARD, { includeHidden: true, limit: 1000 });
      const entries = rows
        .map((row) => ({ ...toPublic(row, ed), hidden: row.hidden, blocked: nameProblem(row, edition)?.reason ?? null }))
        .sort(compareEntries);
      return ok({ board: BOARD, entries });
    },
  };
}
