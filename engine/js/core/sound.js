// Sound effects. On by default; the choice is saved in this browser.
// An edition can switch sound off completely with "sound": { "enabled": false } in data/edition.json.
// Plays assets/sfx/cheer.mp3 if that file exists, otherwise builds a crowd roar with Web Audio.
// Phones only allow sound after a tap, so the audio is unlocked on the first tap or key press.

import { local, KEYS } from './storage.js';
import { ed } from './edition.js';

const CHEER_FILE = 'assets/sfx/cheer.mp3';
const VOLUME = 0.55;

let ctx = null;
let cheerBuffer;          // undefined = not tried yet, null = no file, AudioBuffer = loaded

function settings() {
  const s = local.read(KEYS.settings, null);
  return s && typeof s === 'object' ? s : {};
}

/** False when the edition has switched sound off for everyone (the How To Play toggle is hidden too). */
export const soundAvailable = () => ed('sound.enabled', true) !== false;

export function isSoundOn() { return soundAvailable() && settings().sound !== false; }

export function setSoundOn(on) {
  local.write(KEYS.settings, { ...settings(), sound: !!on });
  if (on) unlock();
}

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

/** Must run inside a tap or key press at least once, or phones keep the audio silent. */
export function unlock() {
  if (!isSoundOn()) return;
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  loadCheer();
}

async function loadCheer() {
  if (cheerBuffer !== undefined || !ctx) return;
  cheerBuffer = null;
  try {
    const res = await fetch(CHEER_FILE);
    if (!res.ok) return;
    const data = await res.arrayBuffer();
    cheerBuffer = await new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail));
  } catch { cheerBuffer = null; }
}

['pointerdown', 'keydown', 'touchend'].forEach((type) =>
  document.addEventListener(type, unlock, { capture: true, passive: true }));

/** Crowd cheering after a correct answer. */
export function playCheer() {
  if (!isSoundOn()) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  if (cheerBuffer) playBuffer(c, cheerBuffer);
  else synthCheer(c);
}

function playBuffer(c, buffer) {
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = VOLUME;
  src.buffer = buffer;
  src.connect(gain).connect(c.destination);
  src.start();
}

/** A swelling crowd roar: filtered noise in a few voice-like bands, wobbling so it sounds like many people. */
function synthCheer(c) {
  const t = c.currentTime;
  const dur = 2.8;
  const len = Math.floor(c.sampleRate * dur);
  const noise = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = noise.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(VOLUME, t + 0.35);   // the roar goes up
  master.gain.setValueAtTime(VOLUME, t + 1.2);
  master.gain.exponentialRampToValueAtTime(0.0001, t + dur);    // and dies away
  master.connect(c.destination);

  // [centre Hz, width (Q), level, wobble Hz]
  const bands = [[350, 0.9, 0.9, 4.3], [800, 1.1, 1.0, 5.7], [1700, 1.4, 0.6, 6.9], [3200, 2, 0.25, 8.1]];
  bands.forEach(([freq, q, level, wobble]) => {
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq * 0.85, t);
    bp.frequency.linearRampToValueAtTime(freq * 1.1, t + 0.5);   // voices rise as the cheer starts
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.value = level;
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = wobble;
    depth.gain.value = level * 0.3;
    lfo.connect(depth).connect(g.gain);
    src.connect(bp).connect(g).connect(master);
    src.start(t); lfo.start(t);
    src.stop(t + dur); lfo.stop(t + dur);
  });
}
