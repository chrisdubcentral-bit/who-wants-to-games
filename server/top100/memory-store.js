// The Top 100 store kept in memory: same methods as blobs-store.js. Used by the tests and tools/dev-server.mjs.
// Reads hand out copies and saves check the etag, as Netlify Blobs does.

export function createMemoryStore({ legacy = null } = {}) {
  const boards = new Map();   // key → { data, etag }
  const submits = new Map();  // 'hour/ipHash' → n
  let version = 0;
  const key = (edition, board) => `${edition}/${board}`;
  const copy = (v) => structuredClone(v);

  return {
    /** Every stored entry, live, for tests to look at or change directly. */
    get entries() { return [...boards.values()].flatMap((b) => b.data.entries); },
    submits,

    async readBoard(edition, board) {
      let b = boards.get(key(edition, board));
      if (!b && legacy) {
        const rows = await legacy.exportEntries(edition, board);
        b = { data: { version: 1, nextId: rows.reduce((m, r) => Math.max(m, r.id), 0) + 1, entries: rows }, etag: `e${++version}` };
        boards.set(key(edition, board), b);
      }
      return b ? { data: copy(b.data), etag: b.etag } : { data: { version: 1, nextId: 1, entries: [] }, etag: null };
    },
    async saveBoard(edition, board, data, etag) {
      const current = boards.get(key(edition, board));
      if ((current?.etag ?? null) !== etag) return false;
      boards.set(key(edition, board), { data: copy(data), etag: `e${++version}` });
      return true;
    },
    async countSubmit(ipHash, hour) {
      const k = `${hour}/${ipHash}`;
      submits.set(k, (submits.get(k) ?? 0) + 1);
      return submits.get(k);
    },
    async pruneSubmits(beforeHour) {
      for (const k of submits.keys()) if (k.split('/')[0] < beforeHour) submits.delete(k);
    },
  };
}
