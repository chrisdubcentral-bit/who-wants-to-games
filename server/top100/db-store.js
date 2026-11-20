// The Top 100's old storage in Netlify Database (Postgres), from before it moved to Netlify Blobs
// (server/top100/blobs-store.js). It's only read once per board, the first time Blobs has no copy of it.
// Tables: netlify/database/migrations/0001_create-top100.sql.

import { getDatabase } from '@netlify/database';

const iso = (v) => (v == null ? null : new Date(v).toISOString());

export function createDbStore() {
  let sql = null;
  const db = () => (sql ??= getDatabase().sql);

  return {
    /** Every entry on a board, as the rows Blobs keeps (private fields included). */
    async exportEntries(edition, board) {
      const rows = await db()`SELECT * FROM top100_entries WHERE edition = ${edition} AND board = ${board}`;
      return rows.map((r) => ({
        id: r.id,
        runToken: r.run_token,
        ipHash: r.ip_hash,
        hidden: r.hidden,
        createdAt: iso(r.created_at),
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
        updatedAt: iso(r.updated_at),
      }));
    },
  };
}
