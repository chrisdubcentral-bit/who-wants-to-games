import { mount, esc } from '../../ui/dom.js';
import { toast } from '../../ui/components/toast.js';
import { LETTERS } from '../../core/utils.js';
import { stars } from './review-list.js';

/** Edit an existing question (id) or create a new one (id = null). */
export function render(root, ctx, id) {
  const { store, meta } = ctx;
  const found = id ? store.find(id) : null;
  if (id && !found) {
    mount(root, `<div class="card notice"><h1>Question not found</h1><p class="muted">${esc(id)} isn't in any collection.</p><a class="btn" href="#review">Back to review</a></div>`);
    return;
  }

  const q = found?.q ?? {
    question: '', options: ['', '', '', ''], correctAnswer: null,
    stage: meta.stages[0].key, category: meta.categories[0].key, difficulty: 1, tags: [],
  };
  const isNew = !found;
  const opts = [0, 1, 2, 3].map((i) => q.options?.[i] ?? '');
  const sel = (value, label, current) => `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;

  mount(root, `
    <section class="screen-enter">
      <header class="page-head">
        <span class="eyebrow">${isNew ? 'New Question' : `Edit · ${esc(q.id)} · ${esc(found.status)}`}</span>
        <h1>${isNew ? 'Add Question' : 'Edit Question'}</h1>
        ${found && found.status !== 'pending' ? `<p class="muted">Saving will move this question back to <strong>Pending</strong> so it can be reviewed again.</p>` : ''}
      </header>
      <div class="edit-layout">
        <form class="card card-pad" novalidate data-ref="form">
          <div class="edit-grid">
            <div class="field span-2">
              <label for="e-question">Question text</label>
              <textarea id="e-question" name="question" class="textarea" rows="3" maxlength="300">${esc(q.question)}</textarea>
              <span class="field-error" data-err="question"></span>
            </div>
            <div class="field span-2">
              <span class="field-label">Answers — tick the correct one</span>
              <div style="display:grid;gap:10px">
                ${opts.map((o, i) => `
                  <div class="option-row">
                    <label class="correct-pick" title="Mark ${LETTERS[i]} as correct">
                      <input type="radio" name="correctAnswer" value="${i}" ${q.correctAnswer === i ? 'checked' : ''} aria-label="${LETTERS[i]} is correct">
                      <span>${LETTERS[i]}</span>
                    </label>
                    <div class="field">
                      <input class="input" name="option${i}" value="${esc(o)}" maxlength="100" aria-label="Option ${LETTERS[i]}">
                      <span class="field-error" data-err="option${i}"></span>
                    </div>
                  </div>`).join('')}
              </div>
              <span class="field-error" data-err="options"></span>
              <span class="field-error" data-err="correctAnswer"></span>
            </div>
            <div class="field">
              <label for="e-stage">Tournament stage</label>
              <select id="e-stage" name="stage" class="select">${meta.stages.map((s) => sel(s.key, s.label, q.stage)).join('')}</select>
              <span class="field-error" data-err="stage"></span>
            </div>
            <div class="field">
              <label for="e-cat">Category</label>
              <select id="e-cat" name="category" class="select">${meta.categories.filter((c) => c.active || c.key === q.category).map((c) => sel(c.key, c.label, q.category)).join('')}</select>
              <span class="field-error" data-err="category"></span>
            </div>
            <div class="field">
              <label for="e-diff">Difficulty</label>
              <select id="e-diff" name="difficulty" class="select">${[1, 2, 3, 4, 5].map((d) => sel(d, `${d} — ${['Easy', 'Fair', 'Medium', 'Hard', 'Expert'][d - 1]}`, q.difficulty)).join('')}</select>
              <span class="field-error" data-err="difficulty"></span>
            </div>
            <div class="field">
              <label for="e-tags">Search tags</label>
              <input id="e-tags" name="tags" class="input" value="${esc((q.tags ?? []).join(', '))}" placeholder="Players, clubs, countries… (comma separated)">
            </div>
          </div>
          <div class="edit-actions">
            <a class="btn btn-ghost" href="#review">Cancel</a>
            <button type="submit" class="btn btn-primary">${isNew ? 'Add to Pending' : 'Save Changes'}</button>
          </div>
        </form>
        <aside class="edit-side">
          <div class="card preview-q" data-ref="preview"></div>
          <div class="card card-pad">
            <h2 class="panel-title" style="margin-bottom:12px">Checks</h2>
            <div class="checks" data-ref="checks"></div>
          </div>
        </aside>
      </div>
    </section>`);

  const form = root.querySelector('[data-ref="form"]');
  let touched = false;

  function read() {
    const d = new FormData(form);
    const correct = d.get('correctAnswer');
    return {
      ...(found ? q : {}),
      question: String(d.get('question') ?? '').trim(),
      options: [0, 1, 2, 3].map((i) => String(d.get(`option${i}`) ?? '').trim()),
      correctAnswer: correct === null ? null : Number(correct),
      stage: d.get('stage'),
      category: d.get('category'),
      difficulty: Number(d.get('difficulty')),
      tags: String(d.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    };
  }

  function check() {
    const draft = read();
    const v = store.validate(draft);
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = ''; });
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    if (touched) {
      v.errors.forEach((e) => {
        const slot = form.querySelector(`[data-err="${e.field}"]`);
        if (slot && !slot.textContent) slot.textContent = e.message;
        const input = form.querySelector(`[name="${e.field}"]`);
        if (input && input.type !== 'radio') input.classList.add('is-invalid');
      });
    }
    root.querySelector('[data-ref="checks"]').innerHTML = [
      ...v.errors.map((e) => `<div class="check-item is-error">✕ ${esc(e.message)}</div>`),
      ...v.warnings.map((w) => `<div class="check-item is-warn">! ${esc(w.message)}</div>`),
      v.valid && !v.warnings.length ? '<div class="check-item is-ok">✓ Ready for approval</div>' : '',
    ].join('');
    root.querySelector('[data-ref="preview"]').innerHTML = `
      <span class="eyebrow">${esc(meta.stageLabel(draft.stage))} · ${esc(meta.categoryLabel(draft.category))}</span>
      <p class="qtext">${esc(draft.question || 'Your question will appear here')}</p>
      <ol class="qopts" style="grid-template-columns:1fr">
        ${draft.options.map((o, i) => `<li class="${draft.correctAnswer === i ? 'is-correct' : ''}"><span class="l">${LETTERS[i]}</span><span>${esc(o || '—')}</span></li>`).join('')}
      </ol>
      ${stars(draft.difficulty)}`;
    return { draft, v };
  }

  form.addEventListener('input', () => check());
  form.addEventListener('change', () => check());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    touched = true;
    const { draft, v } = check();
    // Duplicates are only blocked at approval, so a question can still be saved and reworded.
    const blocking = v.errors.filter((er) => !er.duplicate);
    if (blocking.length) {
      toast({ message: 'Please fix the highlighted fields.', tone: 'danger' });
      form.querySelector('.is-invalid')?.focus();
      return;
    }
    try {
      if (isNew) {
        const newId = store.create(draft);
        toast({ message: `Added ${newId} to pending`, tone: 'success' });
      } else {
        const { id: _id, status: _s, ...changes } = draft;
        const landed = store.update(q.id, changes);
        toast({ message: landed === 'pending' && found.status !== 'pending' ? `Saved — ${q.id} moved to pending for review` : `Saved ${q.id}`, tone: 'success' });
      }
      ctx.go('review');
    } catch (err) {
      toast({ message: err.message, tone: 'danger' });
    }
  });

  check();
  form.querySelector('#e-question').focus();
}
