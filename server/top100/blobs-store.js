// The Top 100's storage in Netlify Blobs: one small JSON file per edition's board, plus per-hour submit counters.
// Blobs has no database to keep awake, so it costs far less than Netlify Database, which was billed for every hour
// it was awake. server/top100/memory-store.js has the same methods in memory, for the tests and the dev server.
//
//   board/<edition>/<board>         { version, nextId, entries: [full rows, including the private runToken/ipHash] }
//   submits/<YYYY-MM-DDTHH>/<ipHash>  { n }: entries saved from one connection in that hour (UTC)
//
// The first time a board is read it's copied from the old Netlify Database table, if `legacy` is given.

import { getStore } from '@netlify/blobs';

const STORE = 'top-board';
const boardKey = (edition, board) => `board/${edition}/${board}`;
const empty = () => ({ version: 1, nextId: 1, entries: [] });

export function createBlobsStore({ legacy = null, log = () => {} } = {}) {
  let store = null;
  // Strong consistency: a save made a moment ago is always seen, so the safe-save check below works.
  const blobs = () => (store ??= getStore({ name: STORE, consistency: 'strong' }));

  /** Reads a JSON blob with its etag. Some servers (the local test one) leave the etag off reads: then the etag
      comes from a listing taken before reading again, so it's never newer than the data and a stale save fails. */
  async function readWithEtag(key) {
    const r = await blobs().getWithMetadata(key, { type: 'json' });
    if (!r || r.etag) return r;
    const { blobs: found } = await blobs().list({ prefix: key });
    const etag = found.find((b) => b.key === key)?.etag;
    const again = await blobs().getWithMetadata(key, { type: 'json' });
    return again && { ...again, etag: again.etag ?? etag };
  }

  async function seedFromLegacy(edition, board) {
    if (!legacy) return;
    const rows = await legacy.exportEntries(edition, board);
    const data = { version: 1, nextId: rows.reduce((max, r) => Math.max(max, r.id), 0) + 1, entries: rows };
    const { modified } = await blobs().setJSON(boardKey(edition, board), data, { onlyIfNew: true });
    if (modified) log('copied board from the database', { edition, board, entries: rows.length });
  }

  return {
    /** The board, with the etag that saveBoard needs: { data, etag }. etag is null for a board not saved yet. */
    async readBoard(edition, board) {
      const key = boardKey(edition, board);
      let r = await readWithEtag(key);
      if (!r && legacy) {
        await seedFromLegacy(edition, board);
        r = await readWithEtag(key);
      }
      return r ? { data: r.data, etag: r.etag ?? null } : { data: empty(), etag: null };
    },

    /** Saves the board only if nobody else saved it since it was read. Returns false if they did. */
    async saveBoard(edition, board, data, etag) {
      const options = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
      const { modified } = await blobs().setJSON(boardKey(edition, board), data, options);
      return modified;
    },

    /** Counts one saved entry from this connection in this hour and returns the hour's total so far. */
    async countSubmit(ipHash, hour) {
      const key = `submits/${hour}/${ipHash}`;
      const n = ((await blobs().get(key, { type: 'json' }))?.n ?? 0) + 1;
      await blobs().setJSON(key, { n });
      return n;
    },

    /** Deletes the submit counters for hours before `beforeHour` ('YYYY-MM-DDTHH'). */
    async pruneSubmits(beforeHour) {
      const { directories } = await blobs().list({ prefix: 'submits/', directories: true });
      for (const dir of directories) {
        if (dir.slice('submits/'.length) >= beforeHour) continue;
        const { blobs: old } = await blobs().list({ prefix: `${dir}/` });
        for (const b of old) await blobs().delete(b.key);
      }
    },
  };
}
