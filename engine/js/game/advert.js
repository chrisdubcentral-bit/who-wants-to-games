// Short video adverts between stages. Each edition lists them in data/adverts.json (managed on the admin page's
// Adverts tab); which ones are showing today is decided in core/adverts.js (on/off switch and start/end dates):
//   { "id", "name", "enabled": true, "from": "2026-12-01", "until": null, "after": "round-1", "landscape": "….mp4",
//     "portrait": "….mp4", "skipAfterMs": 5000, "label": "Celtic Pools", "url": "https://…", "linkText": "Join Now" }
// The advert plays once the newspaper splash has gone. It's muted (phones only autoplay muted video) and a Skip button
// appears after skipAfterMs. With a "url", tapping the video or the link button opens it in a new tab, so the game
// carries on underneath. A missing or broken video never holds the game up: the overlay just closes.
// Adverts showing after the same stage take turns: one per game, in the order listed (a new season counts as a new game).

import { html, esc } from '../ui/dom.js';
import { t } from '../core/edition.js';
import { getAdverts, showingAfter } from '../core/adverts.js';
import { local, KEYS } from '../core/storage.js';

const MAX_HOLD_MS = 20000;     // the longest an advert can hold the game, even if the video stalls
const DEFAULT_SKIP_MS = 5000;

/**
 * The break to play after the given stage, or undefined. When several breaks share the stage they take turns:
 * runKey identifies the game, so the same game always gets the same advert and the next game gets the next one.
 */
export function breakAfter(stageKey, runKey = null) {
  const options = showingAfter(getAdverts(), stageKey);
  if (options.length <= 1 || !runKey) return options[0];

  const turns = local.read(KEYS.advertTurns, {}) ?? {};
  let turn = turns[stageKey];
  if (!turn || turn.run !== runKey) {
    turn = { run: runKey, n: turn && Number.isInteger(turn.n) ? turn.n + 1 : 0 };
    local.write(KEYS.advertTurns, { ...turns, [stageKey]: turn });
  }
  return options[turn.n % options.length];
}

/** The landscape file on a wide screen, the portrait one on a phone held upright (or whichever one is set). */
function sourceFor(brk) {
  const upright = window.matchMedia('(orientation: portrait)').matches;
  return (upright ? brk.portrait : brk.landscape) || brk.landscape || brk.portrait;
}

function makeVideo(brk) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.disablePictureInPicture = true;
  v.src = sourceFor(brk);
  v.dataset.after = brk.after;
  return v;
}

/** Starts loading the advert ahead of time (while the question before the break is on screen). Returns the <video>. */
export function preloadAdvert(brk) {
  const v = makeVideo(brk);
  v.hidden = true;
  document.body.appendChild(v);
  return v;
}

/**
 * Shows the advert full screen. Returns { done, skip, close }:
 *   done   resolves with the milliseconds the game was held, so they can be given back to the player's time
 *          (0 if the screen was left before it finished)
 *   skip   closes it, once the skip delay has passed
 *   close  closes it at once (used when the player leaves the quiz screen)
 */
export function showAdvert(brk, preloaded = null) {
  const skipAfter = Number.isFinite(brk.skipAfterMs) ? Math.max(0, brk.skipAfterMs) : DEFAULT_SKIP_MS;
  // Reuse the preloaded video unless the phone has been turned round since, which needs the other file.
  const reusable = preloaded && preloaded.dataset.after === brk.after && preloaded.getAttribute('src') === sourceFor(brk);
  const video = reusable ? preloaded : makeVideo(brk);
  if (preloaded && !reusable) preloaded.remove();
  video.hidden = false;

  const url = typeof brk.url === 'string' && /^https?:\/\//i.test(brk.url) ? brk.url : null;
  const linkAttrs = url ? `href="${esc(url)}" target="_blank" rel="noopener"` : '';
  const el = html(`
    <div class="advert" role="dialog" aria-label="Advertisement">
      <div class="advert-frame">
        ${url ? `<a class="advert-media" ${linkAttrs} aria-label="${esc(brk.label ?? '')} ${esc(brk.linkText ?? t('advert.link'))}"></a>` : '<div class="advert-media"></div>'}
        <div class="advert-bar">
          <span class="eyebrow">${esc(t('advert.eyebrow'))}${brk.label ? ` · ${esc(brk.label)}` : ''}</span>
          <span class="advert-actions">
            ${url ? `<a class="btn btn-sm btn-primary advert-link" ${linkAttrs}>${esc(brk.linkText ?? t('advert.link'))}</a>` : ''}
            <button type="button" class="btn btn-sm advert-skip" disabled></button>
          </span>
        </div>
      </div>
    </div>`);
  el.querySelector('.advert-media').append(video);
  const skipBtn = el.querySelector('.advert-skip');

  const started = performance.now();
  let timers = [];
  let finished = false;
  let canSkip = false;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  function finish(credit = true) {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout); timers = [];
    try { video.pause(); } catch { /* nothing to pause */ }
    el.classList.add('is-leaving');
    setTimeout(() => { el.remove(); video.remove(); }, 300);
    resolveDone(credit ? Math.round(performance.now() - started) : 0);
  }
  function allowSkip() {
    canSkip = true;
    skipBtn.disabled = false;
    skipBtn.textContent = t('advert.skip');
  }
  function countdown() {
    const left = Math.ceil((skipAfter - (performance.now() - started)) / 1000);
    if (left <= 0) { allowSkip(); return; }
    skipBtn.textContent = t('advert.skipIn', { s: left });
    timers.push(setTimeout(countdown, 250));
  }

  skipBtn.addEventListener('click', () => { if (canSkip) finish(); });
  video.addEventListener('ended', () => finish());
  video.addEventListener('error', () => finish());
  timers.push(setTimeout(() => finish(), MAX_HOLD_MS));

  document.body.appendChild(el);
  countdown();
  try { video.currentTime = 0; } catch { /* not loaded yet: it starts from the beginning anyway */ }
  const playing = video.play();
  if (playing && typeof playing.catch === 'function') playing.catch(() => finish());

  return {
    done,
    skip() { if (canSkip) finish(); },
    close() { finish(false); },
  };
}
