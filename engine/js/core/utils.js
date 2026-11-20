// Small shared helpers.

/** Fisher–Yates shuffle (returns a new array). `rand` is injectable for tests. */
export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandom(arr, rand = Math.random) {
  return arr[Math.floor(rand() * arr.length)];
}

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalise(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words so common in quiz questions that they say nothing about whether two questions match.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'was', 'were', 'which', 'what', 'who', 'whom', 'whose', 'where', 'when', 'did', 'does',
  'has', 'have', 'had', 'from', 'with', 'that', 'this', 'into', 'their', 'celtic', 'beatles', 'club', 'team',
]);

export function words(text) {
  return normalise(text).split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Share of words two texts have in common (0–1). */
export function similarity(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  A.forEach((w) => { if (B.has(w)) shared++; });
  return shared / Math.max(A.size, B.size);
}

export function nowIso() { return new Date().toISOString(); }

/** Next free id like q_000123, given existing ids. */
export function nextQuestionId(existingIds) {
  let max = 0;
  existingIds.forEach((id) => {
    const n = parseInt(String(id).replace(/\D/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  });
  return 'q_' + String(max + 1).padStart(6, '0');
}

export function deepClone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

export const LETTERS = ['A', 'B', 'C', 'D'];
