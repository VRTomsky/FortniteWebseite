// Item-Shop: live, mit Sektionen, Filtern, Comebacks und Countdowns.
import { $, $$, esc, fmtNum, fmtDateLong, fmtTime, icons, debounce, nextReset, lsGet, lsSet, norm } from '../util.js';
import { api } from '../api.js';
import { loadShop, onShop, getShop, loadConfig, watchHit } from '../data.js';
import { offerTile, skeletonTiles, errorBox, emptyBox, vb } from '../components.js';
import { typeLabel, TYPE_ORDER } from '../labels.js';
import { store } from '../store.js';

const KEY = 'sr.shop.v1';
const COLLAPSED_DEFAULT = new Set(['JT', '_alc']);
const SORTS = [
  ['shop', 'Wie im Spiel'],
  ['price-asc', 'Preis aufsteigend'],
  ['price-desc', 'Preis absteigend'],
  ['comeback', 'Längste Pause zuerst'],
  ['leaving', 'Geht bald'],
  ['name', 'Name A–Z'],
];
const FLAGS = [
  ['new', 'Zum ersten Mal'],
  ['comeback', 'Comeback ≥ 100 Tage'],
  ['deal', 'Rabatt'],
  ['leaving', 'Geht heute'],
  ['afford', 'Kann ich mir leisten'],
  ['wish', 'Wunschliste'],
];

let el;
let watch = null;
const saved = lsGet(KEY, {});
const state = { q: '', type: 'all', sort: saved.sort || 'shop', flags: {}, open: saved.open || {} };
const persist = () => lsSet(KEY, { sort: state.sort, open: state.open });

const sectionKey = (s) => (s.id.startsWith('JT') ? 'JT' : s.id);
const isOpen = (s) => state.open[sectionKey(s)] ?? !COLLAPSED_DEFAULT.has(sectionKey(s));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="none" stroke="#ffe23f" stroke-width="6" stroke-linecap="round" d="M12 50a38 38 0 0 1 38-38"/><path fill="none" stroke="#ffe23f" stroke-width="6" stroke-linecap="round" opacity=".55" d="M24 50a26 26 0 0 1 26-26"/><circle cx="50" cy="50" r="8" fill="#ffe23f"/></svg>';
let heroImg = null;
let revealObs = null;

export async function init(container) {
  el = container;
  el.innerHTML = `${hero()}${skeletonTiles(12)}`;
  api.news().then((n) => {
    const m = (n?.motds || []).find((x) => !x.hidden && x.image);
    heroImg = m?.image || n?.image || null;
    applyHeroImage();
  }).catch(() => {});
  window.addEventListener('scroll', onScroll, { passive: true });
  if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    el.addEventListener('pointermove', onTilt);
    el.addEventListener('pointerout', onTiltOut);
  }
  loadConfig().then((c) => { watch = c.watch; if (getShop()) renderResults(); });
  onShop(() => render());
  window.addEventListener('store', (e) => {
    if (!getShop() || el.hidden) return;
    if (e.detail === 'settings' || e.detail === 'owned' || (e.detail === 'wish' && state.flags.wish)) renderResults();
    if (e.detail === 'wish') renderWishHits();
  });
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('input', debounce(onInput, 140));
  await load();
}

async function load() {
  try {
    await loadShop();
    render();
  } catch (err) {
    el.innerHTML = `${hero()}<div id="shop-start">${errorBox(err)}</div>`;
    applyHeroImage();
  }
}

