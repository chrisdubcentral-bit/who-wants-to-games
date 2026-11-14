import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWordFilter, normalise } from '../../server/top100/word-filter.js';
import { bannedWords } from './helpers.mjs';

const filter = createWordFilter(bannedWords);
const blocked = (text, edition = 'celtic') => !filter.check(text, edition).ok;

test('ordinary names and towns pass', () => {
  for (const s of ['Jinky Johnstone', "Seán O'Neill", 'Bobby Murdoch', 'Coatbridge', 'Uddingston', 'Ballieston',
    'Dún Laoghaire', 'Kraków', 'São Paulo', 'Hunter', 'Rangel', 'Glasgow', 'Billy McNeill', 'Celtic 1888', 'Assen',
    'Scunthorpe', 'Penistone', 'Shitterton Dorset', 'Cockenzie', 'Essex', 'Middlesex', 'Hancock', 'Peterhead', 'St. Andrews']) {
    assert.equal(blocked(s), false, s);
  }
});

test('banned words are blocked, including common disguises', () => {
  for (const s of ['shite', 'Shite FC', 'f u c k', 'fuuuuck', 'FUCKFACE', 'sh1t', '$hit', 'c.u.n.t', 'cunts', 'wankers']) {
    assert.equal(blocked(s), true, s);
  }
});

test('look-alike letters from other alphabets and invisible characters are seen through', () => {
  assert.equal(blocked('fеnian'), true, 'Cyrillic е');
  assert.equal(blocked('fe​nian'), true, 'zero-width space');
  assert.equal(normalise('Ѕhіt'), 'shit');
});

test('edition-only words apply to that edition only', () => {
  assert.equal(blocked('Huns', 'celtic'), true);
  assert.equal(blocked('No Surrender', 'celtic'), true);
  assert.equal(blocked('1690', 'celtic'), true);
  assert.equal(blocked('Huns', 'other-club'), false);
});

test('links, emoji and symbols are not allowed', () => {
  assert.equal(filter.check('www.example', 'celtic').reason, 'link');
  assert.equal(filter.check('mysite.com', 'celtic').reason, 'link');
  assert.equal(filter.check('Bob 🖕', 'celtic').reason, 'characters');
  assert.equal(filter.check('<b>Bob</b>', 'celtic').reason, 'characters');
});
