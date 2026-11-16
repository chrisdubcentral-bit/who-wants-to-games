// Admin "Adverts" tab: switch adverts on and off, give them start/end dates, edit their link and button,
// change the stage they play after and the order they take turns in (or have them picked at random). Saves data/adverts.json.
// Unsaved changes are kept in this browser (like the question working copy) until saved or discarded.

import { esc, on, mount } from '../../ui/dom.js';
import { toast } from '../../ui/components/toast.js';
import { openModal, confirmModal } from '../../ui/components/modal.js';
import { local, KEYS } from '../../core/storage.js';
import { fetchJson, PATHS } from '../../core/config.js';
import { advertStatus, advertProblems, dayKey, isDay, setAdverts, ORDERS } from '../../core/adverts.js';
import { saveAdvertsFile, advertsPath, supportsDirectSave, secureAddressHint } from '../../data-sources/publishers.js';

const VIDEO_DIR = '../../media/ads/';
const DEFAULT_SKIP_MS = 5000;

// Kept between visits to the tab while the page is open.
let file = null;     // the adverts file as last loaded or saved: { schemaVersion, updatedAt, order, adverts }
let draft = null;    // the list being edited
let order = 'turns'; // how adverts are chosen, being edited: 'turns' or 'random' (see core/adverts.js)
let dirty = false;
let baseUpdatedAt = null;   // file.updatedAt when the unsaved changes were started

const clone = (v) => JSON.parse(JSON.stringify(v));
const validOrder = (v) => (ORDERS.includes(v) ? v : 'turns');
const pretty = (day) => (isDay(day)
  ? new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '');

async function loadFile() {
  try {
    const f = await fetchJson(PATHS.adverts);
    return { schemaVersion: 1, updatedAt: f.updatedAt ?? null, order: validOrder(f.order), adverts: Array.isArray(f.adverts) ? f.adverts : [] };
  } catch {
    return { schemaVersion: 1, updatedAt: null, order: 'turns', adverts: [], missing: true };
  }
}

async function loadState({ fresh = false } = {}) {
  file = await loadFile();
  const saved = fresh ? null : local.read(KEYS.adminAdverts, null);
  if (saved && Array.isArray(saved.adverts)) {
    draft = saved.adverts;
    order = validOrder(saved.order ?? file.order);
    baseUpdatedAt = saved.base ?? null;
    dirty = true;
  } else {
    draft = clone(file.adverts);
    order = file.order;
    baseUpdatedAt = file.updatedAt;
    dirty = false;
  }
}

function keepDraft() {
  dirty = true;
  local.write(KEYS.adminAdverts, { base: baseUpdatedAt, order, adverts: draft });
}

function clearDraft() {
  local.remove(KEYS.adminAdverts);
  dirty = false;
}

/** A bare file name means a video in media/ads; anything with a slash or a web address is used as it is. */
function videoPath(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return v.includes('/') || /^https?:/i.test(v) ? v : VIDEO_DIR + v;
}

function newAdvert(stageKey) {
  return {
    id: `advert-${Date.now().toString(36)}`,
    name: 'New advert',
    enabled: false,
    from: null,
    until: null,
    after: stageKey,
    label: '',
    url: '',
    linkText: 'Find out more',
    landscape: null,
    portrait: null,
    skipAfterMs: DEFAULT_SKIP_MS,
  };
}

