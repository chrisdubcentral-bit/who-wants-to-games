// The Top 100's storage in Netlify Database (Postgres). Tables: netlify/database/migrations/.
// tests/server/memory-store.mjs implements the same methods in memory for the tests.

import { getDatabase } from '@netlify/database';

const iso = (v) => (v == null ? null : new Date(v).toISOString());

const fromRow = (r) => ({
  id: r.id,
  name: r.name,
  town: r.town,
  result: r.result,
  cups: r.cups,
  season: r.season,
  stageKey: r.stage_key,
  stageReachedIndex: r.stage_reached_index,
  correctCount: r.correct_count,
  roundsPlayed: r.rounds_played,
  lifelineUsed: r.lifeline_used,
  durationMs: r.duration_ms,
  hidden: r.hidden,
  updatedAt: iso(r.updated_at),
});

export function createDbStore() {
  let sql = null;
  const db = () => (sql ??= getDatabase().sql);

  return {
    async createRun({ token, edition, ipHash, createdAt }) {
      await db()`INSERT INTO top100_runs (token, edition, ip_hash, created_at)
                 VALUES (${token}, ${edition}, ${ipHash}, ${createdAt})`;
    },

    async countRecentRuns(ipHash, sinceIso) {
      const [r] = await db()`SELECT count(*)::int AS n FROM top100_runs
                             WHERE ip_hash = ${ipHash} AND created_at > ${sinceIso}`;
      return r?.n ?? 0;
    },

    async getRun(token) {
      const [r] = await db()`SELECT edition, created_at, submits FROM top100_runs WHERE token = ${token}`;
      return r ? { edition: r.edition, createdAt: iso(r.created_at), submits: r.submits } : null;
    },

    async bumpSubmits(token) {
      await db()`UPDATE top100_runs SET submits = submits + 1 WHERE token = ${token}`;
    },

    async pruneRuns(beforeIso) {
      await db()`DELETE FROM top100_runs WHERE created_at < ${beforeIso}`;
    },

    async listEntries(edition, board, { includeHidden, limit }) {
      const rows = includeHidden
        ? await db()`SELECT * FROM top100_entries WHERE edition = ${edition} AND board = ${board}
                     ORDER BY cups DESC, correct_count DESC, lifeline_used, duration_ms, updated_at LIMIT ${limit}`
        : await db()`SELECT * FROM top100_entries WHERE edition = ${edition} AND board = ${board} AND NOT hidden
                     ORDER BY cups DESC, correct_count DESC, lifeline_used, duration_ms, updated_at LIMIT ${limit}`;
      return rows.map(fromRow);
    },

    async getEntryByToken(token) {
      const [r] = await db()`SELECT * FROM top100_entries WHERE run_token = ${token}`;
      return r ? fromRow(r) : null;
    },

    /** Inserts the run's entry, or replaces it if the run already has one. Returns the row id. */
    async saveEntry(e) {
      const [r] = await db()`
        INSERT INTO top100_entries
          (edition, board, run_token, name, town, result, cups, season, stage_key, stage_reached_index,
           correct_count, rounds_played, lifeline_used, duration_ms, ip_hash, updated_at)
        VALUES
          (${e.edition}, ${e.board}, ${e.runToken}, ${e.name}, ${e.town}, ${e.result}, ${e.cups}, ${e.season},
           ${e.stageKey}, ${e.stageReachedIndex}, ${e.correctCount}, ${e.roundsPlayed}, ${e.lifelineUsed},
           ${e.durationMs}, ${e.ipHash}, ${e.updatedAt})
        ON CONFLICT (run_token) DO UPDATE SET
          name = EXCLUDED.name, town = EXCLUDED.town, result = EXCLUDED.result, cups = EXCLUDED.cups,
          season = EXCLUDED.season, stage_key = EXCLUDED.stage_key,
          stage_reached_index = EXCLUDED.stage_reached_index, correct_count = EXCLUDED.correct_count,
          rounds_played = EXCLUDED.rounds_played, lifeline_used = EXCLUDED.lifeline_used,
          duration_ms = EXCLUDED.duration_ms, updated_at = EXCLUDED.updated_at
        RETURNING id`;
      return r.id;
    },

    async setHidden(id, hidden) {
      await db()`UPDATE top100_entries SET hidden = ${hidden} WHERE id = ${id}`;
    },
  };
}
