// Reads the published question files. This is the "DataSource" a cloud API could replace later.

import { PATHS, COLLECTIONS, fetchJson } from '../core/config.js';
import { migrateCollection } from '../core/migrations.js';

export async function loadCollection(name, base = '') {
  const file = await fetchJson(base + PATHS[name]);
  const migrated = migrateCollection(file);
  migrated.collection = name;
  return migrated;
}

/** Loads pending, approved and rejected. Returns { pending, approved, rejected, versions }. */
export async function loadAllCollections(base = '') {
  const files = await Promise.all(COLLECTIONS.map((c) => loadCollection(c, base)));
  const out = { versions: {} };
  COLLECTIONS.forEach((c, i) => {
    out[c] = files[i].questions;
    out.versions[c] = files[i].updatedAt;
  });
  return out;
}

export function toFile(name, questions) {
  return {
    schemaVersion: 1,
    collection: name,
    updatedAt: new Date().toISOString(),
    questions,
  };
}
