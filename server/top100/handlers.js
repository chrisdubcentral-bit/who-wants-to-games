// The online Top 40's request handling, kept separate from Netlify and the storage
// so it can be tested with an in-memory store (tests/server/handlers.test.mjs).
//
// Each handler returns { status, body }. netlify/functions/top100.mjs turns that into a Response.

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { compareEntries, LIMIT } from '../../engine/js/game/ranking.js';
import { checkResult, cleanName, cleanTown, MIN_MS_PER_ROUND } from './validate.js';

// Change this to start a fresh, empty board. Older boards stay in storage under their old name.
export const BOARD = 'launch';

const HOUR = 3600 * 1000;
export const LIMITS = {
  submitsPerHourPerIp: 120, // entries saved from one connection in an hour (a champion's is updated each season)
  runMaxAgeMs: 3 * 24 * HOUR,
  timeSlackMs: 5000,        // network delay between the game starting and the token being made
  keep: LIMIT * 3,          // entries kept beyond the board, so hiding or blocking one lets the next move up
  saveAttempts: 5,          // tries when another entry is saved at the same moment
};

// A run token is "<run id>.<start time in ms>.<signature>". The signature proves the server issued it, so starting
// a game needs no storage at all, and most games never reach the board.
const RUN_TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{13})\.([A-Za-z0-9_-]{43})$/;

const MESSAGES = {
  name: `That name or town can't be used on the Top ${LIMIT}. Please choose another.`,
  characters: "Names and towns can only use letters, numbers, spaces and - ' . & , ( )",
  link: "Names and towns can't include links.",
  invalid: "That result doesn't look right, so it can't be added.",
  'no-run': `This game couldn't connect to the online Top ${LIMIT} when it started, so it can't be added.`,
  expired: `This game is too old to add to the Top ${LIMIT}.`,
  busy: 'Too many attempts. Please wait a while and try again.',
};

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error, extra = {}) => ({ status, body: { ok: false, error, message: MESSAGES[error], ...extra } });

export function createHandlers({ store, wordFilter, editions, adminKey = '', ipSalt = '', now = () => Date.now(), log = () => {} }) {
  const hashIp = (ip) => createHash('sha256').update(`${ipSalt}:${ip ?? 'unknown'}`).digest('hex').slice(0, 32);
  /** The UTC hour as 'YYYY-MM-DDTHH', for the per-hour submit counters. */
  const hourKey = (ms = now()) => new Date(ms).toISOString().slice(0, 13);

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

  /** Stored rows in board order (compareEntries ranks by date as the tie-break; rows keep it as updatedAt). */
  const byRank = (a, b) => compareEntries({ ...a, date: a.updatedAt }, { ...b, date: b.updatedAt });

  /** Keeps every hidden row (so the admin can show it again) and the best LIMITS.keep of the rest. */
  const trim = (rows) => {
    let kept = 0;
    return [...rows].sort(byRank).filter((r) => r.hidden || kept++ < LIMITS.keep);
  };

  /** The visible board from stored rows: not hidden by the admin, and passing the current word list. */
  const visibleRows = (rows, edition) => rows
    .filter((row) => !row.hidden && !nameProblem(row, edition))
    .map((row) => toPublic(row, editions[edition]))
    .sort(compareEntries)
    .slice(0, LIMIT);

  async function visibleBoard(edition) {
    const { data } = await store.readBoard(edition, BOARD);
    return visibleRows(data.entries, edition);
  }

  /**
   * Reads the board, lets change(entries, data) return the new entries (or null for no change), and saves it.
   * If another request saved in between, it starts again from the new board. Returns the saved data, or null.
   */
  async function updateBoard(edition, change) {
    for (let attempt = 0; attempt < LIMITS.saveAttempts; attempt++) {
      const { data, etag } = await store.readBoard(edition, BOARD);
      const result = change(data.entries, data);
      if (!result) return { data, saved: false };
      const next = { ...data, ...result, entries: trim(result.entries) };
      if (await store.saveBoard(edition, BOARD, next, etag)) return { data: next, saved: true };
    }
    return null;
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

      // Everything above is checked without touching storage, so a refused entry costs almost nothing.
      const ipHash = hashIp(ip);
      if (await store.countSubmit(ipHash, hourKey()) > LIMITS.submitsPerHourPerIp) return fail(429, 'busy');
      if (Math.random() < 0.02) await store.pruneSubmits(hourKey(now() - 2 * HOUR));

      const entry = { ...checked.entry, name, town, updatedAt: new Date(now()).toISOString() };
      let id = null;
      const saved = await updateBoard(edition, (entries, data) => {
        const old = entries.find((e) => e.runToken === run.id);
        id = old?.id ?? data.nextId;
        // A champion who plays on and does worse keeps their earlier, better entry.
        if (old) return byRank(old, entry) > 0 ? { entries: entries.map((e) => (e === old ? { ...old, ...entry } : e)) } : null;
        const row = { id, runToken: run.id, ipHash, hidden: false, createdAt: entry.updatedAt, ...entry };
        return { nextId: data.nextId + 1, entries: [...entries, row] };
      });
      if (!saved) return fail(429, 'busy');

      const board = visibleRows(saved.data.entries, edition);
      const i = board.findIndex((e) => e.id === id);
      return ok({ id, rank: i === -1 ? null : i + 1, board });
    },

    /**
     * GET  /api/top100/admin?edition=celtic          → every entry, with hidden/blocked flags
     * POST /api/top100/admin { edition, id, hidden: boolean } → hide or show an entry
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
        if (body.edition != null && !editions[body.edition]) return fail(400, 'edition');
        // Older admin pages didn't send the edition: look on every board.
        for (const edition of body.edition ? [body.edition] : Object.keys(editions)) {
          const r = await updateBoard(edition, (entries) => (entries.some((e) => e.id === id)
            ? { entries: entries.map((e) => (e.id === id ? { ...e, hidden: body.hidden } : e)) }
            : null));
          if (!r) return fail(429, 'busy');
          if (r.saved) break;
        }
        return ok({});
      }

      const edition = query.edition;
      const ed = editions[edition];
      if (!ed) return fail(400, 'edition');
      const { data } = await store.readBoard(edition, BOARD);
      const entries = data.entries
        .map((row) => ({ ...toPublic(row, ed), hidden: row.hidden, blocked: nameProblem(row, edition)?.reason ?? null }))
        .sort(compareEntries);
      return ok({ board: BOARD, entries });
    },
  };
}
