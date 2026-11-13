// Safe, namespaced wrappers around localStorage / sessionStorage.
// Storage can be missing, full, or blocked (private mode), so every call is guarded.

import { APP } from './config.js';

function make(area) {
  const get = () => {
    try { return window[area]; } catch { return null; }
  };
  return {
    read(key, fallback = null) {
      try {
        const raw = get()?.getItem(APP.storagePrefix + key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        console.warn(`[storage] could not read ${key}`, err);
        return fallback;
      }
    },
    write(key, value) {
      try {
        get()?.setItem(APP.storagePrefix + key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn(`[storage] could not write ${key}`, err);
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
          window.dispatchEvent(new CustomEvent('storage-full', { detail: { key } }));
        }
        return false;
      }
    },
    remove(key) {
      try { get()?.removeItem(APP.storagePrefix + key); } catch { /* ignore */ }
    },
  };
}

export const local = make('localStorage');
export const session = make('sessionStorage');

export const KEYS = {
  stats: 'stats',
  seen: 'seen',
  settings: 'settings',
  adminWorking: 'admin:working',
  adminAudit: 'admin:audit',
  adminReviewStatus: 'admin:reviewStatus',
  gameSnapshot: 'game:snapshot',
  leaderboard: 'leaderboard',
  boardReset: 'leaderboard:reset',
  player: 'player',
};
