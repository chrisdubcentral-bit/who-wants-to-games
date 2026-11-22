// Builds the Beatles edition's home-screen icons and link-preview picture with headless Chrome (no npm install needed).
// Usage: node tools/brand/make-beatles-images.js
// Writes editions/beatles/assets/img/icon-180.png, icon-192.png, icon-512.png and share-preview.png.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'editions/beatles/assets/img');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FONT = pathToFileURL(path.join(__dirname, 'Anton-Regular.ttf')).href;
const CROWD = pathToFileURL(path.join(OUT, 'crowd.jpg')).href;

/** The gold disc in a silver chrome ring, drawn in a 600 x 600 space. The only gold in the Beatles look is the disc. */
const disc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".2" stop-color="#bdbdbd"/><stop offset=".47" stop-color="#4a4a4a"/>
      <stop offset=".53" stop-color="#f2f2f2"/><stop offset=".8" stop-color="#8c8c8c"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <radialGradient id="gold" cx=".38" cy=".32" r=".8">
      <stop offset="0" stop-color="#fff3cf"/><stop offset=".45" stop-color="#e0c27a"/><stop offset="1" stop-color="#9a7830"/>
    </radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".35"/>
      <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle cx="300" cy="300" r="282" fill="#050505"/>
  <circle cx="300" cy="300" r="270" fill="none" stroke="url(#chrome)" stroke-width="22"/>
  <circle cx="300" cy="300" r="238" fill="url(#gold)"/>
  <g fill="none" stroke="#7a5e22" stroke-opacity=".45" stroke-width="3">
    <circle cx="300" cy="300" r="212"/><circle cx="300" cy="300" r="190"/><circle cx="300" cy="300" r="168"/>
    <circle cx="300" cy="300" r="146"/><circle cx="300" cy="300" r="124"/>
  </g>
  <circle cx="300" cy="300" r="238" fill="url(#shine)"/>
  <circle cx="300" cy="300" r="84" fill="#050505" stroke="url(#chrome)" stroke-width="6"/>
  <circle cx="300" cy="300" r="14" fill="#e0c27a"/>
</svg>`;

const page = (w, h, body) => `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: Anton; src: url("${FONT}"); }
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #000; }
  svg { display: block; }
  .chrome { background: linear-gradient(180deg, #ffffff 0%, #e0e0e0 38%, #5c5c5c 52%, #ffffff 60%, #b0b0b0 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
</style><body>${body}</body>`;

// Home-screen icon: full-bleed black (Android crops maskable icons to a circle, so the disc sits inside the safe zone).
const icon = (s) => page(s, s, `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;
  background:radial-gradient(circle at 50% 42%, #2a2a2a 0%, #0a0a0a 60%, #000 100%)">
  <div style="width:${Math.round(s * 0.8)}px;height:${Math.round(s * 0.8)}px">${disc.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`);

// Link preview, 1200 x 630: the crowd photo, the disc on the left, the title on the right.
const share = page(1200, 630, `<div style="position:relative;width:1200px;height:630px;font-family:Anton,Impact,sans-serif;
  background:linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,.8) 100%), url('${CROWD}') center/cover">
  <div style="position:absolute;left:70px;top:135px;width:360px;height:360px;filter:drop-shadow(0 18px 40px rgba(0,0,0,.8))">
    ${disc.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  <div style="position:absolute;left:480px;right:60px;top:118px;text-align:center">
    <div class="chrome" style="font-size:58px;letter-spacing:6px;line-height:1">WHO WANTS TO PLAY</div>
    <div class="chrome" style="font-size:112px;letter-spacing:4px;line-height:1.08">SHEA STADIUM</div>
    <div style="height:3px;margin:22px 30px;background:linear-gradient(90deg, transparent, #fff 25%, #fff 75%, transparent)"></div>
    <div style="font-size:34px;letter-spacing:14px;color:#e0c27a">BEATLES EDITION</div>
    <div style="margin-top:30px;font-size:24px;letter-spacing:3px;white-space:nowrap;color:#d9d9d9">EIGHT VENUES. ONE WRONG ANSWER AND IT\u2019S OVER.</div>
  </div></div>`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beatles-img-'));
const jobs = [['icon-180.png', 180, 180, icon(180)], ['icon-192.png', 192, 192, icon(192)],
  ['icon-512.png', 512, 512, icon(512)], ['share-preview.png', 1200, 630, share]];
for (const [name, w, h, html] of jobs) {
  const src = path.join(tmp, name + '.html');
  fs.writeFileSync(src, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--virtual-time-budget=3000', `--window-size=${w},${h}`, `--screenshot=${path.join(OUT, name)}`, pathToFileURL(src).href],
    { stdio: 'ignore' });
  console.log('wrote', name);
}
fs.rmSync(tmp, { recursive: true, force: true });
