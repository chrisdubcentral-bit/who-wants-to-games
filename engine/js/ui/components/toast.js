// Small notifications, optionally with an action button (e.g. Undo).

import { esc } from '../dom.js';

function region() {
  let r = document.querySelector('.toast-region');
  if (!r) {
    r = document.createElement('div');
    r.className = 'toast-region';
    r.setAttribute('role', 'status');
    r.setAttribute('aria-live', 'polite');
    document.body.appendChild(r);
  }
  return r;
}

/** @param {{message, tone?:'success'|'danger'|'gold', actionLabel?, onAction?, duration?}} o */
export function toast({ message, tone = '', actionLabel, onAction, duration = 4500 }) {
  const t = document.createElement('div');
  t.className = `toast ${tone ? 'is-' + tone : ''}`;
  t.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  const remove = () => t.remove();
  if (actionLabel) t.querySelector('button').addEventListener('click', () => { onAction?.(); remove(); });
  region().appendChild(t);
  setTimeout(remove, duration);
  return remove;
}
