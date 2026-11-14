// Shared helpers for the server tests: an in-memory store and real games played through the engine.

import { readFileSync } from 'node:fs';
import { initialState, reduce, summarise } from '../../engine/js/game/game-engine.js';
import { entryFromSummary } from '../../engine/js/game/ranking.js';
import { EDITIONS } from '../../server/top100/editions.js';
export { createMemoryStore } from '../../server/top100/memory-store.js';

export const celtic = EDITIONS.celtic;
export const bannedWords = JSON.parse(readFileSync(new URL('../../moderation/banned-words.json', import.meta.url), 'utf8'));

const q = () => ({ correctAnswer: 0, options: ['a', 'b', 'c', 'd'] });

/**
 * Plays a run through the real engine. `plan` lists seasons as rounds answered right before a wrong
 * answer; `null` means the whole season was won. e.g. [null, 2] = won season 1, out after 2 wins in season 2.
 * Each answer takes `msPerRound`.
 */
export function playRun(plan, { msPerRound = 10000, retire = false, forfeitAt = null, fifty = false } = {}) {
  const stages = celtic.stages;
  let t = Date.parse('2026-06-01T12:00:00Z');
  const at = () => new Date(t).toISOString();
  let st = reduce(initialState(stages), { type: 'START', questions: stages.map(q), startedAt: at(), sessionId: 's1' });
  if (fifty) st = reduce(st, { type: 'USE_5050' });

  plan.forEach((wins, season) => {
    if (season > 0) {
      const from = celtic.restartIndex;
      st = reduce(st, { type: 'NEXT_SEASON', questions: stages.slice(from).map(q), fromIndex: from, at: at() });
    }
    const left = stages.length - st.stageIndex;
    const n = wins == null ? left : wins;
    for (let i = 0; i < n; i++) {
      t += msPerRound;
      st = reduce(st, { type: 'SELECT', index: 0 });
      st = reduce(st, { type: 'REVEAL' });
      st = reduce(st, { type: 'ADVANCE', at: at() });
    }
    if (wins != null) {
      t += msPerRound;
      if (forfeitAt != null) {
        st = reduce(st, { type: 'FORFEIT', at: at() });
      } else {
        st = reduce(st, { type: 'SELECT', index: 1 });
        st = reduce(st, { type: 'REVEAL' });
        st = reduce(st, { type: 'ADVANCE', at: at() });
      }
    }
  });
  if (retire) st = reduce(st, { type: 'RETIRE' });
  const summary = summarise(st);
  return { summary, entry: entryFromSummary(summary, { name: 'Jinky', town: 'Uddingston', sessionId: 's1' }), elapsedMs: t - Date.parse('2026-06-01T12:00:00Z') };
}
