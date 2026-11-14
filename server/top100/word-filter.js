// Checks Top 100 names and towns against moderation/banned-words.json.
// Pure: no I/O, so it's easy to test (tests/server/word-filter.test.mjs).

const ZERO_WIDTH = /[​-‏‪-‮⁠-⁯﻿­]/g;

// Digits and symbols people use in place of letters.
const LEET = { 0: 'o', 1: 'i', '!': 'i', '|': 'i', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', '+': 't', 8: 'b', 9: 'g' };

// Letters from other alphabets that look like Latin ones (Cyrillic and Greek).
const LOOKALIKE = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
};

/** Lower case, no accents, look-alikes and leetspeak turned into plain letters. */
export function normalise(text) {
  return String(text ?? '')
    .replace(ZERO_WIDTH, '')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/./gu, (c) => LOOKALIKE[c] ?? LEET[c] ?? c);
}

const SEP = '[^a-z0-9]*'; // allows f.u.c.k and f u c k
const escapeRe = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pattern for one banned entry: each letter may repeat (fuuuck) and be split by spaces or dots. */
function patternFor(entry, wholeWord) {
  const letters = [...normalise(entry).replace(/[^a-z0-9]/g, '')];
  if (!letters.length) return null;
  const core = letters.map((c) => `${escapeRe(c)}+`).join(SEP);
  return wholeWord ? `(?<![a-z0-9])${core}(?:e?s)?(?![a-z0-9])` : core;
}

function compile(words = [], anywhere = []) {
  const parts = [
    ...words.map((w) => patternFor(w, true)),
    ...anywhere.map((w) => patternFor(w, false)),
  ].filter(Boolean);
  return parts.length ? new RegExp(parts.join('|')) : null;
}

const LINK = /(https?:|www\.|\.(com|net|org|co|uk|io|gg|ly|me|tv|xyz|ru)\b|discord|t\.me\/)/i;
// Letters (any alphabet), digits, spaces and a little punctuation: no emoji or symbols.
const ALLOWED = /^[\p{L}\p{M}\p{N} '’.,&()-]+$/u;

/**
 * Builds a checker from the parsed banned-words.json.
 * check(text, edition) → { ok: true } or { ok: false, reason: 'word' | 'link' | 'characters' }.
 */
export function createWordFilter(list = {}) {
  const shared = { words: list.words ?? [], anywhere: list.anywhere ?? [] };
  const cache = new Map();
  const regexFor = (edition) => {
    if (!cache.has(edition)) {
      const extra = list.editions?.[edition] ?? {};
      cache.set(edition, compile([...shared.words, ...(extra.words ?? [])], [...shared.anywhere, ...(extra.anywhere ?? [])]));
    }
    return cache.get(edition);
  };

  return {
    check(text, edition) {
      const raw = String(text ?? '').replace(ZERO_WIDTH, '');
      if (!ALLOWED.test(raw)) return { ok: false, reason: 'characters' };
      if (LINK.test(raw)) return { ok: false, reason: 'link' };
      const re = regexFor(edition);
      if (re && re.test(normalise(raw))) return { ok: false, reason: 'word' };
      return { ok: true };
    },
  };
}

/** Removes invisible characters that could hide a banned word or spoof a name. */
export const stripInvisible = (text) => String(text ?? '').replace(ZERO_WIDTH, '');
