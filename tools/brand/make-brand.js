// Builds the Who Wants To Win brand files: SVGs with Anton lettering turned into outlines, then PNGs via headless Chrome.
// Usage: node make-brand.js <path to Anton-Regular.ttf> <output folder>
const fs = require('node:fs');
const path = require('node:path');
const opentype = require('opentype.js');
const puppeteer = require('puppeteer-core');

const [fontFile, OUT] = process.argv.slice(2);
const font = opentype.loadSync(fontFile);
const CAP = font.tables.os2.sCapHeight / font.unitsPerEm;
fs.mkdirSync(OUT, { recursive: true });

const D = '#020805';
// Gold chrome with the bevel three-quarters of the way down.
const GOLD = [[0,'#fff6d6'],[.45,'#f3d48a'],[.72,'#9c6a17'],[.77,'#ffe7a3'],[.9,'#e0b456'],[1,'#a77a25']];
const stops = GOLD.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');

let uid = 0;
/** Centred outlined lettering with a gold gradient pinned to the capitals. */
function word(cx, y, size, tracking, text, stroke = 3) {
  const opts = { letterSpacing: tracking / size };
  const w = font.getAdvanceWidth(text, size, opts) - tracking; // no trailing space after the last letter
  const d = font.getPath(text, cx - w / 2, y, size, opts).toPathData(2);
  const id = 'w' + (uid++);
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${(y - size * CAP).toFixed(2)}" x2="0" y2="${y}">${stops}</linearGradient>
  <path d="${d}" fill="url(#${id})" stroke="${D}" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke"/>`;
}
/** Plain lettering for taglines. */
function plain(cx, y, size, tracking, text, fill) {
  const opts = { letterSpacing: tracking / size };
  const w = font.getAdvanceWidth(text, size, opts) - tracking;
  return `<path d="${font.getPath(text, cx - w / 2, y, size, opts).toPathData(2)}" fill="${fill}"/>`;
}

const DEFS = `<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>
  <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14402b"/><stop offset=".5" stop-color="#0a2618"/><stop offset="1" stop-color="#03110a"/></linearGradient>
  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e0c27a" stop-opacity="0"/><stop offset=".25" stop-color="#e0c27a"/><stop offset=".75" stop-color="#e0c27a"/><stop offset="1" stop-color="#e0c27a" stop-opacity="0"/></linearGradient>
  <radialGradient id="ground" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#15452e"/><stop offset="1" stop-color="#000"/></radialGradient>
  <radialGradient id="wide" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#15452e"/><stop offset=".6" stop-color="#06180f"/><stop offset="1" stop-color="#020805"/></radialGradient>
</defs>`;

const lozenge = (pts, inner) => `<polygon points="${pts}" fill="url(#plate)" stroke="${D}" stroke-width="18" stroke-linejoin="round"/>
  <polygon points="${pts}" fill="none" stroke="url(#gold)" stroke-width="9" stroke-linejoin="round"/>
  <polygon points="${inner}" fill="none" stroke="#e0c27a" stroke-opacity=".35" stroke-width="2"/>`;
const diamond = (x, y, s) => `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" transform="rotate(45 ${x} ${y})" fill="url(#gold)"/>`;

/** The wordmark in a 1000-wide space, plate centred on y=150. */
const wordmark = () => `<line x1="0" y1="150" x2="1000" y2="150" stroke="url(#rule)" stroke-width="4"/>
  ${diamond(34, 150, 14)}${diamond(966, 150, 14)}
  ${lozenge('70,150 140,64 860,64 930,150 860,236 140,236', '102,150 156,84 844,84 898,150 844,216 156,216')}
  ${word(500, 186, 96, 3, 'WHO WANTS TO WIN')}`;

/** The square mark in a 600 space. */
const mark = (ground = true) => `${ground ? '<rect width="600" height="600" fill="url(#ground)"/>' : ''}
  <line x1="0" y1="350" x2="600" y2="350" stroke="url(#rule)" stroke-width="4"/>
  ${word(300, 250, 78, 5, 'WHO WANTS')}
  ${lozenge('40,350 92,286 508,286 560,350 508,414 92,414', '70,350 108,304 492,304 530,350 492,396 108,396')}
  ${word(300, 386, 96, 6, 'TO WIN')}`;

const svg = (vb, body, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${w ? ` width="${w}" height="${h}"` : ''}>
<title>Who Wants To Win</title>
${DEFS}
${body}
</svg>
`;

const files = {
  'logo.svg': svg('0 48 1000 204', wordmark()),
  'logo-mark.svg': svg('0 0 600 600', mark()),
  'logo-mark-transparent.svg': svg('0 0 600 600', mark(false)),
  // X / Twitter header: logo kept in the middle third, clear of the profile picture at bottom left.
  'x-header.svg': svg('0 0 1500 500', `<rect width="1500" height="500" fill="url(#wide)"/>
    <g transform="translate(300 60) scale(.9)">${wordmark()}</g>
    ${plain(750, 370, 34, 8, 'ONE WRONG ANSWER AND YOU\u2019RE OUT', '#b3bcb7')}`),
  // Link previews (Facebook, WhatsApp, X cards): 1200 x 630.
  'share.svg': svg('0 0 1200 630', `<rect width="1200" height="630" fill="url(#wide)"/>
    <g transform="translate(100 120)">${wordmark()}</g>
    ${plain(600, 470, 38, 8, 'ONE WRONG ANSWER AND YOU\u2019RE OUT', '#d8ddda')}
    ${plain(600, 530, 28, 10, 'CHOOSE YOUR QUIZ', '#e0c27a')}`),
};
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), text);

const PNGS = [
  ['logo-mark.svg', 'profile-400.png', 400, 400],
  ['logo-mark.svg', 'profile-1024.png', 1024, 1024],
  ['logo-mark.svg', 'icon-512.png', 512, 512],
  ['logo-mark.svg', 'icon-192.png', 192, 192],
  ['logo-mark.svg', 'icon-180.png', 180, 180],
  ['logo.svg', 'logo-2000.png', 2000, 408],
  ['x-header.svg', 'x-header-1500x500.png', 1500, 500],
  ['share.svg', 'share-1200x630.png', 1200, 630],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const page = await browser.newPage();
  for (const [src, out, w, h] of PNGS) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const body = fs.readFileSync(path.join(OUT, src), 'utf8').replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" `);
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${body}`);
    await page.screenshot({ path: path.join(OUT, out), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    console.log('wrote', out);
  }
  await browser.close();
  for (const s of ['x-header.svg', 'share.svg']) fs.unlinkSync(path.join(OUT, s)); // sources only; the PNGs are what get uploaded
})();
