// Builds dist/: a game-only copy of the project, ready to upload to a web host (e.g. Netlify).
// Run from the project root:  node tools/build.js
//
// The folder layout is kept, so the pages' relative paths (../../engine, ../../media/ads) still work.
// Left out: the question review page, pending and rejected questions, import batches, tests and docs.
// The online Top 100 isn't in dist/: Netlify deploys it from netlify/functions and netlify/database.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const EDITION_FILES = [
  'index.html',
  'manifest.webmanifest',
  'theme.css',
  'edition.css',
  'assets',
  'data/edition.json',
  'data/adverts.json',
  'data/meta',
  'data/questions/approved-questions.json',
];
const ENGINE_JS = ['core', 'data-sources', 'game', 'ui'];
const VIDEO = /\.(mp4|webm)$/i;

const warnings = [];

function copy(from, to, filter = () => true) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => filter(src) });
}

function copyEngine() {
  copy(path.join(ROOT, 'engine/css'), path.join(DIST, 'engine/css'),
    (src) => path.basename(src) !== 'admin.css');
  for (const dir of ENGINE_JS) {
    copy(path.join(ROOT, 'engine/js', dir), path.join(DIST, 'engine/js', dir));
  }
}

function copyAdverts() {
  const from = path.join(ROOT, 'media/ads');
  if (!fs.existsSync(from)) return;
  const videos = fs.readdirSync(from).filter((f) => VIDEO.test(f));
  for (const file of videos) {
    const to = path.join(DIST, 'media/ads', file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(from, file), to);
  }
}

/** The site logo, icons and link-preview picture used by the front page (made by tools/brand/make-brand.js). */
const BRAND_FILES = ['logo.svg', 'logo-mark.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'share-1200x630.png'];

function copyBrand() {
  for (const file of BRAND_FILES) {
    const from = path.join(ROOT, 'media/brand', file);
    if (!fs.existsSync(from)) { warnings.push(`media/brand/${file} is missing`); continue; }
    fs.mkdirSync(path.join(DIST, 'media/brand'), { recursive: true });
    fs.copyFileSync(from, path.join(DIST, 'media/brand', file));
  }
}

/** Copies one edition and returns what the landing page shows for it. */
function copyEdition(id) {
  const from = path.join(ROOT, 'editions', id);
  const to = path.join(DIST, 'editions', id);
  for (const item of EDITION_FILES) {
    const src = path.join(from, item);
    if (!fs.existsSync(src)) {
      if (item !== 'assets' && item !== 'edition.css' && item !== 'data/adverts.json') warnings.push(`${id}: ${item} is missing`);
      continue;
    }
    copy(src, path.join(to, item));
  }

  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(from, 'manifest.webmanifest'), 'utf8'));
  } catch { /* fall back to the folder name */ }
  const icon = ['assets/img/logo.svg', 'assets/img/icon-192.png'].find((f) => fs.existsSync(path.join(from, f)));
  return {
    id,
    title: manifest.name || id,
    description: manifest.description || '',
    background: /^#[0-9a-f]{3,8}$/i.test(manifest.background_color || '') ? manifest.background_color : '#151b18',
    icon: icon ? `editions/${id}/${icon}` : null,
  };
}

