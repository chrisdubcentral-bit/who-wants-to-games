import { mount } from '../../ui/dom.js';
import { isSoundOn, setSoundOn, playCheer } from '../../core/sound.js';

const soundLabel = (on) => (on ? 'Sound On' : 'Sound Off');

export function render(root) {
  const on = isSoundOn();
  mount(root, `
    <section class="screen screen-enter">
      <header class="page-head">
        <span class="eyebrow">Matchday Briefing</span>
        <h1>How To Play</h1>
      </header>
      <div class="how-grid stagger">
        <article class="card how-card">
          <div class="icon">8</div>
          <h3>The Road to the Final</h3>
          <p>Each round of the campaign is one question: 1st Qualifier, 2nd Qualifier, Playoff, First Round, Second Round, Quarter Finals, Semi Final and the Final. Get it right and Celtic go through.</p>
        </article>
        <article class="card how-card">
          <div class="icon">✕</div>
          <h3>Knockout Football</h3>
          <p>One wrong answer and you're eliminated from the tournament. Win the Final and you're crowned European Champion.</p>
        </article>
        <article class="card how-card">
          <div class="icon">½</div>
          <h3>50:50 Lifeline</h3>
          <p>Use it once to remove two wrong answers. Choose the moment carefully: you don't get another one if you play on into a new season.</p>
        </article>
        <article class="card how-card">
          <div class="icon">+1</div>
          <h3>Defend the Cup</h3>
          <p>Win the Final and you can start a new season as holders, going straight into the First Round. Keep winning to add more European Cups. A wrong answer ends your run, but you keep the cups you've won.</p>
        </article>
        <article class="card how-card">
          <div class="icon icon-sm">100</div>
          <h3>The Top 100</h3>
          <p>Anyone can add their name and town to the Top 100. The most European Cups ranks highest, then the furthest round reached. After that, players who didn't use the 50:50 rank above those who did, then the fastest time wins.</p>
        </article>
        <article class="card how-card">
          <div class="icon">♪</div>
          <h3>Sound</h3>
          <p>Hear the crowd roar when you get an answer right. On a phone, the silent switch or volume may also need turning up.</p>
          <button type="button" class="btn sound-toggle${on ? ' is-on' : ''}" data-action="sound" aria-pressed="${on}">${soundLabel(on)}</button>
        </article>
        <article class="card how-card">
          <div class="icon">⌨</div>
          <h3>Controls</h3>
          <p>Tap an answer, or use <strong>A–D</strong> / <strong>1–4</strong> on a keyboard. Press <strong>F</strong> for 50:50. Your choice is locked in, so think before you answer.</p>
        </article>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary btn-lg" data-go="play">Kick Off</button>
        <button class="btn" data-go="home">Back</button>
      </div>
    </section>`);

  const btn = root.querySelector('[data-action="sound"]');
  btn.addEventListener('click', () => {
    const next = !isSoundOn();
    setSoundOn(next);
    btn.classList.toggle('is-on', next);
    btn.setAttribute('aria-pressed', String(next));
    btn.textContent = soundLabel(next);
    if (next) setTimeout(playCheer, 60); // a quick sample so they know it works
  });
}
