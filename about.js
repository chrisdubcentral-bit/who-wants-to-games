// The About page's "Our quizzes" carousel: each game's front page on a 3D stage, moving both ways with the arrows,
// a swipe or drag, the ← → keys and the dots. The cards are written by tools/build.js (one per hosted edition).
(function () {
  const root = document.querySelector('.stage');
  if (!root) return;
  const vp = root.querySelector('.viewport');
  const games = [...vp.querySelectorAll('.card')];
  const N = games.length;
  const dotsEl = document.querySelector('.stage + .dots');
  const caption = document.querySelector('.caption');
  if (!N) return;
  if (N === 1) { root.classList.add('single'); games[0].classList.add('is-current'); caption.textContent = games[0].dataset.desc || ''; return; }

  // Repeat the games so two cards show on each side and the wrap-around happens out of sight
  const laps = Math.max(2, Math.ceil(5 / N));
  for (let l = 1; l < laps; l++) {
    games.forEach((g) => {
      const copy = g.cloneNode(true);
      copy.dataset.copy = '';
      vp.appendChild(copy);
    });
  }
  const cards = [...vp.querySelectorAll('.card')];
  const M = cards.length;
  const wrap = (i, n) => ((i % n) + n) % n;
  const dist = (i, cur, n) => { let d = wrap(i - cur, n); if (d > n / 2) d -= n; return d; };
  let cur = 0;

  dotsEl.innerHTML = games.map((g) => `<button type="button" aria-label="Show ${g.dataset.title}"></button>`).join('');
  const dots = [...dotsEl.children];
  dots.forEach((b, i) => b.addEventListener('click', () => {
    // Go to the nearest copy of game i
    let best = null;
    for (let k = i; k < M; k += N) { const d = dist(k, cur, M); if (best === null || Math.abs(d) < Math.abs(best)) best = d; }
    go(cur + best);
  }));

  function go(i) {
    cur = wrap(i, M);
    cards.forEach((c, k) => {
      const d = dist(k, cur, M), ad = Math.abs(d);
      const x = d * 58 - Math.sign(d) * (ad > 1 ? 8 : 0);
      c.style.transform = `translateX(-50%) translateX(${x}%) translateZ(${-ad * 220}px) rotateY(${-Math.sign(d) * Math.min(ad, 1) * 42}deg)`;
      c.style.filter = ad ? `brightness(${ad > 1 ? 0.3 : 0.5}) saturate(.7)` : 'none';
      c.style.opacity = ad > 2 ? 0 : 1;
      c.style.zIndex = 10 - ad;
      c.dataset.d = d;
      c.classList.remove('is-current');
      c.setAttribute('aria-hidden', ad ? 'true' : 'false');
      c.querySelector('a')?.setAttribute('tabindex', ad ? '-1' : '0');
    });
    void cards[cur].offsetWidth; // restart the spotlight sweep
    cards[cur].classList.add('is-current');
    caption.textContent = cards[cur].dataset.desc || '';
    dots.forEach((b, k) => b.setAttribute('aria-current', k === cur % N ? 'true' : 'false'));
  }
  const prev = () => go(cur - 1), next = () => go(cur + 1);
  root.querySelector('.prev').addEventListener('click', prev);
  root.querySelector('.next').addEventListener('click', next);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  });

  // Swipe or drag. The click after a drag is swallowed so it doesn't open a game.
  let x0 = null, dragged = false;
  vp.addEventListener('pointerdown', (e) => { x0 = e.clientX; dragged = false; });
  vp.addEventListener('pointermove', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 8) dragged = true; });
  vp.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (dx > 40) prev(); else if (dx < -40) next();
  });
  vp.addEventListener('pointercancel', () => { x0 = null; });
  vp.addEventListener('click', (e) => {
    if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; return; }
    // Clicking a side card brings it to the middle instead of opening it
    const card = e.target.closest('.card');
    const d = card ? Number(card.dataset.d) : 0;
    if (d) { e.preventDefault(); go(cur + d); }
  }, true);

  go(0);
})();
