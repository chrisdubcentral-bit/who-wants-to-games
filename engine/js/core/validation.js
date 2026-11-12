// Question validator shared by the admin page, imports and tests.
// Returns { valid, errors: [{field, message}], warnings: [{field, message}] }.
// Errors block approval; warnings are shown but don't block.

import { normalise, similarity } from './utils.js';

export const RULES = {
  minQuestionLength: 15,
  maxQuestionLength: 250,
  maxOptionLength: 80,
  optionCount: 4,
  similarityWarning: 0.8,
};

/**
 * @param {object} q            question to check
 * @param {object} ctx
 * @param {object} ctx.meta     result of buildMeta / loadMeta
 * @param {Array}  ctx.approved approved questions to check for duplicates
 */
export function validateQuestion(q, { meta, approved = [] } = {}) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (field, message) => warnings.push({ field, message });

  // Question text
  const text = String(q?.question ?? '').trim();
  if (!text) err('question', 'Question text is empty.');
  else if (text.length < RULES.minQuestionLength) err('question', `Question must be at least ${RULES.minQuestionLength} characters.`);
  else if (text.length > RULES.maxQuestionLength) err('question', `Question must be ${RULES.maxQuestionLength} characters or fewer.`);
  if (text && !text.endsWith('?')) warn('question', 'Question does not end with a question mark.');

  // Options
  const options = Array.isArray(q?.options) ? q.options : [];
  if (options.length !== RULES.optionCount) {
    err('options', `Exactly ${RULES.optionCount} answers are required (found ${options.length}).`);
  }
  options.forEach((o, i) => {
    const v = String(o ?? '').trim();
    if (!v) err(`option${i}`, `Answer ${'ABCD'[i] ?? i + 1} is empty.`);
    else if (v.length > RULES.maxOptionLength) err(`option${i}`, `Answer ${'ABCD'[i]} is longer than ${RULES.maxOptionLength} characters.`);
  });
  const normOpts = options.map(normalise).filter(Boolean);
  if (new Set(normOpts).size !== normOpts.length) err('options', 'Two or more answers are the same.');

  // Correct answer
  if (!Number.isInteger(q?.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer >= RULES.optionCount) {
    err('correctAnswer', 'Choose one correct answer (A–D).');
  }

  // Stage / category / difficulty
  const stage = meta?.stageByKey?.[q?.stage];
  if (!stage) err('stage', 'Tournament stage is not valid.');
  const cat = meta?.categoryByKey?.[q?.category];
  if (!cat) err('category', 'Category does not exist.');
  else if (!cat.active) err('category', 'Category is not active.');
  if (!Number.isInteger(q?.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
    err('difficulty', 'Difficulty must be between 1 and 5.');
  } else if (stage && (q.difficulty < stage.difficulty[0] || q.difficulty > stage.difficulty[1])) {
    warn('difficulty', `Difficulty ${q.difficulty} is outside the usual ${stage.difficulty.join('–')} range for ${stage.label}.`);
  }

  // Duplicates against the approved database (ignore itself)
  if (text) {
    const normText = normalise(text);
    const normSet = [...normOpts].sort().join('|');
    let bestMatch = null;
    for (const other of approved) {
      if (!other || other.id === q.id) continue;
      const otherText = normalise(other.question);
      if (otherText === normText) {
        const otherSet = (other.options ?? []).map(normalise).sort().join('|');
        errors.push({
          field: 'question',
          duplicate: other.id,
          message: otherSet === normSet
            ? `Already in the approved database (${other.id}).`
            : `Same question text already approved (${other.id}).`,
        });
        bestMatch = null;
        break;
      }
      const score = similarity(text, other.question);
      if (score >= RULES.similarityWarning && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: other.id, score };
      }
    }
    if (bestMatch) warn('question', `Possible duplicate of ${bestMatch.id} (${Math.round(bestMatch.score * 100)}% similar).`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
