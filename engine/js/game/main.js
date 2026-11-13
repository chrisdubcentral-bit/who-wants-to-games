// Game bootstrap and hash router.

import { loadMeta } from '../core/config.js';
import { loadGameQuestions } from '../core/question-repo.js';
import { bus } from '../core/events.js';
import { mount, on, esc } from '../ui/dom.js';
import { openModal } from '../ui/components/modal.js';
import { createController, readSnapshot, ACTIVE } from './controller.js';
import { NotEnoughQuestionsError } from './question-picker.js';
import { applyBoardReset } from './leaderboard.js';
import { t } from '../core/edition.js';
import * as home from './screens/home.js';
import * as instructions from './screens/instructions.js';
import * as quiz from './screens/quiz.js';
import * as results from './screens/results.js';
import * as statistics from './screens/statistics.js';
import * as top100 from './screens/top100.js';

const SCREENS = { home, how: instructions, play: quiz, results, stats: statistics, top100 };
const root = document.getElementById('app');
let cleanup = null;
const app = {};

function go(route) {
  if (location.hash.slice(1) === route) renderRoute();
  else location.hash = route;
}

function renderRoute() {
  const route = location.hash.slice(1) || 'home';
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  if (route === 'play' && !app.ctrl.isActive && !tryStart()) return;
  const screen = SCREENS[route] ?? home;
  cleanup = screen.render(root, app) ?? null;
  window.scrollTo({ top: 0 });
}

function tryStart(begin = () => app.ctrl.start()) {
  try {
    begin();
    return true;
  } catch (err) {
    if (!(err instanceof NotEnoughQuestionsError)) throw err;
    mount(root, `
      <section class="card notice screen-enter">
        <span class="eyebrow">${esc(t('boot.notReadyEyebrow'))}</span>
        <h1>${esc(t('boot.notReady'))}</h1>
        <p>${esc(t('boot.notReadyBody'))}</p>
        <p class="muted">Missing: ${esc(err.missingStages.join(', '))}</p>
        <div class="page-actions" style="justify-content:center;margin-top:0">
          <a class="btn btn-primary" href="admin-review.html">Review Questions</a>
          <button class="btn btn-ghost" data-go="home">Home</button>
        </div>
      </section>`);
    return false;
  }
}

function showBootError(err) {
  const isFile = location.protocol === 'file:';
  mount(root, `
    <section class="card notice">
      <span class="eyebrow">${esc(t('boot.delayed'))}</span>
      <h1>Couldn't load the questions</h1>
      ${isFile
        ? `<p>This page was opened straight from a file, so the browser blocks it from reading the question files.</p>
           <p>Open the project folder in VS Code, right-click <code>index.html</code> and choose <strong>Open with Live Server</strong>.</p>`
        : `<p class="muted">${esc(err.message)}</p>`}
    </section>`);
}

async function boot() {
  applyBoardReset();
  let meta, loaded;
  try {
    meta = await loadMeta();
    loaded = await loadGameQuestions();
  } catch (err) {
    console.error(err);
    showBootError(err);
    return;
  }

  const activeCategories = new Set(meta.categories.filter((c) => c.active).map((c) => c.key));
  Object.assign(app, {
    meta,
    preview: loaded.preview,
    ctrl: createController({ stages: meta.stages, questions: loaded.questions, activeCategories }),
    go,
    startGame() { if (tryStart()) go('play'); },
    /** Champions only: carry on into the next season. */
    nextSeason() {
      if (app.ctrl.state.status !== 'won') return;
      if (tryStart(() => app.ctrl.nextSeason())) go('play');
    },
  });

  if (loaded.preview) {
    // Small corner badge (the game has no top bar) so it's clear these aren't the published questions.
    document.body.insertAdjacentHTML('beforeend',
      '<a class="preview-chip is-floating" href="admin-review.html" title="This browser has unpublished question changes">Preview · unpublished questions</a>');
  }

  bus.on('game:finished', () => go('results'));
  on(document.body, 'click', '[data-go]', (e, el) => { e.preventDefault(); go(el.dataset.go); });
  window.addEventListener('hashchange', renderRoute);

  // Offer to resume a campaign interrupted by a page refresh.
  const snap = readSnapshot();
  if (snap && ACTIVE.includes(snap.status) && snap.questions?.length === meta.stages.length) {
    const stage = meta.stages[snap.stageIndex];
    home.render(root, app); // not renderRoute(): on #play that would start a new game and overwrite the snapshot
    const choice = await openModal({
      title: t('boot.resumeTitle'),
      message: t('boot.resumeBody', { stage: stage.label }),
      actions: [
        { label: t('boot.end'), value: 'abandon', className: 'btn-ghost' },
        { label: 'Resume', value: 'resume', className: 'btn-primary' },
      ],
    });
    if (choice === 'resume') { app.ctrl.resume(snap); go('play'); }
    else { app.ctrl.abandon(snap); }
    return;
  }
  if (snap && ['won', 'eliminated'].includes(snap.status) && location.hash === '#results') {
    app.ctrl.resume(snap);
  }
  renderRoute();
}

boot();
