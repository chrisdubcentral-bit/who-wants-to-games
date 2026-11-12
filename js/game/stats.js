// Player statistics kept in localStorage.

import { local, KEYS } from '../core/storage.js';
import { STATUS } from './game-engine.js';

const RECENT_LIMIT = 20;

export function emptyStats(stageCount = 8) {
  return {
    schemaVersion: 1,
    gamesPlayed: 0,
    gamesWon: 0,
    eliminations: 0,
    fiftyFiftyUsed: 0,
    highestStageIndex: -1,          // 0-7 = stage reached, 8 = champion
    totalStageIndexReached: 0,
    stageReachedHistogram: new Array(stageCount + 1).fill(0),
    recentGames: [],
    lastRecordedSession: null,
  };
}

export function readStats(stageCount = 8) {
  const s = local.read(KEYS.stats, null);
  if (!s || typeof s !== 'object') return emptyStats(stageCount);
  const base = emptyStats(stageCount);
  const merged = { ...base, ...s };
  if (!Array.isArray(merged.stageReachedHistogram) || merged.stageReachedHistogram.length !== stageCount + 1) {
    merged.stageReachedHistogram = base.stageReachedHistogram;
  }
  return merged;
}

/** Applies one finished game to a stats object (pure). */
export function applyGame(stats, summary, sessionId) {
  if (sessionId && stats.lastRecordedSession === sessionId) return stats; // never count twice
  const s = { ...stats, stageReachedHistogram: [...stats.stageReachedHistogram] };
  s.gamesPlayed += 1;
  if (summary.result === STATUS.WON) s.gamesWon += 1;
  if (summary.result === STATUS.ELIMINATED) s.eliminations += 1;
  if (summary.lifelineUsed) s.fiftyFiftyUsed += 1;
  s.highestStageIndex = Math.max(s.highestStageIndex, summary.stageReachedIndex);
  s.totalStageIndexReached += summary.stageReachedIndex;
  s.stageReachedHistogram[summary.stageReachedIndex] = (s.stageReachedHistogram[summary.stageReachedIndex] ?? 0) + 1;
  s.recentGames = [
    {
      date: new Date().toISOString(),
      result: summary.result,
      stageReached: summary.stageReachedLabel,
      correct: summary.correctCount,
      lifelineUsed: summary.lifelineUsed,
    },
    ...s.recentGames,
  ].slice(0, RECENT_LIMIT);
  s.lastRecordedSession = sessionId ?? null;
  return s;
}

export function recordGame(summary, sessionId, stageCount = 8) {
  const next = applyGame(readStats(stageCount), summary, sessionId);
  local.write(KEYS.stats, next);
  return next;
}

/** Label for a stage index where `stages.length` means champion. */
export function stageIndexLabel(index, stages) {
  if (index < 0) return '—';
  if (index >= stages.length) return 'European Champion';
  return stages[index].label;
}

export function averageStageLabel(stats, stages) {
  if (!stats.gamesPlayed) return '—';
  const avg = stats.totalStageIndexReached / stats.gamesPlayed;
  return stageIndexLabel(Math.round(avg), stages);
}
