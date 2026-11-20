// Sharing a Top 40 place: a message with a link back to the game, and a scorecard picture drawn here in the browser.
//
// On phones and tablets the Share button opens the device's own share menu (WhatsApp, Instagram, Facebook,
// Messages... whatever is installed), with the scorecard attached where the device allows it. On computers it
// opens a small panel with WhatsApp, X, Facebook, Copy and Save image. Nothing is posted without the player
// seeing it and confirming in the app they pick.
//
// Links carry ?utm_source=shared-score, so visits from them show as "Shared scores" on the stats dashboard.

import { html, esc } from '../ui/dom.js';
import { t, ed, prizeCount } from '../core/edition.js';
import { openModal } from '../ui/components/modal.js';
import { track } from '../core/analytics.js';
import { STATUS } from './game-engine.js';
import { cupsOf, LIMIT } from './leaderboard.js';

export const SHARE_TAG = 'shared-score';
const W = 1080;
const H = 1350; // 4:5, the shape Instagram, WhatsApp and Facebook show without cropping

/**
 * This edition's game page, without any game position or query, tagged for the stats dashboard. Uses the short
 * address (/celtic rather than /editions/celtic/), which the site redirects to the game (see tools/build.js).
 */
export function shareUrl() {
  const u = new URL(location.href);
  u.hash = '';
  u.search = '';
  u.pathname = u.pathname.replace(/index\.html$/, '').replace(/\/editions\/([^/]+)\/$/, '/$1');
  u.searchParams.set('utm_source', SHARE_TAG);
  return u.href;
}

/** The round a board entry ended in, e.g. "Quarter-Final". A run that ended with a win ended in the Final. */
function roundLabel(entry, meta) {
  if (entry.result === STATUS.WON) return meta.stages[meta.stages.length - 1]?.label ?? 'Final';
  const stage = meta.stageByKey?.[entry.stageKey] ?? meta.stages?.[entry.stageReachedIndex];
  return stage?.label ?? entry.stageReachedLabel ?? '';
}

/** The words that go with the link. */
export function shareMessage(entry, rank, meta) {
  const cups = cupsOf(entry);
  const game = t('share.game');
  return cups
    ? t('share.withCups', { rank, game, count: prizeCount(cups) })
    : t('share.noCups', { rank, game, stage: roundLabel(entry, meta) });
}

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

async function fontsReady() {
  if (!document.fonts?.load) return;
  const wait = Promise.all([
    document.fonts.load('900 100px Montserrat'), document.fonts.load('800 60px Montserrat'),
    document.fonts.load('700 40px Montserrat'), document.fonts.load('600 36px Inter'),
  ]).catch(() => {});
  await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]);
}

