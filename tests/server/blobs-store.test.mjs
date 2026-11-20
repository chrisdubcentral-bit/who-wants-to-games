// Runs the real Netlify Blobs store (server/top100/blobs-store.js) and the handlers against the local Blobs server
// that ships with @netlify/blobs, so safe saves, the copy from the old database and pruning are tested for real.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';
import { createBlobsStore } from '../../server/top100/blobs-store.js';
import { createHandlers } from '../../server/top100/handlers.js';
import { createWordFilter } from '../../server/top100/word-filter.js';
import { EDITIONS } from '../../server/top100/editions.js';
import { bannedWords, playRun } from './helpers.mjs';

let server;
let dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'blobs-'));
  server = new BlobsServer({ directory: dir, token: 'test-token' });
  const { port } = await server.start();
  setEnvironmentContext({ siteID: 'test-site', token: 'test-token', edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}`, apiURL: `http://localhost:${port}` });
});
after(async () => {
  await server?.stop();
  rmSync(dir, { recursive: true, force: true });
});

test('a save is refused if the board changed since it was read', async () => {
  const store = createBlobsStore();
  const first = await store.readBoard('celtic', 'conflict');
  assert.equal(first.etag, null);
  assert.equal(await store.saveBoard('celtic', 'conflict', { version: 1, nextId: 2, entries: [] }, null), true);
  assert.equal(await store.saveBoard('celtic', 'conflict', { version: 1, nextId: 9, entries: [] }, null), false, 'already exists');
  const second = await store.readBoard('celtic', 'conflict');
  assert.equal(await store.saveBoard('celtic', 'conflict', { version: 1, nextId: 3, entries: [] }, second.etag), true);
  assert.equal(await store.saveBoard('celtic', 'conflict', { version: 1, nextId: 4, entries: [] }, second.etag), false, 'stale etag');
  assert.equal((await store.readBoard('celtic', 'conflict')).data.nextId, 3);
});

test('the old board is copied across once, keeping its ids, and new entries carry on after them', async () => {
  const { entry } = playRun([3]);
  let calls = 0;
  const legacy = { async exportEntries(edition) {
    calls++;
    return edition !== 'celtic' ? [] : [{ id: 41, runToken: '11111111-1111-4111-8111-111111111111', ipHash: 'h', hidden: false, createdAt: '2026-11-01T10:00:00.000Z', ...entry, name: 'Henrik', town: 'Helsingborg', updatedAt: '2026-11-01T10:00:00.000Z' }];
  } };
  let clock = Date.parse('2026-11-20T12:00:00Z');
  const h = createHandlers({ store: createBlobsStore({ legacy }), wordFilter: createWordFilter(bannedWords), editions: EDITIONS, adminKey: 'k', ipSalt: 'salt', now: () => clock });

  assert.deepEqual((await h.board({ query: { edition: 'celtic' } })).body.board.map((e) => e.name), ['Henrik']);
  const tokens = [];
  for (let i = 0; i < 4; i++) tokens.push((await h.start({ body: { edition: 'celtic' }, ip: 'x' })).body.token);
  clock += 600000;
  // One at a time: the local test server checks the etag and writes in separate steps, so it can't test saves at
  // the same moment (handlers.test.mjs does, with the in-memory store; Netlify's own Blobs service checks atomically).
  const sent = [];
  for (const [i, token] of tokens.entries()) {
    sent.push(await h.submit({ body: { edition: 'celtic', token, entry: { ...playRun([1]).entry, name: `Player ${i}`, town: 'Glasgow' } }, ip: `10.0.0.${i}` }));
  }
  assert.deepEqual(sent.map((r) => r.status), [200, 200, 200, 200]);
  const board = (await h.board({ query: { edition: 'celtic' } })).body.board;
  assert.equal(board.length, 5);
  assert.equal(board[0].name, 'Henrik');
  assert.deepEqual(board.map((e) => e.id).sort((a, b) => a - b), [41, 42, 43, 44, 45]);
  assert.equal(calls, 1);

  const hide = await h.admin({ method: 'POST', body: { edition: 'celtic', id: 41, hidden: true }, query: {}, headers: { 'x-admin-key': 'k' } });
  assert.equal(hide.status, 200);
  assert.equal((await h.board({ query: { edition: 'celtic' } })).body.board.some((e) => e.id === 41), false);
});

test('old submit counters are pruned', async () => {
  const store = createBlobsStore();
  assert.equal(await store.countSubmit('aaa', '2026-11-20T08'), 1);
  assert.equal(await store.countSubmit('aaa', '2026-11-20T08'), 2);
  assert.equal(await store.countSubmit('bbb', '2026-11-20T11'), 1);
  await store.pruneSubmits('2026-11-20T10');
  assert.equal(await store.countSubmit('aaa', '2026-11-20T08'), 1, 'the old hour was cleared');
  assert.equal(await store.countSubmit('bbb', '2026-11-20T11'), 2, 'the recent hour was kept');
});
