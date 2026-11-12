// The admin's unpublished working copy, kept in localStorage.
// The game also reads it so an admin can preview changes before publishing.

import { local, KEYS } from '../core/storage.js';

export function readWorkingCopy() {
  const w = local.read(KEYS.adminWorking, null);
  if (!w || !Array.isArray(w.pending) || !Array.isArray(w.approved) || !Array.isArray(w.rejected)) return null;
  return w;
}

export function writeWorkingCopy(working) {
  return local.write(KEYS.adminWorking, working);
}

export function clearWorkingCopy() {
  local.remove(KEYS.adminWorking);
}
