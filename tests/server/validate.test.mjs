import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkResult } from '../../server/top100/validate.js';
import { celtic, playRun } from './helpers.mjs';

const passes = (entry) => checkResult(entry, celtic);

test('real games from the engine pass', () => {
  const cases = {
    'out on the first question': [0],
    'out in the semi final': [6],
    'won once, still holders': [null],
    'won, then out in season 2': [null, 3],
    'won twice': [null, null],
    'won three times, then out at the first hurdle': [null, null, null, 0],
  };
  for (const [name, plan] of Object.entries(cases)) {
    const r = passes(playRun(plan).entry);
    assert.equal(r.ok, true, `${name}: ${r.why}`);
  }
  assert.equal(passes(playRun([null], { retire: true }).entry).ok, true, 'retired champion');
  assert.equal(passes(playRun([null, 2], { forfeitAt: true }).entry).ok, true, 'holder who walked away');
  assert.equal(passes(playRun([4], { fifty: true }).entry).ok, true, 'used the 50:50');
});

test('made-up results are rejected', () => {
  const base = playRun([null, 3]).entry;
  const bad = {
    'more cups than rounds won': { ...base, cups: 5 },
    'rounds won that no season could have': { ...base, correctCount: 30 },
    'wrong stage for the rounds won': { ...base, stageReachedIndex: 7, stageKey: 'final' },
    'stage key does not match': { ...base, stageKey: 'final' },
    'season does not match cups': { ...base, season: 1 },
    'rounds played does not add up': { ...base, roundsPlayed: 2 },
    'impossibly fast': { ...base, durationMs: 1000 },
    'won with no cup': { ...playRun([null]).entry, cups: 0, season: 0 },
    'not finished': { ...base, result: 'playing' },
    'walked away with nothing won': playRun([3], { forfeitAt: true }).entry,
    'numbers as text': { ...base, cups: '1' },
  };
  for (const [name, entry] of Object.entries(bad)) {
    assert.equal(passes(entry).ok, false, name);
  }
});

test('the stored entry comes from the server, not the client label', () => {
  const r = passes({ ...playRun([2]).entry, stageReachedLabel: 'Won the World Cup' });
  assert.equal(r.ok, true);
  assert.equal('stageReachedLabel' in r.entry, false);
});
