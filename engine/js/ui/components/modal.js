// Accessible modal dialog. Returns a promise resolving to the chosen action value.

import { html, esc } from '../dom.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.message]  plain text
 * @param {Node|string} [o.body] extra content (string is HTML — escape before passing)
 * @param {Array<{label, value, className}>} o.actions
 * @param {function} [o.onAction] called with (value, modalEl); return false to keep it open
 */
export function openModal({ title, message = '', body = null, actions, onAction }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const titleId = 'm-' + Math.random().toString(36).slice(2);
    const el = html(`
      <div class="modal-backdrop" role="presentation">
        <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
          <h2 id="${titleId}">${esc(title)}</h2>
          ${message ? `<p>${esc(message)}</p>` : ''}
          <div class="modal-body" ${body ? '' : 'hidden'}></div>
          <div class="modal-actions">
            ${actions.map((a, i) => `<button type="button" class="btn ${a.className ?? ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
          </div>
        </div>
      </div>`);
    if (body) el.querySelector('.modal-body').append(typeof body === 'string' ? html(body) : body);

    const close = (value) => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      prevFocus?.focus?.();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Tab') trapFocus(e, el);
    };

    el.addEventListener('click', (e) => {
      if (e.target === el) return close(null);
      const btn = e.target.closest('[data-i]');
      if (!btn) return;
      const action = actions[Number(btn.dataset.i)];
      if (onAction && onAction(action.value, el) === false) return;
      close(action.value);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    (el.querySelector('input, select, textarea') ?? el.querySelector('.modal-actions .btn'))?.focus();
  });
}

export const confirmModal = (title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false) =>
  openModal({
    title, message,
    actions: [
      { label: cancelLabel, value: false, className: 'btn-ghost' },
      { label: confirmLabel, value: true, className: danger ? 'btn-danger' : 'btn-primary' },
    ],
  }).then((v) => v === true);

function trapFocus(e, root) {
  const f = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
