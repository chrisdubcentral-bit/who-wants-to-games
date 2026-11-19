import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withOwnEntries, LIMIT } from '../../engine/js/game/ranking.js';

const entry = (id, cups, extra = {}) => ({ id, name: `P${id}`, cups, correctCount: cups * 8, lifelineUsed: false, durationMs: 60000, date: '2026-11-19T10:00:00Z', ...extra });

test('a cached board gets this device\'s newer entries, in their right place', () => {
  const cached = [entry(1, 3), entry(2, 1)];
  const fresh = [entry(1, 3), entry(9, 2), entry(2, 1)];
  assert.deepEqual(withOwnEntries(cached, fresh, new Set([9])).map((e) => e.id), [1, 9, 2]);
});

test('a champion\'s updated entry replaces the older cached copy', () => {
  const cached = [entry(1, 3), entry(9, 1)];
  const fresh = [entry(9, 4), entry(1, 3)];
  const board = withOwnEntries(cached, fresh, new Set([9]));
  assert.deepEqual(board.map((e) => [e.id, e.cups]), [[9, 4], [1, 3]]);
});

test('other players\' entries come from the cached board, and the board stays at its limit', () => {
  const cached = Array.from({ length: LIMIT }, (_, i) => entry(i + 1, 50 - Math.floor(i / 3)));
  const fresh = [entry(500, 99), entry(777, 1)];
  const board = withOwnEntries(cached, fresh, new Set([500]));
  assert.equal(board.length, LIMIT);
  assert.equal(board[0].id, 500);
  assert.equal(board.some((e) => e.id === 777), false, 'only this device\'s entries are taken from the fresh board');
  assert.equal(withOwnEntries(cached, fresh, new Set()), cached, 'nothing to add: the cached board as it was');
});
