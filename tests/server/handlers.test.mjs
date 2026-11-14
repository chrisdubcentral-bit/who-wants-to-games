import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers, LIMITS } from '../../server/top100/handlers.js';
import { createWordFilter } from '../../server/top100/word-filter.js';
import { EDITIONS } from '../../server/top100/editions.js';
import { bannedWords, createMemoryStore, playRun } from './helpers.mjs';

function setup() {
  let clock = Date.parse('2026-06-01T12:00:00Z');
  const store = createMemoryStore();
  const h = createHandlers({
    store, wordFilter: createWordFilter(bannedWords), editions: EDITIONS,
    adminKey: 'secret-key', ipSalt: 'salt', now: () => clock,
  });
  const tick = (ms) => { clock += ms; };
  const start = async (ip = '1.1.1.1') => (await h.start({ body: { edition: 'celtic' }, ip })).body.token;
  /** Plays a run in real (fake-clock) time and submits it. */
  const play = async (plan, { name = 'Jinky', town = 'Uddingston', token, ip = '1.1.1.1', ...opts } = {}) => {
    const t = token ?? await start(ip);
    const { entry, elapsedMs } = playRun(plan, opts);
    tick(elapsedMs);
    return { token: t, res: await h.submit({ body: { edition: 'celtic', token: t, entry: { ...entry, name, town } }, ip }) };
  };
  return { h, store, tick, start, play };
}

test('a run gets a token, goes on the board and is ranked', async () => {
  const { h, play } = setup();
  const a = await play([3], { name: 'Bertie' });
  assert.equal(a.res.status, 200);
  assert.equal(a.res.body.rank, 1);
  const b = await play([null], { name: 'Billy' });
  assert.equal(b.res.body.rank, 1, 'a cup beats a quarter-final');
  const board = (await h.board({ query: { edition: 'celtic' } })).body.board;
  assert.deepEqual(board.map((e) => e.name), ['Billy', 'Bertie']);
  assert.equal(board[1].stageReachedLabel, 'First Round', 'out after 3 wins');
  assert.equal('runToken' in board[0] || 'ipHash' in board[0], false, 'no private fields on the public board');
});

test('banned names are refused with a friendly message', async () => {
  const { play } = setup();
  const { res } = await play([2], { name: 'Huns 1690' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'name');
  assert.equal(res.body.field, 'name');
  assert.match(res.body.message, /can't be used/);
});

test('entries without a real token are refused', async () => {
  const { h } = setup();
  const { entry } = playRun([2]);
  for (const token of [undefined, 'abc', '00000000-0000-0000-0000-000000000000']) {
    const r = await h.submit({ body: { edition: 'celtic', token, entry }, ip: 'x' });
    assert.equal(r.body.error, 'no-run');
  }
});

test('a result faster than the time since the game started is refused', async () => {
  const { h, start, tick } = setup();
  const token = await start();
  tick(5000); // claims 7 rounds but only 5 seconds have passed
  const { entry } = playRun([6]);
  const r = await h.submit({ body: { edition: 'celtic', token, entry }, ip: 'x' });
  assert.equal(r.body.error, 'invalid');
});

test('a champion who plays on keeps the better entry, in one row', async () => {
  const { h, store, play, tick } = setup();
  const first = await play([null], { msPerRound: 10000 });
  const id = first.res.body.id;
  tick(60000);
  // Knocked out at the first question of season 2: same rounds won, more time on the clock. The first entry stays.
  const worse = await h.submit({ body: { edition: 'celtic', token: first.token, entry: playRun([null, 0]).entry }, ip: 'x' });
  assert.equal(worse.body.id, id);
  assert.equal(worse.body.rank, 1);
  assert.equal(store.entries[0].season, 1);
  // Two rounds further into season 2 ranks higher, so it replaces the entry instead of adding a second row.
  tick(60000);
  const better = await h.submit({ body: { edition: 'celtic', token: first.token, entry: playRun([null, 2]).entry }, ip: 'x' });
  assert.equal(better.body.id, id);
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].season, 2);
});

test('one connection can only start so many games an hour', async () => {
  const { h } = setup();
  for (let i = 0; i < LIMITS.runsPerHourPerIp; i++) await h.start({ body: { edition: 'celtic' }, ip: '9.9.9.9' });
  const r = await h.start({ body: { edition: 'celtic' }, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
  assert.equal((await h.start({ body: { edition: 'celtic' }, ip: '8.8.8.8' })).status, 200, 'other players unaffected');
});

test('the admin can hide an entry, and newly banned words drop off the board', async () => {
  const { h, store, play } = setup();
  await play([2], { name: 'Tommy' });
  await play([3], { name: 'Danny' });
  const id = store.entries.find((e) => e.name === 'Tommy').id;

  assert.equal((await h.admin({ method: 'GET', query: { edition: 'celtic' }, headers: {} })).status, 401);
  const hide = await h.admin({ method: 'POST', body: { id, hidden: true }, query: {}, headers: { 'x-admin-key': 'secret-key' } });
  assert.equal(hide.status, 200);
  let board = (await h.board({ query: { edition: 'celtic' } })).body.board;
  assert.deepEqual(board.map((e) => e.name), ['Danny']);

  // Someone got through before a word was added to the list: it disappears without touching the database.
  store.entries.find((e) => e.name === 'Danny').name = 'Sevco Danny';
  board = (await h.board({ query: { edition: 'celtic' } })).body.board;
  assert.deepEqual(board, []);
  const admin = await h.admin({ method: 'GET', query: { edition: 'celtic' }, headers: { 'x-admin-key': 'secret-key' } });
  assert.deepEqual(admin.body.entries.map((e) => [e.name, e.hidden, e.blocked]), [['Sevco Danny', false, 'word'], ['Tommy', true, null]]);
});

test('unknown editions are refused', async () => {
  const { h } = setup();
  assert.equal((await h.board({ query: { edition: 'nope' } })).status, 400);
  assert.equal((await h.start({ body: { edition: 'nope' }, ip: 'x' })).status, 400);
});
