// App-wide settings and access to stage/category metadata.

export const APP = {
  title: 'Who Wants To Win The European Cup',
  edition: 'Celtic Edition',
  schemaVersion: 1,
  storagePrefix: 'wwtwtec:v1:',
  club: 'celtic',
};

export const PATHS = {
  stages: 'data/meta/stages.json',
  categories: 'data/meta/categories.json',
  pending: 'data/questions/pending-questions.json',
  approved: 'data/questions/approved-questions.json',
  rejected: 'data/questions/rejected-questions.json',
};

export const COLLECTIONS = ['pending', 'approved', 'rejected'];

export const REJECTION_REASONS = [
  'Duplicate Question',
  'Poor Wording',
  'Incorrect Answer',
  'Factually Incorrect',
  'Other',
];

export const TIMING = {
  lockInMs: 1200,   // gold "locked in" before reveal
  revealMs: 1600,   // show right/wrong before moving on
};

export const RECENT_SEEN_LIMIT = 50;

/** A champion who plays another season skips the qualifiers and starts at this stage. */
export const SEASON_RESTART_KEY = 'round-1';

let meta = null;

/** Loads stages and categories once. `base` lets pages in sub-folders (tests) resolve paths. */
export async function loadMeta(base = '') {
  if (meta) return meta;
  const [s, c] = await Promise.all([
    fetchJson(base + PATHS.stages),
    fetchJson(base + PATHS.categories),
  ]);
  meta = buildMeta(s.stages, c.categories);
  return meta;
}

/** Builds lookup helpers from raw arrays (also used directly by tests). */
export function buildMeta(stages, categories) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  return {
    stages: sorted,
    categories,
    stageKeys: sorted.map((s) => s.key),
    stageByKey: Object.fromEntries(sorted.map((s) => [s.key, s])),
    categoryByKey: Object.fromEntries(categories.map((c) => [c.key, c])),
    stageLabel(key) { return this.stageByKey[key]?.label ?? key; },
    categoryLabel(key) { return this.categoryByKey[key]?.label ?? key; },
  };
}

export function setMeta(m) { meta = m; }
export function getMeta() { return meta; }

export async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}
