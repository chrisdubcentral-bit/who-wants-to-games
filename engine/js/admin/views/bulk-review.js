// Bulk Approve: pending questions a page at a time, each with its round, difficulty and an Approve tick box.
// Round and difficulty changes apply straight away (like the dashboard's round list); the button approves
// every ticked question in one go. Publish then writes them to approved-questions.json.

import { mount, esc, on } from '../../ui/dom.js';
import { toast } from '../../ui/components/toast.js';

const DIFFICULTY_NAMES = ['Easy', 'Fair', 'Medium', 'Hard', 'Expert'];
const PAGE_SIZES = [10, 20, 50];

// Kept between visits to the page during this session.
const state = { stage: '', category: '', difficulty: '', size: 10, page: 0, checked: new Set() };

export function render(root, ctx) {
  const { store, meta } = ctx;
  const opt = (value, label, current) => `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;

  function matching() {
    return store.collection('pending')
      .filter((q) => (!state.stage || q.stage === state.stage)
        && (!state.category || q.category === state.category)
        && (!state.difficulty || String(q.difficulty) === state.difficulty))
      .sort((a, b) => a.id.localeCompare(b.id)); // fixed order, so changing a round doesn't move the question
  }

  function row(q) {
    const v = store.validate(q);
    const stage = meta.stageByKey[q.stage];
    const outOfRange = stage && (q.difficulty < stage.difficulty[0] || q.difficulty > stage.difficulty[1]);
    const checked = v.valid && state.checked.has(q.id);
    const others = (q.options ?? []).filter((_, i) => i !== q.correctAnswer);
    return `
      <li class="bulk-row ${checked ? 'is-checked' : ''}" data-id="${esc(q.id)}">
        <label class="bulk-check" title="${v.valid ? 'Tick to approve' : 'Fix the errors before approving'}">
          <input type="checkbox" data-check ${checked ? 'checked' : ''} ${v.valid ? '' : 'disabled'} aria-label="Approve ${esc(q.id)}">
          <span>Approve</span>
        </label>
        <div class="round-q">
          <div class="bulk-meta">
            <span class="qid">${esc(q.id)}</span><span class="badge">${esc(meta.categoryLabel(q.category))}</span>
            <a class="bulk-edit" href="#edit/${encodeURIComponent(q.id)}">Edit</a>
          </div>
          <p>${esc(q.question)}</p>
          <span class="round-answer bulk-answer">Answer: ${esc(q.options?.[q.correctAnswer] ?? '—')}</span>
          <span class="muted round-answer">Wrong: ${others.map(esc).join(' · ')}</span>
          ${v.errors.map((e) => `<div class="check-item is-error">✕ ${esc(e.message)}</div>`).join('')}
          ${v.warnings.filter((w) => w.field !== 'difficulty').map((w) => `<div class="check-item is-warn">! ${esc(w.message)}</div>`).join('')}
        </div>
        <label class="round-field">
          <span>Round</span>
          <select class="select" data-field="stage" aria-label="Round for ${esc(q.id)}">
            ${meta.stages.map((s) => opt(s.key, s.label, q.stage)).join('')}
          </select>
        </label>
        <label class="round-field">
          <span>Difficulty${outOfRange ? ` <span class="low" title="Usual range for ${esc(stage.label)} is ${stage.difficulty.join('–')}">⚠</span>` : ''}</span>
          <select class="select" data-field="difficulty" aria-label="Difficulty for ${esc(q.id)}">
            ${[1, 2, 3, 4, 5].map((d) => opt(d, `${d} — ${DIFFICULTY_NAMES[d - 1]}`, q.difficulty)).join('')}
          </select>
        </label>
      </li>`;
  }

  const goHtml = () => {
    const n = state.checked.size;
    return `<button type="button" class="btn btn-approve" data-action="approve" ${n ? '' : 'disabled'}>Approve ticked${n ? ` (${n})` : ''}</button>
      ${n ? '<button type="button" class="btn btn-ghost btn-sm" data-action="untick">Untick all</button>' : ''}`;
  };

  /** After ticking: update the rows on screen, the button and "Tick all" without redrawing the page. */
  function refreshTicks() {
    const boxes = [...root.querySelectorAll('.bulk-row [data-check]')];
    boxes.forEach((b) => {
      const on = state.checked.has(b.closest('[data-id]').dataset.id);
      b.checked = on;
      b.closest('.bulk-row').classList.toggle('is-checked', on);
    });
    const go = root.querySelector('.bulk-go');
    if (go) go.innerHTML = goHtml();
    const all = root.querySelector('[data-action="tick-page"]');
    const tickable = boxes.filter((b) => !b.disabled);
    if (all) all.checked = tickable.length > 0 && tickable.every((b) => b.checked);
  }

  let firstDraw = true;
  function draw() {
    // Keep keyboard focus on the same control after the redraw.
    const active = document.activeElement;
    let focusKey = null;
    if (root.contains(active)) {
      const id = active.closest('[data-id]')?.dataset.id;
      if (id && active.dataset.field) focusKey = `[data-id="${id}"] [data-field="${active.dataset.field}"]`;
      else if (id && 'check' in active.dataset) focusKey = `[data-id="${id}"] [data-check]`;
      else if (active.dataset.filter) focusKey = `[data-filter="${active.dataset.filter}"]`;
      else if (active.dataset.action) focusKey = `[data-action="${active.dataset.action}"]`;
    }

    const all = matching();
    const pages = Math.max(1, Math.ceil(all.length / state.size));
    state.page = Math.min(state.page, pages - 1);
    const shown = all.slice(state.page * state.size, (state.page + 1) * state.size);
    // Ticks only count for questions that are still pending.
    const pendingIds = new Set(store.collection('pending').map((q) => q.id));
    [...state.checked].forEach((id) => { if (!pendingIds.has(id)) state.checked.delete(id); });
    const ticked = shown.filter((q) => state.checked.has(q.id)).length;
    const tickable = shown.filter((q) => store.validate(q).valid).length;
    const pager = `
      <div class="bulk-pager">
        <button type="button" class="btn btn-ghost btn-sm" data-action="prev" ${state.page === 0 ? 'disabled' : ''}>‹ Previous</button>
        <span class="muted">Page ${state.page + 1} of ${pages}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-action="next" ${state.page >= pages - 1 ? 'disabled' : ''}>Next ›</button>
      </div>`;

    mount(root, `
      <section class="${firstDraw ? 'screen-enter' : ''}">
        <header class="page-head">
          <span class="eyebrow">Question Review</span>
          <h1>Bulk Approve</h1>
          <p class="muted" style="margin:0">Set each question's round and difficulty, tick the ones to approve, then press <strong>Approve ticked</strong>. Press <strong>Publish</strong> afterwards to save them to approved-questions.json.</p>
        </header>
        <div class="card bulk-bar">
          <label class="round-field"><span>Round</span>
            <select class="select" data-filter="stage">${opt('', 'All rounds', state.stage)}${meta.stages.map((s) => opt(s.key, s.label, state.stage)).join('')}</select>
          </label>
          <label class="round-field"><span>Category</span>
            <select class="select" data-filter="category">${opt('', 'All categories', state.category)}${meta.categories.map((c) => opt(c.key, c.label, state.category)).join('')}</select>
          </label>
          <label class="round-field"><span>Difficulty</span>
            <select class="select" data-filter="difficulty">${opt('', 'Any', state.difficulty)}${[1, 2, 3, 4, 5].map((d) => opt(d, `${d} — ${DIFFICULTY_NAMES[d - 1]}`, state.difficulty)).join('')}</select>
          </label>
          <label class="round-field"><span>Per page</span>
            <select class="select" data-filter="size">${PAGE_SIZES.map((s) => opt(s, s, state.size)).join('')}</select>
          </label>
          <div class="bulk-go">${goHtml()}</div>
        </div>
        <div class="list-meta">
          <span class="muted">${all.length} pending question${all.length === 1 ? '' : 's'}${all.length ? ` · showing ${state.page * state.size + 1}–${state.page * state.size + shown.length}` : ''}</span>
          ${shown.length ? `<label class="bulk-check bulk-all"><input type="checkbox" data-action="tick-page" ${tickable && ticked === tickable ? 'checked' : ''} ${tickable ? '' : 'disabled'}><span>Tick all on this page</span></label>` : ''}
        </div>
        ${shown.length
          ? `<ul class="bulk-list">${shown.map(row).join('')}</ul>${pages > 1 ? pager : ''}`
          : '<div class="card card-pad empty" style="text-align:center">No pending questions match these filters.</div>'}
      </section>`);

    if (focusKey) root.querySelector(focusKey)?.focus();
    firstDraw = false;
  }

  const offs = [
    on(root, 'change', '[data-filter]', (e, sel) => {
      const k = sel.dataset.filter;
      state[k] = k === 'size' ? Number(sel.value) : sel.value;
      state.page = 0;
      draw();
    }),
    on(root, 'change', '[data-check]', (e, box) => {
      const id = box.closest('[data-id]').dataset.id;
      if (box.checked) state.checked.add(id); else state.checked.delete(id);
      refreshTicks();
    }),
    on(root, 'change', '[data-action="tick-page"]', (e, box) => {
      const all = matching();
      all.slice(state.page * state.size, (state.page + 1) * state.size)
        .filter((q) => store.validate(q).valid)
        .forEach((q) => (box.checked ? state.checked.add(q.id) : state.checked.delete(q.id)));
      refreshTicks();
    }),
    on(root, 'change', '.bulk-row [data-field]', (e, sel) => {
      const id = sel.closest('[data-id]').dataset.id;
      const field = sel.dataset.field;
      const value = field === 'difficulty' ? Number(sel.value) : sel.value;
      try {
        store.reassign(id, { [field]: value }); // redraws through store:changed
      } catch (err) {
        toast({ message: err.message, tone: 'danger' });
        draw();
      }
    }),
    on(root, 'click', '[data-action="prev"]', () => { state.page = Math.max(0, state.page - 1); draw(); window.scrollTo({ top: 0 }); }),
    on(root, 'click', '[data-action="next"]', () => { state.page += 1; draw(); window.scrollTo({ top: 0 }); }),
    on(root, 'click', '[data-action="untick"]', () => { state.checked.clear(); refreshTicks(); }),
    on(root, 'click', '[data-action="approve"]', () => {
      const { approved, failed } = store.approveMany([...state.checked]);
      approved.forEach((id) => state.checked.delete(id));
      if (failed.length) {
        toast({ message: `${failed.length} not approved: ${failed[0].id} — ${failed[0].message}`, tone: 'danger', duration: 8000 });
      }
      if (approved.length) {
        toast({
          message: `Approved ${approved.length} question${approved.length === 1 ? '' : 's'}. Publish to save them to approved-questions.json.`,
          tone: 'success', duration: 8000,
          actionLabel: 'Undo', onAction: () => { store.undo(); approved.forEach((id) => state.checked.add(id)); draw(); toast({ message: 'Undone' }); },
        });
      }
      draw();
    }),
    ctx.bus.on('store:changed', draw),
  ];

  draw();
  return () => offs.forEach((o) => o());
}
