// Netlify Function for anonymous site statistics. The logic is in server/stats/handlers.js.
//
//   POST /api/stats          events from the game (visits, time on page, games, adverts)
//   GET  /api/stats/report   the dashboard's figures (needs the TOP100_ADMIN_KEY in the x-admin-key header)
//
// Environment variables: TOP100_ADMIN_KEY (dashboard password, shared with the Top 100 admin page),
// TOP100_IP_SALT (or STATS_SALT): random text that makes the daily visitor codes impossible to reverse.

import { createStatsHandlers } from '../../server/stats/handlers.js';
import { createStatsDbStore } from '../../server/stats/db-store.js';
import { EDITIONS } from '../../server/top100/editions.js';

const handlers = createStatsHandlers({
  store: createStatsDbStore(),
  editions: EDITIONS,
  adminKey: process.env.TOP100_ADMIN_KEY ?? '',
  salt: process.env.STATS_SALT ?? process.env.TOP100_IP_SALT ?? '',
});

const json = ({ status, body }) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (req, context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  try {
    if (route === 'stats' && req.method === 'POST') {
      // Sent with fetch or navigator.sendBeacon, so the body may arrive as text/plain.
      let body = null;
      try { body = JSON.parse(await req.text()); } catch { return json({ status: 400, body: { ok: false, error: 'bad-request' } }); }
      return json(await handlers.ingest({
        body,
        ip: context.ip,
        ua: req.headers.get('user-agent') ?? '',
        geo: { country: context.geo?.country?.name ?? null, region: context.geo?.subdivision?.name ?? null },
        host: url.host,
      }));
    }
    if (route === 'report' && req.method === 'GET') {
      return json(await handlers.report({ query: Object.fromEntries(url.searchParams), headers: Object.fromEntries(req.headers) }));
    }
    return json({ status: 404, body: { ok: false, error: 'not-found' } });
  } catch (err) {
    console.error('[stats] failed', err);
    return json({ status: 500, body: { ok: false, error: 'server', message: 'Statistics are unavailable right now.' } });
  }
};

export const config = { path: ['/api/stats', '/api/stats/report'] };
