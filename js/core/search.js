// Filtering and text search for the admin review list.

import { normalise } from './utils.js';

/** Text that search looks through: question, answers, tags, category and stage labels. */
export function searchText(q, meta) {
  return normalise([
    q.id,
    q.question,
    ...(q.options ?? []),
    ...(q.tags ?? []),
    meta?.categoryLabel(q.category),
    meta?.stageLabel(q.stage),
  ].join(' '));
}

const ID_IN_QUERY = /\bq_?(\d{1,6})\b/gi;

/** Question ids in a query: q_000527, q527 or q_527 all mean q_000527. */
export function idsInQuery(query) {
  return [...String(query ?? '').matchAll(ID_IN_QUERY)].map((m) => 'q_' + m[1].padStart(6, '0'));
}

/**
 * Every word in the query must appear somewhere (AND search).
 * Ids are the exception: "q_000527 q_000528" finds either question.
 */
export function matchesQuery(q, query, meta) {
  const ids = idsInQuery(query);
  if (ids.length && !ids.includes(String(q.id))) return false;
  const terms = normalise(String(query ?? '').replace(ID_IN_QUERY, ' ')).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const hay = searchText(q, meta);
  return terms.every((t) => hay.includes(t));
}

/**
 * @param {Array<{q, status}>} rows
 * @param {object} f  { stage, category, difficulty, status, query }
 */
export function applyFilters(rows, f, meta) {
  return rows.filter(({ q, status }) =>
    (!f.status || status === f.status) &&
    (!f.stage || q.stage === f.stage) &&
    (!f.category || q.category === f.category) &&
    (!f.difficulty || String(q.difficulty) === String(f.difficulty)) &&
    matchesQuery(q, f.query ?? '', meta)
  );
}

/** Wraps matched terms in <mark>. Input is escaped first. */
export function highlight(text, query) {
  const safe = escapeHtml(text);
  const terms = normalise(query).split(' ').filter((t) => t.length > 1);
  if (!terms.length) return safe;
  const pattern = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
  return safe.replace(pattern, '<mark>$1</mark>');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
