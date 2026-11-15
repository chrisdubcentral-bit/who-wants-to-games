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

/** Copies one edition and returns { id, title } for the landing page. */
function copyEdition(id) {
  const from = path.join(ROOT, 'editions', id);
  const to = path.join(DIST, 'editions', id);
  for (const item of EDITION_FILES) {
    const src = path.join(from, item);
    if (!fs.existsSync(src)) {
      if (item !== 'assets' && item !== 'data/adverts.json') warnings.push(`${id}: ${item} is missing`);
      continue;
    }
    copy(src, path.join(to, item));
  }

  let title = id;
  try {
    title = JSON.parse(fs.readFileSync(path.join(from, 'manifest.webmanifest'), 'utf8')).name || id;
  } catch { /* keep the folder name */ }
  return { id, title };
}

/**
 * Link previews need full addresses: turns the relative og:image in an edition's index.html into one and adds
 * og:url. Netlify sets URL (the site's main address) during its builds; SITE_URL overrides it.
 */
function absoluteShareTags(id) {
  const file = path.join(DIST, 'editions', id, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  if (!/property="og:image"/.test(html)) return;
  const site = (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');
  if (!site) {
    warnings.push(`${id}: no site address (Netlify sets URL when it builds), so link previews have no picture in this build`);
    return;
  }
  const page = `${site}/editions/${id}/`;
  html = html.replace(/(<meta property="og:image" content=")(?!https?:)([^"]+)"/, (m, a, rel) => `${a}${new URL(rel, page).href}"`);
  if (!/property="og:url"/.test(html)) {
    html = html.replace(/(\s*)(<meta property="og:image" )/, `$1<meta property="og:url" content="${esc(page)}">$1$2`);
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
  <title>Who Wants To Win</title>
  <style>
    body { margin: 0; padding: 48px 16px; background: #0b0f0d; color: #e8ece9; font: 16px/1.5 "Segoe UI", system-ui, sans-serif; }
    main { max-width: 640px; margin: 0 auto; }
    ul { list-style: none; padding: 0; display: grid; gap: 12px; }
    a { display: block; padding: 16px 18px; border-radius: 12px; background: #e0c27a; color: #0b0f0d; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <h1>Who Wants To Win</h1>
    <ul>
${editions.map((e) => `      <li><a href="${link(e)}">${esc(e.title)}</a></li>`).join('\n')}
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

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyEngine();
  copyAdverts();

  const editionsDir = path.join(ROOT, 'editions');
  const ids = fs.readdirSync(editionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(editionsDir, e.name, 'index.html')))
    .map((e) => e.name)
    .sort();
  if (!ids.length) throw new Error('No editions found in editions/');

  const editions = ids.map(copyEdition);
  ids.forEach(checkAdverts);
  ids.forEach(absoluteShareTags);
  checkTop100(ids);
  // Top 100 moderation page (password-protected by TOP100_ADMIN_KEY, not linked from the game).
  copy(path.join(ROOT, 'admin/top100.html'), path.join(DIST, 'admin/top100.html'));
  copy(path.join(ROOT, 'admin/stats.html'), path.join(DIST, 'admin/stats.html'));
  writeLandingPage(editions);

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
