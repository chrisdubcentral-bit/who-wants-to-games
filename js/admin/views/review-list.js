import { mount, esc, on } from '../../ui/dom.js';
import { toast } from '../../ui/components/toast.js';
import { applyFilters, highlight } from '../../core/search.js';
import { debounce, LETTERS, formatDate } from '../../core/utils.js';
import { askRejection } from './reject-modal.js';

const STATUS_BADGE = {
  pending: '<span class="badge badge-gold">Pending</span>',
  approved: '<span class="badge badge-emerald">Approved</span>',
  rejected: '<span class="badge badge-danger">Rejected</span>',
};

export function stars(n) {
  return `<span class="stars" aria-label="Difficulty ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? '' : 'off'}">★</span>`).join('')}</span>`;
}

export function render(root, ctx, params) {
  const { store, meta } = ctx;
  const f = {
    status: params.get('status') ?? 'pending',
    stage: params.get('stage') ?? '',
    category: params.get('category') ?? '',
    difficulty: params.get('difficulty') ?? '',
    query: params.get('q') ?? '',
  };

  const opt = (value, label, current) => `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;

  mount(root, `
    <section class="screen-enter">
      <header class="page-head">
        <span class="eyebrow">Question Review</span>
        <h1>Review Questions</h1>
      </header>
      <form class="card filters" role="search" data-ref="filters">
        <div class="field">
          <label for="f-q">Search</label>
          <input id="f-q" name="query" class="input" type="search" placeholder="Question, player, club, country… or an id like q_000527" value="${esc(f.query)}" autocomplete="off">
        </div>
        <div class="field">
          <label for="f-status">Status</label>
          <select id="f-status" name="status" class="select">
            ${opt('', 'All', f.status)}${opt('pending', 'Pending', f.status)}${opt('approved', 'Approved', f.status)}${opt('rejected', 'Rejected', f.status)}
          </select>
        </div>
        <div class="field">
          <label for="f-stage">Stage</label>
          <select id="f-stage" name="stage" class="select">
            ${opt('', 'All stages', f.stage)}${meta.stages.map((s) => opt(s.key, s.label, f.stage)).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-cat">Category</label>
          <select id="f-cat" name="category" class="select">
            ${opt('', 'All categories', f.category)}${meta.categories.map((c) => opt(c.key, c.label, f.category)).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-diff">Difficulty</label>
          <select id="f-diff" name="difficulty" class="select">
            ${opt('', 'Any', f.difficulty)}${[1, 2, 3, 4, 5].map((d) => opt(d, '★'.repeat(d), f.difficulty)).join('')}
          </select>
        </div>
      </form>
      <div class="list-meta">
        <span class="muted" data-ref="count"></span>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear">Clear filters</button>
          <a class="btn btn-gold-outline btn-sm" href="#new">+ Add Question</a>
        </div>
      </div>
      <div class="qlist" data-ref="list"></div>
    </section>`);

  const listEl = root.querySelector('[data-ref="list"]');
  const countEl = root.querySelector('[data-ref="count"]');
  const form = root.querySelector('[data-ref="filters"]');

  function syncHash() {
    const p = new URLSearchParams();
    if (f.status !== 'pending') p.set('status', f.status);
    ['stage', 'category', 'difficulty'].forEach((k) => f[k] && p.set(k, f[k]));
    if (f.query) p.set('q', f.query);
    const qs = p.toString();
    history.replaceState(null, '', '#review' + (qs ? '?' + qs : ''));
  }

  function card({ q, status }) {
    const v = status === 'pending' ? store.validate(q) : null;
    const checks = v
      ? `<div class="checks">
          ${v.errors.map((e) => `<div class="check-item is-error">✕ ${esc(e.message)}</div>`).join('')}
          ${v.warnings.map((w) => `<div class="check-item is-warn">! ${esc(w.message)}</div>`).join('')}
          ${v.valid && !v.warnings.length ? '<div class="check-item is-ok">✓ All checks passed</div>' : ''}
        </div>`
      : '';
    const rejection = status === 'rejected' && q.review?.rejectionReason
      ? `<div class="rejection"><strong>${esc(q.review.rejectionReason)}</strong>${q.review.rejectionNote ? ` — ${esc(q.review.rejectionNote)}` : ''}${q.review.reviewedAt ? ` <span class="muted">· ${esc(formatDate(q.review.reviewedAt))}</span>` : ''}</div>`
      : '';
    const actions = {
      pending: `
        <button class="btn btn-ghost btn-sm" data-action="edit">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="reject">Reject</button>
        <button class="btn btn-approve btn-sm" data-action="approve" ${v && !v.valid ? 'disabled title="Fix the errors before approving"' : ''}>Approve</button>`,
      approved: `
        <button class="btn btn-ghost btn-sm" data-action="edit">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="pending">Withdraw to Pending</button>`,
      rejected: `
        <button class="btn btn-ghost btn-sm" data-action="edit">Edit</button>
        <button class="btn btn-gold-outline btn-sm" data-action="pending">Restore to Pending</button>`,
    }[status];

    return `
      <article class="card qcard" data-id="${esc(q.id)}">
        <div class="qcard-head">
          <div class="qcard-tags">
            ${STATUS_BADGE[status]}
            <span class="badge">${esc(meta.stageLabel(q.stage))}</span>
            <span class="badge">${esc(meta.categoryLabel(q.category))}</span>
            ${stars(q.difficulty)}
          </div>
          <span class="qid">${esc(q.id)}</span>
        </div>
        <p class="qtext">${highlight(q.question, f.query)}</p>
        <ol class="qopts">
          ${(q.options ?? []).map((o, i) => `<li class="${i === q.correctAnswer ? 'is-correct' : ''}"><span class="l">${LETTERS[i]}</span><span>${highlight(o, f.query)}</span></li>`).join('')}
        </ol>
        ${q.tags?.length ? `<div class="qtags">${q.tags.map((t) => `<span>${highlight(t, f.query)}</span>`).join('')}</div>` : ''}
        ${checks}${rejection}
        <div class="qcard-actions">${actions}</div>
      </article>`;
  }

  function draw() {
    const rows = applyFilters(store.rows(), f, meta);
    countEl.textContent = `${rows.length} question${rows.length === 1 ? '' : 's'}`;
    listEl.innerHTML = rows.length ? rows.map(card).join('') : emptyState();
  }

  /** No matches: say so, and offer to widen the status filter if that would find some. */
  function emptyState() {
    const elsewhere = f.status ? applyFilters(store.rows(), { ...f, status: '' }, meta).length : 0;
    return `<div class="card card-pad empty" style="text-align:center;display:grid;gap:12px;justify-items:center">
      <span>No ${esc(f.status)} questions match these filters.</span>
      ${elsewhere ? `<button type="button" class="btn btn-sm" data-action="all-statuses">Show ${elsewhere} match${elsewhere === 1 ? '' : 'es'} in all questions</button>` : ''}
    </div>`;
  }

  const readForm = () => {
    const data = new FormData(form);
    ['status', 'stage', 'category', 'difficulty', 'query'].forEach((k) => { f[k] = String(data.get(k) ?? ''); });
    syncHash();
    draw();
  };

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', readForm);
  form.querySelector('#f-q').addEventListener('input', debounce(readForm, 200));

  const undoToast = (message) => toast({
    message, tone: 'success', actionLabel: 'Undo',
    onAction: () => { store.undo(); toast({ message: 'Undone' }); },
  });

  const offs = [
    on(listEl, 'click', '[data-action="all-statuses"]', () => {
      form.querySelector('#f-status').value = '';
      readForm();
    }),
    on(root, 'click', '[data-action="clear"]', () => {
      form.reset();
      form.querySelector('#f-status').value = '';
      readForm();
    }),
    on(listEl, 'click', '[data-action]', async (e, btn) => {
      const id = btn.closest('[data-id]').dataset.id;
      const action = btn.dataset.action;
      try {
        if (action === 'edit') return ctx.go('edit/' + id);
        if (action === 'approve') {
          const res = store.approve(id);
          if (!res.ok) return toast({ message: res.result.errors[0].message, tone: 'danger' });
          undoToast(`Approved ${id}`);
        }
        if (action === 'reject') {
          const found = store.find(id);
          const answer = await askRejection(found.q);
          if (!answer) return;
          store.reject(id, answer.reason, answer.note);
          undoToast(`Rejected ${id} · ${answer.reason}`);
        }
        if (action === 'pending') {
          const from = store.find(id).status;
          store.sendToPending(id);
          undoToast(from === 'approved' ? `Withdrew ${id} from the game` : `Restored ${id} to pending`);
        }
      } catch (err) {
        console.error(err);
        toast({ message: err.message, tone: 'danger' });
      }
    }),
  ];

  const offStore = ctx.bus.on('store:changed', draw);
  draw();
  if (f.query) form.querySelector('#f-q').focus();

  return () => { offs.forEach((o) => o()); offStore(); };
}
