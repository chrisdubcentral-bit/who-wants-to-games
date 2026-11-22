// The edition's wording and settings (team, prize, headlines...), loaded from data/edition.json.
// Screens call t('section.key', { vars }) instead of writing edition-specific text into the code.
// {placeholders} are filled from the vars passed in, then from the edition's own "vars".

let edition = { id: 'game', vars: {}, seasons: {}, images: {}, text: {} };

export function setEdition(e) {
  if (e && typeof e === 'object') edition = { ...edition, ...e, vars: e.vars ?? {}, text: e.text ?? {} };
}

export const getEdition = () => edition;

/** The edition's own value for a key, e.g. ed('seasons.restartStage'). */
export function ed(path, fallback = undefined) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), edition);
  return v ?? fallback;
}

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (m, k) =>
  (vars[k] ?? edition.vars[k] ?? m));

/** Plain text for a key (escape it before putting it in HTML). A missing key shows the key itself. */
export function t(path, vars = {}) {
  const v = ed('text.' + path);
  if (v == null) {
    console.warn(`[edition] missing text: ${path}`);
    return path;
  }
  return fill(v, vars);
}

/** Wording the pure game engine needs for its summary. */
export function summaryLabels() {
  return { champion: edition.vars.champion, outIn: t('results.outIn'), leftIn: t('results.leftIn') };
}

/** "1 European Cup" / "3 European Cups". */
export function prizeCount(n) {
  return `${n} ${n === 1 ? edition.vars.prize : edition.vars.prizes}`;
}

/** What the edition calls each run after the first win: "Season" unless its vars say otherwise ("Season 2"). */
export const seasonName = () => edition.vars.season ?? 'Season';

/** Label for the button that starts the next season; an edition can set its own wording in text.results.seasonButton. */
export const seasonButton = (n) => ed('text.results.seasonButton') || `Start ${seasonName()} ${n}`;
