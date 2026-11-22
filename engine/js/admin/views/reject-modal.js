import { openModal } from '../../ui/components/modal.js';
import { REJECTION_REASONS } from '../../core/config.js';
import { esc } from '../../ui/dom.js';

/**
 * Asks for a rejection reason. Pass a question, or a number to reject that many in one go.
 * Resolves to { reason, note } or null if cancelled.
 */
export function askRejection(question) {
  let picked = null;
  const many = typeof question === 'number';
  const summary = many
    ? `The same reason and note will be recorded for all ${question} ticked question${question === 1 ? '' : 's'}.`
    : esc(question.question);
  const body = `
    <div style="display:grid;gap:16px">
      <p class="muted" style="font-size:.875rem">${summary}</p>
      <div class="field">
        <label for="rj-reason">Reason</label>
        <select id="rj-reason" class="select">
          ${REJECTION_REASONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="rj-note">Note <span data-req hidden>(required)</span></label>
        <textarea id="rj-note" class="textarea" rows="3" placeholder="Optional details for the record"></textarea>
        <span class="field-error" data-err hidden>Please add a note when choosing "Other".</span>
      </div>
    </div>`;

  return openModal({
    title: many ? `Reject ${question} question${question === 1 ? '' : 's'}` : 'Reject question',
    body,
    actions: [
      { label: 'Cancel', value: null, className: 'btn-ghost' },
      { label: many ? `Reject ${question}` : 'Reject', value: 'reject', className: 'btn-danger' },
    ],
    onAction(value, el) {
      if (value !== 'reject') return true;
      const reason = el.querySelector('#rj-reason').value;
      const note = el.querySelector('#rj-note').value.trim();
      if (reason === 'Other' && !note) {
        el.querySelector('[data-err]').hidden = false;
        el.querySelector('#rj-note').classList.add('is-invalid');
        el.querySelector('#rj-note').focus();
        return false;
      }
      picked = { reason, note };
      return true;
    },
  }).then((v) => (v === 'reject' ? picked : null));
}

// Show "(required)" when Other is selected.
document.addEventListener('change', (e) => {
  if (e.target.id !== 'rj-reason') return;
  const modal = e.target.closest('.modal');
  modal.querySelector('[data-req]').hidden = e.target.value !== 'Other';
});
