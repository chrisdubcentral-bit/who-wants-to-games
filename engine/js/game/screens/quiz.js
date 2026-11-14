import { mount, html, esc, on, announce } from '../../ui/dom.js';
import { ladderHtml, stripHtml } from '../../ui/components/ladder.js';
import { STATUS } from '../game-engine.js';
import { bus } from '../../core/events.js';
import { LETTERS } from '../../core/utils.js';
import { playCheer } from '../../core/sound.js';
import { t, ed, prizeCount } from '../../core/edition.js';
import { breakAfter, preloadAdvert, showAdvert } from '../advert.js';

/** Identifies one game for advert turns: each new game, and each new season, gets the next advert. */
const advertRun = (state) => `${state.sessionId}:${state.season ?? 1}`;

export function render(root, app) {
  const { ctrl, meta } = app;

  mount(root, `
    <section class="screen quiz">
      <div class="quiz-main">
        <div class="card strip" data-ref="strip"></div>
        <div class="stage-head">
          <div class="stage-title">
            <span class="eyebrow" data-ref="round"></span>
            <h1 data-ref="stage"></h1>
          </div>
          <div class="stage-meta" data-ref="meta"></div>
        </div>
        <div class="card question-panel" aria-live="polite">
          <span class="eyebrow" data-ref="cat"></span>
          <h2 class="question-text" data-ref="question"></h2>
        </div>
        <div class="answers" data-ref="answers" role="group" aria-label="Answers"></div>
        <div class="quiz-actions">
          <button type="button" class="btn lifeline" data-action="fifty">50:50</button>
          <span class="kbd-hint"><kbd>A</kbd>–<kbd>D</kbd> answer · <kbd>F</kbd> 50:50</span>
        </div>
      </div>
      <aside class="card ladder" data-ref="ladder" aria-label="${esc(t('quiz.ladderLabel'))}"></aside>
    </section>`);

  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  let shownStage = -1;
  let shownStatus = null;
  let splashTimers = [];
  let splashNext = null;   // what to do once the newspaper has been dismissed (an advert break, if one is set)
  let advert = null;       // the advert overlay while one is playing
  let preloaded = null;    // an advert video loading in the background

  /** Removes the newspaper splash, if one is showing. Instant removal (leaving the screen) skips what was to follow. */
  function closeSplash(instant = false) {
    splashTimers.forEach(clearTimeout); splashTimers = [];
    const el = document.querySelector('.splash');
    if (!el) return;
    if (instant) { splashNext = null; el.remove(); return; }
    el.classList.add('is-leaving');
    splashTimers.push(setTimeout(() => el.remove(), 320));
    const next = splashNext; splashNext = null;
    if (next) next();
  }

  /** An advert showing today after the stage just won (data/adverts.json) plays once the newspaper has gone.
      The time it holds the game is given back, so it doesn't count against the player's Top 100 time. */
  function advertAfter(state) {
    const brk = breakAfter(state.stages[state.stageIndex - 1].key, advertRun(state));
    if (!brk) return null;
    return () => {
      advert = showAdvert(brk, preloaded);
      preloaded = null;
      advert.done.then((heldMs) => { advert = null; if (heldMs > 0) ctrl.creditPause(heldMs); });
    };
  }

  /** A newspaper spins in between stages to mark a correct answer. Tap or press a key to skip. */
  function showSplash(state, afterwards = null) {
    closeSplash(true);
    const won = state.stages[state.stageIndex - 1];
    const next = state.stages[state.stageIndex];
    // Needed the 50:50 on the question just answered? Then they only just scraped through.
    const helped = state.lifeline.usedAtStage === won.key && (state.lifeline.usedAtSeason ?? 1) === (state.season ?? 1);
    // Some stages always get their own headline (set per edition), 50:50 or not.
    const standard = t('newspaper.headline');
    const headline = ed('text.newspaper.stages.' + won.key)
      || (helped ? t('newspaper.helped') : standard);
    const isLong = headline.length > standard.length;
    const el = html(`
      <div class="splash" aria-hidden="true">
        <div class="paper">
          <div class="paper-masthead">${esc(t('newspaper.masthead'))}</div>
          <div class="paper-dateline"><span>${esc(t('newspaper.special'))}</span><span>${esc(won.label)}</span><span>Extra!</span></div>
          <div class="paper-headline${isLong ? ' is-long' : ''}">${esc(headline)}</div>
          <div class="paper-sub">${esc(t('newspaper.sub', { won: won.label, next: next.label }))}</div>
          <div class="paper-body">
            <div class="paper-photo"><img src="${esc(ed('images.prize'))}" alt=""></div>
            <div class="paper-cols"><i></i><i></i></div>
          </div>
        </div>
      </div>`);
    el.addEventListener('click', () => closeSplash());
    document.body.appendChild(el);
    splashNext = afterwards;
    splashTimers.push(setTimeout(() => closeSplash(), 2800));
  }

  function renderQuestion(state) {
    const q = state.questions[state.stageIndex];
    const stage = state.stages[state.stageIndex];
    const season = state.season ?? 1;
    const cups = state.cups ?? 0;
    ref('round').textContent = `${season > 1 ? `Season ${season} · ` : ''}Stage ${stage.order} of ${state.stages.length}`;
    ref('stage').textContent = stage.label;
    ref('meta').innerHTML = [
      cups ? `<span class="badge badge-gold">${esc(t('quiz.won', { count: prizeCount(cups) }))}</span>` : '',
      stage.key === 'final' ? '<span class="badge badge-gold">The Final</span>' : '',
    ].join('');
    ref('cat').textContent = meta.categoryLabel(q.category);
    ref('question').textContent = q.question;
    // An advert after this stage? Start loading it now so it plays without a pause.
    const brk = breakAfter(stage.key, advertRun(state));
    if (brk && preloaded?.dataset.after !== stage.key) { preloaded?.remove(); preloaded = preloadAdvert(brk); }
    ref('answers').innerHTML = q.options.map((opt, i) => `
      <button type="button" class="answer" data-index="${i}" aria-label="${LETTERS[i]}: ${esc(opt)}">
        <span class="letter" aria-hidden="true">${LETTERS[i]}</span>
        <span class="text">${esc(opt)}</span>
        <span class="mark" aria-hidden="true"></span>
      </button>`).join('');
    const panel = root.querySelector('.question-panel');
    [panel, ref('answers'), ref('stage')].forEach((el) => {
      el.classList.remove('screen-enter'); void el.offsetWidth; el.classList.add('screen-enter');
    });
    announce(`${stage.label}. ${q.question}`);
  }

  function update(state) {
    if (!state.questions.length) return;
    if (state.stageIndex !== shownStage) {
      const advanced = shownStage >= 0 && state.stageIndex === shownStage + 1 && state.status === STATUS.PLAYING;
      renderQuestion(state);
      if (advanced) showSplash(state, advertAfter(state));
      shownStage = state.stageIndex;
    }

    const q = state.questions[state.stageIndex];
    const playing = state.status === STATUS.PLAYING;
    const revealed = [STATUS.REVEALED, STATUS.WON, STATUS.ELIMINATED].includes(state.status);

    root.querySelectorAll('.answer').forEach((btn) => {
      const i = Number(btn.dataset.index);
      const removed = state.lifeline.removed.includes(i);
      const isSel = state.selected === i;
      const isRight = revealed && i === q.correctAnswer;
      const isWrong = revealed && isSel && i !== q.correctAnswer;
      btn.classList.toggle('is-removed', removed);
      btn.classList.toggle('is-selected', isSel && !revealed);
      btn.classList.toggle('is-correct', isRight);
      btn.classList.toggle('is-wrong', isWrong);
      btn.classList.toggle('is-dimmed', revealed && !isRight && !isWrong && !removed);
      btn.querySelector('.mark').textContent = isRight ? '✓' : isWrong ? '✗' : '';
      btn.disabled = !playing || removed;
      btn.setAttribute('aria-disabled', String(!playing || removed));
    });

    const fifty = root.querySelector('[data-action="fifty"]');
    const used = state.lifeline.fiftyFiftyUsed;
    fifty.classList.toggle('is-used', used);
    fifty.disabled = used || !playing;
    fifty.innerHTML = used ? '50:50 <span class="used-tag">Used</span>' : '50:50';
    fifty.setAttribute('aria-label', used ? '50:50 lifeline, used' : 'Use 50:50 lifeline');

    ref('ladder').innerHTML = ladderHtml(state);
    ref('strip').innerHTML = stripHtml(state);
    const sheetLadder = document.querySelector('.sheet .ladder');
    if (sheetLadder) sheetLadder.innerHTML = ladderHtml(state);

    if (state.status !== shownStatus) {
      if (state.status === STATUS.LOCKED) announce(`Final answer: ${LETTERS[state.selected]}`);
      if (state.status === STATUS.REVEALED) {
        if (state.lastCorrect) playCheer();
        announce(state.lastCorrect ? t('quiz.correct') : `Wrong. The correct answer was ${LETTERS[q.correctAnswer]}: ${q.options[q.correctAnswer]}`);
      }
      shownStatus = state.status;
    }
  }

  function openLadderSheet() {
    const sheet = html(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="${esc(t('quiz.ladderLabel'))}">
        <div class="sheet card">
          <div class="ladder">${ladderHtml(ctrl.state)}</div>
          <button type="button" class="btn btn-block" style="margin-top:16px" data-close>Close</button>
        </div>
      </div>`);
    const close = () => { sheet.remove(); document.removeEventListener('keydown', onEsc, true); };
    const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onEsc, true);
    document.body.appendChild(sheet);
    sheet.querySelector('[data-close]').focus();
  }

  const offs = [
    on(root, 'click', '.answer', (e, btn) => ctrl.select(Number(btn.dataset.index))),
    on(root, 'click', '[data-action="fifty"]', () => ctrl.useFiftyFifty()),
    on(root, 'click', '[data-action="open-ladder"]', openLadderSheet),
    bus.on('game:state', update),
  ];

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-backdrop, .sheet-backdrop')) return;
    // While an advert is playing, keys can't answer the hidden question; Escape, Enter or Space skip it once allowed.
    if (advert) { e.preventDefault(); if (['Escape', 'Enter', ' '].includes(e.key)) advert.skip(); return; }
    // While the newspaper is up, any key just dismisses it (so it can't answer the hidden question).
    if (document.querySelector('.splash:not(.is-leaving)')) { e.preventDefault(); closeSplash(); return; }
    const k = e.key.toLowerCase();
    const idx = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 }[k];
    if (idx !== undefined) { e.preventDefault(); ctrl.select(idx); }
    else if (k === 'f') { e.preventDefault(); ctrl.useFiftyFifty(); }
  };
  document.addEventListener('keydown', onKey);

  update(ctrl.state);

  return () => {
    offs.forEach((off) => off());
    document.removeEventListener('keydown', onKey);
    document.querySelectorAll('.sheet-backdrop').forEach((n) => n.remove());
    closeSplash(true);
    advert?.close(); advert = null;
    preloaded?.remove(); preloaded = null;
  };
}