/** Shrinks the font until the text fits the width. */
function fitText(ctx, text, maxWidth, weight, size, family = 'Montserrat') {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}, system-ui, sans-serif`; s -= 2; } while (s > 18 && ctx.measureText(text).width > maxWidth);
}

function spaced(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the scorecard and returns it as a PNG File, or null if this browser can't. */
export async function makeCard(entry, rank, meta) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx?.measureText) return null;
    const [, logo, trophy] = await Promise.all([fontsReady(), loadImage('assets/img/logo.svg'), loadImage(ed('images.prize'))]);
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const gold = v('--gold-bright', '#E0C27A');
    const goldDark = v('--gold', '#C7A45A');
    const grey = v('--grey-light', '#C8D0CA');
    const muted = v('--grey-muted', '#89958D');

    // Background: deep green with a glow at the top, a gold frame.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, v('--emerald-dark', '#0E4D38'));
    bg.addColorStop(0.45, v('--bg-panel', '#0D1712'));
    bg.addColorStop(1, v('--studio-bg', '#06100B'));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 120, 720);
    glow.addColorStop(0, 'rgba(31, 138, 98, 0.55)'); glow.addColorStop(1, 'rgba(31, 138, 98, 0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const rim = ctx.createLinearGradient(0, 0, 0, H);
    rim.addColorStop(0, '#fff3cf'); rim.addColorStop(0.5, goldDark); rim.addColorStop(1, gold);
    ctx.strokeStyle = rim; ctx.lineWidth = 4;
    roundRect(ctx, 32, 32, W - 64, H - 64, 36); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (logo) ctx.drawImage(logo, W / 2 - 60, 84, 120, 120);

    // Title
    ctx.fillStyle = '#FFFFFF'; spaced(ctx, 4);
    fitText(ctx, t('share.cardTitleTop').toUpperCase(), W - 200, 800, 50);
    ctx.fillText(t('share.cardTitleTop').toUpperCase(), W / 2, 280);
    const titleGold = ctx.createLinearGradient(0, 290, 0, 350);
    titleGold.addColorStop(0, '#f6e2a6'); titleGold.addColorStop(1, goldDark);
    ctx.fillStyle = titleGold; spaced(ctx, 2);
    fitText(ctx, t('share.cardTitle').toUpperCase(), W - 180, 900, 76);
    ctx.fillText(t('share.cardTitle').toUpperCase(), W / 2, 356);
    ctx.fillStyle = grey; spaced(ctx, 10);
    ctx.font = '700 26px Montserrat, system-ui, sans-serif';
    ctx.fillText(t('share.cardEdition').toUpperCase(), W / 2, 408);

    // Divider
    const line = ctx.createLinearGradient(200, 0, W - 200, 0);
    line.addColorStop(0, 'rgba(224,194,122,0)'); line.addColorStop(0.5, gold); line.addColorStop(1, 'rgba(224,194,122,0)');
    ctx.fillStyle = line; ctx.fillRect(200, 452, W - 400, 2);

    // Rank
    ctx.fillStyle = gold; spaced(ctx, 12);
    ctx.font = '800 30px Montserrat, system-ui, sans-serif';
    ctx.fillText(`TOP ${LIMIT}`, W / 2, 524);
    spaced(ctx, 0);
    const rankGold = ctx.createLinearGradient(0, 540, 0, 760);
    rankGold.addColorStop(0, '#fff3cf'); rankGold.addColorStop(0.5, gold); rankGold.addColorStop(1, goldDark);
    ctx.fillStyle = rankGold;
    ctx.font = '900 250px Montserrat, system-ui, sans-serif';
    ctx.fillText(`#${rank}`, W / 2, 752);

    // Player
    ctx.fillStyle = '#FFFFFF';
    fitText(ctx, entry.name, W - 200, 800, 66);
    ctx.fillText(entry.name, W / 2, 846);
    if (entry.town) {
      ctx.fillStyle = grey;
      fitText(ctx, entry.town, W - 200, 600, 36, 'Inter');
      ctx.fillText(entry.town, W / 2, 900);
    }

    // Three stat boxes
    const cups = cupsOf(entry);
    const boxes = [
      { label: t('top100.prizeColumn').toUpperCase(), value: cups ? `× ${cups}` : '0', icon: cups ? trophy : null },
      { label: 'ROUND', value: roundLabel(entry, meta) },
      { label: '50:50', value: entry.lifelineUsed ? 'Used' : 'Not used' },
    ];
    const bw = 280, gap = 24, bh = 170, by = 960;
    const bx0 = (W - (bw * 3 + gap * 2)) / 2;
    boxes.forEach((b, i) => {
      const x = bx0 + i * (bw + gap);
      ctx.fillStyle = 'rgba(18, 30, 23, 0.85)';
      roundRect(ctx, x, by, bw, bh, 22); ctx.fill();
      ctx.strokeStyle = 'rgba(224, 194, 122, 0.35)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = muted; spaced(ctx, 6);
      ctx.font = '700 22px Montserrat, system-ui, sans-serif';
      ctx.fillText(b.label, x + bw / 2, by + 50);
      spaced(ctx, 0);
      ctx.fillStyle = i === 0 && cups ? gold : '#FFFFFF';
      fitText(ctx, b.value, bw - (b.icon ? 100 : 36), 800, 46);
      const textW = ctx.measureText(b.value).width;
      if (b.icon) {
        const ih = 64, iw = ih * (b.icon.width / b.icon.height || 0.83);
        const start = x + bw / 2 - (iw + 12 + textW) / 2;
        ctx.drawImage(b.icon, start, by + 72, iw, ih);
        ctx.textAlign = 'left';
        ctx.fillText(b.value, start + iw + 12, by + 126);
        ctx.textAlign = 'center';
      } else {
        ctx.fillText(b.value, x + bw / 2, by + 126);
      }
    });

    // Call to action and address
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 46px Montserrat, system-ui, sans-serif';
    ctx.fillText(t('share.cardCta'), W / 2, 1222);
    ctx.fillStyle = gold;
    ctx.font = '600 30px Inter, system-ui, sans-serif';
    ctx.fillText(location.host, W / 2, 1272);

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return null;
    const name = `${ed('id', 'game')}-top-${LIMIT}-number-${rank}.png`;
    try { return new File([blob], name, { type: 'image/png' }); } catch { return Object.assign(blob, { name }); }
  } catch {
    return null;
  }
}

