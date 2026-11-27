// Builds the Glasgow edition's "Red Wash" pictures with headless Chrome (no npm install needed).
// Usage: node tools/brand/make-glasgow-images.js
// Writes to editions/glasgow/assets/img:
//   gig-backdrop.jpg  the gig photo at the Barras (tools/brand/barras-gig-source.jpg), black and white, washed in red,
//                     faded to black at the sides and bottom. It sits at the top of every screen (edition.css).
//   barras-stamp.png  the rubber-stamp emblem: the prize, the front-page picture and the share card's prize.
//   icon-180.png, icon-192.png, icon-512.png  home-screen icons.
//   share-preview.png the 1200 x 630 link-preview picture.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'editions/glasgow/assets/img');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FONT = pathToFileURL(path.join(__dirname, 'Anton-Regular.ttf')).href;
const PHOTO = path.join(__dirname, 'barras-gig-source.jpg');
const RED = '#d4141c', BONE = '#f1ebe1', BLACK = '#0a0606';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glasgow-img-'));
const chrome = (args, src) => execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--allow-file-access-from-files', '--virtual-time-budget=5000', ...args, pathToFileURL(src).href],
  { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return f; };

// ---------- 1. The red-washed backdrop, encoded as JPEG by Chrome's canvas and read back from the page ----------
const photoData = 'data:image/jpeg;base64,' + fs.readFileSync(PHOTO).toString('base64');
const backdropSrc = write('backdrop.html', `<!doctype html><meta charset="utf-8"><body><script>
const img = new Image();
img.onload = () => {
  const w = 1600, h = Math.round(img.height * 1600 / img.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.filter = 'grayscale(1) brightness(1.7) contrast(1.3)';
  x.drawImage(img, 0, 0, w, h);
  x.filter = 'none';
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = '${RED}'; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  const fade = (g, stops) => { stops.forEach(([o, a]) => g.addColorStop(o, 'rgba(10,6,6,' + a + ')')); x.fillStyle = g; x.fillRect(0, 0, w, h); };
  fade(x.createLinearGradient(0, 0, 0, h), [[0, 0], [0.5, 0.05], [0.8, 0.8], [1, 1]]);
  fade(x.createLinearGradient(0, 0, w, 0), [[0, 1], [0.16, 0], [0.84, 0], [1, 1]]);
  document.body.textContent = 'IMG[' + c.toDataURL('image/jpeg', 0.8) + ']IMG';
};
img.src = '${photoData}';
</script></body>`);
const dom = chrome(['--dump-dom'], backdropSrc).toString();
const m = dom.match(/IMG\[data:image\/jpeg;base64,([^\]]+)\]IMG/);
if (!m) throw new Error('Chrome did not return the backdrop');
fs.writeFileSync(path.join(OUT, 'gig-backdrop.jpg'), Buffer.from(m[1], 'base64'));
console.log('wrote gig-backdrop.jpg');

// ---------- 2. The stamp, as inline SVG so Chrome draws its lettering in Anton ----------
const stamp = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 264 264">
  <defs>
    <path id="ring" d="M132 132m-92 0a92 92 0 1 1 184 0a92 92 0 1 1 -184 0"/>
    <filter id="worn"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -0.55" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
  </defs>
  <g filter="url(#worn)">
    <circle cx="132" cy="132" r="124" fill="none" stroke="${BONE}" stroke-width="7"/>
    <circle cx="132" cy="132" r="66" fill="none" stroke="${BONE}" stroke-width="4"/>
    <text font-family="Anton" font-size="28" fill="${BONE}"><textPath href="#ring" textLength="574" lengthAdjust="spacing">THE BARRAS \u2605 GLASGOW \u2605 LIVE \u2605</textPath></text>
    <path d="M132 86L178 132L132 178L86 132Z" fill="${BONE}"/>
    <path d="M132 106L158 132L132 158L106 132Z" fill="${RED}"/>
  </g>
</svg>`;

const page = (w, h, body, bg = 'transparent') => `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: Anton; src: url("${FONT}"); }
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: ${bg}; }
  svg, img { display: block; }
</style><body>${body}</body>`;

const backdrop = pathToFileURL(path.join(OUT, 'gig-backdrop.jpg')).href;
const icon = (s) => page(s, s, `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;
  background:radial-gradient(circle at 50% 45%, #5a0d10 0%, #250607 60%, ${BLACK} 100%)">
  <div style="transform:rotate(-12deg)">${stamp(Math.round(s * 0.72))}</div></div>`, BLACK);

const share = page(1200, 630, `<div style="position:relative;width:1200px;height:630px;font-family:Anton,Impact,sans-serif;
    background:linear-gradient(90deg, rgba(10,6,6,.2) 0%, rgba(10,6,6,.55) 45%, rgba(10,6,6,.92) 75%), url('${backdrop}') center 30%/cover, ${BLACK}">
  <div style="position:absolute;left:70px;top:135px;transform:rotate(-12deg)">${stamp(360)}</div>
  <div style="position:absolute;left:520px;right:50px;top:56px">
    <span style="display:inline-block;background:${BLACK};padding:6px 16px;font-size:54px;letter-spacing:4px;color:${BONE}">WHO WANTS TO PLAY</span>
    <div style="font-size:150px;line-height:.88;color:${BONE};text-shadow:-6px 4px 0 ${RED};margin-top:12px">THE BARRAS</div>
    <span style="display:inline-block;margin-top:22px;background:${RED};padding:8px 18px;font:bold 34px 'Courier New',monospace;letter-spacing:6px;color:#fff">GLASGOW EDITION</span>
    <div style="margin-top:26px;font:bold 22px 'Courier New',monospace;color:#e6dcd0;white-space:nowrap">Eight venues. One wrong answer and it\u2019s over.</div>
  </div></div>`, BLACK);

const jobs = [['barras-stamp.png', 512, 512, page(512, 512, stamp(512)), true],
  ['icon-180.png', 180, 180, icon(180)], ['icon-192.png', 192, 192, icon(192)], ['icon-512.png', 512, 512, icon(512)],
  ['share-preview.png', 1200, 630, share]];
for (const [name, w, h, html, clear] of jobs) {
  const args = [`--window-size=${w},${h}`, `--screenshot=${path.join(OUT, name)}`];
  if (clear) args.push('--default-background-color=00000000');
  chrome(args, write(name + '.html', html));
  console.log('wrote', name);
}
fs.rmSync(tmp, { recursive: true, force: true });
