// Unit tests for the pure modules. Open tests/test-runner.html through a local server.

import { buildMeta, fetchJson } from '../engine/js/core/config.js';
import { initialState, reduce, summarise, STATUS } from '../engine/js/game/game-engine.js';
import { pickQuestions, prepareQuestion, NotEnoughQuestionsError } from '../engine/js/game/question-picker.js';
import { validateQuestion } from '../engine/js/core/validation.js';
import { migrateQuestion, migrateCollection } from '../engine/js/core/migrations.js';
import { applyGame, emptyStats } from '../engine/js/game/stats.js';
import { matchesQuery, applyFilters, idsInQuery } from '../engine/js/core/search.js';
import { normalise, nextQuestionId, similarity } from '../engine/js/core/utils.js';
import { advertStatus, showingAfter, advertProblems, dayKey } from '../engine/js/core/adverts.js';
import { compareEntries, insertEntry, upsertEntry, entryFromSummary, prospectiveRank, isEligible, cleanText, formatDuration, rankOfSession, LIMIT } from '../engine/js/game/leaderboard.js';

const results = [];
let current = '';
const group = (name) => { current = name; };
function test(name, fn) {
  try { fn(); results.push({ group: current, name, ok: true }); }
  catch (err) { results.push({ group: current, name, ok: false, err }); }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}
function ok(cond, msg = 'expected true') { if (!cond) throw new Error(msg); }

// Deterministic random for repeatable tests.
function seeded(seed = 42) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const [stagesFile, catsFile, approvedFile] = await Promise.all([
  fetchJson('../editions/celtic/data/meta/stages.json'),
  fetchJson('../editions/celtic/data/meta/categories.json'),
  fetchJson('../editions/celtic/data/questions/approved-questions.json'),
]);
const meta = buildMeta(stagesFile.stages, catsFile.categories);
const stages = meta.stages;
const approved = migrateCollection(approvedFile).questions;

// 8 fake questions, correct answer always index 0.
const fakeQs = stages.map((s, i) => ({ id: 't' + i, stage: s.key, question: `Q${i}?`, options: ['right', 'w1', 'w2', 'w3'], correctAnswer: 0 }));

function play(answers) {
  let st = reduce(initialState(stages), { type: 'START', questions: fakeQs });
  for (const a of answers) {
    st = reduce(st, { type: 'SELECT', index: a });
    st = reduce(st, { type: 'REVEAL' });
    st = reduce(st, { type: 'ADVANCE' });
  }
  return st;
}

