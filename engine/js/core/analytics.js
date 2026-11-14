// Anonymous visit statistics, sent to /api/stats (netlify/functions/stats.mjs).
//
// Privacy by design: no cookies and nothing saved on the player's device for tracking. Each page visit gets
// a random id that only lives in memory, so a refresh is a new visit. The server never stores IP addresses.
// Players with "Do Not Track" or Global Privacy Control switched on are not counted at all.
// The site owner can exclude their own devices by opening the game once with ?notrack (and ?track to undo).
//
// What's sent: the visit (device type, the referring site's name, any ?utm_source), time on screen, and game
// events: game started/finished (stage reached), adverts shown/clicked/skipped, Top 100 entries.

import { local } from './storage.js';

const API = '/api/stats';
const FLUSH_MS = 5000;           // send queued events this often
const PING_MS = 30000;           // update time on screen this often while the page is visible
const MAX_TRACKED_MS = 6 * 3600 * 1000;
const OPT_OUT = 'stats:off';

let state = null; // { sid, edition, queue, activeMs, visibleSince, visitSent, lastSentActive }

function optedOut() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('notrack')) local.write(OPT_OUT, true);
    if (params.has('track')) local.remove(OPT_OUT);
    if (local.read(OPT_OUT, false)) return true;
  } catch { /* ignore */ }
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
}

function device() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const short = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0);
  if (!coarse) return 'desktop';
  return short >= 600 ? 'tablet' : 'phone';
}

function referrerHost() {
  try {
    const host = new URL(document.referrer).host;
    return host && host !== location.host ? host : '';
  } catch { return ''; }
}

function activeNow() {
  if (!state) return 0;
  const running = state.visibleSince != null ? performance.now() - state.visibleSince : 0;
  return Math.min(Math.round(state.activeMs + running), MAX_TRACKED_MS);
}

function payload() {
  const body = { sid: state.sid, edition: state.edition, activeMs: activeNow(), events: state.queue.splice(0, 50) };
  if (!state.visitSent) {
    const params = new URLSearchParams(location.search);
    body.visit = { device: device(), referrer: referrerHost(), utm: params.get('utm_source') ?? '' };
  }
  return body;
}

/** Sends whatever is waiting. On the way out of the page it uses sendBeacon, which survives the page closing. */
function flush({ leaving = false, force = false } = {}) {
  if (!state) return;
  const changed = state.queue.length || !state.visitSent || activeNow() - state.lastSentActive >= PING_MS - 1000;
  if (!changed && !force) return;
  const body = payload();
  const wasVisitSent = state.visitSent;
  state.visitSent = true;
  state.lastSentActive = body.activeMs;
  const text = JSON.stringify(body);
  try {
    if (leaving && navigator.sendBeacon) {
      navigator.sendBeacon(API, new Blob([text], { type: 'text/plain' }));
      return;
    }
    fetch(API, { method: 'POST', body: text, headers: { 'content-type': 'text/plain' } })
      .then(async (res) => {
        await res.text(); // read the reply so the browser can close the request
        if (!res.ok && res.status >= 500) throw new Error();
      })
      .catch(() => {
        // Not sent (offline, or no server behind Live Server): put the events back for the next try.
        if (!state) return;
        state.queue.unshift(...body.events);
        state.queue.length = Math.min(state.queue.length, 200);
        if (!wasVisitSent) state.visitSent = false;
      });
  } catch { /* never let statistics break the game */ }
}

function onVisibility() {
  if (!state) return;
  if (document.visibilityState === 'visible') {
    if (state.visibleSince == null) state.visibleSince = performance.now();
  } else {
    if (state.visibleSince != null) { state.activeMs += performance.now() - state.visibleSince; state.visibleSince = null; }
    flush({ leaving: true, force: true });
  }
}

/** Starts counting this visit. Does nothing for players who opt out, or if it has already started. */
export function startAnalytics({ edition }) {
  if (state || !edition || optedOut() || typeof fetch !== 'function') return;
  let sid;
  try { sid = crypto.randomUUID(); } catch { return; }
  state = {
    sid, edition, queue: [], activeMs: 0, lastSentActive: 0, visitSent: false,
    visibleSince: document.visibilityState === 'visible' ? performance.now() : null,
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => flush({ leaving: true, force: true }));
  setInterval(() => flush(), FLUSH_MS);
  flush();
}

/** Records an event: game_start, game_end, advert_shown, advert_click, advert_skip, advert_complete, top100_entry. */
export function track(type, props = {}) {
  if (!state) return;
  state.queue.push({ type, ...props });
  if (state.queue.length > 200) state.queue.splice(0, state.queue.length - 200);
}
