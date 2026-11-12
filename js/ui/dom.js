// Tiny DOM helpers.

export { escapeHtml as esc } from '../core/search.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Parses an HTML string into a single element (or fragment if several roots). */
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

/** Replaces a container's contents. */
export function mount(container, node) {
  container.replaceChildren(typeof node === 'string' ? html(node) : node);
  return container;
}

/** Delegated event listener. */
export function on(root, type, selector, fn) {
  const handler = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) fn(e, target);
  };
  root.addEventListener(type, handler);
  return () => root.removeEventListener(type, handler);
}

let liveRegion;
/** Screen-reader announcement. */
export function announce(message) {
  if (!liveRegion) {
    liveRegion = document.getElementById('live') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'live', className: 'sr-only' }));
    liveRegion.setAttribute('aria-live', 'assertive');
  }
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = message; }, 30);
}
