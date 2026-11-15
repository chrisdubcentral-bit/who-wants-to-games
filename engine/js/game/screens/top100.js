import { mount, esc } from '../../ui/dom.js';
import { fetchBoard, cachedBoard, myEntry, myEntryIds, formatDuration, cupsOf, roundsPlayedOf, LIMIT } from '../leaderboard.js';
import { STATUS } from '../game-engine.js';
import { formatDate } from '../../core/utils.js';
import { t, ed, prizeCount } from '../../core/edition.js';
import { shareCardHtml, wireShareCard } from '../share.js';

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

/** The board table, or a message when it's empty. youId highlights this player's entry. */
function boardHtml(board, youId, meta) {
  const rows = board.map((e, i) => {
    const pos = i + 1;
    return `
      <tr class="${youId != null && e.id === youId ? 'is-you' : ''}">
        <td class="pos"><span class="pos-badge ${pos <= 3 ? `pos-${pos}` : ''}">${pos}</span></td>
        <td class="who"><strong>${esc(e.name)}</strong><span class="town">${esc(e.town)}</span></td>
        <td class="num">${cupsCell(e)}</td>
        <td class="num col-round">${roundCell(e, meta)}</td>
        <td class="num">${roundsPlayedOf(e)}</td>
        <td class="num">${e.lifelineUsed ? 'Used' : '<span class="clean">Not used</span>'}</td>
        <td class="num">${esc(formatDuration(e.durationMs))}</td>
        <td class="when">${esc(formatDate(e.date))}</td>
      </tr>`;
  }).join('');

  return board.length ? `
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
}

const statusCard = (text, retry = false) => `
  <div class="card card-pad board-empty">
    <p class="muted">${esc(text)}</p>
    ${retry ? '<div><button class="btn btn-sm" type="button" data-action="board-retry">Try Again</button></div>' : ''}
  </div>`;

export function render(root, app) {
  const state = app.ctrl.state;
  const canCarryOn = state.status === STATUS.WON;
  const youId = app.lastBoardEntry ?? myEntry(state.sessionId)?.id ?? null;
  // The entry to highlight and share: this game's, or else this device's best place still on the board.
  const mineIds = myEntryIds();
  const ownId = (board) => (youId != null && board.some((e) => e.id === youId) ? youId : board.find((e) => mineIds.has(e.id))?.id ?? null);
  // Show the board from the last visit straight away (e.g. just after adding a name), then refresh it.
  const cached = cachedBoard();

  mount(root, `
    <section class="screen screen-enter">
      <header class="page-head has-corner-action">
        <button class="btn btn-ghost btn-sm btn-plate-phone page-corner-action" data-go="home">Home</button>
        <span class="eyebrow">${esc(t('top100.eyebrow'))}</span>
        <h1>Top ${LIMIT}</h1>
        <p class="muted board-rules">${esc(t('top100.rules'))}</p>
      </header>
      <div class="share-slot"></div>
      <div class="board-slot">${cached ? boardHtml(cached, ownId(cached), app.meta) : statusCard('Loading the board…')}</div>
      <div class="page-actions">
        ${canCarryOn
          ? `<button class="btn btn-primary" data-action="season">Start Season ${(state.season ?? 1) + 1}</button>`
          : `<button class="btn btn-primary" data-go="play">${esc(ed('vars.start'))}</button>`}
        <button class="btn btn-ghost btn-plate-phone" data-go="home">Home</button>
      </div>
    </section>`);

  root.querySelector('[data-action="season"]')?.addEventListener('click', () => app.nextSeason());
  root.querySelector('.is-you')?.scrollIntoView({ block: 'center' });

  const slot = root.querySelector('.board-slot');
  // This player's own place, with a Share button. Redrawn only if their position changes.
  const shareSlot = root.querySelector('.share-slot');
  let sharedRank = null;
  const showShare = (board) => {
    const id = ownId(board);
    const i = id == null ? -1 : board.findIndex((e) => e.id === id);
    if (i < 0) { shareSlot.innerHTML = ''; sharedRank = null; return; }
    if (sharedRank === i + 1) return;
    sharedRank = i + 1;
    shareSlot.innerHTML = shareCardHtml(sharedRank);
    wireShareCard(shareSlot, board[i], sharedRank, app.meta);
  };
  if (cached) showShare(cached);
  const load = async () => {
    const r = await fetchBoard();
    if (!slot.isConnected) return;
    if (!r.ok) {
      // Keep what's already showing if there is one; otherwise explain.
      if (!cached) {
        slot.innerHTML = statusCard(`Couldn't load the Top ${LIMIT}. Check your connection and try again.`, true);
        slot.querySelector('[data-action="board-retry"]').addEventListener('click', () => {
          slot.innerHTML = statusCard('Loading the board…');
          load();
        });
      }
      return;
    }
    const hadYou = !!slot.querySelector('.is-you');
    slot.innerHTML = boardHtml(r.board, ownId(r.board), app.meta);
    showShare(r.board);
    if (!hadYou) slot.querySelector('.is-you')?.scrollIntoView({ block: 'center' });
  };
  load();
}