export function render(root, ctx) {
  const { meta } = ctx;
  const stageKeys = meta.stages.map((s) => s.key);
  const stageLabel = (key) => meta.stageByKey[key]?.label ?? key;
  let today = dayKey();
  const shapes = {}; // advert id -> 'landscape' | 'portrait' shown in the preview

  function statusHtml(ad) {
    const st = advertStatus(ad, today);
    const text = {
      showing: `Showing now${isDay(ad.until) ? ` · until ${pretty(ad.until)}` : ''}`,
      scheduled: `Starts ${pretty(ad.from)}`,
      expired: `Ended ${pretty(ad.until)}`,
      off: 'Off',
      'no-video': 'No video',
    }[st];
    return `<span class="adstatus is-${st}">${esc(text)}</span>`;
  }

  function problemsHtml(ad) {
    const list = advertProblems(ad, stageKeys);
    return list.length ? `<ul class="adproblems">${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
  }

  function summaryHtml() {
    const showing = draft.filter((a) => advertStatus(a, today) === 'showing');
    const byStage = stageKeys
      .map((k) => ({ k, ads: showing.filter((a) => a.after === k) }))
      .filter((g) => g.ads.length);
    const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join(''));
    const lines = order === 'random' && showing.length > 1
      ? [`<span>After the ${list(byStage.map((g) => `<strong>${esc(stageLabel(g.k))}</strong>`))}: one of ${showing.map((a) => esc(a.name)).join(', ')}, picked at random</span>`]
      : byStage.map((g) => g.ads.length === 1
      ? `<span>After the <strong>${esc(stageLabel(g.k))}</strong>: ${esc(g.ads[0].name)}</span>`
      : `<span>After the <strong>${esc(stageLabel(g.k))}</strong>, taking turns: ${g.ads.map((a) => esc(a.name)).join(', ')}</span>`);
    return `
      <p class="ad-today"><span class="eyebrow">Today · ${esc(pretty(today))}</span>
        ${lines.length ? lines.join('') : '<span>No adverts are showing today, so the game plays straight through.</span>'}
      </p>`;
  }

  function barHtml() {
    return dirty
      ? `<span class="badge badge-gold dirty-badge">Unsaved advert changes</span>
         <button class="btn btn-ghost btn-sm" data-action="discard">Discard</button>
         <button class="btn btn-primary btn-sm" data-action="save">Save Adverts</button>`
      : `<span class="muted" style="font-size:.8rem">${file?.missing ? `No ${esc(advertsPath())} yet` : 'Saved to ' + esc(advertsPath())}</span>`;
  }

  function videoField(ad, shape, label) {
    return `
      <div class="field span-2">
        <label for="${esc(ad.id)}-${shape}">${label}</label>
        <input class="input" id="${esc(ad.id)}-${shape}" data-f="${shape}" value="${esc(ad[shape] ?? '')}" placeholder="file name in media/ads, e.g. my-advert-${shape}.mp4" spellcheck="false">
        <span class="ad-file muted" data-file="${shape}"></span>
      </div>`;
  }

  function mediaHtml(ad) {
    let shape = shapes[ad.id] ?? (ad.landscape ? 'landscape' : 'portrait');
    if (!ad[shape]) shape = ad.landscape ? 'landscape' : 'portrait';
    const src = ad[shape] || '';
    return `
          ${src ? `<video class="is-${shape}" src="${esc(src)}#t=2" muted playsinline controls preload="metadata"></video>` : '<div class="ad-novideo">No video yet</div>'}
          <div class="ad-shapes" role="group" aria-label="Preview shape">
            <button type="button" class="btn btn-sm ${shape === 'landscape' ? 'is-on' : 'btn-ghost'}" data-shape="landscape" ${ad.landscape ? '' : 'disabled'}>Landscape</button>
            <button type="button" class="btn btn-sm ${shape === 'portrait' ? 'is-on' : 'btn-ghost'}" data-shape="portrait" ${ad.portrait ? '' : 'disabled'}>Portrait</button>
          </div>`;
  }

  function cardHtml(ad, i) {
    return `
      <article class="card adcard" data-id="${esc(ad.id)}">
        <div class="adcard-media">${mediaHtml(ad)}</div>
        <div class="adcard-body">
          <div class="adcard-head">
            <input class="input adname" data-f="name" value="${esc(ad.name ?? '')}" aria-label="Advert name" placeholder="Advert name">
            <span data-ref="status">${statusHtml(ad)}</span>
            <label class="ad-switch">
              <input type="checkbox" data-f="enabled" ${ad.enabled !== false ? 'checked' : ''}>
              <span class="track" aria-hidden="true"></span><span class="txt">${ad.enabled !== false ? 'On' : 'Off'}</span>
            </label>
          </div>
          <div class="adgrid">
            <div class="field">
              <label for="${esc(ad.id)}-from">Show from <span class="muted">(optional)</span></label>
              <input class="input" type="date" id="${esc(ad.id)}-from" data-f="from" value="${esc(ad.from ?? '')}">
            </div>
            <div class="field">
              <label for="${esc(ad.id)}-until">Show until <span class="muted">(optional, last day shown)</span></label>
              <input class="input" type="date" id="${esc(ad.id)}-until" data-f="until" value="${esc(ad.until ?? '')}">
            </div>
            <div class="field">
              <label for="${esc(ad.id)}-after">Plays after</label>
              <select class="select" id="${esc(ad.id)}-after" data-f="after">
                ${meta.stages.slice(0, -1).map((s) => `<option value="${esc(s.key)}" ${s.key === ad.after ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="${esc(ad.id)}-skip">Skip button after (seconds)</label>
              <input class="input" type="number" min="0" max="20" step="1" id="${esc(ad.id)}-skip" data-f="skip" value="${Number.isFinite(ad.skipAfterMs) ? ad.skipAfterMs / 1000 : DEFAULT_SKIP_MS / 1000}">
            </div>
            <div class="field">
              <label for="${esc(ad.id)}-label">Advertiser name shown</label>
              <input class="input" id="${esc(ad.id)}-label" data-f="label" value="${esc(ad.label ?? '')}" placeholder="e.g. Celtic Pools">
            </div>
            <div class="field">
              <label for="${esc(ad.id)}-linkText">Button text</label>
              <input class="input" id="${esc(ad.id)}-linkText" data-f="linkText" value="${esc(ad.linkText ?? '')}" placeholder="e.g. Join Now">
            </div>
            <div class="field span-2">
              <label for="${esc(ad.id)}-url">Link <span class="muted">(opens when the video or button is tapped)</span></label>
              <input class="input" type="url" id="${esc(ad.id)}-url" data-f="url" value="${esc(ad.url ?? '')}" placeholder="https://" spellcheck="false">
            </div>
            ${videoField(ad, 'landscape', 'Landscape video <span class="muted">(wide screens, phones held sideways)</span>')}
            ${videoField(ad, 'portrait', 'Portrait video <span class="muted">(phones held upright)</span>')}
          </div>
          <div data-ref="problems">${problemsHtml(ad)}</div>
          <div class="adcard-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="up" ${i === 0 ? 'disabled' : ''} title="Earlier in the turn order">Move Up</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="down" ${i === draft.length - 1 ? 'disabled' : ''} title="Later in the turn order">Move Down</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>
          </div>
        </div>
      </article>`;
  }

  function draw() {
    const conflict = dirty && file && !file.missing && baseUpdatedAt !== file.updatedAt;
    mount(root, `
      <section class="adverts">
        <header class="page-head">
          <span class="eyebrow">Admin</span>
          <h1>Adverts</h1>
          <p class="muted">Adverts play between stages. Switch them on or off, or give them dates so a time-limited advert
            starts and stops by itself. Adverts after the same stage take turns, one per game, in the order below,
            unless the order is set to random.
            Dates use the player's own date and include the end day. Save here, then push to <code>live</code> to update the game.</p>
        </header>
        <div class="card card-pad adverts-bar">
          <div data-ref="summary">${summaryHtml()}</div>
          <div class="adverts-save" data-ref="bar">${barHtml()}</div>
        </div>
        ${conflict ? `<div class="alert"><span><strong>The adverts file has changed</strong> since you started these unsaved changes
          (it was saved somewhere else). Saving will replace it with what you see here. Discard to start again from the file.</span></div>` : ''}
        <div class="field ad-order">
          <label for="ad-order">Order</label>
          <select class="select" id="ad-order" data-order>
            <option value="turns" ${order === 'turns' ? 'selected' : ''}>Take turns: each advert plays after its own stage</option>
            <option value="random" ${order === 'random' ? 'selected' : ''}>Random: any advert can play in any break, none twice in a game</option>
          </select>
        </div>
        <div class="adlist">${draft.length ? draft.map(cardHtml).join('') : '<div class="card card-pad muted">No adverts yet.</div>'}</div>
        <div class="page-actions" style="justify-content:flex-start">
          <button type="button" class="btn" data-action="add">Add Advert</button>
        </div>
        <p class="muted ad-help">New videos go in the project's <code>media/ads</code> folder (the compressed 720p copies, see
          <code>media/ads/README.md</code>). Then add an advert here and type the file names.</p>
      </section>`);
    root.querySelectorAll('.adcard').forEach((card) => checkFiles(card));
  }

  const adOf = (el) => draft.find((a) => a.id === el.closest('.adcard')?.dataset.id);

  function refreshCard(card, ad) {
    card.querySelector('[data-ref="status"]').innerHTML = statusHtml(ad);
    card.querySelector('[data-ref="problems"]').innerHTML = problemsHtml(ad);
    const txt = card.querySelector('.ad-switch .txt');
    if (txt) txt.textContent = ad.enabled !== false ? 'On' : 'Off';
    root.querySelector('[data-ref="summary"]').innerHTML = summaryHtml();
    root.querySelector('[data-ref="bar"]').innerHTML = barHtml();
  }

  async function checkFiles(card) {
    const ad = adOf(card);
    if (!ad) return;
    for (const shape of ['landscape', 'portrait']) {
      const out = card.querySelector(`[data-file="${shape}"]`);
      if (!out) continue;
      const src = ad[shape];
      if (!src) { out.textContent = ''; out.className = 'ad-file muted'; continue; }
      if (/^https?:/i.test(src)) { out.textContent = 'Web address: not checked'; out.className = 'ad-file muted'; continue; }
      let found = false;
      try { found = (await fetch(src, { method: 'HEAD', cache: 'no-store' })).ok; } catch { found = false; }
      if (!out.isConnected || ad[shape] !== src) continue;
      out.textContent = found ? '✓ File found' : '✕ File not found. Check the name, and that it is in media/ads.';
      out.className = `ad-file ${found ? 'is-ok' : 'is-bad'}`;
    }
  }

  function update(el) {
    const ad = adOf(el);
    if (!ad) return;
    const f = el.dataset.f;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (f === 'enabled') ad.enabled = v;
    else if (f === 'from' || f === 'until') ad[f] = v || null;
    else if (f === 'skip') ad.skipAfterMs = v === '' ? null : Math.round(Number(v) * 1000);
    else if (f === 'landscape' || f === 'portrait') ad[f] = videoPath(v);
    else ad[f] = v;
    keepDraft();
    refreshCard(el.closest('.adcard'), ad);
  }

  async function save() {
    const bad = draft.find((a) => advertProblems(a, stageKeys).length);
    if (bad) {
      toast({ message: `Fix "${bad.name || 'an advert'}" first: ${advertProblems(bad, stageKeys)[0]}`, tone: 'danger', duration: 7000 });
      root.querySelector(`.adcard[data-id="${CSS.escape(bad.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const direct = supportsDirectSave() && !secureAddressHint();
    if (!direct) {
      const ok = await confirmModal('Download the adverts file?',
        `This browser can't save straight into your project here, so adverts.json will download. Copy it into ${advertsPath().replace(/\/adverts\.json$/, '')}, replacing the old one. (Chrome or Edge on 127.0.0.1 can save directly.)`,
        'Download', 'Cancel');
      if (!ok) return;
    }
    const data = { schemaVersion: 1, updatedAt: new Date().toISOString(), order, adverts: draft.map((a) => ({ ...a, name: a.name.trim() })) };
    try {
      const res = await saveAdvertsFile(data);
      if (res.method === 'download') {
        const copied = await openModal({
          title: 'File downloaded',
          message: `Copy adverts.json into ${advertsPath().replace(/\/adverts\.json$/, '')}, replacing the old one. Then mark it as saved.`,
          actions: [
            { label: 'Not yet', value: false, className: 'btn-ghost' },
            { label: "I've copied it", value: true, className: 'btn-primary' },
          ],
        });
        if (!copied) return;
      }
      file = data;
      draft = clone(data.adverts);
      baseUpdatedAt = data.updatedAt;
      clearDraft();
      setAdverts(draft, order);
      draw();
      toast({ message: 'Adverts saved. Push to live to update the game.', tone: 'success', duration: 6000 });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error(err);
      toast({ message: `Couldn't save: ${err.message}`, tone: 'danger', duration: 8000 });
    }
  }

  const offs = [
    on(root, 'input', '[data-f]', (e, el) => { if (el.type !== 'checkbox' && el.tagName !== 'SELECT') update(el); }),
    on(root, 'change', '[data-f]', (e, el) => {
      update(el);
      if (el.dataset.f === 'landscape' || el.dataset.f === 'portrait') {
        const card = el.closest('.adcard');
        card.querySelector('.adcard-media').innerHTML = mediaHtml(adOf(el));
        checkFiles(card);
      }
    }),
    on(root, 'change', '[data-order]', (e, el) => {
      order = validOrder(el.value);
      keepDraft();
      root.querySelector('[data-ref="summary"]').innerHTML = summaryHtml();
      root.querySelector('[data-ref="bar"]').innerHTML = barHtml();
    }),
    on(root, 'click', '[data-shape]', (e, btn) => {
      const ad = adOf(btn);
      if (!ad) return;
      shapes[ad.id] = btn.dataset.shape;
      btn.closest('.adcard-media').innerHTML = mediaHtml(ad);
    }),
    on(root, 'click', '[data-action]', async (e, btn) => {
      const a = btn.dataset.action;
      if (a === 'save') return save();
      if (a === 'discard') {
        const ok = await confirmModal('Discard advert changes?', 'This reloads the saved adverts file and throws away the changes you haven\'t saved.', 'Discard', 'Cancel', true);
        if (!ok) return;
        clearDraft();
        await loadState({ fresh: true });
        draw();
        toast({ message: 'Advert changes discarded' });
        return;
      }
      if (a === 'add') {
        const ad = newAdvert(draft.at(-1)?.after ?? stageKeys[Math.min(3, stageKeys.length - 2)]);
        draft.push(ad);
        keepDraft();
        draw();
        const card = root.querySelector(`.adcard[data-id="${CSS.escape(ad.id)}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.querySelector('.adname')?.select();
        return;
      }
      const ad = adOf(btn);
      if (!ad) return;
      const i = draft.indexOf(ad);
      if (a === 'up' && i > 0) [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
      if (a === 'down' && i < draft.length - 1) [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
      if (a === 'delete') {
        const ok = await confirmModal(`Delete "${ad.name}"?`, 'It stops playing once you save and push. The video files stay in media/ads.', 'Delete', 'Cancel', true);
        if (!ok) return;
        draft.splice(draft.indexOf(ad), 1);
      }
      keepDraft();
      draw();
    }),
  ];

  // The date rolls over at midnight: keep "Showing now" honest if the page is left open.
  const timer = setInterval(() => {
    if (dayKey() !== today) { today = dayKey(); draw(); }
  }, 60000);

  root.innerHTML = '<p class="muted" style="text-align:center;padding:64px 0">Loading adverts…</p>';
  (draft ? Promise.resolve() : loadState()).then(draw).catch((err) => {
    console.error(err);
    root.innerHTML = `<section class="card notice"><h1>Couldn't load the adverts</h1><p class="muted">${esc(err.message)}</p></section>`;
  });

  return () => {
    clearInterval(timer);
    offs.forEach((off) => typeof off === 'function' && off());
  };
}