/* ---------------- Engine ---------------- */
group('Game engine');
test('answering all 8 correctly wins the European Cup', () => {
  const st = play([0, 0, 0, 0, 0, 0, 0, 0]);
  eq(st.status, STATUS.WON);
  const s = summarise(st);
  eq(s.correctCount, 8);
  eq(s.stageReachedIndex, 8);
});
test('wrong answer at the 2nd Qualifier: eliminated there', () => {
  const st = play([0, 1]);
  eq(st.status, STATUS.ELIMINATED);
  const s = summarise(st);
  eq(s.stageReachedLabel, '2nd Qualifier');
  eq(s.finishLabel, 'Knocked out in the 2nd Qualifier');
});
test('out in the Semi Final is recorded at the Semi Final', () => {
  const s = summarise(play([0, 0, 0, 0, 0, 0, 1]));
  eq(s.stageReachedLabel, 'Semi Final');
  eq(s.stageReachedIndex, 6);
});
test('leaving a game unfinished counts as knocked out at the current stage', () => {
  const st = reduce(play([0, 0, 0]), { type: 'FORFEIT' });
  eq(st.status, STATUS.ELIMINATED);
  const s = summarise(st);
  eq(s.stageReachedLabel, 'First Round');
  eq(s.forfeited, true);
  eq(s.finishLabel, 'Left during the First Round');
});
test('50:50 removes exactly two wrong answers and never the correct one', () => {
  for (let seed = 1; seed < 40; seed++) {
    const st = reduce(play([]), { type: 'USE_5050', rand: seeded(seed) });
    eq(st.lifeline.removed.length, 2);
    ok(!st.lifeline.removed.includes(0), 'removed the correct answer');
  }
});
test('50:50 can only be used once per game', () => {
  let st = reduce(play([]), { type: 'USE_5050', rand: seeded(1) });
  st = reduce(st, { type: 'SELECT', index: 0 }); st = reduce(st, { type: 'REVEAL' }); st = reduce(st, { type: 'ADVANCE' });
  const again = reduce(st, { type: 'USE_5050', rand: seeded(2) });
  eq(again.lifeline.removed, [], 'removed list resets per stage and no second use');
  ok(again === st, 'state unchanged');
});
test('cannot pick an answer removed by 50:50', () => {
  const st = reduce(play([]), { type: 'USE_5050', rand: seeded(3) });
  const removed = st.lifeline.removed[0];
  ok(reduce(st, { type: 'SELECT', index: removed }) === st);
});
test('input is ignored while an answer is locked in', () => {
  let st = reduce(play([]), { type: 'SELECT', index: 0 });
  ok(reduce(st, { type: 'SELECT', index: 1 }) === st, 'second select');
  ok(reduce(st, { type: 'FORFEIT' }) === st, 'forfeit');
  ok(reduce(st, { type: 'USE_5050' }) === st, '50:50');
});
test('time held by an advert between stages is not counted', () => {
  let st = reduce(initialState(stages), { type: 'START', questions: fakeQs, startedAt: '2026-01-01T00:00:00.000Z' });
  st = reduce(st, { type: 'PAUSE_CREDIT', ms: 8000 });
  st = reduce(st, { type: 'SELECT', index: 1 }); st = reduce(st, { type: 'REVEAL' });
  st = reduce(st, { type: 'ADVANCE', at: '2026-01-01T00:01:00.000Z' });
  eq(summarise(st).durationMs, 52000);
});
test('a pause credit is ignored unless a question is on screen, and must be a positive time', () => {
  const playing = play([]);
  ok(reduce(playing, { type: 'PAUSE_CREDIT', ms: 0 }) === playing, 'zero');
  ok(reduce(playing, { type: 'PAUSE_CREDIT', ms: -5 }) === playing, 'negative');
  ok(reduce(playing, { type: 'PAUSE_CREDIT', ms: 'soon' }) === playing, 'not a number');
  const locked = reduce(playing, { type: 'SELECT', index: 0 });
  ok(reduce(locked, { type: 'PAUSE_CREDIT', ms: 1000 }) === locked, 'locked in');
  const out = play([1]);
  ok(reduce(out, { type: 'PAUSE_CREDIT', ms: 1000 }) === out, 'eliminated');
});

/* ---------------- Picker ---------------- */
group('Question picker');
test('picks one unique question per stage from the seed data', () => {
  const picked = pickQuestions(approved, stages, { rand: seeded(7) });
  eq(picked.length, 8);
  eq(new Set(picked.map((q) => q.id)).size, 8);
  picked.forEach((q, i) => eq(q.stage, stages[i].key, `stage ${i}`));
});
test('shuffling answers keeps the correct answer correct', () => {
  const q = approved[0];
  for (let seed = 1; seed < 30; seed++) {
    const p = prepareQuestion(q, seeded(seed));
    eq(p.options[p.correctAnswer], q.options[q.correctAnswer]);
    eq([...p.options].sort(), [...q.options].sort());
  }
});
test('avoids recently seen questions when possible', () => {
  const pool = approved.filter((q) => q.stage === 'qualifier-1');
  const seen = pool.slice(0, pool.length - 1).map((q) => q.id);
  const picked = pickQuestions(approved, stages, { seen, rand: seeded(9) });
  eq(picked[0].id, pool[pool.length - 1].id);
});
test('falls back to another stage when one stage is empty', () => {
  const noFinal = approved.filter((q) => q.stage !== 'final');
  const picked = pickQuestions(noFinal, stages, { rand: seeded(5) });
  eq(picked.length, 8);
});
test('throws "not enough questions" with too few questions', () => {
  let thrown = null;
  try { pickQuestions(approved.slice(0, 3), stages); } catch (e) { thrown = e; }
  ok(thrown instanceof NotEnoughQuestionsError, 'expected NotEnoughQuestionsError');
});

