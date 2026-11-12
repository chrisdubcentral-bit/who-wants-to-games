// Pure game state machine — no DOM, no timers, no storage.
// next = reduce(state, action). Easy to test.

export const STATUS = {
  IDLE: 'idle',
  PLAYING: 'playing',
  LOCKED: 'locked',       // answer chosen, waiting for reveal
  REVEALED: 'revealed',   // right/wrong showing, waiting to advance
  WON: 'won',
  ELIMINATED: 'eliminated',
};

export const FINISHED = [STATUS.WON, STATUS.ELIMINATED];

/**
 * @param {Array} stages  ordered stage objects ({key,label})
 */
export function initialState(stages) {
  return {
    status: STATUS.IDLE,
    stages,
    sessionId: null,
    startedAt: null,
    finishedAt: null,
    season: 1,             // goes up each time a champion carries on
    seasonStartIndex: 0,   // stage this season began at (later seasons skip the qualifiers)
    cups: 0,               // European Cups won in this run
    stageIndex: 0,
    questions: [],
    selected: null,
    lastCorrect: null,
    answers: [],
    lifeline: { fiftyFiftyUsed: false, usedAtStage: null, usedAtSeason: null, removed: [] },
    forfeited: false,
  };
}

const seasonOf = (state) => state.season ?? 1;

export function reduce(state, action) {
  switch (action.type) {
    case 'START': {
      if (!Array.isArray(action.questions) || action.questions.length !== state.stages.length) return state;
      return {
        ...initialState(state.stages),
        status: STATUS.PLAYING,
        sessionId: action.sessionId ?? String(Date.now()),
        startedAt: action.startedAt ?? new Date().toISOString(),
        questions: action.questions,
      };
    }

    case 'SELECT': {
      if (state.status !== STATUS.PLAYING) return state;
      const i = action.index;
      if (!Number.isInteger(i) || i < 0 || i > 3) return state;
      if (state.lifeline.removed.includes(i)) return state;
      return { ...state, status: STATUS.LOCKED, selected: i };
    }

    case 'REVEAL': {
      if (state.status !== STATUS.LOCKED) return state;
      const q = state.questions[state.stageIndex];
      const correct = state.selected === q.correctAnswer;
      const stage = state.stages[state.stageIndex];
      return {
        ...state,
        status: STATUS.REVEALED,
        lastCorrect: correct,
        answers: [...state.answers, { stageKey: stage.key, season: seasonOf(state), questionId: q.id, chosen: state.selected, correct }],
      };
    }

    case 'ADVANCE': {
      if (state.status !== STATUS.REVEALED) return state;
      const finishedAt = action.at ?? new Date().toISOString();
      if (!state.lastCorrect) return { ...state, status: STATUS.ELIMINATED, finishedAt };
      const isFinal = state.stageIndex === state.stages.length - 1;
      if (isFinal) return { ...state, status: STATUS.WON, cups: (state.cups ?? 0) + 1, finishedAt };
      return {
        ...state,
        status: STATUS.PLAYING,
        stageIndex: state.stageIndex + 1,
        selected: null,
        lastCorrect: null,
        lifeline: { ...state.lifeline, removed: [] },
      };
    }

    case 'USE_5050': {
      if (state.status !== STATUS.PLAYING || state.lifeline.fiftyFiftyUsed) return state;
      const q = state.questions[state.stageIndex];
      const rand = action.rand ?? Math.random;
      const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctAnswer);
      const keep = wrong[Math.floor(rand() * wrong.length)];
      const removed = wrong.filter((i) => i !== keep);
      return {
        ...state,
        lifeline: { fiftyFiftyUsed: true, usedAtStage: state.stages[state.stageIndex].key, usedAtSeason: seasonOf(state), removed },
      };
    }

    // A champion carries on: same run, next season, starting at stage `fromIndex`.
    // The 50:50 is not handed back, and time spent on the champion screen isn't counted.
    case 'NEXT_SEASON': {
      if (state.status !== STATUS.WON) return state;
      const from = action.fromIndex;
      if (!Number.isInteger(from) || from < 0 || from >= state.stages.length) return state;
      if (!Array.isArray(action.questions) || action.questions.length !== state.stages.length - from) return state;
      const paused = Date.parse(action.at ?? new Date().toISOString()) - Date.parse(state.finishedAt);
      const startedAt = Number.isFinite(paused) && paused > 0
        ? new Date(Date.parse(state.startedAt) + paused).toISOString()
        : state.startedAt;
      return {
        ...state,
        status: STATUS.PLAYING,
        season: seasonOf(state) + 1,
        seasonStartIndex: from,
        startedAt,
        finishedAt: null,
        stageIndex: from,
        questions: [...new Array(from).fill(null), ...action.questions],
        selected: null,
        lastCorrect: null,
        lifeline: { ...state.lifeline, removed: [] },
      };
    }

    // A game left unfinished (e.g. not resumed after a page refresh) counts as knocked out.
    case 'FORFEIT': {
      if (state.status !== STATUS.PLAYING) return state;
      return { ...state, status: STATUS.ELIMINATED, forfeited: true, finishedAt: action.at ?? new Date().toISOString() };
    }

    case 'RESET':
      return initialState(state.stages);

    default:
      return state;
  }
}

/** Milliseconds from kick-off to the end of the game, or null if unknown. */
function durationOf({ startedAt, finishedAt }) {
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * Summary used by the results screen and stats.
 * stageReachedIndex: stage the player was on when the game ended (8 = champion).
 * correctCount covers the whole run; seasonCorrectCount only the season just played.
 */
export function summarise(state, labels = {}) {
  const L = { champion: 'Champion', outIn: 'Knocked out in the {stage}', leftIn: 'Left during the {stage}', ...labels };
  const withStage = (tpl, stage) => tpl.replace('{stage}', stage);
  const { stages, status } = state;
  const correctCount = state.answers.filter((a) => a.correct).length;
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
  const season = seasonOf(state);
  const base = {
    result: status,
    season,
    cups: state.cups ?? 0,
    stageKey: null,
    seasonCorrectCount: state.answers.filter((a) => a.correct && (a.season ?? 1) === season).length,
    lifelineUsedThisSeason: state.lifeline.fiftyFiftyUsed && (state.lifeline.usedAtSeason ?? 1) === season,
    correctCount,
    roundsPlayed: state.answers.length,   // every question answered in the run, including the one that knocked them out
    totalStages: stages.length,
    lifelineUsed: state.lifeline.fiftyFiftyUsed,
    lifelineStage: state.lifeline.usedAtStage ? byKey[state.lifeline.usedAtStage]?.label : null,
    forfeited: !!state.forfeited,
    durationMs: durationOf(state),
  };

  if (status === STATUS.WON) {
    return { ...base, stageReachedIndex: stages.length, stageReachedLabel: L.champion, finishLabel: L.champion };
  }

  const current = stages[state.stageIndex];
  if (status === STATUS.ELIMINATED) {
    return {
      ...base,
      stageKey: current.key,
      stageReachedIndex: state.stageIndex,
      stageReachedLabel: current.label,
      finishLabel: withStage(state.forfeited ? L.leftIn : L.outIn, current.label),
    };
  }

  return { ...base, stageReachedIndex: state.stageIndex, stageReachedLabel: current?.label ?? '', finishLabel: '' };
}
