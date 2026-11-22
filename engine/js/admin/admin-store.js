// Admin working copy: moves questions between pending / approved / rejected,
// validates, keeps an audit log and one level of undo, and publishes to disk.

import { COLLECTIONS, APP } from '../core/config.js';
import { validateQuestion } from '../core/validation.js';
import { migrateQuestion } from '../core/migrations.js';
import { nowIso, nextQuestionId, deepClone, normalise } from '../core/utils.js';
import { local, KEYS } from '../core/storage.js';
import { bus } from '../core/events.js';
import { loadAllCollections } from '../data-sources/json-file-source.js';
import { readWorkingCopy, writeWorkingCopy, clearWorkingCopy } from '../data-sources/local-overlay-source.js';
import { publish as publishFiles } from '../data-sources/publishers.js';

const AUDIT_LIMIT = 500;

export function createAdminStore(meta) {
  let w = null;            // { pending, approved, rejected, dirty, baseVersions, publishedAt }
  let undoSnapshot = null;
  let conflict = false;

  const save = () => { writeWorkingCopy(stripPrivate(w)); bus.emit('store:changed', api); };

  function audit(action, id, detail = '') {
    const log = local.read(KEYS.adminAudit, []);
    log.unshift({ at: nowIso(), action, id, detail });
    local.write(KEYS.adminAudit, log.slice(0, AUDIT_LIMIT));
  }

  function allIds() { return COLLECTIONS.flatMap((c) => w[c].map((q) => q.id)); }

  /** Gives fresh ids to any question whose id is missing or already used. */
  function fixIds() {
    const seen = new Set();
    // Approved questions keep their ids; clashes are resolved by renumbering the others.
    ['approved', 'rejected', 'pending'].forEach((c) => {
      w[c].forEach((q) => {
        if (!q.id || seen.has(q.id)) {
          const old = q.id;
          q.id = nextQuestionId([...seen, ...allIds()]);
          if (old) console.info(`[admin] ${old} was already in use, so it is shown as ${q.id}. Publish to save the new id.`);
        }
        seen.add(q.id);
      });
    });
  }

  /**
   * Questions can't be deleted here, so anything in the files that the working copy doesn't have
   * was added on disk (e.g. a new batch) after the working copy was made. Bring those in so they
   * aren't hidden by the working copy and then wiped by the next Publish.
   * A question counts as "already there" when the same id has the same createdAt, or the wording is the
   * same (a merged question renumbered by fixIds() keeps its wording, so it isn't added twice before the
   * renumbered copy reaches the files). An id clash with a different question is renumbered by fixIds().
   */
  function addNewFromDisk(published) {
    const mine = COLLECTIONS.flatMap((c) => w[c]);
    const have = new Set(mine.map((q) => `${q.id}|${q.createdAt ?? ''}`));
    const wording = new Set(mine.map((q) => normalise(q.question)));
    let added = 0;
    COLLECTIONS.forEach((c) => {
      published[c].forEach((q) => {
        if (have.has(`${q.id}|${q.createdAt ?? ''}`) || wording.has(normalise(q.question))) return;
        w[c].push(deepClone(q));
        added++;
      });
    });
    if (added) console.info(`[admin] Added ${added} question(s) from the files that were missing from your unpublished copy.`);
    return added;
  }

  function assertIntegrity() {
    const ids = allIds();
    if (new Set(ids).size !== ids.length) throw new Error('A question ended up in more than one collection.');
  }

  /** Runs a change with undo + integrity check, then saves. */
  function mutate(label, fn) {
    const before = deepClone({ pending: w.pending, approved: w.approved, rejected: w.rejected, dirty: w.dirty });
    try {
      fn();
      assertIntegrity();
    } catch (err) {
      Object.assign(w, before);
      throw err;
    }
    undoSnapshot = { label, state: before };
    w.dirty = true;
    save();
  }

  function locate(id) {
    for (const c of COLLECTIONS) {
      const i = w[c].findIndex((q) => q.id === id);
      if (i !== -1) return { collection: c, index: i, q: w[c][i] };
    }
    return null;
  }

  function move(id, to, patch = {}) {
    const loc = locate(id);
    if (!loc) throw new Error(`Question ${id} not found.`);
    const [q] = w[loc.collection].splice(loc.index, 1);
    const moved = { ...q, ...patch, status: to, updatedAt: nowIso() };
    w[to].unshift(moved);
    return moved;
  }

  const api = {
    get conflict() { return conflict; },
    get dirty() { return !!w?.dirty; },
    get publishedAt() { return w?.publishedAt ?? null; },
    get canUndo() { return !!undoSnapshot; },
    get undoLabel() { return undoSnapshot?.label ?? ''; },
    collection(name) { return w[name]; },
    counts() { return Object.fromEntries(COLLECTIONS.map((c) => [c, w[c].length])); },
    rows() { return COLLECTIONS.flatMap((c) => w[c].map((q) => ({ q, status: c }))); },
    find(id) { const l = locate(id); return l ? { q: l.q, status: l.collection } : null; },
    audit() { return local.read(KEYS.adminAudit, []); },

    async load() {
      const published = await loadAllCollections();
      const saved = readWorkingCopy();
      if (saved && saved.dirty) {
        w = saved;
        const changedOnDisk = COLLECTIONS.some((c) => (saved.baseVersions?.[c] ?? null) !== (published.versions[c] ?? null));
        conflict = changedOnDisk;
        w._published = published;
        addNewFromDisk(published);
      } else {
        w = { pending: published.pending, approved: published.approved, rejected: published.rejected, dirty: false, baseVersions: published.versions, publishedAt: saved?.publishedAt ?? null };
        conflict = false;
      }
      fixIds();
      writeWorkingCopy(stripPrivate(w));
      bus.emit('store:changed', api);
    },

    /** Conflict resolution: throw away the working copy and use the files on disk. */
    useDiskVersion() {
      const p = w._published;
      w = { pending: p.pending, approved: p.approved, rejected: p.rejected, dirty: false, baseVersions: p.versions, publishedAt: w.publishedAt };
      conflict = false; undoSnapshot = null;
      fixIds();
      save();
    },
    keepWorkingCopy() {
      conflict = false;
      if (w._published) { w.baseVersions = w._published.versions; delete w._published; }
      save();
    },

    validate(q) {
      return validateQuestion(q, { meta, approved: w.approved });
    },

    approve(id) {
      const found = locate(id);
      if (!found) throw new Error(`Question ${id} not found.`);
      const result = api.validate(found.q);
      if (!result.valid) return { ok: false, result };
      mutate(`Approved ${id}`, () => move(id, 'approved', {
        review: { ...(found.q.review ?? {}), reviewedAt: nowIso(), rejectionReason: null, rejectionNote: null },
      }));
      audit('approve', id);
      return { ok: true, result };
    },

    /**
     * Approves several questions as one change (one Undo puts them all back).
     * Questions that fail the checks are left where they are and listed in `failed`.
     */
    approveMany(ids) {
      const ok = []; const failed = [];
      ids.forEach((id) => {
        const found = locate(id);
        if (!found) { failed.push({ id, message: `Question ${id} not found.` }); return; }
        if (found.collection === 'approved') return;
        const result = api.validate(found.q);
        if (result.valid) ok.push(id); else failed.push({ id, message: result.errors[0].message });
      });
      if (ok.length) {
        mutate(`Approved ${ok.length} question${ok.length === 1 ? '' : 's'}`, () => ok.forEach((id) => {
          const q = locate(id).q;
          move(id, 'approved', { review: { ...(q.review ?? {}), reviewedAt: nowIso(), rejectionReason: null, rejectionNote: null } });
        }));
        ok.forEach((id) => audit('approve', id, 'bulk'));
      }
      return { approved: ok, failed };
    },

    reject(id, reason, note = '') {
      const found = locate(id);
      mutate(`Rejected ${id}`, () => move(id, 'rejected', {
        review: { ...(found?.q.review ?? {}), reviewedAt: nowIso(), rejectionReason: reason, rejectionNote: note || null },
      }));
      audit('reject', id, reason + (note ? ` — ${note}` : ''));
    },

    /** Rejects several questions with the same reason as one change (one Undo puts them all back). */
    rejectMany(ids, reason, note = '') {
      const todo = ids.filter((id) => { const l = locate(id); return l && l.collection !== 'rejected'; });
      if (!todo.length) return { rejected: [] };
      mutate(`Rejected ${todo.length} question${todo.length === 1 ? '' : 's'}`, () => todo.forEach((id) => {
        const q = locate(id).q;
        move(id, 'rejected', { review: { ...(q.review ?? {}), reviewedAt: nowIso(), rejectionReason: reason, rejectionNote: note || null } });
      }));
      todo.forEach((id) => audit('reject', id, `bulk · ${reason}${note ? ` — ${note}` : ''}`));
      return { rejected: todo };
    },

    /** Rejected → pending, or approved → pending (withdraw from the game). */
    sendToPending(id) {
      const from = locate(id)?.collection;
      mutate(from === 'approved' ? `Withdrew ${id}` : `Restored ${id}`, () => move(id, 'pending', {
        review: { reviewedAt: null, rejectionReason: null, rejectionNote: null },
      }));
      audit(from === 'approved' ? 'withdraw' : 'restore', id);
    },

    /** Saves edits. Edited approved/rejected questions go back to pending for review. */
    update(id, changes) {
      const loc = locate(id);
      if (!loc) throw new Error(`Question ${id} not found.`);
      mutate(`Edited ${id}`, () => {
        const updated = { ...loc.q, ...changes, updatedAt: nowIso() };
        if (loc.collection === 'pending') {
          w.pending[loc.index] = updated;
        } else {
          w[loc.collection].splice(loc.index, 1);
          w.pending.unshift({ ...updated, status: 'pending', review: { reviewedAt: null, rejectionReason: null, rejectionNote: null } });
        }
      });
      audit('edit', id, loc.collection !== 'pending' ? `moved from ${loc.collection} to pending` : '');
      return locate(id).collection;
    },

    /**
     * Moves a question to another round and/or changes its difficulty.
     * The wording is unchanged, so approved questions stay approved.
     */
    reassign(id, { stage, difficulty } = {}) {
      const loc = locate(id);
      if (!loc) throw new Error(`Question ${id} not found.`);
      if (stage !== undefined && !meta.stageByKey[stage]) throw new Error(`Unknown round: ${stage}`);
      if (difficulty !== undefined && !(Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5)) {
        throw new Error('Difficulty must be between 1 and 5.');
      }
      const changes = {};
      if (stage !== undefined && stage !== loc.q.stage) changes.stage = stage;
      if (difficulty !== undefined && difficulty !== loc.q.difficulty) changes.difficulty = difficulty;
      if (!Object.keys(changes).length) return;
      const detail = [
        changes.stage && `${meta.stageLabel(loc.q.stage)} → ${meta.stageLabel(changes.stage)}`,
        changes.difficulty && `difficulty ${loc.q.difficulty} → ${changes.difficulty}`,
      ].filter(Boolean).join(', ');
      mutate(`Changed ${id}: ${detail}`, () => {
        w[loc.collection][loc.index] = { ...loc.q, ...changes, updatedAt: nowIso() };
      });
      audit('reassign', id, detail);
    },

    create(fields) {
      const id = nextQuestionId(allIds());
      const q = migrateQuestion({
        schemaVersion: 1, club: meta.categoryByKey[fields.category]?.club ?? APP.club, tags: [], source: 'manual',
        ...fields, id, status: 'pending', createdAt: nowIso(), updatedAt: nowIso(),
        review: { reviewedAt: null, rejectionReason: null, rejectionNote: null },
      });
      mutate(`Added ${id}`, () => { w.pending.unshift(q); });
      audit('create', id);
      return id;
    },

    /** Bulk import: everything lands in pending. Returns { added, skipped }. */
    importQuestions(list) {
      const items = Array.isArray(list) ? list : (list?.questions ?? []);
      let added = 0, skipped = 0;
      mutate(`Imported questions`, () => {
        items.forEach((raw) => {
          if (!raw || typeof raw !== 'object' || !raw.question) { skipped++; return; }
          const q = migrateQuestion({ source: 'import', ...raw });
          q.id = nextQuestionId(allIds());
          q.status = 'pending';
          q.createdAt = q.createdAt ?? nowIso();
          q.updatedAt = nowIso();
          q.review = { reviewedAt: null, rejectionReason: null, rejectionNote: null };
          if (!Array.isArray(q.tags)) q.tags = [];
          w.pending.unshift(q);
          added++;
        });
        if (!added) throw new Error('No questions found in that file.');
      });
      audit('import', '-', `${added} added, ${skipped} skipped`);
      return { added, skipped };
    },

    undo() {
      if (!undoSnapshot) return;
      Object.assign(w, deepClone(undoSnapshot.state));
      audit('undo', '-', undoSnapshot.label);
      undoSnapshot = null;
      save();
    },

    async publish(opts) {
      // Publish writes all three files whole, so first bring in anything added to them since this page
      // loaded (e.g. a batch from tools/add-questions.mjs while this tab was open). Otherwise it is wiped.
      const added = addNewFromDisk(await loadAllCollections());
      if (added) {
        fixIds();
        undoSnapshot = null; // undo would drop the questions that just came in
        save();
      }
      const res = await publishFiles({ pending: w.pending, approved: w.approved, rejected: w.rejected }, opts);
      res.addedFromDisk = added;
      if (res.method === 'direct') {
        // Re-read so our base versions match what is now on disk.
        const published = await loadAllCollections();
        w.baseVersions = published.versions;
        w.dirty = false;
        w.publishedAt = nowIso();
        undoSnapshot = null;
        save();
      }
      audit('publish', '-', res.method === 'direct' ? 'saved to disk' : 'downloaded files');
      return res;
    },

    /** Marks the working copy as published after the admin copied downloaded files manually. */
    markPublished() {
      w.dirty = false;
      w.publishedAt = nowIso();
      save();
    },

    async discard() {
      clearWorkingCopy();
      undoSnapshot = null;
      audit('discard', '-', 'reloaded published files');
      await api.load();
    },
  };

  return api;
}

function stripPrivate(w) {
  const { _published, ...rest } = w;
  return rest;
}
