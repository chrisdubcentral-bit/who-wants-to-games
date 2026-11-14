import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStatsHandlers, sourceOf, cleanEvents, LIMITS } from '../../server/stats/handlers.js';
import { createStatsMemoryStore } from '../../server/stats/memory-store.js';
import { EDITIONS } from '../../server/top100/editions.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1';

function setup(at = '2026-11-14T12:00:00Z') {
  let clock = Date.parse(at);
  const store = createStatsMemoryStore();
  const h = createStatsHandlers({ store, editions: EDITIONS, adminKey: 'k', salt: 's', now: () => clock });
  const send = (sid, body = {}, extra = {}) => h.ingest({ body: { sid, edition: 'celtic', activeMs: 0, events: [], ...body }, ip: '1.2.3.4', ua: UA, geo: { country: 'United Kingdom', region: 'Scotland' }, host: 'game.netlify.app', ...extra });
  const report = (query = {}) => h.report({ query: { edition: 'celtic', ...query }, headers: { 'x-admin-key': 'k' } });
  return { store, h, send, report, tick: (ms) => { clock += ms; } };
}

test('sources are tidied into names people recognise', () => {
  assert.equal(sourceOf({ referrer: 'l.facebook.com' }), 'Facebook');
  assert.equal(sourceOf({ referrer: 'www.google.co.uk' }), 'Google');
  assert.equal(sourceOf({ referrer: 't.co' }), 'X (Twitter)');
  assert.equal(sourceOf({ referrer: '' }), 'Direct');
  assert.equal(sourceOf({ referrer: 'game.netlify.app' }, 'game.netlify.app'), 'Direct');
  assert.equal(sourceOf({ referrer: 'celticfanzone.com' }), 'celticfanzone.com');
  assert.equal(sourceOf({ utm: 'Facebook', referrer: 'google.com' }), 'Facebook', 'a utm tag wins');
  assert.equal(sourceOf({ utm: 'Club Newsletter' }), 'club newsletter');
});

test('only well-formed events are kept', () => {
  const out = cleanEvents([
    { type: 'game_start' },
    { type: 'advert_click', advert: 'beanie-promo', detail: 'button' },
    { type: 'hack', advert: 'x' },
    { type: 'advert_shown', advert: '<script>' },
    { type: 'game_end', stage: 4, season: 1, value: 0, detail: 'eliminated' },
  ]);
  assert.deepEqual(out.map((e) => e.type), ['game_start', 'advert_click', 'advert_shown', 'game_end']);
  assert.equal(out[2].advert, null, 'bad advert id dropped');
  assert.equal(out[3].stage, 4);
});

test('a visit records device, source and region, and its time on screen only grows', async () => {
  const { store, send } = setup();
  const sid = randomUUID();
  await send(sid, { visit: { device: 'phone', referrer: 'm.facebook.com' }, activeMs: 5000 });
  await send(sid, { activeMs: 65000 });
  await send(sid, { activeMs: 30000 }); // late, out-of-order ping
  const s = store.sessions.get(sid);
  assert.equal(s.device, 'phone');
  assert.equal(s.source, 'Facebook');
  assert.equal(s.region, 'Scotland');
  assert.equal(s.activeMs, 65000);
  assert.equal(s.day, '2026-11-14');
  assert.equal('ip' in s, false, 'no IP address stored');
});

test('bots, bad sessions and unknown editions are ignored', async () => {
  const { store, send } = setup();
  assert.equal((await send(randomUUID(), {}, { ua: 'Googlebot/2.1' })).body.ignored, 'bot');
  assert.equal((await send('not-a-uuid')).status, 400);
  assert.equal((await send(randomUUID(), { edition: 'nope' })).status, 400);
  assert.equal(store.sessions.size, 0);
});

test('one visit can only record so many events', async () => {
  const { store, send } = setup();
  const sid = randomUUID();
  const fifty = Array.from({ length: 50 }, () => ({ type: 'advert_shown', advert: 'a' }));
  for (let i = 0; i < 25; i++) await send(sid, { events: fifty });
  assert.equal(store.events.length, LIMITS.eventsPerSession);
});

test('the report adds up visits, games, the stage funnel and advert click rates', async () => {
  const { send, report, tick } = setup();
  const a = randomUUID(); const b = randomUUID(); const c = randomUUID();
  await send(a, { visit: { device: 'phone', referrer: 'facebook.com' }, activeMs: 120000, events: [
    { type: 'game_start' }, { type: 'advert_shown', advert: 'weekly-lottery' }, { type: 'advert_click', advert: 'weekly-lottery', detail: 'button' },
    { type: 'game_end', stage: 8, season: 1, value: 1, detail: 'won' },
  ] });
  await send(b, { visit: { device: 'desktop' }, activeMs: 4000 }); // bounced
  tick(24 * 3600e3);
  await send(c, { visit: { device: 'phone', utm: 'facebook' }, activeMs: 40000, events: [
    { type: 'game_start' }, { type: 'advert_shown', advert: 'beanie-promo' }, { type: 'advert_skip', advert: 'beanie-promo', value: 6000 },
    { type: 'game_end', stage: 2, season: 1, value: 0, detail: 'eliminated' }, { type: 'top100_entry' },
  ] });

  const r = (await report({ from: '2026-11-14', to: '2026-11-15' })).body;
  assert.equal(r.totals.visits, 3);
  assert.equal(r.totals.bounces, 1);
  assert.equal(r.totals.gamesStarted, 2);
  assert.equal(r.totals.seasonsWon, 1);
  assert.equal(r.totals.top100Entries, 1);
  assert.deepEqual(r.daily.map((d) => [d.day, d.visits, d.games]), [['2026-11-14', 2, 1], ['2026-11-15', 1, 1]]);
  assert.deepEqual(r.sources[0], { name: 'Facebook', n: 2 });
  assert.deepEqual(r.devices.map((d) => [d.name, d.n]), [['phone', 2], ['desktop', 1]]);
  assert.deepEqual(r.funnel.map((f) => f.n), [2, 2, 2, 1, 1, 1, 1, 1, 1], 'both played stages 1-3, one went on to win');
  const lottery = r.adverts.find((x) => x.id === 'weekly-lottery');
  assert.equal(lottery.clickRate, 1);
  assert.equal(lottery.clickVia.button, 1);
  const beanie = r.adverts.find((x) => x.id === 'beanie-promo');
  assert.equal(beanie.skipped, 1);
  assert.equal(beanie.avgWatchedBeforeSkipMs, 6000);
  assert.equal(r.time.find((t) => t.name === 'Under 10s').n, 1);
});

test('the report needs the admin key', async () => {
  const { h } = setup();
  assert.equal((await h.report({ query: { edition: 'celtic' }, headers: {} })).status, 401);
  assert.equal((await h.report({ query: { edition: 'celtic' }, headers: { 'x-admin-key': 'wrong' } })).status, 401);
});

test('the same visitor counts once a day, but again on another day', async () => {
  const { send, report, tick } = setup();
  await send(randomUUID(), { visit: {} });
  await send(randomUUID(), { visit: {} });
  tick(24 * 3600e3);
  await send(randomUUID(), { visit: {} });
  const r = (await report({ from: '2026-11-14', to: '2026-11-15' })).body;
  assert.equal(r.totals.visits, 3);
  assert.equal(r.totals.visitors, 2);
});
