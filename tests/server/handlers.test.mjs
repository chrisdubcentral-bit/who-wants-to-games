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

test('starting a game and a refused entry never touch the database', async () => {
  const untouched = new Proxy({}, { get() { throw new Error('the database was used'); } });
  const h = createHandlers({ store: untouched, wordFilter: createWordFilter(bannedWords), editions: EDITIONS, ipSalt: 'salt' });
  const token = (await h.start({ body: { edition: 'celtic' }, ip: 'x' })).body.token;
  const { entry } = playRun([2]);
  const named = await h.submit({ body: { edition: 'celtic', token, entry: { ...entry, name: 'Huns 1690' } }, ip: 'x' });
  assert.equal(named.body.error, 'name');
  assert.equal((await h.submit({ body: { edition: 'celtic', token: 'abc', entry }, ip: 'x' })).body.error, 'no-run');
});

test('altered, forged and other-edition tokens are refused', async () => {
  const { h, start, tick } = setup();
  const token = await start();
  tick(600000);
  const { entry } = playRun([2]);
  const [id, startedAt, signature] = token.split('.');
  const altered = `${id}.${Number(startedAt) - 3600000}.${signature}`;
  const other = createHandlers({ store: createMemoryStore(), wordFilter: createWordFilter(bannedWords), editions: EDITIONS, ipSalt: 'another-salt' });
  const forged = (await other.start({ body: { edition: 'celtic' }, ip: 'x' })).body.token;
  for (const bad of [altered, forged]) {
    assert.equal((await h.submit({ body: { edition: 'celtic', token: bad, entry }, ip: 'x' })).body.error, 'no-run');
  }
  const shared = createHandlers({ store: createMemoryStore(), wordFilter: createWordFilter(bannedWords), editions: { ...EDITIONS, other: EDITIONS.celtic }, ipSalt: 'salt' });
  const elsewhere = (await shared.start({ body: { edition: 'other' }, ip: 'x' })).body.token;
  assert.equal((await shared.submit({ body: { edition: 'celtic', token: elsewhere, entry }, ip: 'x' })).body.error, 'no-run');
});

test('an old token has expired', async () => {
  const { h, start, tick } = setup();
  const token = await start();
  tick(LIMITS.runMaxAgeMs + 1000);
  const r = await h.submit({ body: { edition: 'celtic', token, entry: playRun([2]).entry }, ip: 'x' });
  assert.equal(r.body.error, 'expired');
});

test('without a secret no run tokens are issued', async () => {
  const h = createHandlers({ store: createMemoryStore(), wordFilter: createWordFilter(bannedWords), editions: EDITIONS });
  assert.equal((await h.start({ body: { edition: 'celtic' }, ip: 'x' })).status, 503);
});

test('one run can only submit so many times', async () => {
  const { h, start, tick } = setup();
  const token = await start();
  tick(600000);
  const { entry } = playRun([2]);
  const send = () => h.submit({ body: { edition: 'celtic', token, entry }, ip: 'x' });
  for (let i = 0; i < LIMITS.submitsPerRun; i++) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429);
});

test('one connection can only enter so many games an hour', async () => {
  const { h, start, tick } = setup();
  const tokens = [];
  for (let i = 0; i <= LIMITS.runsPerHourPerIp + 1; i++) tokens.push(await start());
  tick(600000);
  const { entry } = playRun([2]);
  const send = (token, ip) => h.submit({ body: { edition: 'celtic', token, entry }, ip });
  for (let i = 0; i < LIMITS.runsPerHourPerIp; i++) assert.equal((await send(tokens[i], '9.9.9.9')).status, 200);
  assert.equal((await send(tokens[LIMITS.runsPerHourPerIp], '9.9.9.9')).status, 429);
  assert.equal((await send(tokens[LIMITS.runsPerHourPerIp + 1], '8.8.8.8')).status, 200, 'other players unaffected');
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
