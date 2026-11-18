// The Top 100 store kept in memory: same methods as db-store.js. Used by the tests and tools/dev-server.mjs.

/** Same methods as server/top100/db-store.js, kept in memory. */
export function createMemoryStore() {
  const runs = new Map();
  const entries = [];
  let nextId = 1;
  return {
    runs, entries,
    async countRecentRuns(ipHash, sinceIso) {
      return [...runs.values()].filter((r) => r.ipHash === ipHash && r.createdAt > sinceIso).length;
    },
    async getRun(token) { const r = runs.get(token); return r ? { ...r } : null; },
    async recordSubmit({ token, edition, ipHash, createdAt }) {
      const r = runs.get(token);
      if (r) r.submits++; else runs.set(token, { edition, ipHash, createdAt, submits: 1 });
    },
    async pruneRuns(beforeIso) { for (const [k, r] of runs) if (r.createdAt < beforeIso) runs.delete(k); },
    async listEntries(edition, board, { includeHidden, limit }) {
      return entries.filter((e) => e.edition === edition && e.board === board && (includeHidden || !e.hidden))
        .slice(0, limit).map((e) => ({ ...e }));
    },
    async getEntryByToken(token) { const e = entries.find((x) => x.runToken === token); return e ? { ...e } : null; },
    async saveEntry(e) {
      const old = entries.find((x) => x.runToken === e.runToken);
      if (old) { Object.assign(old, e); return old.id; }
      const row = { ...e, id: nextId++, hidden: false };
      entries.push(row);
      return row.id;
    },
    async setHidden(id, hidden) { const e = entries.find((x) => x.id === id); if (e) e.hidden = hidden; },
  };
}