/* ---------- Intro ---------- */
function hero(shop) {
  const resetAt = nextReset();
  const s = Math.max(0, Math.floor((resetAt - Date.now()) / 1000));
  const p2 = (n) => String(n).padStart(2, '0');
  const counts = shop ? {
    all: shop.offers.length,
    new: shop.offers.filter((o) => o.isNew).length,
    comeback: shop.offers.filter((o) => o.comeback >= 100).length,
    leaving: shop.offers.filter((o) => o.leavesToday).length,
  } : null;
  return `<section class="hero" data-hero aria-label="Shopradar">
    <div class="hero__bg" data-hero-bg aria-hidden="true"></div>
    <div class="hero__shade" aria-hidden="true"></div>
    <div class="hero__inner" data-hero-inner>
      <h1 class="logo"><span class="sr-only">Shopradar – </span>${MARK}<span class="logo__word">Shop<b>radar</b></span></h1>
      <p class="hero__tag">Der Fortnite Item-Shop – <em>live</em>, mit Comebacks, Song-Vorschau, Leaks und allem, was heute zählt.</p>
      <div class="countdown" role="timer" aria-label="Zeit bis zum neuen Shop">
        <div class="cd"><b data-cd="h">${p2(Math.floor(s / 3600))}</b><span>Std</span></div>
        <span class="cd-sep" aria-hidden="true">:</span>
        <div class="cd"><b data-cd="m">${p2(Math.floor((s % 3600) / 60))}</b><span>Min</span></div>
        <span class="cd-sep" aria-hidden="true">:</span>
        <div class="cd cd--sec"><b data-cd="s">${p2(s % 60)}</b><span>Sek</span></div>
      </div>
      <p class="hero__sub">Bis zum neuen Shop · <b>${esc(fmtTime(resetAt))} Uhr</b>${shop ? ` · ${esc(fmtDateLong(shop.date || Date.now()))}` : ''}</p>
      <div class="hero__cta">
        <button class="btn btn--primary btn--lg" type="button" data-scroll-shop>${icons.play}<span>Heutigen Shop ansehen</span></button>
        <a class="btn btn--glass btn--lg" href="#/leaks">Leaks</a>
      </div>
      ${counts ? `<ul class="hero__facts">
        <li><b>${fmtNum(counts.all)}</b>Angebote</li>
        <li data-tone="new"><b>${fmtNum(counts.new)}</b>zum ersten Mal</li>
        <li data-tone="comeback"><b>${fmtNum(counts.comeback)}</b>Comebacks</li>
        <li data-tone="leaving"><b>${fmtNum(counts.leaving)}</b>gehen heute</li>
      </ul>` : ''}
    </div>
    <button class="hero__scroll" type="button" data-scroll-shop aria-label="Zum Shop scrollen">Scroll${icons.arrowDown}</button>
  </section>`;
}

function applyHeroImage() {
  const bg = $('[data-hero-bg]', el);
  if (!bg || !heroImg || bg.querySelector('img')) return;
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.onload = () => img.classList.add('is-loaded');
  img.src = heroImg;
  bg.append(img);
}

let ticking = false;
function onScroll() {
  if (ticking || el.hidden || reduceMotion) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const h = $('[data-hero]', el);
    if (!h) return;
    const p = Math.min(1, Math.max(0, window.scrollY / h.offsetHeight));
    h.style.setProperty('--hy', `${(p * 90).toFixed(1)}px`);
    h.style.setProperty('--hz', (1.04 + p * 0.14).toFixed(3));
    h.style.setProperty('--iy', `${(-p * 140).toFixed(1)}px`);
    h.style.setProperty('--is', (1 - p * 0.08).toFixed(3));
    h.style.setProperty('--io', Math.max(0, 1 - p * 1.6).toFixed(3));
  });
}

/* ---------- Highlights-Band ---------- */
function spotlight(shop) {
  const picks = shop.offers
    .filter((o) => o.image && (o.type === 'outfit' || o.type === 'bundle' || o.type === 'sidekick'))
    .sort((a, b) => (b.isNew - a.isNew) || ((b.comeback ?? -1) - (a.comeback ?? -1)))
    .slice(0, 14);
  if (picks.length < 4) return '';
  const card = (o, dup) => `<a class="spot" href="#/offer/${encodeURIComponent(o.key)}" style="--c1:${o.colors[0]};--c2:${o.colors[1]};--c3:${o.colors[2]}"${dup ? ' tabindex="-1" aria-hidden="true"' : ''}>
      <img src="${esc(o.image)}" alt="" loading="lazy" decoding="async">
      ${o.isNew ? '<span class="badge badge--new">Zum ersten Mal</span>' : o.comeback >= 100 ? `<span class="badge badge--comeback">Nach ${fmtNum(o.comeback)} Tagen</span>` : ''}
      <div class="spot__band"><p class="spot__name">${esc(o.title)}</p><span class="tile__price">${vb(o.price, o.regular)}</span></div>
    </a>`;
  return `<section class="spotlight-wrap" aria-label="Highlights von heute">
    <div class="section-head"><h2>Highlights heute</h2><span class="rule" aria-hidden="true"></span></div>
    <div class="spotlight"><div class="spotlight__track" style="--dur:${picks.length * 5}s">${picks.map((o) => card(o)).join('')}${picks.map((o) => card(o, true)).join('')}</div></div>
  </section>`;
}

