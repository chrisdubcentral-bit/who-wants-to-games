import { mount, esc } from '../../ui/dom.js';
import { summarise, STATUS } from '../game-engine.js';
import { LETTERS } from '../../core/utils.js';
import { t, ed, summaryLabels, prizeCount } from '../../core/edition.js';
import { openModal } from '../../ui/components/modal.js';
import {
  readBoard, saveEntry, readPlayer, entryFromSummary, isEligible, prospectiveRank,
  cleanText, NAME_MAX, TOWN_MAX, LIMIT,
} from '../leaderboard.js';

export function render(root, app) {
  const state = app.ctrl.state;
  if (!app.ctrl.isFinished) { app.go('home'); return; }
  const s = summarise(state, summaryLabels());

  const stat = (label, value, gold = false, extraCls = '') =>
    `<div class="card result-stat ${extraCls}"><span class="label">${esc(label)}</span><span class="value ${gold ? 'gold' : ''}">${esc(value)}</span></div>`;

  let hero = '';
  let stats = '';
  let extra = '';
  let cls = '';
  let actions = '<button class="btn btn-primary btn-lg" data-action="again">Play Again</button>';
  // A champion who ended the run instead of playing on gets the knocked-out layout, Top 100 form included.
  const won = s.result === STATUS.WON && !s.retired;
  const later = s.season > 1;
  // In a first season it's "5 / 8"; over several seasons a running total reads better.
  const correct = later ? String(s.correctCount) : `${s.correctCount} / ${s.totalStages}`;

  if (s.retired) {
    cls = 'is-eliminated is-retired';
    hero = `
      <span class="eyebrow">${esc(t('results.outEyebrow'))}${later ? ` · Season ${s.season}` : ''}</span>
      <h1>${esc(t('results.retired'))}</h1>
      <p class="sub">${esc(t('results.retiredSub', { count: prizeCount(s.cups) }))}</p>`;
    stats = [
      stat(t('results.prizeCount'), String(s.cups), true),
      stat('Correct Answers', correct),
      stat('50:50', s.lifelineUsed ? `Used · ${s.lifelineStage}` : 'Unused'),
    ].join('');
  } else if (won) {
    cls = 'is-won';
    hero = `
      <img class="trophy" src="${esc(ed('images.prize'))}" alt="${esc(t('results.prizeAlt'))}" width="210" height="252">
      <span class="eyebrow ${later ? '' : 'is-edition'}">${esc(later ? `Season ${s.season}` : t('results.edition'))}</span>
      <h1>${esc(t('results.champion'))}</h1>
      <p class="sub">${esc(s.cups > 1 ? t('results.wonMany', { n: s.cups }) : t('results.wonOnce'))}</p>`;
    stats = [
      stat(s.cups > 1 ? t('results.prizeCount') : t('results.result'), s.cups > 1 ? String(s.cups) : ed('vars.champion'), true, s.cups > 1 ? '' : 'is-result'),
      stat('Correct Answers', correct),
      stat('50:50', s.lifelineUsed ? `Used · ${s.lifelineStage}` : 'Not needed'),
    ].join('');
    const restart = app.meta.stageLabel(ed('seasons.restartStage'));
    extra = `
      <p class="muted season-note">${esc(t('results.seasonNote', { restart }))}
        ${s.lifelineUsed ? 'Your 50:50 has been used.' : 'Your 50:50 is still there to use.'}</p>`;
    actions = `<button class="btn btn-primary btn-lg" data-action="season">Start Season ${s.season + 1}</button>`;
  } else {
    cls = 'is-eliminated';
    const last = state.answers[state.answers.length - 1];
    const q = state.questions[state.stageIndex];
    hero = `
      <div class="result-icon is-out" aria-hidden="true">✕</div>
      <span class="eyebrow">${esc(t('results.outEyebrow'))}${later ? ` · Season ${s.season}` : ''}</span>
      <h1>${esc(t('results.out'))}</h1>
      <p class="sub">${esc(s.finishLabel)}</p>`;
    stats = [
      stat('Stage Reached', s.stageReachedLabel, false, 'is-stage-reached'),
      s.cups ? stat(t('results.prizeCount'), String(s.cups), true) : stat('Correct Answers', correct),
      stat('50:50', s.lifelineUsed ? `Used · ${s.lifelineStage}` : 'Unused'),
    ].join('');
    // Only show the missed question if it was actually answered (not when the game was left unfinished).
    if (q && last && last.stageKey === state.stages[state.stageIndex].key && !last.correct) {
      extra = `
        <div class="card missed">
          <span class="eyebrow">The one that got away</span>
          <p class="q">${esc(q.question)}</p>
          <div class="row">
            <span class="yours">Your answer: ${LETTERS[last.chosen]} · ${esc(q.options[last.chosen])}</span>
            <span class="right">Correct: ${LETTERS[q.correctAnswer]} · ${esc(q.options[q.correctAnswer])}</span>
          </div>
        </div>`;
    }
  }

  mount(root, `
    <section class="screen results ${cls}">
      <div class="results-hero stagger">${hero}</div>
      <div class="result-stats stagger">${stats}</div>
      ${won ? '' : extra}
      ${boardPanel(state, s, !won)}
      <div class="page-actions">
        ${actions}
        ${won ? extra : ''}
        <div class="results-row">
          <button class="btn" data-go="top100">Top 100</button>
          <button class="btn" data-go="stats">Stats</button>
          <button class="btn btn-ghost" data-go="home">Home</button>
        </div>
      </div>
    </section>`);

  root.querySelector('[data-action="again"]')?.addEventListener('click', () => app.startGame());
  root.querySelector('[data-action="season"]')?.addEventListener('click', () => app.nextSeason());
  const form = root.querySelector('.board-entry');
  if (form) wireEntryForm(form, app, state, s);
  else root.querySelector('.page-actions .btn-lg').focus({ preventScroll: true });

  if (won) {
    // Leaving the champion screen ends the run, so check first and offer the Top 100 on the way out.
    root.querySelector('.results-row').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-go]');
      if (!btn || !wouldMakeBoard(state, s)) return;
      e.preventDefault();
      e.stopPropagation();
      const next = s.season + 1;
      const choice = await openModal({
        title: 'End your run?',
        message: `You can carry on into Season ${next}, or end your run now and add your name to the Top ${LIMIT}.`,
        actions: [
          { label: 'End Run', value: 'end', className: 'btn-ghost' },
          { label: `Start Season ${next}`, value: 'season', className: 'btn-primary' },
        ],
      });
      if (choice === 'season') app.nextSeason();
      else if (choice === 'end') { app.ctrl.retire(); app.go('results'); }
    });
    return confetti();
  }
}

