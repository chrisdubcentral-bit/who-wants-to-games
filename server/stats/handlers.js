// Anonymous site statistics: takes events from the game and builds the dashboard report.
// Kept separate from Netlify and the database so it can be tested (tests/server/stats.test.mjs).
//
// Privacy: nothing that identifies a person is stored. No IP address, no cookies, nothing saved on the
// player's device. Unique visitors are counted with a salted hash of IP address + browser that includes
// the date, so it changes every day and can't be linked across days or back to a person.

import { createHash, timingSafeEqual } from 'node:crypto';

export const EVENT_TYPES = ['game_start', 'game_end', 'advert_shown', 'advert_click', 'advert_skip', 'advert_complete', 'top100_entry', 'share'];

/** utm_source on links players share from the game (engine/js/game/share.js), and the name the dashboard shows for it. */
export const SHARE_TAG = 'shared-score';
export const SHARE_SOURCE = 'Shared scores';
export const SHARE_METHODS = ['share_menu', 'whatsapp', 'x', 'facebook', 'copy', 'download'];

export const LIMITS = {
  eventsPerRequest: 200,   // a whole visit's events arrive together when the page is hidden (engine/js/core/analytics.js)
  eventsPerSession: 1000,
  sessionsPerVisitorPerDay: 300,
  maxActiveMs: 6 * 3600 * 1000,
  keepDays: 400,          // a little over 13 months
  maxReportDays: 400,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|headless|lighthouse|pingdom|curl|wget|python|axios|node-fetch/i;

/** The UK date for a moment, as YYYY-MM-DD. */
export const ukDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));

const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const KNOWN_SOURCES = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X (Twitter)'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)whatsapp\.(com|net)$/, 'WhatsApp'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'Yahoo'],
];

/** Where a visit came from: an explicit ?utm_source, else a tidy name for the referring site, else Direct. */
export function sourceOf({ utm, referrer } = {}, ownHost = '') {
  const tag = String(utm ?? '').trim().toLowerCase().replace(/[^a-z0-9 ._-]/g, '').slice(0, 40);
  if (tag === SHARE_TAG) return SHARE_SOURCE;
  if (tag) {
    const named = KNOWN_SOURCES.find(([re]) => re.test(`${tag}.com`) || re.test(tag));
    return named ? named[1] : tag;
  }
  const host = String(referrer ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '').slice(0, 80);
  if (!host || host === String(ownHost).toLowerCase().replace(/^www\./, '')) return 'Direct';
  const named = KNOWN_SOURCES.find(([re]) => re.test(host));
  return named ? named[1] : host;
}

const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

/** Keeps only well-formed events, trimmed to what the tables store. */
export function cleanEvents(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, LIMITS.eventsPerRequest).flatMap((e) => {
    if (!e || !EVENT_TYPES.includes(e.type)) return [];
    const advert = typeof e.advert === 'string' && /^[a-z0-9_-]{1,60}$/i.test(e.advert) ? e.advert : null;
    const detail = typeof e.detail === 'string' && /^[a-z_]{1,20}$/.test(e.detail) ? e.detail : null;
    return [{ type: e.type, advert, stage: int(e.stage, 0, 50), season: int(e.season, 1, 1000), value: int(e.value, 0, 86400000), detail }];
  });
}

export function createStatsHandlers({ store, editions, adminKey = '', salt = '', now = () => Date.now() }) {
  const visitorHash = (day, ip, ua) => createHash('sha256').update(`${salt}|${day}|${ip ?? ''}|${ua ?? ''}`).digest('hex').slice(0, 24);

  return {
    /** POST /api/stats { sid, edition, activeMs, visit?: { device, referrer, utm }, events: [...] } */
    async ingest({ body, ip, ua = '', geo = {}, host = '' }) {
      const edition = body?.edition;
      if (!editions[edition]) return { status: 400, body: { ok: false, error: 'edition' } };
      const sid = body?.sid;
      if (typeof sid !== 'string' || !UUID.test(sid)) return { status: 400, body: { ok: false, error: 'session' } };
      if (BOT.test(ua)) return { status: 202, body: { ok: true, ignored: 'bot' } };

      const events = cleanEvents(body.events);
      const activeMs = Math.min(int(body.activeMs, 0, Number.MAX_SAFE_INTEGER) ?? 0, LIMITS.maxActiveMs);
      const day = ukDay(now());

      let session = await store.getSession(sid);
      if (!session) {
        const visitor = visitorHash(day, ip, ua);
        if (await store.countVisitorSessions(visitor, day) >= LIMITS.sessionsPerVisitorPerDay) {
          return { status: 202, body: { ok: true, ignored: 'limit' } };
        }
        const v = body.visit ?? {};
        session = {
          id: sid, edition, day, visitor,
          device: ['phone', 'tablet', 'desktop'].includes(v.device) ? v.device : 'desktop',
          source: sourceOf(v, host),
          country: typeof geo.country === 'string' ? geo.country.slice(0, 60) : null,
          region: typeof geo.region === 'string' ? geo.region.slice(0, 60) : null,
          activeMs: 0, events: 0,
        };
        await store.createSession(session);
        if (Math.random() < 0.01) await store.prune(addDays(day, -LIMITS.keepDays));
      }
      if (session.edition !== edition) return { status: 400, body: { ok: false, error: 'session' } };

      const room = Math.max(0, LIMITS.eventsPerSession - (session.events ?? 0));
      const kept = events.slice(0, room);
      await store.touchSession(sid, activeMs, kept.length);
      if (kept.length) await store.insertEvents(kept.map((e) => ({ ...e, sessionId: sid, edition, day: session.day })));
      return { status: 200, body: { ok: true } };
    },

    /** GET /api/stats/report?edition=celtic&from=YYYY-MM-DD&to=YYYY-MM-DD (needs the admin key) */
    async report({ query, headers }) {
      if (!adminKey) return { status: 503, body: { ok: false, error: 'admin-off', message: 'Set TOP100_ADMIN_KEY in Netlify to use the dashboard.' } };
      const given = Buffer.from(String(headers['x-admin-key'] ?? ''));
      const want = Buffer.from(adminKey);
      if (given.length !== want.length || !timingSafeEqual(given, want)) return { status: 401, body: { ok: false, error: 'admin-key', message: 'Wrong admin key.' } };

      const edition = query.edition;
      const ed = editions[edition];
      if (!ed) return { status: 400, body: { ok: false, error: 'edition', message: 'Unknown edition.' } };
      const today = ukDay(now());
      const to = DAY.test(query.to ?? '') ? query.to : today;
      let from = DAY.test(query.from ?? '') ? query.from : addDays(to, -29);
      if (from > to) from = to;
      if (addDays(from, LIMITS.maxReportDays) < to) from = addDays(to, -LIMITS.maxReportDays);

      const [sessions, events] = await Promise.all([
        store.sessionsBetween(edition, from, to),
        store.eventsBetween(edition, from, to),
      ]);
      return { status: 200, body: { ok: true, ...buildReport({ sessions, events, from, to, stages: ed.stages }) } };
    },
  };
}

