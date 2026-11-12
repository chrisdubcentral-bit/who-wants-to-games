// Tournament ladder (desktop column / mobile sheet) and the compact mobile strip.

import { esc } from '../dom.js';
import { STATUS } from '../../game/game-engine.js';
import { t } from '../../core/edition.js';

function rungState(state, i) {
  const { stageIndex, status, lastCorrect } = state;
  // Champions skip the qualifiers in later seasons.
  if ((state.season ?? 1) > 1 && i < (state.seasonStartIndex ?? 0)) return 'bye';
  if (status === STATUS.WON) return 'done';
  if (i < stageIndex) return 'done';
  if (i === stageIndex) {
    if (status === STATUS.REVEALED && lastCorrect) return 'done';
    if ((status === STATUS.REVEALED && lastCorrect === false) || status === STATUS.ELIMINATED) return 'lost';
    return 'current';
  }
  return 'upcoming';
}

export function ladderHtml(state) {
  const items = state.stages.map((s, i) => {
    const st = rungState(state, i);
    const cls = [
      'rung',
      st === 'done' && 'is-done',
      st === 'current' && 'is-current',
      st === 'lost' && 'is-lost',
      st === 'bye' && 'is-bye',
      s.key === 'final' && 'is-final',
    ].filter(Boolean).join(' ');
    const label = `${s.label}${st === 'done' ? ', completed' : st === 'current' ? ', current stage' : st === 'bye' ? `, ${t('quiz.bye')}` : ''}`;
    return `<li class="${cls}" aria-label="${esc(label)}" ${st === 'current' ? 'aria-current="step"' : ''}>
        <span class="num">${s.order}</span>
        <span>${esc(s.label)}</span>
        <span class="icons">${st === 'done' ? '<span class="check" aria-hidden="true">✓</span>' : st === 'bye' ? '<span class="bye" aria-hidden="true">Bye</span>' : ''}</span>
      </li>`;
  }).reverse().join('');

  const season = state.season ?? 1;
  return `
    <div class="ladder-head">
      <span class="eyebrow">${season > 1 ? `Season ${season} · ` : ''}${esc(t('quiz.ladder'))}</span>
    </div>
    <ol class="ladder-list" reversed>${items}</ol>`;
}

export function stripHtml(state) {
  const dots = state.stages.map((s, i) => {
    const st = rungState(state, i);
    return `<span class="strip-dot ${st === 'done' ? 'is-done' : ''} ${st === 'current' ? 'is-current' : ''}"></span>`;
  }).join('');
  return `
    <div class="strip-track" aria-hidden="true">${dots}</div>
    <div class="strip-row">
      <span class="eyebrow">${esc(t('quiz.ladder'))}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-action="open-ladder">View ladder</button>
    </div>`;
}
