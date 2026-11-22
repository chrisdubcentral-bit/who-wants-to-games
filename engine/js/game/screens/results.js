import { mount, esc } from '../../ui/dom.js';
import { summarise, STATUS } from '../game-engine.js';
import { LETTERS } from '../../core/utils.js';
import { t, ed, summaryLabels, prizeCount, seasonName } from '../../core/edition.js';
import { openModal } from '../../ui/components/modal.js';
import {
  fetchBoard, cachedBoard, submitEntry, hasRunToken, myEntry, readPlayer, entryFromSummary, isEligible,
  prospectiveRank, cleanText, NAME_MAX, TOWN_MAX, LIMIT,
} from '../leaderboard.js';
import { track } from '../../core/analytics.js';
import { shareCardHtml, wireShareCard } from '../share.js';

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
      <span class="eyebrow">${esc(t('results.outEyebrow'))}${later ? ` · ${seasonName()} ${s.season}` : ''}</span>
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
      <span class="eyebrow ${later ? '' : 'is-edition'}">${esc(later ? `${seasonName()} ${s.season}` : t('results.edition'))}</span>
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
    actions = `<button class="btn btn-primary btn-lg" data-action="season">Start ${seasonName()} ${s.season + 1}</button>`;
  } else {
    cls = 'is-eliminated';
    const last = state.answers[state.answers.length - 1];
    const q = state.questions[state.stageIndex];
    hero = `
      <img class="result-icon" src="${esc(ed('images.eliminated'))}" alt="${esc(t('results.outAlt') || 'Eliminated')}" width="84" height="84">
      <span class="eyebrow">${esc(t('results.outEyebrow'))}${later ? ` · ${seasonName()} ${s.season}` : ''}</span>
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
      <div class="board-slot" aria-live="polite"></div>
      <div class="page-actions">
        ${actions}
        ${won ? extra : ''}
        <div class="results-row">
          <button class="btn" data-go="top100">Top ${LIMIT}</button>
          <button class="btn" data-go="stats">Stats</button>
          <button class="btn btn-ghost" data-go="home">Home</button>
        </div>
      </div>
    </section>`);

  root.querySelector('[data-action="again"]')?.addEventListener('click', () => app.startGame());
  root.querySelector('[data-action="season"]')?.addEventListener('click', () => app.nextSeason());
  const primary = root.querySelector('.page-actions .btn-lg');
  primary.focus({ preventScroll: true });
  fillBoardPanel(root.querySelector('.board-slot'), app, state, s, !won, primary);

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
        message: `You can carry on into ${seasonName()} ${next}, or end your run now and add your name to the Top ${LIMIT}.`,
        actions: [
          { label: 'End Run', value: 'end', className: 'btn-ghost' },
          { label: `Start ${seasonName()} ${next}`, value: 'season', className: 'btn-primary' },
        ],
      });
      if (choice === 'season') app.nextSeason();
      else if (choice === 'end') { app.ctrl.retire(); app.go('results'); }
    });
    return confetti();
  }
}

/** True if this run isn't on the Top 100 yet but would make it, going by the board this screen fetched. */
function wouldMakeBoard(state, s) {
  const board = cachedBoard();
  if (!board || !isEligible(s) || myEntry(state.sessionId)) return false;
  return !!prospectiveRank(board, entryFromSummary(s, { name: '', town: '', sessionId: state.sessionId }));
}

const OFFLINE = `Couldn't reach the Top ${LIMIT}. Check your connection and try again.`;

const noteCard = (text, retry = false) => `
  <div class="card card-pad board-note">
    <p class="muted">${esc(text)}</p>
    ${retry ? '<button class="btn btn-sm" type="button" data-action="board-retry">Try Again</button>' : ''}
  </div>`;

