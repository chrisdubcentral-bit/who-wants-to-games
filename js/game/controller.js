// Runs a game: holds engine state, drives the lock-in/reveal timers,
// saves a refresh snapshot and records stats when the game ends.

import { initialState, reduce, summarise, STATUS, FINISHED } from './game-engine.js';
import { pickQuestions } from './question-picker.js';
import { recordGame } from './stats.js';
import { session, local, KEYS } from '../core/storage.js';
import { TIMING, RECENT_SEEN_LIMIT, SEASON_RESTART_KEY } from '../core/config.js';
import { bus } from '../core/events.js';

export const ACTIVE = [STATUS.PLAYING, STATUS.LOCKED, STATUS.REVEALED];

export function createController({ stages, questions, activeCategories }) {
  let state = initialState(stages);
  let timers = [];

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function set(next) {
    if (next === state) return false;
    const wasFinished = FINISHED.includes(state.status);
    state = next;
    session.write(KEYS.gameSnapshot, state);
    bus.emit('game:state', state);
    if (!wasFinished && FINISHED.includes(state.status)) {
      const summary = summarise(state);
      // Statistics count each season as its own game.
      const statsId = summary.season > 1 ? `${state.sessionId}:s${summary.season}` : state.sessionId;
      recordGame({ ...summary, correctCount: summary.seasonCorrectCount, lifelineUsed: summary.lifelineUsedThisSeason }, statsId, stages.length);
      bus.emit('game:finished', { state, summary });
    }
    return true;
  }

  const dispatch = (action) => set(reduce(state, action));

  function scheduleReveal() {
    later(() => {
      dispatch({ type: 'REVEAL' });
      scheduleAdvance();
    }, TIMING.lockInMs);
  }
  function scheduleAdvance() {
    later(() => dispatch({ type: 'ADVANCE' }), TIMING.revealMs);
  }

  return {
    get state() { return state; },
    get isActive() { return ACTIVE.includes(state.status); },
    get isFinished() { return FINISHED.includes(state.status); },

    /** Picks questions and starts a new game. Throws NotEnoughQuestionsError if the pool is too small. */
    start() {
      clearTimers();
      const seen = local.read(KEYS.seen, []);
      const picked = pickQuestions(questions, stages, { seen, activeCategories });
      local.write(KEYS.seen, [...picked.map((q) => q.id), ...seen].slice(0, RECENT_SEEN_LIMIT));
      dispatch({ type: 'START', questions: picked });
    },

    /** A champion plays on: new questions from the First Round, same run. Returns false if the game isn't won. */
    nextSeason() {
      if (state.status !== STATUS.WON) return false;
      clearTimers();
      const fromIndex = Math.max(0, stages.findIndex((s) => s.key === SEASON_RESTART_KEY));
      const seen = local.read(KEYS.seen, []);
      const picked = pickQuestions(questions, stages, { seen, activeCategories, fromIndex });
      local.write(KEYS.seen, [...picked.map((q) => q.id), ...seen].slice(0, RECENT_SEEN_LIMIT));
      return dispatch({ type: 'NEXT_SEASON', questions: picked, fromIndex });
    },

    select(index) {
      if (dispatch({ type: 'SELECT', index })) scheduleReveal();
    },

    useFiftyFifty() { dispatch({ type: 'USE_5050' }); },

    /** Restores a game after a page refresh. A locked answer still gets revealed — no retries. */
    resume(snapshot) {
      clearTimers();
      state = { ...snapshot, stages };
      bus.emit('game:state', state);
      if (state.status === STATUS.LOCKED) scheduleReveal();
      else if (state.status === STATUS.REVEALED) scheduleAdvance();
    },

    /** Ends an abandoned game as knocked out at the current stage (resolving a locked answer first). */
    abandon(snapshot) {
      clearTimers();
      state = { ...snapshot, stages };
      if (state.status === STATUS.LOCKED) { state = reduce(state, { type: 'REVEAL' }); }
      if (state.status === STATUS.REVEALED) { state = reduce(state, { type: 'ADVANCE' }); }
      if (state.status === STATUS.PLAYING) { set(reduce(state, { type: 'FORFEIT' })); return; }
      // Finished during resolution — record it.
      const s = state; state = initialState(stages); set(s);
    },

    stop() { clearTimers(); },
  };
}

export function readSnapshot() {
  const s = session.read(KEYS.gameSnapshot, null);
  return s && typeof s === 'object' && s.status ? s : null;
}
