import { mount } from '../../ui/dom.js';

export function render(root, app) {
  mount(root, `
    <section class="screen home">
      <div class="home-inner stagger">
        <img class="home-trophy" src="assets/img/trophy-placeholder.svg" alt="" width="128" height="154">
        <div class="title-lockup">
          <h1 class="title-main">Who Wants To Win<br><span class="accent">The European Cup</span></h1>
          <div class="title-edition gold-rule">Celtic Edition</div>
        </div>
        <p class="home-tagline">Guide Celtic through a European campaign. Eight ties. One wrong answer and you're out.</p>
        <div class="home-actions">
          <button class="btn btn-primary btn-lg btn-block" data-go="play">Kick Off</button>
          <div class="row">
            <button class="btn btn-block" data-go="how">How To Play</button>
            <button class="btn btn-block" data-go="stats">Stats</button>
            <button class="btn btn-block" data-go="top100">Top 100</button>
          </div>
        </div>
      </div>
    </section>`);

  root.querySelector('[data-go="play"]').focus({ preventScroll: true });
}
