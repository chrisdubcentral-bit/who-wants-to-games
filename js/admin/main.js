// Admin bootstrap: router, navigation and the publish bar.

import { loadMeta } from '../core/config.js';
import { bus } from '../core/events.js';
import { mount, esc, on } from '../ui/dom.js';
import { toast } from '../ui/components/toast.js';
import { openModal, confirmModal } from '../ui/components/modal.js';
import { supportsDirectSave, secureAddressHint } from '../data-sources/publishers.js';
import { createAdminStore } from './admin-store.js';
import * as dashboard from './views/dashboard.js';
import * as reviewList from './views/review-list.js';
import * as editForm from './views/edit-form.js';

const root = document.getElementById('admin');
const nav = document.getElementById('admin-nav');
const publishZone = document.getElementById('publish-zone');
let cleanup = null;
const ctx = { bus };

function parseHash() {
  const raw = location.hash.slice(1) || 'dashboard';
  const [path, qs = ''] = raw.split('?');
  return { path, params: new URLSearchParams(qs) };
}

function go(route) {
  if (location.hash.slice(1) === route) renderRoute();
  else location.hash = route;
}

function renderRoute() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const { path, params } = parseHash();
  let section = 'dashboard';
  if (path === 'review') { section = 'review'; cleanup = reviewList.render(root, ctx, params); }
  else if (path.startsWith('edit/')) { section = 'review'; cleanup = editForm.render(root, ctx, decodeURIComponent(path.slice(5))); }
  else if (path === 'new') { section = 'new'; cleanup = editForm.render(root, ctx, null); }
  else { cleanup = dashboard.render(root, ctx); }
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('is-active', a.dataset.section === section));
  window.scrollTo({ top: 0 });
}

function drawPublishZone() {
  const { store } = ctx;
  const c = store.counts();
  nav.querySelector('[data-section="review"] .n').textContent = c.pending ? ` (${c.pending})` : '';
  publishZone.innerHTML = store.dirty
    ? `<span class="badge badge-gold dirty-badge">Unpublished changes</span>
       ${store.canUndo ? `<button class="btn btn-ghost btn-sm" data-action="undo" title="${esc(store.undoLabel)}">Undo</button>` : ''}
       <button class="btn btn-ghost btn-sm" data-action="discard">Discard</button>
       <button class="btn btn-primary btn-sm" data-action="publish">Publish</button>`
    : `<span class="muted" style="font-size:.75rem">${store.publishedAt ? 'All changes published' : 'Up to date with the question files'}</span>`;
}

async function doPublish() {
  const { store } = ctx;
  // On a network address (e.g. http://192.168.1.72:5500) Chrome/Edge won't allow saving into the folder.
  const secureUrl = secureAddressHint();
  if (secureUrl) {
    const ok = await confirmModal(
      'Download the question files?',
      `This page is open on a network address (${window.location.host}), so the browser won't let Publish save straight into data/questions. ` +
      'Three files will download now: copy them into data/questions, replacing the old ones. ' +
      `Next time, open the admin page at ${secureUrl.split('#')[0]} and Publish will save the files directly. ` +
      '(Unpublished changes are kept separately for each address, so finish publishing these here first.)',
      'Download', 'Cancel',
    );
    if (!ok) return;
  } else if (!supportsDirectSave()) {
    const ok = await confirmModal(
      'Download the question files?',
      'This browser can\'t save straight to your project folder. Three files will download — copy them into data/questions, replacing the old ones. (Chrome or Edge can save directly.)',
      'Download', 'Cancel',
    );
    if (!ok) return;
  }
  try {
    const res = await store.publish();
    if (res.method === 'direct') {
      toast({ message: 'Published — the game now uses these questions', tone: 'success' });
    } else {
      const done = await openModal({
        title: 'Files downloaded',
        message: 'Copy pending-questions.json, approved-questions.json and rejected-questions.json into the data/questions folder. Then mark this as published.',
        actions: [
          { label: 'Not yet', value: false, className: 'btn-ghost' },
          { label: "I've copied them", value: true, className: 'btn-primary' },
        ],
      });
      if (done) { store.markPublished(); toast({ message: 'Marked as published', tone: 'success' }); }
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error(err);
    toast({ message: `Publish failed: ${err.message}`, tone: 'danger' });
  }
}

async function boot() {
  try {
    ctx.meta = await loadMeta();
    ctx.store = createAdminStore(ctx.meta);
    ctx.go = go;
    await ctx.store.load();
  } catch (err) {
    console.error(err);
    const isFile = location.protocol === 'file:';
    mount(root, `
      <section class="card notice">
        <span class="eyebrow">Admin</span>
        <h1>Couldn't load the question files</h1>
        ${isFile
          ? '<p>Open the project in VS Code, right-click <code>admin-review.html</code> and choose <strong>Open with Live Server</strong>.</p>'
          : `<p class="muted">${esc(err.message)}</p>`}
      </section>`);
    return;
  }

  bus.on('store:changed', drawPublishZone);
  drawPublishZone();

  on(publishZone, 'click', '[data-action]', async (e, btn) => {
    const a = btn.dataset.action;
    if (a === 'publish') doPublish();
    if (a === 'undo') { ctx.store.undo(); toast({ message: 'Undone' }); }
    if (a === 'discard') {
      const ok = await confirmModal('Discard unpublished changes?', 'This reloads the published question files and throws away every change you haven\'t published.', 'Discard', 'Cancel', true);
      if (ok) { await ctx.store.discard(); renderRoute(); toast({ message: 'Changes discarded' }); }
    }
  });

  window.addEventListener('storage-full', () => toast({ message: 'Browser storage is full — publish or export your changes now.', tone: 'danger', duration: 10000 }));
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('beforeunload', (e) => {
    // Changes are kept in this browser, so this is only a gentle reminder.
    if (ctx.store.dirty && !supportsDirectSave()) { e.preventDefault(); e.returnValue = ''; }
  });
  renderRoute();
}

boot();