/* ---------------- Validation ---------------- */
group('Validation');
const good = { id: 'x1', question: 'Which club did Celtic beat in Lisbon in 1967?', options: ['Inter', 'Real Madrid', 'Benfica', 'Ajax'], correctAnswer: 0, stage: 'playoff', category: 'cup-finals', difficulty: 2 };
const fieldsOf = (r) => r.errors.map((e) => e.field);
test('a good question passes', () => { const r = validateQuestion(good, { meta }); ok(r.valid, JSON.stringify(r.errors)); eq(r.warnings, []); });
test('empty question fails', () => ok(fieldsOf(validateQuestion({ ...good, question: '' }, { meta })).includes('question')));
test('short question fails', () => ok(fieldsOf(validateQuestion({ ...good, question: 'Who?' }, { meta })).includes('question')));
test('three answers fail', () => ok(fieldsOf(validateQuestion({ ...good, options: ['a', 'b', 'c'] }, { meta })).includes('options')));
test('empty answer fails', () => ok(fieldsOf(validateQuestion({ ...good, options: ['a', '', 'c', 'd'] }, { meta })).includes('option1')));
test('duplicate answers fail (case-insensitive)', () => ok(fieldsOf(validateQuestion({ ...good, options: ['Inter', 'inter ', 'B', 'C'] }, { meta })).includes('options')));
test('missing correct answer fails', () => ok(fieldsOf(validateQuestion({ ...good, correctAnswer: null }, { meta })).includes('correctAnswer')));
test('correct answer out of range fails', () => ok(fieldsOf(validateQuestion({ ...good, correctAnswer: 4 }, { meta })).includes('correctAnswer')));
test('invalid stage fails', () => ok(fieldsOf(validateQuestion({ ...good, stage: 'group-stage' }, { meta })).includes('stage')));
test('unknown category fails', () => ok(fieldsOf(validateQuestion({ ...good, category: 'cricket' }, { meta })).includes('category')));
test('difficulty outside 1–5 fails', () => ok(fieldsOf(validateQuestion({ ...good, difficulty: 9 }, { meta })).includes('difficulty')));
test('exact duplicate of an approved question fails', () => {
  const dup = { ...approved[0], id: 'new' };
  const r = validateQuestion(dup, { meta, approved });
  ok(r.errors.some((e) => e.duplicate === approved[0].id), JSON.stringify(r.errors));
});
test('an approved question is not a duplicate of itself', () => {
  ok(validateQuestion(approved[0], { meta, approved }).valid);
});
test('near-duplicate gives a warning, not an error', () => {
  // Compared against a made-up approved list, so changes to the real question files can't break it.
  // Long enough that one extra word stays above the 80% similarity threshold.
  const text = 'Which Celtic captain lifted the European Cup in Lisbon after beating Inter Milan in May 1967?';
  const existing = { ...good, id: 'q_000001', question: text };
  const near = { ...good, id: 'x2', question: text.replace('?', ' exactly?') };
  const r = validateQuestion(near, { meta, approved: [existing] });
  ok(r.valid, 'should still be valid');
  ok(r.warnings.some((w) => /Possible duplicate/.test(w.message)), JSON.stringify(r.warnings));
});
test('missing "?" and odd difficulty give warnings', () => {
  const r = validateQuestion({ ...good, question: good.question.slice(0, -1), difficulty: 5 }, { meta });
  ok(r.valid);
  eq(r.warnings.length, 2);
});
// Only errors fail here: warnings (e.g. a possible duplicate) are advice, and a reviewer may have approved the question anyway.
test('every approved question passes validation', () => {
  approved.forEach((q) => {
    const r = validateQuestion(q, { meta, approved });
    ok(r.valid, `${q.id}: ${JSON.stringify(r.errors)}`);
  });
});

/* ---------------- Migrations ---------------- */
group('Migrations');
test('legacy question from the original brief is upgraded', () => {
  const legacy = { id: 1, stage: '1st Qualifier', category: 'General Football', difficulty: 1, question: 'Which country won the 1966 FIFA World Cup?', options: ['England', 'Germany', 'Brazil', 'Italy'], correctAnswer: 0 };
  const q = migrateQuestion(legacy);
  eq(q.id, 'q_000001'); eq(q.stage, 'qualifier-1'); eq(q.category, 'general-football'); eq(q.schemaVersion, 1); eq(q.status, 'pending');
  ok(validateQuestion(q, { meta }).valid);
});
test('current questions pass through unchanged', () => eq(migrateQuestion(approved[3]), approved[3]));