const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Gets a share ready for one Top 100 place: the message straight away and the scorecard in the background,
 * so the Share button can open the share menu at once (phones only allow it straight after a tap).
 */
export function prepareShare(entry, rank, meta) {
  const prep = { entry, rank, message: shareMessage(entry, rank, meta), url: shareUrl(), file: null };
  prep.ready = makeCard(entry, rank, meta).then((f) => { prep.file = f; return f; });
  return prep;
}

/** Runs when the Share button is tapped. */
export async function share(prep) {
  const full = `${prep.message} ${prep.url}`;
  if (isTouch() && navigator.share) {
    const data = { title: t('share.game'), text: full };
    if (prep.file && navigator.canShare?.({ files: [prep.file] })) data.files = [prep.file];
    try {
      await navigator.share(data);
      track('share', { detail: 'share_menu' });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // the player closed the menu
      // Otherwise (e.g. sharing blocked) fall back to the panel.
    }
  }
  openPanel(prep, full);
}

function openPanel(prep, full) {
  const enc = encodeURIComponent;
  const links = [
    { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(full)}` },
    { id: 'x', label: 'X', href: `https://x.com/intent/post?text=${enc(prep.message)}&url=${enc(prep.url)}` },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(prep.url)}` },
  ];
  const body = html(`
    <div class="share-panel">
      <div class="share-preview"><p class="muted">Drawing your scorecard…</p></div>
      <p class="share-message">${esc(full)}</p>
      <div class="share-buttons">
        ${links.map((l) => `<a class="btn btn-sm" href="${esc(l.href)}" target="_blank" rel="noopener" data-share="${l.id}">${esc(l.label)}</a>`).join('')}
        <button class="btn btn-sm" type="button" data-share="copy">Copy Message</button>
        <a class="btn btn-sm" data-share="download" hidden>Save Image</a>
      </div>
      <p class="muted share-tip">Facebook only takes the link, so paste the copied message in yourself. For Instagram, save the image and post it from the app.</p>
    </div>`);

  let objectUrl = null;
  const showCard = (file) => {
    if (!file) return;
    objectUrl = URL.createObjectURL(file);
    body.querySelector('.share-preview').innerHTML = `<img src="${objectUrl}" alt="Your scorecard: number ${prep.rank} in the Top ${LIMIT}" width="270" height="338">`;
    const save = body.querySelector('[data-share="download"]');
    save.href = objectUrl;
    save.download = file.name || 'scorecard.png';
    save.hidden = false;
  };
  if (prep.file) showCard(prep.file);
  else prep.ready.then((f) => (f ? showCard(f) : body.querySelector('.share-preview')?.remove()));

  body.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-share]');
    if (!el) return;
    const method = el.dataset.share;
    if (method === 'copy') {
      try {
        await navigator.clipboard.writeText(full);
        el.textContent = 'Copied';
      } catch {
        el.textContent = 'Copy failed';
        return;
      }
    }
    track('share', { detail: method });
  });

  openModal({ title: 'Share Your Score', body, actions: [{ label: 'Close', value: 'close', className: 'btn-ghost' }] })
    .then(() => { if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); });
}

/** The card with the Share button, for the results screen and the Top 100 page. */
export function shareCardHtml(rank, { link = false } = {}) {
  return `
    <div class="card board-entry-done share-card">
      <span class="eyebrow">Top ${LIMIT}</span>
      <p>You're number <strong>${rank}</strong> in the Top ${LIMIT}. Challenge your friends to beat it.</p>
      <div class="share-actions">
        <button class="btn btn-primary btn-sm" type="button" data-action="share">Share Your Score</button>
        ${link ? `<button class="btn btn-sm" data-go="top100">View Top ${LIMIT}</button>` : ''}
      </div>
    </div>`;
}

/** Wires the Share button inside a share card. */
export function wireShareCard(root, entry, rank, meta) {
  const btn = root.querySelector('[data-action="share"]');
  if (!btn) return;
  const prep = prepareShare(entry, rank, meta);
  btn.addEventListener('click', () => share(prep));
}
