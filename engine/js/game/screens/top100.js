import { mount, esc } from '../../ui/dom.js';
import { readBoard, formatDuration, cupsOf, roundsPlayedOf, LIMIT } from '../leaderboard.js';
import { STATUS } from '../game-engine.js';
import { formatDate } from '../../core/utils.js';
import { t, ed, prizeCount } from '../../core/edition.js';

/** Small prize icon × how many the run won. */
function cupsCell(e) {
  const n = cupsOf(e);
  if (!n) return `<span class="no-cups" aria-label="${esc(t('top100.none'))}">—</span>`;
  return `<span class="cups" aria-label="${esc(prizeCount(n))}">
      <img src="${esc(ed('images.prize'))}" alt="" width="15" height="18"><span aria-hidden="true">× ${n}</span>
    </span>`;
}

/** The round the run ended in. A run that ended with a win ended in the Final. */
function roundCell(e, meta) {
  if (e.result === STATUS.WON) return '<span class="reached is-champ">Final</span>';
  const stage = meta.stageByKey[e.stageKey] ?? meta.stages[e.stageReachedIndex];
  return `<span class="reached">${esc(stage?.label ?? e.stageReachedLabel ?? '—')}</span>`;
}

export function render(root, app) {
  const board = readBoard();
  const youSession = app.lastBoardEntry ?? null;
  const state = app.ctrl.state;
  const canCarryOn = state.status === STATUS.WON;

  const rows = board.map((e, i) => {
    const pos = i + 1;
    return `
      <tr class="${e.sessionId && e.sessionId === youSession ? 'is-you' : ''}">
        <td class="pos"><span class="pos-badge ${pos <= 3 ? `pos-${pos}` : ''}">${pos}</span></td>
        <td class="who"><strong>${esc(e.name)}</strong><span class="town">${esc(e.town)}</span></td>
        <td class="num">${cupsCell(e)}</td>
        <td class="num col-round">${roundCell(e, app.meta)}</td>
        <td class="num">${roundsPlayedOf(e)}</td>
        <td class="num">${e.lifelineUsed ? 'Used' : '<span class="clean">Not used</span>'}</td>
        <td class="num">${esc(formatDuration(e.durationMs))}</td>
        <td class="when">${esc(formatDate(e.date))}</td>
      </tr>`;
  }).join('');

  const table = board.length ? `
    <div class="card board-wrap">
      <table class="board">
        <caption class="sr-only">Top ${LIMIT} leaderboard</caption>
        <thead>
          <tr>
            <th scope="col" class="pos">#</th>
            <th scope="col">Player</th>
            <th scope="col" class="num">${esc(t('top100.prizeColumn'))}</th>
            <th scope="col" class="num col-round">Round</th>
            <th scope="col" class="num" title="Total rounds played">Rounds</th>
            <th scope="col" class="num">50:50</th>
            <th scope="col" class="num">Time</th>
            <th scope="col" class="when">Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    : `<div class="card card-pad board-empty">
        <p>No one is on the board yet.</p>
        <p class="muted">Finish a ${esc(ed('vars.game'))} and you can add your name to the Top ${LIMIT}.</p>
      </div>`;

  mount(root, `
    <section class="screen screen-enter">
      <header class="page-head">
        <span class="eyebrow">${esc(t('top100.eyebrow'))}</span>
        <h1>Top ${LIMIT}</h1>
        <p class="muted board-rules">${esc(t('top100.rules'))}</p>
      </header>
      ${table}
      <div class="page-actions">
        ${canCarryOn
          ? `<button class="btn btn-primary" data-action="season">Start Season ${(state.season ?? 1) + 1}</button>`
          : `<button class="btn btn-primary" data-go="play">${esc(ed('vars.start'))}</button>`}
        <button class="btn btn-ghost btn-plate-phone" data-go="home">Home</button>
      </div>
    </section>`);

  root.querySelector('[data-action="season"]')?.addEventListener('click', () => app.nextSeason());
  root.querySelector('.is-you')?.scrollIntoView({ block: 'center' });
}
