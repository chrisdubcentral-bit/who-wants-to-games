// Checks that a submitted Top 100 result could really have happened.
// It can't prove the player knew the answers (the game runs in the browser), but it stops
// made-up results: impossible scores, cups that don't match the rounds won, and impossible times.

import { STATUS, FINISHED } from '../../engine/js/game/game-engine.js';
import { cleanText, isEligible, NAME_MAX, TOWN_MAX } from '../../engine/js/game/ranking.js';
import { stripInvisible } from './word-filter.js';

// Each question holds the answer for 2.8s (lock-in + reveal) before the next one, plus reading time.
export const MIN_MS_PER_ROUND = 3000;
const MAX_DURATION_MS = 7 * 24 * 3600 * 1000;
const MAX_CUPS = 500;

const isInt = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(n) && n >= min && n <= max;

/**
 * Checks the result in a submission against the edition's tournament.
 * Returns { ok: true, entry } with a clean entry to store, or { ok: false, why } (why is for logs only).
 */
export function checkResult(raw, edition) {
  if (!raw || typeof raw !== 'object') return { ok: false, why: 'no entry' };
  const { rounds: R, restartIndex: r, stages } = edition;
  const L = R - r; // rounds in a later season

  const result = raw.result;
  const cups = raw.cups;
  const season = raw.season;
  const correct = raw.correctCount;
  const played = raw.roundsPlayed;
  const forfeited = raw.forfeited === true;
  const lifelineUsed = raw.lifelineUsed === true;
  const durationMs = raw.durationMs;

  if (!FINISHED.includes(result)) return { ok: false, why: 'result' };
  if (!isInt(cups, 0, MAX_CUPS) || !isInt(season, 1) || !isInt(correct) || !isInt(played)) return { ok: false, why: 'numbers' };
  if (!isEligible({ result, cups, forfeited })) return { ok: false, why: 'not eligible' };

  const won = result === STATUS.WON;
  if (won && cups < 1) return { ok: false, why: 'won without a cup' };
  if (season !== cups + (won ? 0 : 1)) return { ok: false, why: 'season' };

  // Rounds needed to win `cups` cups: a full first season, then the shorter later seasons.
  const forCups = cups === 0 ? 0 : R + (cups - 1) * L;
  // Knocked out: k rounds won in the season they went out in (which is shorter after the first).
  const k = correct - forCups;
  const seasonRounds = cups === 0 ? R : L;
  if (won ? correct !== forCups : (k < 0 || k >= seasonRounds)) return { ok: false, why: 'rounds won' };

  const stageIndex = won ? R : (cups === 0 ? 0 : r) + k;
  if (raw.stageReachedIndex !== stageIndex) return { ok: false, why: 'stage index' };
  if (!won && raw.stageKey !== stages[stageIndex].key) return { ok: false, why: 'stage key' };

  const expectedPlayed = correct + (!won && !forfeited ? 1 : 0);
  if (played !== expectedPlayed) return { ok: false, why: 'rounds played' };

  if (!isInt(durationMs, played * MIN_MS_PER_ROUND, MAX_DURATION_MS)) return { ok: false, why: 'time' };

  return {
    ok: true,
    entry: {
      result, cups, season, correctCount: correct, roundsPlayed: played, lifelineUsed, durationMs,
      stageKey: won ? null : stages[stageIndex].key,
      stageReachedIndex: stageIndex,
    },
  };
}

/** Cleans a name or town the same way the game does, plus invisible characters. */
export const cleanName = (v) => cleanText(stripInvisible(v), NAME_MAX);
export const cleanTown = (v) => cleanText(stripInvisible(v), TOWN_MAX);