const count = (list, key) => {
  const m = new Map();
  for (const x of list) { const k = key(x) ?? 'Unknown'; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || String(a.name).localeCompare(String(b.name)));
};
const top = (rows, n) => (rows.length <= n ? rows : [...rows.slice(0, n), { name: 'Other', n: rows.slice(n).reduce((s, r) => s + r.n, 0) }]);
const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Turns the raw rows for a date range into the dashboard's figures. Pure, so it's easy to test. */
export function buildReport({ sessions, events, from, to, stages }) {
  const byType = (t) => events.filter((e) => e.type === t);
  const started = new Set(byType('game_start').map((e) => e.sessionId));
  const visitorsOn = (list) => new Set(list.map((s) => `${s.day}|${s.visitor}`)).size;
  const active = sessions.map((s) => s.activeMs);

  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const daily = days.map((day) => {
    const ss = sessions.filter((s) => s.day === day);
    return { day, visits: ss.length, visitors: visitorsOn(ss), games: events.filter((e) => e.day === day && e.type === 'game_start').length };
  });

  const BUCKETS = [['Under 10s', 0, 10e3], ['10s–1 min', 10e3, 60e3], ['1–3 min', 60e3, 180e3], ['3–10 min', 180e3, 600e3], ['10 min +', 600e3, Infinity]];
  const time = BUCKETS.map(([name, lo, hi]) => ({ name, n: sessions.filter((s) => s.activeMs >= lo && s.activeMs < hi).length }));

  // How far players get in a first season: a game that ended at stage i played stages 0..i.
  const firstSeason = byType('game_end').filter((e) => (e.season ?? 1) === 1 && Number.isInteger(e.stage));
  const funnel = stages.map((s, i) => ({ key: s.key, name: s.label, n: firstSeason.filter((e) => e.stage >= i).length }));
  funnel.push({ key: 'won', name: 'Won the final', n: firstSeason.filter((e) => e.stage >= stages.length).length });

  const advertIds = [...new Set(events.filter((e) => e.advert).map((e) => e.advert))];
  const adverts = advertIds.map((id) => {
    const of = (t) => events.filter((e) => e.type === t && e.advert === id);
    const shown = of('advert_shown').length;
    const clicks = of('advert_click');
    const skips = of('advert_skip');
    return {
      id,
      shown,
      clicks: clicks.length,
      clickRate: shown ? clicks.length / shown : 0,
      clickVia: { video: clicks.filter((c) => c.detail === 'video').length, button: clicks.filter((c) => c.detail === 'button').length },
      skipped: skips.length,
      avgWatchedBeforeSkipMs: skips.length ? Math.round(skips.reduce((s, e) => s + (e.value ?? 0), 0) / skips.length) : 0,
      completed: of('advert_complete').length,
    };
  }).sort((a, b) => b.shown - a.shown);

  const ends = byType('game_end');
  return {
    range: { from, to, days: days.length },
    totals: {
      visits: sessions.length,
      visitors: visitorsOn(sessions),
      avgActiveMs: active.length ? Math.round(active.reduce((a, b) => a + b, 0) / active.length) : 0,
      medianActiveMs: median(active),
      bounces: sessions.filter((s) => s.activeMs < 10e3 && !started.has(s.id)).length,
      gamesStarted: byType('game_start').length,
      gamesFinished: ends.length,
      seasonsWon: ends.filter((e) => e.detail === 'won').length,
      top100Entries: byType('top100_entry').length,
      advertsShown: byType('advert_shown').length,
      advertClicks: byType('advert_click').length,
      shares: byType('share').length,
      sharedVisits: sessions.filter((s) => s.source === SHARE_SOURCE).length,
    },
    daily,
    devices: count(sessions, (s) => s.device),
    sources: top(count(sessions, (s) => s.source), 10),
    countries: top(count(sessions, (s) => s.country), 10),
    regions: top(count(sessions.filter((s) => s.region), (s) => `${s.region}${s.country ? `, ${s.country}` : ''}`), 10),
    time,
    funnel,
    adverts,
    shareVia: count(byType('share'), (e) => (SHARE_METHODS.includes(e.detail) ? e.detail : 'share_menu')),
  };
}
