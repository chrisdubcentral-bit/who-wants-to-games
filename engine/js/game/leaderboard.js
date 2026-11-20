// Top 40 leaderboard: one board shared by every player, kept online (netlify/functions/top100.mjs).
// The ranking rules live in ranking.js, which the server uses too.
//
// How a run gets onto the board:
//   1. When a new game starts, startRun() asks the server for a signed run token holding the start time,
//      so the server can check later that the run took as long as it claims.
//   2. When the run is over, submitEntry() sends the name, town and result with that token.
//   3. The server checks the entry (word filter, plausible result and time) and returns the new board.
// A game that started without a connection has no token, so it can't be added.

import { local, session, KEYS } from '../core/storage.js';
import { APP } from '../core/config.js';
import { cleanText, compareEntries, withOwnEntries, LIMIT, NAME_MAX, TOWN_MAX } from './ranking.js';

export * from './ranking.js';

const API = '/api/top100';
const TIMEOUT_MS = 10000;

/* ---------- Server calls ---------- */

async function call(path, { method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // The board GET may come from Netlify's CDN cache (netlify/functions/top100.mjs); 'no-store' would bypass it.
      cache: method === 'GET' ? 'default' : 'no-store',
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON, e.g. no server behind Live Server */ }
    if (!data || typeof data !== 'object') return { ok: false, offline: true };
    return { ...data, ok: res.ok && data.ok !== false, status: res.status };
  } catch {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(timer);
  }
}

const sortBoard = (board) => (Array.isArray(board) ? board.filter((e) => e && e.name).sort(compareEntries).slice(0, LIMIT) : []);

/* ---------- Board ---------- */

let lastBoard = null;
// The board GET can come from Netlify's CDN cache, up to 11 minutes old (netlify/functions/top100.mjs). For that long
// after an entry, the board the server returned with it supplies this device's entries, so the player still sees theirs.
const BOARD_CACHE_MS = 11 * 60 * 1000;
let submitted = null; // { board, at }

/** The board from the last successful fetch, or null. Used where waiting for the network isn't possible. */
export const cachedBoard = () => lastBoard;

/** Fetches the board. Returns { ok: true, board } or { ok: false, offline }. */
export async function fetchBoard() {
  const r = await call(`?edition=${encodeURIComponent(APP.club)}`);
  if (!r.ok) return { ok: false, offline: !!r.offline };
  lastBoard = sortBoard(r.board);
  if (submitted && Date.now() - submitted.at < BOARD_CACHE_MS) lastBoard = withOwnEntries(lastBoard, submitted.board, myEntryIds());
  return { ok: true, board: lastBoard };
}

/* ---------- Runs ---------- */

const readTokens = () => {
  const t = session.read(KEYS.boardTokens, {});
  return t && typeof t === 'object' ? t : {};
};

const pending = new Map();

/** Asks for a run token for a game that has just started. Fire and forget: the game doesn't wait for it. */
export function startRun(sessionId) {
  if (!sessionId) return;
  const request = call('/start', { method: 'POST', body: { edition: APP.club } }).then((r) => {
    if (!r.ok || typeof r.token !== 'string') return;
    // Keep only a few recent runs; a page refresh mid-game still finds its token.
    const kept = Object.entries(readTokens()).slice(-4);
    session.write(KEYS.boardTokens, Object.fromEntries([...kept, [sessionId, r.token]]));
  }).finally(() => pending.delete(sessionId));
  pending.set(sessionId, request);
}

/** The run's token, waiting for the request if a very short game finished before it came back. */
async function runToken(sessionId) {
  await pending.get(sessionId);
  return readTokens()[sessionId] ?? null;
}

export const hasRunToken = async (sessionId) => !!(await runToken(sessionId));

/** This device's entry on the board for a run: { id, name, town }, or null. */
export function myEntry(sessionId) {
  const mine = local.read(KEYS.boardMine, {});
  return (mine && typeof mine === 'object' && mine[sessionId]) || null;
}

/** Ids of every board entry added from this device (its last 20 games that made the board). */
export function myEntryIds() {
  const mine = local.read(KEYS.boardMine, {});
  return new Set(Object.values(mine && typeof mine === 'object' ? mine : {}).map((m) => m?.id).filter((id) => id != null));
}

function rememberMine(sessionId, value) {
  const mine = local.read(KEYS.boardMine, {});
  const kept = Object.entries(mine && typeof mine === 'object' ? mine : {}).slice(-19);
  local.write(KEYS.boardMine, Object.fromEntries([...kept, [sessionId, value]]));
}

/**
 * Adds or updates the run's entry.
 * Returns { ok: true, rank, id, board } or { ok: false, error, message }.
 * error is 'name' (word filter), 'no-run' (no token), 'offline', or another server code.
 */
export async function submitEntry(entry, sessionId) {
  const token = await runToken(sessionId);
  if (!token) return { ok: false, error: 'no-run' };
  const r = await call('', { method: 'POST', body: { edition: APP.club, token, entry } });
  if (!r.ok) return { ok: false, error: r.offline ? 'offline' : (r.error || 'failed'), message: r.message, field: r.field };
  lastBoard = sortBoard(r.board);
  if (r.id != null) rememberMine(sessionId, { id: r.id, name: entry.name, town: entry.town });
  submitted = { board: lastBoard, at: Date.now() };
  local.write(KEYS.player, { name: entry.name, town: entry.town });
  return { ok: true, rank: r.rank ?? null, id: r.id ?? null, board: lastBoard };
}

/* ---------- Player ---------- */

export function readPlayer() {
  const p = local.read(KEYS.player, null);
  return { name: cleanText(p?.name, NAME_MAX), town: cleanText(p?.town, TOWN_MAX) };
}

/** Clears the old per-device board left by earlier versions of the game. */
export function clearLocalBoard() {
  local.remove(KEYS.leaderboard);
  local.remove(KEYS.boardReset);
}

/* ---------- Formatting ---------- */

/** 4:05, or 1:02:09 for an hour or more. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
