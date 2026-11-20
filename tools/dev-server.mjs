// Local server for trying the game with a working online Top 100, without Netlify.
// Run from the project root:  node tools/dev-server.mjs   then open http://localhost:8888
//
// Serves the project folder as it is (like Live Server) and answers /api/top100 with the real
// handlers from server/top100, but keeps the board in memory: it's empty every time you start it.
// Admin pages: http://localhost:8888/admin/top100.html and /admin/stats.html with the key "dev".
// Visit statistics are kept in memory too.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandlers } from '../server/top100/handlers.js';
import { createMemoryStore } from '../server/top100/memory-store.js';
import { createWordFilter } from '../server/top100/word-filter.js';
import { EDITIONS } from '../server/top100/editions.js';
import { createStatsHandlers } from '../server/stats/handlers.js';
import { createStatsMemoryStore } from '../server/stats/memory-store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8888;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
};

const handlers = createHandlers({
  store: createMemoryStore(),
  wordFilter: createWordFilter(JSON.parse(readFileSync(path.join(ROOT, 'moderation/banned-words.json'), 'utf8'))),
  editions: EDITIONS,
  adminKey: 'dev',
  ipSalt: 'dev',
  log: (msg, data) => console.log(`[top100] ${msg}`, JSON.stringify(data)),
});

const stats = createStatsHandlers({ store: createStatsMemoryStore(), editions: EDITIONS, adminKey: 'dev', salt: 'dev' });

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

async function statsApi(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  let out;
  if (route === 'stats' && req.method === 'POST') {
    out = await stats.ingest({ body: await readBody(req), ip: req.socket.remoteAddress, ua: req.headers['user-agent'] ?? '', geo: { country: 'United Kingdom', region: 'Scotland' }, host: req.headers.host });
  } else if (route === 'report') {
    out = await stats.report({ query: Object.fromEntries(url.searchParams), headers: req.headers });
  } else out = { status: 404, body: { ok: false, error: 'not-found' } };
  res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(out.body));
}

async function api(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  let body = null;
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
  }
  const query = Object.fromEntries(url.searchParams);
  const ip = req.socket.remoteAddress;
  let out;
  if (route === 'admin') out = await handlers.admin({ method: req.method, query, body, headers: req.headers });
  else if (route === 'start' && req.method === 'POST') out = await handlers.start({ body, ip });
  else if (route === 'top100' && req.method === 'GET') out = await handlers.board({ query });
  else if (route === 'top100' && req.method === 'POST') out = await handlers.submit({ body, ip });
  else out = { status: 404, body: { ok: false, error: 'not-found' } };
  res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(out.body));
}

async function file(res, url) {
  let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT) || p.includes(`${path.sep}node_modules`)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(p)).isDirectory()) p = path.join(p, 'index.html');
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

/** /celtic → /editions/celtic/, like the _redirects file the build writes for the hosted site. */
function shortLink(url) {
  const id = url.pathname.match(/^\/([a-z0-9-]+)\/?$/i)?.[1];
  return id && EDITIONS[id] ? `/editions/${id}/${url.search}` : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/top100')) await api(req, res, url);
    else if (url.pathname.startsWith('/api/stats')) await statsApi(req, res, url);
    else if (url.pathname === '/') { res.writeHead(302, { location: '/editions/celtic/index.html' }).end(); }
    else if (shortLink(url)) { res.writeHead(302, { location: shortLink(url) }).end(); }
    else await file(res, url);
  } catch (err) {
    console.error(err);
    res.writeHead(500).end();
  }
}).listen(PORT, () => {
  console.log(`Game:  http://localhost:${PORT}/editions/celtic/index.html`);
  console.log(`       http://localhost:${PORT}/editions/beatles/index.html`);
  console.log(`Admin: http://localhost:${PORT}/admin/top100.html  (key: dev)`);
  console.log(`Stats: http://localhost:${PORT}/admin/stats.html  (key: dev)`);
  console.log('The Top 100 is kept in memory and starts empty each time.');
});