/** True if this run isn't on the Top 100 yet but would make it. */
function wouldMakeBoard(state, s) {
  if (!isEligible(s)) return false;
  const board = readBoard();
  if (board.some((e) => e.sessionId === state.sessionId)) return false;
  return !!prospectiveRank(board, entryFromSummary(s, { name: '', town: '', sessionId: state.sessionId }));
}

/**
 * Top 100 card: the entry form if the game qualifies, or the position already taken.
 * The form is only offered once the run is over (canEnter); a champion still playing on isn't asked.
 */
function boardPanel(state, s, canEnter) {
  if (!isEligible(s)) return '';
  const mine = readBoard().find((e) => e.sessionId === state.sessionId);
  // Already on the board from an earlier season of this run: bring the entry up to date.
  const entered = mine
    ? saveEntry(entryFromSummary(s, { name: mine.name, town: mine.town, sessionId: state.sessionId })).rank
    : null;
  const board = readBoard();
  if (!entered && !canEnter) return '';
  if (entered) {
    return `
      <div class="card board-entry-done">
        <span class="eyebrow">Top ${LIMIT}</span>
        <p>You're number <strong>${entered}</strong> in the Top ${LIMIT}.</p>
        <button class="btn btn-sm" data-go="top100">View Top ${LIMIT}</button>
      </div>`;
  }
  const rank = prospectiveRank(board, entryFromSummary(s, { name: '', town: '', sessionId: state.sessionId }));
  if (!rank) return `<p class="muted board-miss">Not quite enough for the Top ${LIMIT} this time.</p>`;
  const player = readPlayer();
  return `
    <form class="card board-entry" novalidate>
      <span class="eyebrow">Top ${LIMIT}</span>
      <h2>You've made the Top ${LIMIT} at number ${rank}</h2>
      <p class="muted">Add your name to the leaderboard.</p>
      <div class="board-fields">
        <div class="field">
          <label for="lb-name">Your name</label>
          <input class="input" id="lb-name" name="name" maxlength="${NAME_MAX}" autocomplete="nickname" value="${esc(player.name)}" required>
        </div>
        <div class="field">
          <label for="lb-town">City or town</label>
          <input class="input" id="lb-town" name="town" maxlength="${TOWN_MAX}" autocomplete="address-level2" value="${esc(player.town)}" required>
        </div>
      </div>
      <p class="field-error" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit">Add To Top ${LIMIT}</button>
    </form>`;
}

function wireEntryForm(form, app, state, s) {
  const name = form.elements.name;
  const town = form.elements.town;
  const error = form.querySelector('.field-error');
  (name.value ? town.value ? form.querySelector('[type="submit"]') : town : name).focus({ preventScroll: true });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = cleanText(name.value, NAME_MAX);
    const t = cleanText(town.value, TOWN_MAX);
    name.classList.toggle('is-invalid', !n);
    town.classList.toggle('is-invalid', !t);
    if (!n || !t) {
      error.textContent = !n && !t ? 'Enter your name and your city or town.' : !n ? 'Enter your name.' : 'Enter your city or town.';
      error.hidden = false;
      (!n ? name : town).focus();
      return;
    }
    const { rank, saved } = saveEntry(entryFromSummary(s, { name: n, town: t, sessionId: state.sessionId }));
    if (!saved) {
      error.textContent = "Couldn't save to this browser. Storage may be full or blocked.";
      error.hidden = false;
      return;
    }
    app.lastBoardEntry = rank ? state.sessionId : null;
    // The form only appears once the run is over, so go and see the board.
    app.go('top100');
  });
}

function confetti() {
  // Plays even when the phone asks for reduced motion: it's a one-off celebration for winning the cup.
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  const colours = ['#E0C27A', '#C7A45A', '#1F8A62', '#146B4C', '#FFFFFF'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colours[i % colours.length];
    p.style.setProperty('--delay', (Math.random() * 0.9).toFixed(2) + 's');
    p.style.setProperty('--dur', (2.2 + Math.random() * 1.4).toFixed(2) + 's');
    p.style.setProperty('--drift', (Math.random() * 160 - 80).toFixed(0) + 'px');
    p.style.setProperty('--spin', (Math.random() * 720 + 180).toFixed(0) + 'deg');
    if (i % 3 === 0) { p.style.width = '6px'; p.style.height = '6px'; p.style.borderRadius = '50%'; }
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  const t = setTimeout(() => layer.remove(), 4200);
  return () => { clearTimeout(t); layer.remove(); };
}
