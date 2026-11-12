// Schema upgrades for question files and stored data.
// Add steps as { from, to, up(data) } — they run in order until the data reaches CURRENT.

export const CURRENT_SCHEMA = 1;

const questionSteps = [
  // Example for the future:
  // { from: 1, to: 2, up: (q) => ({ ...q, newField: 'default' }) },
];

/** Upgrades one question. Older files without schemaVersion are treated as version 0. */
export function migrateQuestion(q) {
  let out = { ...q };
  // Version 0 → 1: the original brief's shape (numeric id, stage label instead of key).
  if (!out.schemaVersion) out = fromLegacy(out);
  let v = out.schemaVersion;
  for (const step of questionSteps) {
    if (step.from === v) { out = step.up(out); v = step.to; out.schemaVersion = v; }
  }
  return out;
}

export function migrateCollection(file) {
  const questions = Array.isArray(file) ? file : (file?.questions ?? []);
  return {
    schemaVersion: CURRENT_SCHEMA,
    collection: file?.collection ?? null,
    updatedAt: file?.updatedAt ?? null,
    questions: questions.map(migrateQuestion),
  };
}

const LEGACY_STAGE = {
  '1st qualifier': 'qualifier-1', '2nd qualifier': 'qualifier-2', 'playoff': 'playoff',
  'first round': 'round-1', 'second round': 'round-2', 'quarter finals': 'quarter-final',
  'quarter final': 'quarter-final', 'semi final': 'semi-final', 'final': 'final',
};

function fromLegacy(q) {
  const id = typeof q.id === 'number' ? 'q_' + String(q.id).padStart(6, '0') : q.id;
  const stageKey = LEGACY_STAGE[String(q.stage ?? '').toLowerCase()] ?? q.stage;
  const category = q.category && /\s/.test(q.category)
    ? q.category.toLowerCase().replace(/\s+/g, '-')
    : q.category;
  return {
    club: 'celtic',
    tags: [],
    source: 'manual',
    status: 'pending',
    review: { reviewedAt: null, rejectionReason: null, rejectionNote: null },
    ...q,
    id,
    stage: stageKey,
    category,
    schemaVersion: 1,
  };
}
