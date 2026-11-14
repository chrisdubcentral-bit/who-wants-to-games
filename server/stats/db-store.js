// Site statistics storage in Netlify Database. Tables: netlify/database/migrations/0002_create-stats.sql.
// server/stats/memory-store.js has the same methods in memory, for the tests and the local dev server.

import { getDatabase } from '@netlify/database';

const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export function createStatsDbStore() {
  let sql = null;
  const db = () => (sql ??= getDatabase().sql);

  return {
    async getSession(id) {
      const [r] = await db()`SELECT id, edition, day::text AS day, events FROM stats_sessions WHERE id = ${id}`;
      return r ? { id: r.id, edition: r.edition, day: day(r.day), events: r.events } : null;
    },

    async countVisitorSessions(visitor, onDay) {
      const [r] = await db()`SELECT count(*)::int AS n FROM stats_sessions WHERE visitor = ${visitor} AND day = ${onDay}`;
      return r?.n ?? 0;
    },

    async createSession(s) {
      await db()`
        INSERT INTO stats_sessions (id, edition, day, visitor, device, source, country, region)
        VALUES (${s.id}, ${s.edition}, ${s.day}, ${s.visitor}, ${s.device}, ${s.source}, ${s.country}, ${s.region})
        ON CONFLICT (id) DO NOTHING`;
    },

    async touchSession(id, activeMs, addEvents) {
      await db()`
        UPDATE stats_sessions
        SET active_ms = GREATEST(active_ms, ${activeMs}), last_seen = now(), events = events + ${addEvents}
        WHERE id = ${id}`;
    },

    async insertEvents(rows) {
      for (const e of rows) {
        await db()`
          INSERT INTO stats_events (session_id, edition, day, type, advert, stage, season, value, detail)
          VALUES (${e.sessionId}, ${e.edition}, ${e.day}, ${e.type}, ${e.advert}, ${e.stage}, ${e.season}, ${e.value}, ${e.detail})`;
      }
    },

    async sessionsBetween(edition, from, to) {
      const rows = await db()`
        SELECT id, day::text AS day, active_ms, visitor, device, source, country, region FROM stats_sessions
        WHERE edition = ${edition} AND day BETWEEN ${from} AND ${to}`;
      return rows.map((r) => ({ id: r.id, day: day(r.day), activeMs: r.active_ms, visitor: r.visitor, device: r.device, source: r.source, country: r.country, region: r.region }));
    },

    async eventsBetween(edition, from, to) {
      const rows = await db()`
        SELECT session_id, day::text AS day, type, advert, stage, season, value, detail FROM stats_events
        WHERE edition = ${edition} AND day BETWEEN ${from} AND ${to}`;
      return rows.map((r) => ({ sessionId: r.session_id, day: day(r.day), type: r.type, advert: r.advert, stage: r.stage, season: r.season, value: r.value, detail: r.detail }));
    },

    async prune(beforeDay) {
      await db()`DELETE FROM stats_events WHERE day < ${beforeDay}`;
      await db()`DELETE FROM stats_sessions WHERE day < ${beforeDay}`;
    },
  };
}
