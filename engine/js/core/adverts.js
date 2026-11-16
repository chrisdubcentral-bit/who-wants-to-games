// The edition's adverts (data/adverts.json) and the rules for which ones are showing on a given day.
// Pure apart from the loaded list, so the game, the admin page and the tests all use the same rules.
//
// Each advert: { id, name, enabled, from, until, after, label, url, linkText, landscape, portrait, skipAfterMs }
//   enabled      false switches it off whatever the dates say
//   from, until  optional 'YYYY-MM-DD' dates, both inclusive, in the player's own time zone
//   after        the stage key it plays after (e.g. "round-1"); adverts sharing a stage take turns
//
// The file's "order" says how adverts are chosen:
//   'turns'   (the default) each advert plays after its own stage; adverts sharing a stage take turns
//   'random'  every stage that has an advert is an advert break, and each break plays one of all the adverts
//             showing today, picked at random, with no advert shown twice in the same game

export const ORDERS = ['turns', 'random'];

let adverts = [];
let order = 'turns';

export function setAdverts(list, newOrder = 'turns') {
  adverts = Array.isArray(list) ? list.filter((a) => a && typeof a === 'object') : [];
  order = ORDERS.includes(newOrder) ? newOrder : 'turns';
}
export const getAdverts = () => adverts;
export const getAdvertOrder = () => order;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v) => typeof v === 'string' && DAY.test(v);

/** Today (or the given date) as 'YYYY-MM-DD' in local time. */
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Where an advert stands on the given day:
 *   'showing'   plays in the game today
 *   'off'       switched off
 *   'scheduled' switched on, but its start date hasn't come yet
 *   'expired'   switched on, but its end date has passed
 *   'no-video'  has no video file, so it can't play
 */
export function advertStatus(ad, today = dayKey()) {
  if (!ad || (!ad.landscape && !ad.portrait)) return 'no-video';
  if (ad.enabled === false) return 'off';
  if (isDay(ad.from) && today < ad.from) return 'scheduled';
  if (isDay(ad.until) && today > ad.until) return 'expired';
  return 'showing';
}

export const isShowing = (ad, today) => advertStatus(ad, today) === 'showing';

/** The adverts showing today after the given stage, in the order listed. */
export function showingAfter(list, stageKey, today = dayKey()) {
  return (Array.isArray(list) ? list : []).filter((a) => a && a.after === stageKey && isShowing(a, today));
}

/** The stages that have an advert break today (at least one advert showing after them). */
export function breakStages(list, today = dayKey()) {
  return [...new Set((Array.isArray(list) ? list : []).filter((a) => a && isShowing(a, today)).map((a) => a.after))];
}

/**
 * Random order: the advert for the break after the given stage, or undefined if that stage has no break.
 * Picked from every advert showing today, leaving out the ones already shown this game (usedIds) while
 * there are others left.
 */
export function randomAfter(list, stageKey, usedIds = [], rand = Math.random, today = dayKey()) {
  if (!breakStages(list, today).includes(stageKey)) return undefined;
  const showing = list.filter((a) => a && isShowing(a, today));
  const unseen = showing.filter((a) => !usedIds.includes(a.id));
  const pool = unseen.length ? unseen : showing;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Problems that would stop an advert working properly (shown on the admin page, checked by the build). */
export function advertProblems(ad, stageKeys = null) {
  const out = [];
  if (!ad.name?.trim()) out.push('Give it a name.');
  if (!ad.landscape && !ad.portrait) out.push('Add at least one video file.');
  if (!ad.after || (stageKeys && !stageKeys.includes(ad.after))) out.push('Choose the stage it plays after.');
  if (ad.from && !isDay(ad.from)) out.push('The start date is not a valid date.');
  if (ad.until && !isDay(ad.until)) out.push('The end date is not a valid date.');
  if (isDay(ad.from) && isDay(ad.until) && ad.until < ad.from) out.push('The end date is before the start date.');
  if (ad.url && !/^https?:\/\//i.test(ad.url)) out.push('The link must start with https:// (or http://).');
  if (ad.skipAfterMs != null && !(Number.isFinite(ad.skipAfterMs) && ad.skipAfterMs >= 0)) out.push('The skip delay must be a number of seconds.');
  return out;
}
