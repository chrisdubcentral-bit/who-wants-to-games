// Netlify Function for the online Top 100. The logic is in server/top100/handlers.js.
//
//   GET  /api/top100?edition=celtic   the board
//   POST /api/top100/start            a run token for a new game
//   POST /api/top100                  add or update an entry
//   GET/POST /api/top100/admin        moderation (needs TOP100_ADMIN_KEY)
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   TOP100_ADMIN_KEY  password for the admin page (/admin/top100.html). Long and random.
//   TOP100_IP_SALT    any random text; makes the stored IP hashes impossible to reverse, and signs the run tokens.
//   NETLIFY_DB_URL    set by Netlify Database automatically.

import { createHandlers } from '../../server/top100/handlers.js';
import { createDbStore } from '../../server/top100/db-store.js';
import { createWordFilter } from '../../server/top100/word-filter.js';
import { EDITIONS } from '../../server/top100/editions.js';
import bannedWords from '../../moderation/banned-words.json' with { type: 'json' };

const handlers = createHandlers({
  store: createDbStore(),
  wordFilter: createWordFilter(bannedWords),
  editions: EDITIONS,
  adminKey: process.env.TOP100_ADMIN_KEY ?? '',
  ipSalt: process.env.TOP100_IP_SALT ?? '',
  log: (msg, data) => console.log(`[top100] ${msg}`, JSON.stringify(data)),
});

const json = ({ status, body }, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
});

// The board is cached at Netlify's CDN for 10 minutes, so views almost never wake the database (it's billed for
// the time it's awake). Other players see new entries within about 10 minutes; the player who submits sees
// theirs at once (BOARD_CACHE_MS in engine/js/game/leaderboard.js).
// Browsers always ask the CDN (max-age=0), and the cache is kept per edition.
const BOARD_CACHE = {
  'cache-control': 'public, max-age=0, must-revalidate',
  'netlify-cdn-cache-control': 'public, s-maxage=600, stale-while-revalidate=60',
  'netlify-vary': 'query=edition',
};

export default async (req, context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  const query = Object.fromEntries(url.searchParams);
  const headers = Object.fromEntries(req.headers);

  let body = null;
  if (req.method === 'POST') {
    if (!String(headers['content-type'] ?? '').includes('application/json')) {
      return json({ status: 415, body: { ok: false, error: 'bad-request' } });
    }
    try { body = await req.json(); } catch { return json({ status: 400, body: { ok: false, error: 'bad-request' } }); }
  }

  try {
    if (route === 'admin' && (req.method === 'GET' || req.method === 'POST')) {
      return json(await handlers.admin({ method: req.method, query, body, headers }));
    }
    if (route === 'start' && req.method === 'POST') return json(await handlers.start({ body, ip: context.ip }));
    if (route === 'top100' && req.method === 'GET') {
      const r = await handlers.board({ query });
      return json(r, r.status === 200 ? BOARD_CACHE : {});
    }
    if (route === 'top100' && req.method === 'POST') return json(await handlers.submit({ body, ip: context.ip }));
    return json({ status: 404, body: { ok: false, error: 'not-found' } });
  } catch (err) {
    console.error('[top100] failed', err);
    return json({ status: 500, body: { ok: false, error: 'server', message: 'The Top 100 is unavailable right now. Please try again later.' } });
  }
};

export const config = {
  path: ['/api/top100', '/api/top100/start', '/api/top100/admin'],
};