/* ---------------- Seasons ---------------- */
group('Seasons');
const R1 = stages.findIndex((s) => s.key === 'round-1');
const seasonQs = (tag) => stages.slice(R1).map((s, i) => ({ id: tag + i, stage: s.key, question: `Q${i}?`, options: ['right', 'w1', 'w2', 'w3'], correctAnswer: 0 }));
function playOn(st, answers) {
  st = reduce(st, { type: 'NEXT_SEASON', questions: seasonQs('s' + ((st.season ?? 1) + 1) + '-'), fromIndex: R1 });
  for (const a of answers) {
    st = reduce(st, { type: 'SELECT', index: a });
    st = reduce(st, { type: 'REVEAL' });
    st = reduce(st, { type: 'ADVANCE' });
  }
  return st;
}
test('a champion starts the next season at the First Round with one cup', () => {
  const st = playOn(play([0, 0, 0, 0, 0, 0, 0, 0]), []);
  eq(st.status, STATUS.PLAYING); eq(st.season, 2); eq(st.cups, 1);
  eq(st.stages[st.stageIndex].key, 'round-1');
  eq(st.questions[st.stageIndex].id, 's2-0');
});
test('only a champion can start another season', () => {
  const out = play([0, 1]);
  eq(reduce(out, { type: 'NEXT_SEASON', questions: seasonQs('x'), fromIndex: R1 }), out);
  const won = play([0, 0, 0, 0, 0, 0, 0, 0]);
  eq(reduce(won, { type: 'NEXT_SEASON', questions: fakeQs, fromIndex: R1 }), won, 'wrong number of questions');
});
test('a champion can retire, keeping the cups and joining the Top 100, but not play on', () => {
  const won = play([0, 0, 0, 0, 0, 0, 0, 0]);
  const out = play([0, 1]);
  eq(reduce(out, { type: 'RETIRE' }), out, 'only a champion can retire');
  const st = reduce(won, { type: 'RETIRE' });
  eq(st.status, STATUS.WON); eq(st.cups, 1);
  const s = summarise(st);
  ok(s.retired, 'summary says retired');
  ok(isEligible(s), 'eligible for the Top 100');
  eq(reduce(st, { type: 'RETIRE' }), st, 'retiring twice changes nothing');
  eq(reduce(st, { type: 'NEXT_SEASON', questions: seasonQs('r'), fromIndex: R1 }), st, 'no new season after retiring');
});
test('the 50:50 is not handed back for a new season', () => {
  let st = reduce(play([0]), { type: 'USE_5050', rand: seeded(3) });
  for (let i = 0; i < 7; i++) { st = reduce(st, { type: 'SELECT', index: 0 }); st = reduce(st, { type: 'REVEAL' }); st = reduce(st, { type: 'ADVANCE' }); }
  eq(st.status, STATUS.WON);
  st = playOn(st, []);
  eq(st.lifeline.fiftyFiftyUsed, true); eq(st.lifeline.removed, []);
  eq(reduce(st, { type: 'USE_5050' }), st);
  const s = summarise(st);
  eq(s.lifelineUsed, true); eq(s.lifelineUsedThisSeason, false);
});
test('winning again adds a cup, and a wrong answer keeps the cups won', () => {
  const twice = playOn(play([0, 0, 0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0]);
  eq(twice.status, STATUS.WON); eq(twice.cups, 2);
  const out = playOn(twice, [0, 0, 1]);
  eq(out.status, STATUS.ELIMINATED);
  const s = summarise(out);
  eq(s.cups, 2); eq(s.season, 3); eq(s.stageKey, 'quarter-final'); eq(s.correctCount, 15); eq(s.seasonCorrectCount, 2);
  const e = entryFromSummary(s, { name: 'A', town: 'B', sessionId: 'z' });
  eq(e.cups, 2); eq(e.stageKey, 'quarter-final');
});
test('time on the champion screen is not counted', () => {
  let st = reduce(initialState(stages), { type: 'START', questions: fakeQs, startedAt: '2026-01-01T00:00:00.000Z' });
  for (let i = 0; i < 8; i++) {
    st = reduce(st, { type: 'SELECT', index: 0 }); st = reduce(st, { type: 'REVEAL' });
    st = reduce(st, { type: 'ADVANCE', at: '2026-01-01T00:02:00.000Z' });
  }
  st = reduce(st, { type: 'NEXT_SEASON', questions: seasonQs('n'), fromIndex: R1, at: '2026-01-01T00:12:00.000Z' });
  st = reduce(st, { type: 'SELECT', index: 1 }); st = reduce(st, { type: 'REVEAL' });
  st = reduce(st, { type: 'ADVANCE', at: '2026-01-01T00:13:00.000Z' });
  eq(summarise(st).durationMs, 180000);
});
test('questions for a new season are only picked from the First Round on', () => {
  const picked = pickQuestions(approved, stages, { rand: seeded(11), fromIndex: R1 });
  eq(picked.map((q) => q.stage), stages.slice(R1).map((s) => s.key));
});

/* ---------------- Stats ---------------- */
group('Statistics');
test('a game is counted once even if recorded twice', () => {
  const summary = summarise(play([0, 0, 0, 1]));
  let s = applyGame(emptyStats(), summary, 'abc');
  s = applyGame(s, summary, 'abc');
  eq(s.gamesPlayed, 1);
  eq(s.stageReachedHistogram[3], 1);
});
test('wins, eliminations and 50:50 use are tracked', () => {
  let s = applyGame(emptyStats(), summarise(play([0, 0, 0, 0, 0, 0, 0, 0])), 'a');
  let out = reduce(play([0]), { type: 'USE_5050', rand: seeded(1) });
  out = reduce(out, { type: 'FORFEIT' });
  s = applyGame(s, summarise(out), 'b');
  eq(s.gamesWon, 1); eq(s.eliminations, 1); eq(s.fiftyFiftyUsed, 1); eq(s.highestStageIndex, 8); eq(s.totalStageIndexReached, 9);
});

/* ---------------- Search & utils ---------------- */
group('Search & utilities');
test('search ignores case and accents', () => {
  const q = approved.find((x) => x.options.includes('Estádio Nacional'));
  ok(matchesQuery(q, 'estadio nacional', meta));
  ok(matchesQuery(q, 'LISBON', meta), 'tag search');
});
test('search finds players, managers, clubs, countries and competitions', () => {
  ['Larsson', "O'Neill", 'Porto', 'Portugal', 'UEFA Cup'].forEach((term) => {
    ok(approved.some((q) => matchesQuery(q, term, meta)), term);
  });
});
test('search by id finds one question, or any of several', () => {
  const [a, b, c] = approved;
  eq(idsInQuery('q527 and Q_000528'), ['q_000527', 'q_000528']);
  ok(matchesQuery(a, a.id, meta) && !matchesQuery(b, a.id, meta), 'exact id');
  ok(matchesQuery(a, 'q' + String(Number(a.id.slice(2))), meta), 'short id');
  const both = a.id + ' ' + b.id;
  ok(matchesQuery(a, both, meta) && matchesQuery(b, both, meta) && !matchesQuery(c, both, meta), 'either id');
  ok(!matchesQuery(a, a.id + ' zzzz', meta), 'other words still have to match');
});
test('filters combine', () => {
  const rows = approved.map((q) => ({ q, status: 'approved' }));
  const r = applyFilters(rows, { status: 'approved', stage: 'final', difficulty: '5', query: '1967' }, meta);
  ok(r.length > 0 && r.every(({ q }) => q.stage === 'final' && q.difficulty === 5));
});
test('normalise / nextQuestionId / similarity', () => {
  eq(normalise('  Atlético   Madrid! '), 'atletico madrid');
  eq(nextQuestionId(['q_000009', 'q_000120']), 'q_000121');
  ok(similarity('Who won the cup in 1967?', 'Who won the cup in 1967') === 1);
});

group('Top 100');
const entry = (o) => ({ name: 'A', town: 'B', sessionId: null, date: '2026-01-01T00:00:00Z', result: STATUS.WON, stageReachedIndex: 8, lifelineUsed: false, durationMs: 60000, correctCount: 8, ...o });
test('no 50:50 ranks above 50:50 however fast, then fastest, then earliest', () => {
  const rows = [
    entry({ name: 'slow', durationMs: 90000 }),
    entry({ name: 'fifty-fast', lifelineUsed: true, durationMs: 1000 }),
    entry({ name: 'fifty-slow', lifelineUsed: true, durationMs: 5000 }),
    entry({ name: 'late', date: '2026-02-01T00:00:00Z' }),
    entry({ name: 'fast', durationMs: 30000 }),
    entry({ name: 'early' }),
  ].sort(compareEntries).map((e) => e.name);
  eq(rows, ['fast', 'early', 'late', 'slow', 'fifty-fast', 'fifty-slow']);
});
test('the board keeps only the top 100 and reports the new rank', () => {
  const full = Array.from({ length: LIMIT }, (_, i) => entry({ name: 'p' + i, durationMs: 1000 * (i + 1) }));
  const better = entry({ name: 'new', durationMs: 500 });
  const r = insertEntry(full, better);
  eq(r.board.length, LIMIT); eq(r.rank, 1); eq(r.board[LIMIT - 1].name, 'p98');
  eq(insertEntry(full, entry({ durationMs: 999999 })).rank, null);
});
test('prospective rank says whether a game would make the board', () => {
  const full = Array.from({ length: LIMIT }, () => entry({ lifelineUsed: true }));
  eq(prospectiveRank(full, entry({ lifelineUsed: false, durationMs: 999999 })), 1);
  eq(prospectiveRank(full, entry({ lifelineUsed: true, durationMs: 999999 })), null);
  eq(prospectiveRank([], entry({})), 1);
});
test('anyone who finishes a game can join the board', () => {
  ok(isEligible({ result: STATUS.WON, forfeited: false, correctCount: 8, cups: 1 }));
  ok(isEligible({ result: STATUS.ELIMINATED, forfeited: false, correctCount: 7, cups: 0 }));
  ok(isEligible({ result: STATUS.ELIMINATED, forfeited: false, correctCount: 0, cups: 0 }));
  ok(!isEligible({ result: STATUS.ELIMINATED, forfeited: true, correctCount: 3, cups: 0 }), 'walked away with nothing won');
  ok(isEligible({ result: STATUS.ELIMINATED, forfeited: true, correctCount: 9, cups: 1 }), 'walked away as holders');
  ok(!isEligible({ result: STATUS.PLAYING, forfeited: false, correctCount: 2, cups: 0 }), 'still playing');
});
test('most cups ranks first, then the furthest round, then the 50:50 and time', () => {
  const out = (o) => entry({ result: STATUS.ELIMINATED, cups: 0, ...o });
  const rows = [
    out({ name: 'out-qf', correctCount: 5, durationMs: 1000 }),
    out({ name: 'out-sf-fifty', correctCount: 6, lifelineUsed: true, durationMs: 1000 }),
    out({ name: 'out-sf', correctCount: 6, durationMs: 90000 }),
    entry({ name: 'one-cup-fifty', cups: 1, lifelineUsed: true }),
    entry({ name: 'two-cups-fifty', cups: 2, correctCount: 13, lifelineUsed: true, durationMs: 999999 }),
    entry({ name: 'one-cup-then-qf', cups: 1, correctCount: 10, result: STATUS.ELIMINATED, lifelineUsed: true }),
    entry({ name: 'old-winner', cups: undefined }),
  ].sort(compareEntries).map((e) => e.name);
  eq(rows, ['two-cups-fifty', 'one-cup-then-qf', 'old-winner', 'one-cup-fifty', 'out-sf', 'out-sf-fifty', 'out-qf']);
});
test('a run that carries on updates its entry and never loses a place', () => {
  const others = [entry({ name: 'x', sessionId: 'x', durationMs: 70000 })];
  const first = entry({ name: 'me', sessionId: 'me', cups: 1, durationMs: 60000 });
  let r = upsertEntry(others, first);
  eq(r.rank, 1); eq(r.board.length, 2);
  // Knocked out straight away next season: same rounds won, more time on the clock. The first entry stays.
  r = upsertEntry(r.board, entry({ name: 'me', sessionId: 'me', cups: 1, result: STATUS.ELIMINATED, durationMs: 80000 }));
  eq(r.changed, false); eq(r.rank, 1); eq(r.board.length, 2);
  // A second cup replaces it instead of adding a second row.
  r = upsertEntry(r.board, entry({ name: 'me', sessionId: 'me', cups: 2, correctCount: 13, durationMs: 200000 }));
  eq(r.changed, true); eq(r.rank, 1); eq(r.board.length, 2); eq(r.board[0].cups, 2);
});
test('names are trimmed, capped and stripped of control characters', () => {
  eq(cleanText('  Jinky \n\t Johnstone  ', 20), 'Jinky Johnstone');
  eq(cleanText('x'.repeat(40), 20).length, 20);
  eq(cleanText(null, 20), '');
});
test('a game is found on the board by its session', () => {
  eq(rankOfSession([entry({ sessionId: 'a' }), entry({ sessionId: 'b' })], 'b'), 2);
  eq(rankOfSession([entry({ sessionId: 'a' })], 'z'), null);
});
test('time formatting', () => { eq(formatDuration(245000), '4:05'); eq(formatDuration(3729000), '1:02:09'); eq(formatDuration(null), '—'); });
test('a finished game records how long it took', () => {
  let st = reduce(initialState(stages), { type: 'START', questions: fakeQs, startedAt: '2026-01-01T00:00:00.000Z' });
  st = reduce(st, { type: 'SELECT', index: 1 });
  st = reduce(st, { type: 'REVEAL' });
  st = reduce(st, { type: 'ADVANCE', at: '2026-01-01T00:01:30.000Z' });
  eq(summarise(st).durationMs, 90000);
});

/* ---------------- Adverts ---------------- */
group('Adverts');
const ad = (o = {}) => ({ id: 'a', name: 'Ad', enabled: true, from: null, until: null, after: 'round-1', landscape: 'x.mp4', portrait: 'y.mp4', ...o });
test('an advert with no dates shows whenever it is switched on', () => {
  eq(advertStatus(ad(), '2026-11-14'), 'showing');
  eq(advertStatus(ad({ enabled: false }), '2026-11-14'), 'off');
});
test('start and end dates both count as showing days', () => {
  const xmas = ad({ from: '2026-12-01', until: '2026-12-25' });
  eq(advertStatus(xmas, '2026-11-30'), 'scheduled');
  eq(advertStatus(xmas, '2026-12-01'), 'showing');
  eq(advertStatus(xmas, '2026-12-25'), 'showing');
  eq(advertStatus(xmas, '2026-12-26'), 'expired');
});
test('switching an advert off beats its dates, and no video means it cannot play', () => {
  eq(advertStatus(ad({ enabled: false, from: '2026-01-01' }), '2026-06-01'), 'off');
  eq(advertStatus(ad({ landscape: null, portrait: null }), '2026-06-01'), 'no-video');
});
test('only adverts showing today after the stage take turns, in the order listed', () => {
  const list = [ad({ id: '1' }), ad({ id: '2', until: '2026-01-01' }), ad({ id: '3', after: 'round-2' }), ad({ id: '4' })];
  eq(showingAfter(list, 'round-1', '2026-06-01').map((a) => a.id), ['1', '4']);
  eq(showingAfter(list, 'final', '2026-06-01'), []);
});
test('advert problems are spotted', () => {
  eq(advertProblems(ad(), ['round-1']), []);
  ok(advertProblems(ad({ from: '2026-12-25', until: '2026-12-01' })).some((p) => p.includes('before the start')));
  ok(advertProblems(ad({ url: 'celticpools.com' })).some((p) => p.includes('https://')));
  ok(advertProblems(ad({ after: 'final' }), ['round-1']).some((p) => p.includes('stage')));
});
test('dates are the player\'s local day as YYYY-MM-DD', () => { eq(dayKey(new Date(2026, 0, 5, 23, 30)), '2026-01-05'); });
const advertsFile = await fetchJson('../editions/celtic/data/adverts.json');
test('the Celtic adverts file has no problems', () => {
  for (const a of advertsFile.adverts) eq(advertProblems(a, stages.map((s) => s.key)), [], a.name);
});

/* ---------------- Render ---------------- */
const out = document.getElementById('results');
const passed = results.filter((r) => r.ok).length;
document.getElementById('summary').textContent = `${passed} / ${results.length} passed`;
document.getElementById('summary').className = passed === results.length ? 'pass' : 'fail';
let last = '';
out.innerHTML = results.map((r) => {
  const head = r.group !== last ? `<h2>${r.group}</h2>` : '';
  last = r.group;
  return `${head}<div class="t ${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✕'} ${r.name}${r.ok ? '' : `<pre>${String(r.err?.message ?? r.err)}</pre>`}</div>`;
}).join('');
window.__testResults = { passed, total: results.length, failures: results.filter((r) => !r.ok).map((r) => `${r.group} › ${r.name}: ${r.err?.message}`) };
