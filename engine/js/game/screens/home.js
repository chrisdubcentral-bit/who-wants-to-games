import { mount, esc } from '../../ui/dom.js';
import { t, ed } from '../../core/edition.js';
import { LIMIT } from '../ranking.js';

export function render(root, app) {
  mount(root, `
    <section class="screen home">
      <div class="home-inner stagger">
        <img class="home-trophy" src="${esc(ed('images.home', ed('images.prize')))}" alt="" width="128" height="154">
        <div class="title-lockup">
          <h1 class="title-main">${esc(t('home.titleTop'))}<br><span class="accent">${esc(t('home.titleAccent'))}</span></h1>
          <div class="title-edition gold-rule">${esc(t('home.edition'))}</div>
        </div>
        <p class="home-tagline">${esc(t('home.tagline'))}</p>
        <div class="home-actions">
          <button class="btn btn-primary btn-lg btn-block" data-go="play">${esc(ed('vars.start'))}</button>
          <div class="row">
            <button class="btn btn-block" data-go="how">How To Play</button>
            <button class="btn btn-block" data-go="stats">Stats</button>
            <button class="btn btn-block" data-go="top100">Top ${LIMIT}</button>
          </div>
        </div>
        <p class="home-links"><a href="../../about.html">About</a> · <a href="../../contact.html">Contact us</a></p>
      </div>
    </section>`);

  root.querySelector('[data-go="play"]').focus({ preventScroll: true });
}
