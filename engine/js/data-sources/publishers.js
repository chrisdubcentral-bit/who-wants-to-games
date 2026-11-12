// Writes the three question files back to disk.
// Chrome/Edge: File System Access API (pick data/questions once, then save directly).
// Other browsers: download the three files to copy into data/questions manually.

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
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

// Each edition remembers its own folder, so one edition's questions can never be saved into another's.
const handleKey = () => `questionsDir:${APP.club}`;

async function getSavedHandle() {
  try { return await idb('readonly', (s) => s.get(handleKey())); } catch { return null; }
}
async function saveHandle(handle) {
  try { await idb('readwrite', (s) => s.put(handle, handleKey())); } catch { /* not critical */ }
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