/** The site's own address: Netlify sets URL during its builds, SITE_URL overrides it. Empty for local builds. */
function siteAddress() {
  return (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');
}

/**
 * Short addresses for each edition (/celtic → /editions/celtic/). They redirect rather than rewrite, because the
 * game pages load the engine from ../../engine and so must be served from /editions/<id>/. Netlify keeps the
 * query string (e.g. ?utm_source=shared-score) and also matches /celtic/.
 */
function writeRedirects(ids) {
  const lines = ids.map((id) => `/${id}  /editions/${id}/  301`);
  fs.writeFileSync(path.join(DIST, '_redirects'), `# Short address for each edition, written by tools/build.js\n${lines.join('\n')}\n`);
}

/**
 * Link previews need full addresses: turns the relative og:image in an edition's index.html into one and adds
 * og:url. Netlify sets URL (the site's main address) during its builds; SITE_URL overrides it.
 */
function absoluteShareTags(id) {
  const file = path.join(DIST, 'editions', id, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  if (!/property="og:image"/.test(html)) return;
  const site = siteAddress();
  if (!site) {
    warnings.push(`${id}: no site address (Netlify sets URL when it builds), so link previews have no picture in this build`);
    return;
  }
  const page = `${site}/editions/${id}/`;
  html = html.replace(/(<meta property="og:image" content=")(?!https?:)([^"]+)"/, (m, a, rel) => `${a}${new URL(rel, page).href}"`);
  if (!/property="og:url"/.test(html)) {
    // The short address, the same one the Share button uses.
    html = html.replace(/(\s*)(<meta property="og:image" )/, `$1<meta property="og:url" content="${esc(`${site}/${id}`)}">$1$2`);
  }
  fs.writeFileSync(file, html);
}

/** Reads an edition's adverts: data/adverts.json, or adverts.breaks in edition.json for older editions. */
function readAdverts(editionDir) {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(editionDir, p), 'utf8')); } catch { return null; } };
  return read('data/adverts.json')?.adverts ?? read('data/edition.json')?.adverts?.breaks ?? [];
}

/** Warns about adverts that won't play: missing videos, or dates that leave them switched off. */
function checkAdverts(id) {
  const editionDir = path.join(DIST, 'editions', id);
  const today = new Date().toISOString().slice(0, 10);
  const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  for (const ad of readAdverts(editionDir)) {
    const name = ad.name || ad.id || ad.label || 'an advert';
    if (ad.enabled === false) continue;
    if (isDay(ad.until) && ad.until < today) { warnings.push(`${id}: advert "${name}" ended on ${ad.until}, so it won't play`); continue; }
    if (isDay(ad.from) && isDay(ad.until) && ad.until < ad.from) warnings.push(`${id}: advert "${name}" ends before it starts`);
    for (const shape of ['landscape', 'portrait']) {
      const file = ad[shape];
      if (!file || /^https?:\/\//i.test(file)) continue;
      if (!fs.existsSync(path.resolve(editionDir, file))) {
        warnings.push(`${id}: advert video not found, testers won't see it: ${file}`);
      }
    }
  }
}

/** Warns about editions the online Top 100 doesn't know about yet (server/top100/editions.js). */
function checkTop100(ids) {
  const src = fs.readFileSync(path.join(ROOT, 'server/top100/editions.js'), 'utf8');
  for (const id of ids) {
    if (!new RegExp(`^\\s*${id}:`, 'm').test(src)) warnings.push(`${id}: not in server/top100/editions.js, so its Top 100 won't work online`);
  }
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** The link-preview tags from an edition's built page, so links to the site's front page get the same preview. */
function previewTags(id) {
  try {
    const page = fs.readFileSync(path.join(DIST, 'editions', id, 'index.html'), 'utf8');
    const tags = page.match(/<meta (property="og:|name="twitter:)[^>]*>/g) ?? [];
    return tags.map((tag) => `
  ${tag}`).join('');
  } catch { return ''; }
}

function writeLandingPage(editions) {
  const link = (e) => `editions/${encodeURIComponent(e.id)}/index.html`;
  const head = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">`;

  const html = editions.length === 1
    ? `${head}${previewTags(editions[0].id)}
  <meta http-equiv="refresh" content="0; url=${link(editions[0])}">
  <title>${esc(editions[0].title)}</title>
</head>
<body>
  <p><a href="${link(editions[0])}">Play ${esc(editions[0].title)}</a></p>
</body>
</html>
`
    : `${head}
  <title>Who Wants To Win · Choose your quiz</title>
  <meta name="description" content="One wrong answer and you're out. Pick a quiz and see if you can make the Top 40.">
  <link rel="icon" type="image/png" sizes="192x192" href="media/brand/icon-192.png">
  <link rel="apple-touch-icon" href="media/brand/icon-180.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Who Wants To Win">
  <meta property="og:title" content="Who Wants To Win · Choose your quiz">
  <meta property="og:description" content="One wrong answer and you're out. Pick a quiz and see if you can make the Top 40.">${siteAddress() ? `
  <meta property="og:url" content="${esc(siteAddress())}/">
  <meta property="og:image" content="${esc(siteAddress())}/media/brand/share-1200x630.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Who Wants To Win: gold lettering on a green quiz-show answer plate">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#0b0f0d">
  <style>
    :root { color-scheme: dark; --bg: #0b0f0d; --line: rgba(255,255,255,.14); --text: #e8ece9; --muted: #b3bcb7; --accent: #e0c27a; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; padding: 56px 16px; background: radial-gradient(ellipse at top, #18201c 0%, var(--bg) 60%) var(--bg); color: var(--text); font: 16px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; }
    main { max-width: 640px; margin: 0 auto; }
    .logo { display: block; width: 100%; max-width: 520px; height: auto; margin: 0 0 20px; }
    h1 { margin: 4px 0 8px; font-size: clamp(1.8rem, 6vw, 2.4rem); line-height: 1.15; }
    .lead { margin: 0 0 32px; color: var(--muted); }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
    a.edition { display: flex; gap: 16px; align-items: center; padding: 16px; border-radius: 16px; border: 1px solid var(--line); background: var(--card); color: var(--text); text-decoration: none; transition: transform .15s ease, border-color .15s ease; }
    a.edition:hover { transform: translateY(-2px); border-color: var(--accent); }
    a.edition:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    a.edition img { flex: none; width: 64px; height: 64px; border-radius: 14px; }
    .text { min-width: 0; flex: 1; }
    .title { display: block; font-weight: 700; font-size: 1.05rem; line-height: 1.3; }
    .desc { display: block; margin-top: 4px; color: var(--muted); font-size: .92rem; }
    .play { flex: none; padding: 8px 14px; border-radius: 999px; background: var(--accent); color: #0b0f0d; font-weight: 700; font-size: .9rem; }
    @media (max-width: 420px) { .play { display: none; } a.edition img { width: 52px; height: 52px; } }
    @media (prefers-reduced-motion: reduce) { a.edition { transition: none; } a.edition:hover { transform: none; } }
  </style>
</head>
<body>
  <main>
    <img class="logo" src="media/brand/logo.svg" alt="Who Wants To Win" width="1000" height="204">
    <h1>Choose your quiz</h1>
    <p class="lead">One wrong answer and you're out. How far can you go?</p>
    <ul>
${editions.map((e) => `      <li><a class="edition" href="${link(e)}" style="--card: ${e.background}">${e.icon ? `<img src="${esc(e.icon)}" alt="" width="64" height="64">` : ''}<span class="text"><span class="title">${esc(e.title)}</span>${e.description ? `<span class="desc">${esc(e.description)}</span>` : ''}</span><span class="play" aria-hidden="true">Play</span></a></li>`).join('\n')}
    </ul>
  </main>
</body>
</html>
`;
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function approvedCount(editionDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(editionDir, 'data/questions/approved-questions.json'), 'utf8')).questions.length;
  } catch { return 0; }
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyEngine();
  copyAdverts();
  copyBrand();

  const editionsDir = path.join(ROOT, 'editions');
  const found = fs.readdirSync(editionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(editionsDir, e.name, 'index.html')))
    .map((e) => e.name)
    .sort();
  // An edition still being written (no approved questions yet) is left off the hosted site.
  // "hosted": false in an edition's data/edition.json holds it back from the hosted site until it's ready.
  const ids = found.filter((id) => {
    let hosted = true;
    try { hosted = JSON.parse(fs.readFileSync(path.join(editionsDir, id, 'data/edition.json'), 'utf8')).hosted !== false; } catch { /* treat as hosted */ }
    if (!hosted) { warnings.push(`${id}: "hosted": false in data/edition.json, so it is left out of this build`); return false; }
    if (approvedCount(path.join(editionsDir, id))) return true;
    warnings.push(`${id}: no approved questions yet, so it is left out of this build`);
    return false;
  });
  if (!ids.length) throw new Error('No editions with approved questions found in editions/');

  const editions = ids.map(copyEdition);
  ids.forEach(checkAdverts);
  ids.forEach(absoluteShareTags);
  checkTop100(ids);
  // Top 100 moderation page (password-protected by TOP100_ADMIN_KEY, not linked from the game).
  copy(path.join(ROOT, 'admin/top100.html'), path.join(DIST, 'admin/top100.html'));
  copy(path.join(ROOT, 'admin/stats.html'), path.join(DIST, 'admin/stats.html'));
  writeLandingPage(editions);
  writeRedirects(ids);

  // Netlify reads this file: keep the test site out of search engines.
  fs.writeFileSync(path.join(DIST, '_headers'), '/*\n  X-Robots-Tag: noindex\n');

  const files = listFiles(DIST);
  const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  console.log(`Built dist/ with ${files.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Editions: ${ids.join(', ')}`);
  for (const w of warnings) console.warn(`Warning: ${w}`);
  console.log('Next: drag the dist folder onto your Netlify site (see README, "Sharing a test link").');
}

build();
