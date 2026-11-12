import { mount, esc, on } from '../../ui/dom.js';
import { toast } from '../../ui/components/toast.js';
import { downloadJson } from '../../data-sources/publishers.js';
import { toFile } from '../../data-sources/json-file-source.js';
import { formatDate } from '../../core/utils.js';
import { t } from '../../core/edition.js';

const LOW_STAGE_COUNT = 3;
const DIFFICULTY_NAMES = ['Easy', 'Fair', 'Medium', 'Hard', 'Expert'];

export function render(root, ctx) {
  const { store, meta } = ctx;
  // Filters for the "Assign Questions To Rounds" panel (kept across redraws).
  const rounds = { stage: '', status: 'approved' };

  function roundRow(q, status) {
    const stage = meta.stageByKey[q.stage];
    const outOfRange = stage && (q.difficulty < stage.difficulty[0] || q.difficulty > stage.difficulty[1]);
    return `
      <li class="round-row" data-id="${esc(q.id)}">
        <div class="round-q">
          <span class="qid">${esc(q.id)}</span>${status === 'pending' ? ' <span class="badge badge-gold">Pending</span>' : ''}
          <p>${esc(q.question)}</p>
          <span class="muted round-answer">Answer: ${esc(q.options?.[q.correctAnswer] ?? '—')}</span>
        </div>
        <label class="round-field">
          <span>Round</span>
          <select class="select" data-field="stage" aria-label="Round for ${esc(q.id)}">
            ${meta.stages.map((s) => `<option value="${esc(s.key)}" ${s.key === q.stage ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
        </label>
        <label class="round-field">
          <span>Difficulty${outOfRange ? ` <span class="low" title="Usual range for ${esc(stage.label)} is ${stage.difficulty.join('–')}">⚠</span>` : ''}</span>
          <select class="select" data-field="difficulty" aria-label="Difficulty for ${esc(q.id)}">
            ${[1, 2, 3, 4, 5].map((d) => `<option value="${d}" ${d === q.difficulty ? 'selected' : ''}>${d} — ${DIFFICULTY_NAMES[d - 1]}</option>`).join('')}
          </select>
        </label>
      </li>`;
  }

  function roundsPanel() {
    const order = Object.fromEntries(meta.stages.map((s, i) => [s.key, i]));
    const list = (rounds.status === 'all' ? ['approved', 'pending'] : [rounds.status])
      .flatMap((c) => store.collection(c).map((q) => ({ q, status: c })))
      .filter(({ q }) => !rounds.stage || q.stage === rounds.stage)
      .sort((a, b) => (order[a.q.stage] ?? 99) - (order[b.q.stage] ?? 99) || a.q.id.localeCompare(b.q.id));
    const statusOpts = [['approved', 'Approved'], ['pending', 'Pending'], ['all', 'Approved + pending']];
    return `
      <div class="card card-pad rounds-panel" id="rounds">
        <h2 class="panel-title">Assign Questions To Rounds</h2>
        <p class="muted" style="font-size:.875rem;margin-top:0">Move a question to a harder or easier round, or change its difficulty. Approved questions stay approved; only the round changes. Publish when you're done.</p>
        <div class="rounds-filters">
          <label class="round-field"><span>Round</span>
            <select class="select" data-filter="stage">
              <option value="">All rounds</option>
              ${meta.stages.map((s) => `<option value="${esc(s.key)}" ${s.key === rounds.stage ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
            </select>
          </label>
          <label class="round-field"><span>Questions</span>
            <select class="select" data-filter="status">
              ${statusOpts.map(([v, l]) => `<option value="${v}" ${v === rounds.status ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
        </div>
        ${list.length
          ? `<ul class="round-list">${list.map(({ q, status }) => roundRow(q, status)).join('')}</ul>`
          : '<p class="empty">No questions in this round.</p>'}
      </div>`;
  }

  function draw() {
    // Keep keyboard focus on the same control after the redraw.
    const active = document.activeElement;
    let focusKey = null;
    if (root.contains(active)) {
      if (active.dataset.filter) focusKey = `[data-filter="${active.dataset.filter}"]`;
      else if (active.dataset.field) focusKey = `[data-id="${active.closest('[data-id]')?.dataset.id}"] [data-field="${active.dataset.field}"]`;
    }

    const c = store.counts();
    const approved = store.collection('approved');
    const perStage = meta.stages.map((s) => ({ s, n: approved.filter((q) => q.stage === s.key).length }));
    const maxN = Math.max(1, ...perStage.map((x) => x.n));
    const audit = store.audit().slice(0, 12);

    mount(root, `
      <section class="screen-enter">
        <header class="page-head">
          <span class="eyebrow">${esc(t('admin.eyebrow'))}</span>
          <h1>Question Dashboard</h1>
        </header>

        ${store.conflict ? `
          <div class="alert" role="alert">
            <div><strong>The question files changed on disk</strong> since your unpublished changes were made (perhaps edited by hand or on another device).</div>
            <div class="row">
              <button class="btn btn-sm btn-gold-outline" data-action="keep">Keep my changes</button>
              <button class="btn btn-sm btn-ghost" data-action="disk">Use the files on disk</button>
            </div>
          </div>` : ''}

        <div class="count-grid stagger">
          <a class="card card-hover count-card is-pending" href="#review">
            <span class="label">Pending</span><span class="value">${c.pending}</span><span class="hint">Awaiting review</span>
          </a>
          <a class="card card-hover count-card is-approved" href="#review?status=approved">
            <span class="label">Approved</span><span class="value">${c.approved}</span><span class="hint">Live in the game</span>
          </a>
          <a class="card card-hover count-card is-rejected" href="#review?status=rejected">
            <span class="label">Rejected</span><span class="value">${c.rejected}</span><span class="hint">Kept for the record</span>
          </a>
        </div>

        <div class="dash-cols">
          <div class="card card-pad">
            <h2 class="panel-title">Approved Questions Per Stage</h2>
            <table class="coverage">
              <thead><tr><th>Stage</th><th></th><th class="num">Approved</th></tr></thead>
              <tbody>
                ${perStage.map(({ s, n }) => `
                  <tr>
                    <td><a href="#rounds" data-round="${esc(s.key)}" title="Show these questions below">${esc(s.label)}</a></td>
                    <td style="width:45%"><div class="meter"><span style="width:${(n / maxN) * 100}%"></span></div></td>
                    <td class="num ${n < LOW_STAGE_COUNT ? 'low' : ''}">${n}${n < LOW_STAGE_COUNT ? ' ⚠' : ''}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <p class="muted" style="font-size:.75rem;margin-top:10px">⚠ Fewer than ${LOW_STAGE_COUNT} questions means players will see repeats at that stage.</p>
          </div>
          <div class="card card-pad">
            <h2 class="panel-title">Recent Activity</h2>
            ${audit.length ? `<ul class="audit">${audit.map((a) => `
              <li><span><span class="act">${esc(a.action)}</span> <span class="muted">${esc(a.id !== '-' ? a.id : '')}</span>${a.detail ? `<br><span class="muted" style="font-size:.75rem">${esc(a.detail)}</span>` : ''}</span>
              <span class="when">${esc(formatDate(a.at))}</span></li>`).join('')}</ul>` : '<p class="empty">No admin activity yet.</p>'}
          </div>
        </div>

        ${roundsPanel()}

        <div class="tools">
          <div class="card card-pad">
            <h2 class="panel-title" style="margin-bottom:0">Import Questions</h2>
            <p class="muted" style="font-size:.875rem">Add questions from a JSON file. Everything imported goes to <strong>Pending</strong> for review. Accepts a list of questions or a collection file.</p>
            <label class="dropzone" data-ref="drop">
              <input type="file" accept=".json,application/json" hidden data-ref="file">
              Drop a .json file here or <span style="color:var(--gold-bright);text-decoration:underline">choose a file</span>
            </label>
          </div>
          <div class="card card-pad">
            <h2 class="panel-title" style="margin-bottom:0">Export</h2>
            <p class="muted" style="font-size:.875rem">Download a copy of any collection, including unpublished changes.</p>
            <div class="row">
              <button class="btn btn-sm" data-export="pending">Pending</button>
              <button class="btn btn-sm" data-export="approved">Approved</button>
              <button class="btn btn-sm" data-export="rejected">Rejected</button>
            </div>
          </div>
        </div>
      </section>`);

    if (focusKey) root.querySelector(focusKey)?.focus();

    const fileInput = root.querySelector('[data-ref="file"]');
    const drop = root.querySelector('[data-ref="drop"]');
    fileInput.addEventListener('change', () => fileInput.files[0] && importFile(fileInput.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('is-over');
      const f = e.dataTransfer.files[0];
      if (f) importFile(f);
    });
  }

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const { added, skipped } = store.importQuestions(data);
      toast({ message: `Imported ${added} question${added === 1 ? '' : 's'} to pending${skipped ? ` · ${skipped} skipped` : ''}`, tone: 'success', actionLabel: 'Review', onAction: () => ctx.go('review') });
    } catch (err) {
      toast({ message: err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message, tone: 'danger' });
    }
  }

  const offs = [
    on(root, 'change', '[data-filter]', (e, sel) => { rounds[sel.dataset.filter] = sel.value; draw(); }),
    on(root, 'click', '[data-round]', (e, a) => {
      e.preventDefault();
      rounds.stage = a.dataset.round;
      draw();
      root.querySelector('#rounds')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
    on(root, 'change', '.round-row [data-field]', (e, sel) => {
      const id = sel.closest('[data-id]').dataset.id;
      const field = sel.dataset.field;
      const value = field === 'difficulty' ? Number(sel.value) : sel.value;
      try {
        store.reassign(id, { [field]: value });
        toast({
          message: field === 'stage' ? `${id} moved to ${meta.stageLabel(value)}` : `${id} difficulty set to ${value}`,
          tone: 'success', actionLabel: 'Undo', onAction: () => store.undo(),
        });
      } catch (err) {
        toast({ message: err.message, tone: 'danger' });
        draw();
      }
    }),
    on(root, 'click', '[data-export]', (e, btn) => {
      const name = btn.dataset.export;
      downloadJson(`${name}-questions.json`, toFile(name, store.collection(name)));
    }),
    on(root, 'click', '[data-action="keep"]', () => { store.keepWorkingCopy(); toast({ message: 'Keeping your unpublished changes' }); }),
    on(root, 'click', '[data-action="disk"]', () => { store.useDiskVersion(); toast({ message: 'Loaded the files from disk' }); }),
    ctx.bus.on('store:changed', draw),
  ];

  draw();
  return () => offs.forEach((o) => o());
}
