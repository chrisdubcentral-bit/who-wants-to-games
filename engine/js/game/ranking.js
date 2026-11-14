// Top 100 ranking rules. Pure functions with no browser or storage code,
// shared by the game (engine/js/game/leaderboard.js) and the online board (server/top100/).

import { STATUS, FINISHED } from './game-engine.js';

export const LIMIT = 100;
export const NAME_MAX = 20;
export const TOWN_MAX = 30;

/** Trims, removes control characters, collapses spaces and caps the length. */
export function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const timeOf = (e) => (Number.isFinite(e.durationMs) ? e.durationMs : Number.MAX_SAFE_INTEGER);

/** European Cups won in the run. Entries saved before seasons existed were all one-time winners. */
export function cupsOf(e) {
  if (Number.isFinite(e.cups)) return e.cups;
  return e.result === STATUS.WON ? 1 : 0;
}

/** Rounds won over the whole run, which also orders players by how far they got in their last season. */
const roundsOf = (e) => (Number.isFinite(e.correctCount) ? e.correctCount : 0);

/** Questions answered in the run. Older entries didn't store it, so work it out: wins plus the one that was lost. */
export function roundsPlayedOf(e) {
  if (Number.isFinite(e.roundsPlayed)) return e.roundsPlayed;
  return roundsOf(e) + (e.result === STATUS.ELIMINATED ? 1 : 0);
}

/** Most European Cups, then furthest round, then no 50:50, then fastest, then whoever got there first. */
export function compareEntries(a, b) {
  return (cupsOf(b) - cupsOf(a))
    || (roundsOf(b) - roundsOf(a))
    || (Number(a.lifelineUsed) - Number(b.lifelineUsed))
    || (timeOf(a) - timeOf(b))
    || String(a.date).localeCompare(String(b.date));
}

/** Any finished game can join the board. One that was walked away from only counts if a cup was won first. */
export function isEligible(summary) {
  if (!summary || !FINISHED.includes(summary.result)) return false;
  return !summary.forfeited || cupsOf(summary) > 0;
}

export function entryFromSummary(summary, { name, town, sessionId, date = new Date().toISOString() }) {
  return {
    name: cleanText(name, NAME_MAX),
    town: cleanText(town, TOWN_MAX),
    sessionId: sessionId ?? null,
    date,
    result: summary.result,
    cups: cupsOf(summary),
    season: summary.season ?? 1,
    stageKey: summary.stageKey ?? null,
    stageReachedIndex: summary.stageReachedIndex,
    stageReachedLabel: summary.stageReachedLabel,
    correctCount: summary.correctCount,
    roundsPlayed: summary.roundsPlayed,
    lifelineUsed: !!summary.lifelineUsed,
    forfeited: !!summary.forfeited,
    durationMs: Number.isFinite(summary.durationMs) ? summary.durationMs : null,
  };
}

/** 1-based position the entry would take, or null if it wouldn't make the board. */
export function prospectiveRank(board, entry) {
  const ahead = board.filter((e) => compareEntries(e, entry) <= 0).length;
  return ahead < LIMIT ? ahead + 1 : null;
}

/** Returns the new board (sorted, capped) and the entry's 1-based rank (null if it fell off). */
export function insertEntry(board, entry) {
  const next = [...board, entry].sort(compareEntries).slice(0, LIMIT);
  const i = next.indexOf(entry);
  return { board: next, rank: i === -1 ? null : i + 1 };
}

/**
 * Adds the entry, or updates the one the same run already has (a champion who carried on).
 * The earlier entry stays if it ranks at least as high, so playing on can never cost a place.
 */
export function upsertEntry(board, entry) {
  const old = entry.sessionId ? board.find((e) => e.sessionId === entry.sessionId) : null;
  if (old && compareEntries(old, entry) <= 0) return { board, rank: board.indexOf(old) + 1, changed: false };
  return { ...insertEntry(board.filter((e) => e !== old), entry), changed: true };
}

export function rankOfSession(board, sessionId) {
  if (!sessionId) return null;
  const i = board.findIndex((e) => e.sessionId === sessionId);
  return i === -1 ? null : i + 1;
}
