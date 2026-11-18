// App-wide settings and access to stage/category metadata.

import { setEdition, getEdition } from './edition.js';
import { setAdverts } from './adverts.js';

// Edition-specific wording and settings live in data/edition.json (see js/core/edition.js).
export const APP = {
  schemaVersion: 1,
  // Each edition's page can set <meta name="storage-prefix">, so editions keep separate stats and Top 100s.
  get storagePrefix() {
    const tag = typeof document.querySelector === 'function' ? document.querySelector('meta[name="storage-prefix"]') : null;
    return tag?.content || 'wwtwtec:v1:';
  },
  get club() { return getEdition().id; },
};

export const PATHS = {
  edition: 'data/edition.json',
  adverts: 'data/adverts.json',
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


let meta = null;

/** Loads the edition, stages and categories once. `base` lets pages in sub-folders (tests) resolve paths. */
export async function loadMeta(base = '') {
  if (meta) return meta;
  const [e, s, c, a] = await Promise.all([
    fetchJson(base + PATHS.edition),
    fetchJson(base + PATHS.stages),
    fetchJson(base + PATHS.categories),
    fetchJson(base + PATHS.adverts).catch(() => null), // optional: an edition without adverts.json has no adverts
  ]);
  setEdition(e);
  // Older editions kept their adverts in edition.json under adverts.breaks.
  setAdverts(a?.adverts ?? e?.adverts?.breaks ?? [], a?.order);
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
  // 'no-cache' always asks the server, but an unchanged file isn't downloaded again, which saves bandwidth.
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}
