// Chooses one question per stage and shuffles its answers.

import { shuffle, pickRandom } from '../core/utils.js';

export class NotEnoughQuestionsError extends Error {
  constructor(missingStages) {
    super(`Not enough approved questions for: ${missingStages.join(', ')}`);
    this.name = 'NotEnoughQuestionsError';
    this.missingStages = missingStages;
  }
}

/** Returns a copy of the question with the answers in a random order and correctAnswer remapped. */
export function prepareQuestion(q, rand = Math.random) {
  const order = shuffle([0, 1, 2, 3], rand);
  return {
    id: q.id,
    stage: q.stage,
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
    options: order.map((i) => q.options[i]),
    correctAnswer: order.indexOf(q.correctAnswer),
  };
}

/**
 * @param {Array} approved   approved questions
 * @param {Array} stages     ordered stages
 * @param {object} opts      { seen: string[], rand, activeCategories: Set, fromIndex: first stage to pick for }
 */
export function pickQuestions(approved, stages, { seen = [], rand = Math.random, activeCategories = null, fromIndex = 0 } = {}) {
  const seenSet = new Set(seen);
  const used = new Set();
  const usable = approved.filter((q) => !activeCategories || activeCategories.has(q.category));
  const picked = [];
  const missing = [];

  stages.forEach((stage, idx) => {
    if (idx < fromIndex) return;
    const free = (q) => !used.has(q.id);
    const fresh = (q) => free(q) && !seenSet.has(q.id);

    // 1. This stage, not seen recently  2. This stage, any
    let pool = usable.filter((q) => q.stage === stage.key && fresh(q));
    if (!pool.length) pool = usable.filter((q) => q.stage === stage.key && free(q));

    // 3. Any stage with a matching difficulty  4. Nearest stage by order
    if (!pool.length) {
      const [lo, hi] = stage.difficulty;
      pool = usable.filter((q) => free(q) && q.difficulty >= lo && q.difficulty <= hi);
    }
    if (!pool.length) {
      const order = Object.fromEntries(stages.map((s, i) => [s.key, i]));
      const candidates = usable.filter(free);
      if (candidates.length) {
        const best = Math.min(...candidates.map((q) => Math.abs((order[q.stage] ?? 0) - idx)));
        pool = candidates.filter((q) => Math.abs((order[q.stage] ?? 0) - idx) === best);
      }
    }

    if (!pool.length) { missing.push(stage.label); return; }
    const q = pickRandom(pool, rand);
    used.add(q.id);
    picked.push(prepareQuestion(q, rand));
  });

  if (missing.length) throw new NotEnoughQuestionsError(missing);
  return picked;
}
