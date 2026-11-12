// Where the game gets its live questions from.

import { loadCollection } from '../data-sources/json-file-source.js';
import { readWorkingCopy } from '../data-sources/local-overlay-source.js';

/**
 * Returns { questions, preview }. If this browser holds unpublished admin changes,
 * the game uses those so the admin can test them ("preview mode").
 */
export async function loadGameQuestions(base = '') {
  const working = readWorkingCopy();
  if (working && working.dirty) {
    return { questions: working.approved, preview: true };
  }
  const file = await loadCollection('approved', base);
  return { questions: file.questions, preview: false };
}