const formCard = (rank, player) => `
  <form class="card board-entry" novalidate>
    <span class="eyebrow">Top ${LIMIT}</span>
    <h2>You've made the Top ${LIMIT} at number ${rank}</h2>
    <p class="muted">Add your name to the leaderboard. Your name and town will be shown to everyone who plays.</p>
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

/**
 * Fills the Top 100 card once the board has loaded: the entry form if the game qualifies,
 * or the position already taken. The form is only offered once the run is over (canEnter);
 * a champion still playing on isn't asked, but an entry from an earlier season is brought up to date.
 */
async function fillBoardPanel(slot, app, state, s, canEnter, primary) {
  if (!slot || !isEligible(s)) return;
  const show = (html) => { if (slot.isConnected) slot.innerHTML = html; return slot.isConnected; };
  const retry = () => slot.querySelector('[data-action="board-retry"]')?.addEventListener('click', () => {
    fillBoardPanel(slot, app, state, s, canEnter, null);
  });

  const mine = myEntry(state.sessionId);
  if (!mine && !canEnter) { fetchBoard(); return; } // loads the board for the "End your run?" check

  show(`<p class="muted board-miss">Checking the Top ${LIMIT}…</p>`);

  if (mine) {
    const entry = entryFromSummary(s, { name: mine.name, town: mine.town, sessionId: state.sessionId });
    const r = await submitEntry(entry, state.sessionId);
    if (r.ok && r.rank) {
      app.lastBoardEntry = r.id;
      if (show(shareCardHtml(r.rank, { link: true }))) wireShareCard(slot, entry, r.rank, app.meta);
      return;
    }
    if (r.ok) { show(`<p class="muted board-miss">Your entry has dropped out of the Top ${LIMIT}.</p>`); return; }
    if (show(noteCard(r.error === 'offline' ? OFFLINE : (r.message || OFFLINE), r.error === 'offline'))) retry();
    return;
  }

  if (!(await hasRunToken(state.sessionId))) {
    show(noteCard(`This game couldn't connect to the online Top ${LIMIT} when it started, so it can't be added. Check your connection before your next game.`));
    return;
  }

  const b = await fetchBoard();
  if (!b.ok) { if (show(noteCard(OFFLINE, true))) retry(); return; }
  const rank = prospectiveRank(b.board, entryFromSummary(s, { name: '', town: '', sessionId: state.sessionId }));
  if (!rank) { show(`<p class="muted board-miss">Not quite enough for the Top ${LIMIT} this time.</p>`); return; }

  // Only take the focus if the player hasn't moved it since the screen opened.
  const takeFocus = !primary || document.activeElement === primary || document.activeElement === document.body;
  if (show(formCard(rank, readPlayer()))) wireEntryForm(slot.querySelector('.board-entry'), app, state, s, takeFocus);
}

function wireEntryForm(form, app, state, s, takeFocus) {
  const name = form.elements.name;
  const town = form.elements.town;
  const error = form.querySelector('.field-error');
  const button = form.querySelector('[type="submit"]');
  if (takeFocus) (name.value ? town.value ? button : town : name).focus({ preventScroll: true });

  const showError = (text, field = null) => {
    error.textContent = text;
    error.hidden = false;
    name.classList.toggle('is-invalid', field === name);
    town.classList.toggle('is-invalid', field === town);
    field?.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    const n = cleanText(name.value, NAME_MAX);
    const t = cleanText(town.value, TOWN_MAX);
    if (!n || !t) {
      showError(!n && !t ? 'Enter your name and your city or town.' : !n ? 'Enter your name.' : 'Enter your city or town.', !n ? name : town);
      name.classList.toggle('is-invalid', !n);
      town.classList.toggle('is-invalid', !t);
      return;
    }

    button.disabled = true;
    button.textContent = 'Adding…';
    const r = await submitEntry(entryFromSummary(s, { name: n, town: t, sessionId: state.sessionId }), state.sessionId);
    if (!form.isConnected) return;
    button.disabled = false;
    button.textContent = `Add To Top ${LIMIT}`;

    if (!r.ok) {
      const field = r.field === 'town' ? town : r.field === 'name' ? name : null;
      showError(r.error === 'offline' ? OFFLINE : (r.message || OFFLINE), field);
      return;
    }
    app.lastBoardEntry = r.rank ? r.id : null;
    track('top100_entry');
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
