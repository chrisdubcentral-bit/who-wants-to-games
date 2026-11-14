import { mount, esc } from '../../ui/dom.js';
import { t, ed } from '../../core/edition.js';
import { isSoundOn, setSoundOn, playCheer, soundAvailable } from '../../core/sound.js';

const soundLabel = (on) => (on ? 'Sound On' : 'Sound Off');

export function render(root, app) {
  const on = isSoundOn();
  const stages = app.meta.stages.map((s) => s.label);
  const stageList = stages.length > 1 ? `${stages.slice(0, -1).join(', ')} and the ${stages.at(-1)}` : stages.join('');
  const restart = app.meta.stageLabel(ed('seasons.restartStage'));
  mount(root, `
    <section class="screen screen-enter">
      <header class="page-head">
        <span class="eyebrow">${esc(t('how.eyebrow'))}</span>
        <h1>How To Play</h1>
      </header>
      <div class="how-grid stagger">
        <article class="card how-card">
          <div class="icon">${stages.length}</div>
          <h3>${esc(t('how.roadTitle'))}</h3>
          <p>${esc(t('how.road', { stages: stageList }))}</p>
        </article>
        <article class="card how-card">
          <div class="icon">✕</div>
          <h3>${esc(t('how.knockoutTitle'))}</h3>
          <p>${esc(t('how.knockout'))}</p>
        </article>
        <article class="card how-card">
          <div class="icon">½</div>
          <h3>50:50 Lifeline</h3>
          <p>${esc(t('how.lifeline'))}</p>
        </article>
        <article class="card how-card">
          <div class="icon">+1</div>
          <h3>${esc(t('how.seasonsTitle'))}</h3>
          <p>${esc(t('how.seasons', { restart }))}</p>
        </article>
        <article class="card how-card">
          <div class="icon icon-sm">100</div>
          <h3>The Top 100</h3>
          <p>${esc(t('how.top100'))}</p>
        </article>
        ${soundAvailable() ? `<article class="card how-card">
          <div class="icon">♪</div>
          <h3>Sound</h3>
          <p>${esc(t('how.sound'))}</p>
          <button type="button" class="btn sound-toggle${on ? ' is-on' : ''}" data-action="sound" aria-pressed="${on}">${soundLabel(on)}</button>
        </article>` : ''}
        <article class="card how-card">
          <div class="icon">⌨</div>
          <h3>Controls</h3>
          <p>Tap an answer, or use <strong>A–D</strong> / <strong>1–4</strong> on a keyboard. Press <strong>F</strong> for 50:50. Your choice is locked in, so think before you answer.</p>
        </article>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary btn-lg" data-go="play">${esc(ed('vars.start'))}</button>
        <button class="btn" data-go="home">Back</button>
      </div>
    </section>`);

  const btn = root.querySelector('[data-action="sound"]');
  btn?.addEventListener('click', () => {
    const next = !isSoundOn();
    setSoundOn(next);
    btn.classList.toggle('is-on', next);
    btn.setAttribute('aria-pressed', String(next));
    btn.textContent = soundLabel(next);
    if (next) setTimeout(playCheer, 60); // a quick sample so they know it works
  });
}