/* ---------- Einflug & Kippen ---------- */
function observeTiles() {
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  const out = $('[data-results]', el);
  if (!out) return;
  out.classList.add('js-reveal');
  revealObs?.disconnect();
  revealObs = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting);
    visible.forEach((e, i) => {
      e.target.style.setProperty('--d', `${Math.min(i, 10) * 45}ms`);
      e.target.classList.add('is-in');
      revealObs.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
  $$('.tile', out).forEach((t) => revealObs.observe(t));
}

let tiltTile = null;
function onTilt(e) {
  const t = e.target.closest('.tile');
  if (!t) return;
  tiltTile = t;
  const r = t.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  t.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
  t.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
  t.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  t.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
}
function onTiltOut(e) {
  const t = e.target.closest('.tile');
  if (!t || t.contains(e.relatedTarget)) return;
  t.style.removeProperty('--rx');
  t.style.removeProperty('--ry');
  if (tiltTile === t) tiltTile = null;
}

export function onShow() {
  if (getShop()) renderWishHits();
  onScroll();
}

function render() {
  const shop = getShop();
  if (!shop) return;
  el.innerHTML = `
    ${hero(shop)}
    ${spotlight(shop)}
    <div data-wishhits></div>
    <div class="toolbar" role="search" id="shop-start">
      <div class="toolbar__row">
        <div class="search">
          ${icons.search}
          <label class="sr-only" for="shop-q">Im Shop suchen</label>
          <input class="input" id="shop-q" type="search" placeholder="Im Shop suchen …" value="${esc(state.q)}" autocomplete="off" data-q>
        </div>
        <label class="sr-only" for="shop-sort">Sortierung</label>
        <select class="select" id="shop-sort" data-sort>
          ${SORTS.map(([v, l]) => `<option value="${v}"${state.sort === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <span class="sep" aria-hidden="true"></span>
        <div class="toolbar__flags">${FLAGS.map(([f, l]) => `<button class="chip" type="button" data-flag="${f}" aria-pressed="${!!state.flags[f]}">${l}</button>`).join('')}</div>
      </div>
      <div class="toolbar__row toolbar__row--scroll" data-types></div>
    </div>
    <div class="result-line"><p class="label" data-count></p></div>
    <div data-results></div>`;
  applyHeroImage();
  renderTypes();
  renderWishHits();
  renderResults();
  onScroll();
}

function renderTypes() {
  const shop = getShop();
  const counts = new Map();
  for (const o of shop.offers) counts.set(o.type, (counts.get(o.type) || 0) + 1);
  const types = [...counts.keys()].sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
  $('[data-types]', el).innerHTML = [
    `<button class="chip" type="button" data-type="all" aria-pressed="${state.type === 'all'}">Alles <span class="count">${fmtNum(shop.offers.length)}</span></button>`,
    ...types.map((t) => `<button class="chip" type="button" data-type="${esc(t)}" aria-pressed="${state.type === t}">${esc(typeLabel(t, true))} <span class="count">${fmtNum(counts.get(t))}</span></button>`),
  ].join('');
}

function renderWishHits() {
  const slot = $('[data-wishhits]', el);
  if (!slot) return;
  const shop = getShop();
  const hits = store.wishList().filter((w) => shop.byItem.has(w.id));
  if (!hits.length) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="banner--wish">
    <p><strong>Wunschliste</strong>${hits.length === 1 ? 'Ein Item von deiner Wunschliste ist' : `${hits.length} Items von deiner Wunschliste sind`} heute im Shop: ${hits.map((h) => `<a href="#/item/${encodeURIComponent(h.id)}">${esc(h.name)}</a>`).join(', ')}.</p>
    <button class="btn btn--sm" type="button" data-flag-on="wish">Nur diese zeigen</button>
  </div>`;
}

function matches(o, q) {
  if (q && !o.search.includes(q)) return false;
  if (state.type !== 'all' && o.type !== state.type) return false;
  const f = state.flags;
  if (f.new && !o.isNew) return false;
  if (f.comeback && !(o.comeback >= 100)) return false;
  if (f.deal && !o.discount) return false;
  if (f.leaving && !o.leavesToday) return false;
  if (f.afford) { const b = store.balance; if (b == null || o.price > b) return false; }
  if (f.wish && !o.items.some((i) => store.isWished(i.id))) return false;
  return true;
}

const SORT_FN = {
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  comeback: (a, b) => (b.comeback ?? -1) - (a.comeback ?? -1),
  leaving: (a, b) => (a.outAt ?? Infinity) - (b.outAt ?? Infinity),
  name: (a, b) => a.title.localeCompare(b.title, 'de'),
};

function tileFor(o) {
  return offerTile(o, { watch: watchHit(watch, o.title, ...o.items.map((i) => `${i.name} ${i.set}`)) });
}

function renderResults() {
  const shop = getShop();
  const out = $('[data-results]', el);
  if (!shop || !out) return;
  const q = norm(state.q);
  const list = shop.offers.filter((o) => matches(o, q));
  const filtered = list.length !== shop.offers.length;
  $('[data-count]', el).textContent = filtered ? `${fmtNum(list.length)} von ${fmtNum(shop.offers.length)} Angeboten` : `${fmtNum(list.length)} Angebote in ${shop.sections.length} Bereichen`;

  if (state.flags.afford && store.balance == null) {
    out.innerHTML = emptyBox('Guthaben fehlt', 'Trag oben rechts dein V-Bucks-Guthaben ein, dann zeigt dieser Filter alles, was du dir leisten kannst.');
    return;
  }
  if (!list.length) {
    out.innerHTML = emptyBox('Nichts gefunden', 'Mit diesen Filtern ist heute nichts im Shop. Nimm einen Filter raus oder such nach etwas anderem.', '<button class="btn" type="button" data-reset>Filter zurücksetzen</button>');
    return;
  }
  if (state.sort !== 'shop') {
    out.innerHTML = `<div class="grid">${[...list].sort(SORT_FN[state.sort]).map(tileFor).join('')}</div>`;
    observeTiles();
    return;
  }
  const visible = new Set(list.map((o) => o.key));
  out.innerHTML = `<div style="display:grid;gap:34px">${shop.sections.map((s) => {
    const offers = s.offers.filter((o) => visible.has(o.key));
    if (!offers.length) return '';
    const open = filtered || isOpen(s);
    const PREVIEW = 12;
    const shown = open ? offers : offers.slice(0, PREVIEW);
    const canToggle = !filtered && offers.length > PREVIEW;
    return `<section class="section" aria-labelledby="sec-${esc(s.id)}">
      <div class="section-head">
        <h2 id="sec-${esc(s.id)}">${esc(s.name)}</h2>
        <span class="count">${fmtNum(offers.length)}</span>
        <span class="rule" aria-hidden="true"></span>
        ${canToggle ? `<button class="btn btn--ghost btn--sm toggle" type="button" data-toggle="${esc(sectionKey(s))}" aria-expanded="${open}">${open ? 'Weniger anzeigen' : `Alle ${fmtNum(offers.length)} anzeigen`}</button>` : ''}
      </div>
      <div class="grid">${shown.map(tileFor).join('')}</div>
    </section>`;
  }).join('')}</div>`;
  observeTiles();
}

function onClick(e) {
  const t = e.target;
  if (t.closest('[data-scroll-shop]')) {
    const bar = $('#shop-start', el) || $('[data-results]', el);
    const y = bar.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 72) + 2;
    window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }
  if (t.closest('[data-retry]')) { el.innerHTML = hero() + skeletonTiles(12); applyHeroImage(); load(); return; }
  const flag = t.closest('[data-flag]');
  if (flag) {
    const f = flag.dataset.flag;
    state.flags[f] = !state.flags[f];
    flag.setAttribute('aria-pressed', state.flags[f]);
    renderResults();
    return;
  }
  const on = t.closest('[data-flag-on], [data-quick]');
  if (on) {
    const f = on.dataset.flagOn || on.dataset.quick;
    state.flags = { [f]: true };
    el.querySelectorAll('[data-flag]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.flag === f));
    renderResults();
    $('#shop-start', el)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  const type = t.closest('[data-type]');
  if (type) {
    state.type = type.dataset.type;
    el.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === state.type));
    renderResults();
    return;
  }
  const tog = t.closest('[data-toggle]');
  if (tog) {
    const k = tog.dataset.toggle;
    const s = getShop().sections.find((x) => sectionKey(x) === k);
    state.open[k] = !(s && isOpen(s));
    persist();
    renderResults();
    return;
  }
  if (t.closest('[data-reset]')) {
    state.q = ''; state.type = 'all'; state.flags = {};
    render();
  }
}

function onChange(e) {
  if (e.target.matches('[data-sort]')) {
    state.sort = e.target.value;
    persist();
    renderResults();
  }
}

function onInput(e) {
  if (e.target.matches('[data-q]')) {
    state.q = e.target.value;
    renderResults();
  }
}

