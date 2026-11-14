// Writes the three question files back to disk, and the adverts file (data/adverts.json).
// Chrome/Edge: File System Access API (pick data/questions once, or data for adverts, then save directly).
// Other browsers: download the files to copy into the folder manually.

import { COLLECTIONS, APP } from '../core/config.js';
import { toFile } from './json-file-source.js';

const FILE_NAMES = {
  pending: 'pending-questions.json',
  approved: 'approved-questions.json',
  rejected: 'rejected-questions.json',
};

const DB = 'wwtwtec-admin';
const STORE = 'handles';

export const supportsDirectSave = () => typeof window.showDirectoryPicker === 'function';

/**
 * Chrome/Edge hide showDirectoryPicker on non-secure pages, e.g. http://192.168.x.x:5500.
 * Returns the same page on 127.0.0.1 (which counts as secure) when that is the problem, else null.
 */
export function secureAddressHint() {
  if (supportsDirectSave() || window.isSecureContext) return null;
  const chromium = /Chrome|Edg\//.test(navigator.userAgent);
  if (!chromium) return null;
  const { protocol, port, pathname, search, hash } = window.location;
  return `${protocol}//127.0.0.1${port ? ':' + port : ''}${pathname}${search}${hash}`;
}

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      try {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err); // e.g. the browser can't store the folder: carry on without remembering it
      }
    };
  });
}

// Each edition remembers its own folder, so one edition's questions can never be saved into another's.
const handleKey = () => `questionsDir:${APP.club}`;

async function getSavedHandle(key = handleKey()) {
  try { return await idb('readonly', (s) => s.get(key)); } catch { return null; }
}
async function saveHandle(handle, key = handleKey()) {
  try { await idb('readwrite', (s) => s.put(handle, key)); } catch { /* not critical */ }
}
export async function forgetFolder() {
  try { await idb('readwrite', (s) => s.delete(handleKey())); } catch { /* ignore */ }
}

/** Where this edition's question files live, for messages. */
export const questionsFolder = () => `editions/${APP.club}/data/questions`;

async function ensurePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

/** Returns a folder handle, asking the user to pick data/questions if needed. */
async function getFolder({ forcePick = false } = {}) {
  let handle = forcePick ? null : await getSavedHandle();
  if (handle && !(await ensurePermission(handle))) handle = null;
  if (!handle) {
    handle = await window.showDirectoryPicker({ id: `questions-${APP.club}`, mode: 'readwrite' });
    await saveHandle(handle);
  }
  return handle;
}

/** @returns {{method:'direct'|'download', folder?:string}} */
export async function publish(collections, { forcePick = false } = {}) {
  const files = COLLECTIONS.map((c) => ({ name: FILE_NAMES[c], data: toFile(c, collections[c]) }));

  if (supportsDirectSave()) {
    const folder = await getFolder({ forcePick });
    if (folder.name !== 'questions') {
      const ok = window.confirm(`You picked the folder "${folder.name}". The game reads from "${questionsFolder()}". Save here anyway?`);
      if (!ok) { await forgetFolder(); throw new DOMException('Publishing cancelled', 'AbortError'); }
    }
    for (const f of files) {
      const fh = await folder.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(f.data, null, 2) + '\n');
      await w.close();
    }
    return { method: 'direct', folder: folder.name };
  }

  files.forEach((f) => downloadJson(f.name, f.data));
  return { method: 'download' };
}

export function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Adverts (data/adverts.json) ---------- */

const ADVERTS_FILE = 'adverts.json';
const dataKey = () => `dataDir:${APP.club}`;

/** Where this edition's adverts file lives, for messages. */
export const advertsPath = () => `editions/${APP.club}/data/${ADVERTS_FILE}`;

/** True if the folder is this edition's data folder (it holds an edition.json with this edition's id). */
async function isEditionDataFolder(folder) {
  try {
    const file = await (await folder.getFileHandle('edition.json')).getFile();
    return JSON.parse(await file.text())?.id === APP.club;
  } catch { return false; }
}

async function getDataFolder({ forcePick = false } = {}) {
  let handle = forcePick ? null : await getSavedHandle(dataKey());
  if (handle && !(await ensurePermission(handle))) handle = null;
  if (!handle) {
    handle = await window.showDirectoryPicker({ id: `data-${APP.club}`, mode: 'readwrite' });
    if (!(await isEditionDataFolder(handle))) {
      throw new Error(`That isn't the ${APP.club} edition's data folder. Pick editions/${APP.club}/data (the folder with edition.json in it).`);
    }
    await saveHandle(handle, dataKey());
  }
  return handle;
}

/**
 * Saves the adverts file. The first time, Chrome/Edge ask for the edition's data folder.
 * @returns {{method:'direct'|'download'}}
 */
export async function saveAdvertsFile(data, { forcePick = false } = {}) {
  if (supportsDirectSave()) {
    const folder = await getDataFolder({ forcePick });
    const fh = await folder.getFileHandle(ADVERTS_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(data, null, 2) + '\n');
    await w.close();
    return { method: 'direct' };
  }
  downloadJson(ADVERTS_FILE, data);
  return { method: 'download' };
}
