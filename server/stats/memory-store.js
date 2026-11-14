// Site statistics kept in memory: same methods as db-store.js. Used by the tests and tools/dev-server.mjs.

export function createStatsMemoryStore() {
  const sessions = new Map();
  const events = [];
  return {
    sessions, events,
    async getSession(id) { const s = sessions.get(id); return s ? { ...s } : null; },
    async countVisitorSessions(visitor, day) { return [...sessions.values()].filter((s) => s.visitor === visitor && s.day === day).length; },
    async createSession(s) { if (!sessions.has(s.id)) sessions.set(s.id, { ...s, activeMs: 0, events: 0 }); },
    async touchSession(id, activeMs, addEvents) {
      const s = sessions.get(id);
      if (s) { s.activeMs = Math.max(s.activeMs, activeMs); s.events += addEvents; }
    },
    async insertEvents(rows) { events.push(...rows.map((r) => ({ ...r }))); },
    async sessionsBetween(edition, from, to) {
      return [...sessions.values()].filter((s) => s.edition === edition && s.day >= from && s.day <= to).map((s) => ({ ...s }));
    },
    async eventsBetween(edition, from, to) {
      return events.filter((e) => e.edition === edition && e.day >= from && e.day <= to).map((e) => ({ ...e }));
    },
    async prune(beforeDay) {
      for (const [id, s] of sessions) if (s.day < beforeDay) sessions.delete(id);
      for (let i = events.length - 1; i >= 0; i--) if (events[i].day < beforeDay) events.splice(i, 1);
    },
  };
}
