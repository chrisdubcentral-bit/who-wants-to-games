import { mount, esc } from '../../ui/dom.js';
import { readStats, stageIndexLabel, averageStageLabel } from '../stats.js';
import { formatDate } from '../../core/utils.js';
import { STATUS } from '../game-engine.js';

const RESULT_LABEL = {
  [STATUS.WON]: 'Champion',
  [STATUS.ELIMINATED]: 'Eliminated',
};

function recentLabel(g) {
  if (g.result === STATUS.WON) return 'Won the Final';
  return `Out in the ${g.stageReached}`;
}

export function render(root, app) {
  const stages = app.meta.stages;
  const s = readStats(stages.length);

  const card = (label, value, tone = '', small = false) =>
    `<div class="card stat-card"><span class="label">${esc(label)}</span><span class="value ${tone} ${small ? 'small' : ''}">${esc(value)}</span></div>`;

  const max = Math.max(1, ...s.stageReachedHistogram);
  const names = [...stages.map((st) => st.short), '🏆'];
  const bars = s.stageReachedHistogram.map((n, i) => `
    <div class="bar-col" title="${esc(stageIndexLabel(i, stages))}: ${n}">
      <span class="count">${n || ''}</span>
      <div class="bar-wrap"><div class="bar ${i === stages.length ? 'is-champ' : ''}" style="height:${(n / max) * 100}%"></div></div>
      <span class="name">${esc(names[i])}</span>
    </div>`).join('');

  const recent = s.recentGames.length
    ? `<ul class="recent">${s.recentGames.slice(0, 8).map((g) => `
        <li>
          <span>
            <strong>${esc(RESULT_LABEL[g.result] ?? 'Ended early')}</strong>
            <span class="muted"> · ${esc(recentLabel(g))}</span>
          </span>
          <span class="when">${esc(formatDate(g.date))}</span>
        </li>`).join('')}</ul>`
    : '<p class="empty">No campaigns played yet.</p>';

  const winRate = s.gamesPlayed ? Math.round((s.gamesWon / s.gamesPlayed) * 100) + '%' : '—';

  mount(root, `
    <section class="screen screen-enter">
      <header class="page-head">
        <span class="eyebrow">Your European Record</span>
        <h1>Statistics</h1>
      </header>
      <div class="stats-grid stagger">
        ${card('Games Played', s.gamesPlayed)}
        ${card('Games Won', s.gamesWon, 'gold')}
        ${card('Highest Stage', stageIndexLabel(s.highestStageIndex, stages), 'emerald', true)}
        ${card('Average Stage', averageStageLabel(s, stages), '', true)}
        ${card('Eliminations', s.eliminations)}
        ${card('50:50 Used', s.fiftyFiftyUsed)}
      </div>
      <div class="stats-cols">
        <div class="card card-pad">
          <h2 class="panel-title">How Far You Got <span class="muted" style="font-size:.75rem;letter-spacing:.08em">· Win rate ${esc(winRate)}</span></h2>
          <div class="bars" role="img" aria-label="Number of campaigns ending at each stage">${bars}</div>
        </div>
        <div class="card card-pad">
          <h2 class="panel-title">Recent Campaigns</h2>
          ${recent}
        </div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-go="play">Kick Off</button>
        <button class="btn" data-go="top100">Top 100</button>
        <button class="btn" data-go="home">Back</button>
      </div>
    </section>`);
}
