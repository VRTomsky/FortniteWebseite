// Item-Shop: Intro mit Countdown, Highlights, darunter der Shop wie bei Fortnite.GG –
// Bereiche in der echten Reihenfolge aus dem Spiel, Zähler-Tabs, Filter/Sortieren/Einstellungen.
import { $, $$, esc, fmtNum, fmtTime, fmtDateLong, icons, debounce, nextReset, lsGet, lsSet, norm } from '../util.js';
import { api } from '../api.js';
import { loadShop, onShop, getShop, loadConfig, watchHit, REGIONAL } from '../data.js';
import { offerTile, skeletonTiles, errorBox, emptyBox, vb } from '../components.js';
import { typeLabel, TYPE_ORDER } from '../labels.js';
import { store } from '../store.js';
import { stopAll as stopTileVideos } from '../video.js';

const KEY = 'sr.shop.v2';
const PREVIEW = 12;
const LONG_DEFAULT = new Set(['JT', REGIONAL]); // lange Bereiche zeigen erst 12 Kacheln
const SORTS = [
  ['shop', 'Wie im Spiel'],
  ['price-asc', 'Preis: aufsteigend'],
  ['price-desc', 'Preis: absteigend'],
  ['comeback', 'Längste Wartezeit'],
  ['leaving', 'Geht bald'],
  ['name', 'Name: A bis Z'],
  ['name-desc', 'Name: Z bis A'],
];
const TABS = [
  ['all', 'Alle'],
  ['new', 'Neu'],
  ['wish', 'Meine Wunschliste'],
  ['changed', 'Anders als gestern'],
  ['leaving', 'Gehen heute'],
  ['comeback', 'Längste Wartezeit'],
  ['deal', 'Rabatt'],
  ['afford', 'Kann ich mir leisten'],
];

let el;
let watch = null;
const saved = lsGet(KEY, {});
const state = {
  q: '', tab: 'all', types: [], sort: saved.sort || 'shop',
  size: saved.size || 'small', hideStrip: !!saved.hideStrip, hideTags: !!saved.hideTags,
  closed: saved.closed || {}, all: saved.all || {},
};
const persist = () => lsSet(KEY, { sort: state.sort, size: state.size, hideStrip: state.hideStrip, hideTags: state.hideTags, closed: state.closed, all: state.all });

const sectionKey = (s) => (s.id.startsWith('JT') ? 'JT' : s.id);
const showsAll = (k) => state.all[k] ?? !LONG_DEFAULT.has(k);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="none" stroke="#ffe23f" stroke-width="6" stroke-linecap="round" d="M12 50a38 38 0 0 1 38-38"/><path fill="none" stroke="#ffe23f" stroke-width="6" stroke-linecap="round" opacity=".55" d="M24 50a26 26 0 0 1 26-26"/><circle cx="50" cy="50" r="8" fill="#ffe23f"/></svg>';
const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
let heroImg = null;
let revealObs = null;
let spotObs = null;

export async function init(container) {
  el = container;
  el.innerHTML = `${hero()}${skeletonTiles(12)}`;
  api.news().then((n) => {
    const m = (n?.motds || []).find((x) => !x.hidden && x.image);
    heroImg = m?.image || n?.image || null;
    applyHeroImage();
  }).catch(() => {});
  window.addEventListener('scroll', onScroll, { passive: true });
  loadConfig().then((c) => { watch = c.watch; if (getShop()) renderResults(); });
  onShop(() => render());
  window.addEventListener('store', (e) => {
    if (!getShop() || el.hidden) return;
    if (e.detail === 'settings' || e.detail === 'owned' || (e.detail === 'wish' && state.tab === 'wish')) { renderTabs(); renderResults(); }
    if (e.detail === 'wish') { renderWishHits(); renderTabs(); }
  });
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('input', debounce(onInput, 140));
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.drop')) closeDrops(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrops(); });
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

/* ---------- Einflug beim Scrollen ---------- */
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


export function onShow() {
  if (getShop()) renderWishHits();
  onScroll();
}

/* ---------- Shop-Kopf wie bei Fortnite.GG ---------- */
function counts(shop) {
  const c = { all: shop.offers.length, new: 0, wish: 0, changed: 0, leaving: 0, comeback: null, deal: 0, afford: 0 };
  const bal = store.balance;
  for (const o of shop.offers) {
    if (o.isNew) c.new++;
    if (o.items.some((i) => store.isWished(i.id))) c.wish++;
    if (o.changed) c.changed++;
    if (o.leavesToday) c.leaving++;
    if (o.discount) c.deal++;
    if (bal != null && o.price <= bal) c.afford++;
  }
  if (bal == null) c.afford = null;
  return c;
}

/** Laufband nur bewegen, wenn es zu sehen ist (spart Rechenleistung für die Videos) */
function watchSpotlight() {
  spotObs?.disconnect();
  const sp = $('.spotlight', el);
  if (!sp || !('IntersectionObserver' in window)) return;
  spotObs = new IntersectionObserver(([e]) => sp.classList.toggle('is-off', !e.isIntersecting));
  spotObs.observe(sp);
}

function render() {
  const shop = getShop();
  if (!shop) return;
  el.innerHTML = `
    ${hero(shop)}
    ${spotlight(shop)}
    <div data-wishhits></div>
    <section class="shop-head" id="shop-start" aria-labelledby="shop-title">
      <h2 class="shop-head__title" id="shop-title">Fortnite Item-Shop</h2>
      <p class="shop-head__date">${esc(fmtDay.format(new Date(shop.date || Date.now())))}</p>
      <p class="shop-head__next">Neue Items in <b class="num" data-until-reset data-fmt="clock">--:--:--</b></p>
      <div class="shop-tabs" role="tablist" aria-label="Schnellfilter" data-tabs></div>
      <div class="drops">
        <div class="drop" data-drop="filter">
          <button class="drop__btn" type="button" aria-expanded="false" aria-haspopup="true">${icons.filter}<span>Filter</span><span class="drop__count" data-filter-count hidden></span>${icons.chevron}</button>
          <div class="drop__menu drop__menu--wide" hidden data-types></div>
        </div>
        <div class="drop" data-drop="sort">
          <button class="drop__btn" type="button" aria-expanded="false" aria-haspopup="true">${icons.sort}<span>Sortieren</span>${icons.chevron}</button>
          <div class="drop__menu" hidden>${SORTS.map(([v, l]) => `<button class="drop__opt" type="button" data-sort="${v}" aria-pressed="${state.sort === v}">${l}</button>`).join('')}</div>
        </div>
        <div class="drop" data-drop="settings">
          <button class="drop__btn" type="button" aria-expanded="false" aria-haspopup="true">${icons.gear}<span>Einstellungen</span>${icons.chevron}</button>
          <div class="drop__menu" hidden data-settings></div>
        </div>
        <label class="search search--pill">
          ${icons.search}
          <span class="sr-only">Im Shop suchen</span>
          <input class="input" type="search" placeholder="Im Shop suchen …" value="${esc(state.q)}" autocomplete="off" data-q>
        </label>
      </div>
    </section>
    <p class="result-line label" data-count></p>
    <div data-results></div>`;
  applyHeroImage();
  watchSpotlight();
  renderTabs();
  renderTypes();
  renderSettings();
  renderWishHits();
  renderResults();
  onScroll();
}

function renderTabs() {
  const slot = $('[data-tabs]', el);
  const shop = getShop();
  if (!slot || !shop) return;
  const c = counts(shop);
  slot.innerHTML = TABS
    .filter(([k]) => (k === 'deal' ? c.deal > 0 : k === 'afford' ? c.afford != null : true))
    .map(([k, l]) => `<button class="shop-tab" type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${c[k] != null ? `<b>${fmtNum(c[k])}</b> ` : ''}${l}</button>`)
    .join('');
}

function renderTypes() {
  const shop = getShop();
  const slot = $('[data-types]', el);
  if (!slot) return;
  const cnt = new Map();
  for (const o of shop.offers) cnt.set(o.type, (cnt.get(o.type) || 0) + 1);
  const types = [...cnt.keys()].sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
  slot.innerHTML = `<p class="drop__label">Item-Typ</p>
    <div class="drop__grid">${types.map((t) => `<label class="check"><input type="checkbox" data-type="${esc(t)}"${state.types.includes(t) ? ' checked' : ''}><span>${esc(typeLabel(t, true))}</span><i>${fmtNum(cnt.get(t))}</i></label>`).join('')}</div>
    <button class="btn btn--sm btn--ghost" type="button" data-types-reset${state.types.length ? '' : ' disabled'}>Alle Typen zeigen</button>`;
  const n = $('[data-filter-count]', el);
  if (n) { n.hidden = !state.types.length; n.textContent = state.types.length; }
}

function renderSettings() {
  const slot = $('[data-settings]', el);
  if (!slot) return;
  const hv = store.settings.hoverVideo !== false;
  slot.innerHTML = `<p class="drop__label">Größe</p>
    <div class="seg seg--small" role="group" aria-label="Kachelgröße">
      <button type="button" data-size="small" aria-pressed="${state.size === 'small'}">Klein</button>
      <button type="button" data-size="large" aria-pressed="${state.size === 'large'}">Groß</button>
    </div>
    <label class="check check--row"><input type="checkbox" data-set="hoverVideo"${hv ? ' checked' : ''}><span>Videos beim Drüberfahren</span></label>
    <label class="check check--row"><input type="checkbox" data-set="hideStrip"${state.hideStrip ? ' checked' : ''}><span>Restzeit ausblenden</span></label>
    <label class="check check--row"><input type="checkbox" data-set="hideTags"${state.hideTags ? ' checked' : ''}><span>Hinweise ausblenden</span></label>`;
}

function closeDrops(except) {
  $$('.drop', el).forEach((d) => {
    if (d === except) return;
    d.classList.remove('is-open');
    d.querySelector('.drop__btn')?.setAttribute('aria-expanded', 'false');
    const m = d.querySelector('.drop__menu');
    if (m) m.hidden = true;
  });
}

function renderWishHits() {
  const slot = $('[data-wishhits]', el);
  if (!slot) return;
  const shop = getShop();
  const hits = store.wishList().filter((w) => shop.byItem.has(w.id));
  if (!hits.length) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="banner--wish">
    <p><strong>Wunschliste</strong>${hits.length === 1 ? 'Ein Item von deiner Wunschliste ist' : `${hits.length} Items von deiner Wunschliste sind`} heute im Shop: ${hits.map((h) => `<a href="#/item/${encodeURIComponent(h.id)}">${esc(h.name)}</a>`).join(', ')}.</p>
    <button class="btn btn--sm" type="button" data-tab="wish">Nur diese zeigen</button>
  </div>`;
}

function matches(o, q) {
  if (q && !o.search.includes(q)) return false;
  if (state.types.length && !state.types.includes(o.type)) return false;
  switch (state.tab) {
    case 'new': return o.isNew;
    case 'wish': return o.items.some((i) => store.isWished(i.id));
    case 'changed': return o.changed;
    case 'leaving': return o.leavesToday;
    case 'comeback': return o.comeback != null;
    case 'deal': return o.discount > 0;
    case 'afford': { const b = store.balance; return b != null && o.price <= b; }
    default: return true;
  }
}

const SORT_FN = {
  'price-asc': (a, b) => (a.price - b.price) || (a.order - b.order),
  'price-desc': (a, b) => (b.price - a.price) || (a.order - b.order),
  comeback: (a, b) => ((b.comeback ?? -1) - (a.comeback ?? -1)) || (a.order - b.order),
  leaving: (a, b) => ((a.outAt ?? Infinity) - (b.outAt ?? Infinity)) || (a.order - b.order),
  name: (a, b) => a.title.localeCompare(b.title, 'de'),
  'name-desc': (a, b) => b.title.localeCompare(a.title, 'de'),
};

function tileFor(o) {
  return offerTile(o, { watch: watchHit(watch, o.title, ...o.items.map((i) => `${i.name} ${i.set}`)) });
}

function gridClass() {
  return ['grid', 'grid--shop', state.size === 'large' ? 'grid--large' : '', state.hideStrip ? 'no-strip' : '', state.hideTags ? 'no-tags' : ''].filter(Boolean).join(' ');
}

function renderResults() {
  const shop = getShop();
  const out = $('[data-results]', el);
  if (!shop || !out) return;
  stopTileVideos();
  const q = norm(state.q);
  const list = shop.offers.filter((o) => matches(o, q));
  const filtered = list.length !== shop.offers.length;
  const sort = state.tab === 'comeback' && state.sort === 'shop' ? 'comeback' : state.sort;
  $('[data-count]', el).textContent = filtered ? `${fmtNum(list.length)} von ${fmtNum(shop.offers.length)} Angeboten` : `${fmtNum(list.length)} Angebote in ${shop.sections.length} Bereichen`;

  if (state.tab === 'afford' && store.balance == null) {
    out.innerHTML = emptyBox('Guthaben fehlt', 'Trag oben rechts dein V-Bucks-Guthaben ein, dann zeigt dieser Filter alles, was du dir leisten kannst.');
    return;
  }
  if (!list.length) {
    out.innerHTML = emptyBox('Nichts gefunden', 'Mit diesen Filtern ist heute nichts im Shop. Nimm einen Filter raus oder such nach etwas anderem.', '<button class="btn" type="button" data-reset>Filter zurücksetzen</button>');
    return;
  }
  if (sort !== 'shop') {
    out.innerHTML = `<div class="${gridClass()}">${[...list].sort(SORT_FN[sort]).map(tileFor).join('')}</div>`;
    observeTiles();
    return;
  }
  const visible = new Set(list.map((o) => o.key));
  out.innerHTML = `<div class="sections">${shop.sections.map((s) => {
    const offers = s.offers.filter((o) => visible.has(o.key));
    if (!offers.length) return '';
    const k = sectionKey(s);
    const closed = !filtered && !!state.closed[k];
    const all = filtered || showsAll(k);
    const shown = all ? offers : offers.slice(0, PREVIEW);
    const canMore = !filtered && offers.length > PREVIEW;
    return `<section class="section${closed ? ' is-closed' : ''}" aria-labelledby="sec-${esc(s.id)}">
      <h2 class="sec-head" id="sec-${esc(s.id)}">
        <button type="button" data-collapse="${esc(k)}" aria-expanded="${!closed}">
          <span>${esc(s.name)}</span><span class="sec-head__count">${fmtNum(offers.length)}</span><span class="arrow" aria-hidden="true"></span>
        </button>
      </h2>
      ${s.id === REGIONAL ? '<p class="sec-note">Diese Angebote erscheinen nicht in jedem Land im Shop.</p>' : ''}
      ${closed ? '' : `<div class="${gridClass()}">${shown.map(tileFor).join('')}</div>
      ${canMore ? `<button class="more" type="button" data-more="${esc(k)}" aria-expanded="${all}">${all ? 'Weniger anzeigen' : `Alle ${fmtNum(offers.length)} anzeigen`}${icons.chevron}</button>` : ''}`}
    </section>`;
  }).join('')}</div>`;
  observeTiles();
}

function scrollToShop() {
  const bar = $('#shop-start', el) || $('[data-results]', el);
  const y = bar.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 72) - 8;
  window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function onClick(e) {
  const t = e.target;
  if (t.closest('[data-scroll-shop]')) { scrollToShop(); return; }
  if (t.closest('[data-retry]')) { el.innerHTML = hero() + skeletonTiles(12); applyHeroImage(); load(); return; }
  const dropBtn = t.closest('.drop__btn');
  if (dropBtn) {
    const d = dropBtn.closest('.drop');
    const open = !d.classList.contains('is-open');
    closeDrops(d);
    d.classList.toggle('is-open', open);
    dropBtn.setAttribute('aria-expanded', String(open));
    d.querySelector('.drop__menu').hidden = !open;
    return;
  }
  const tab = t.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    renderTabs();
    renderResults();
    if (!tab.closest('.shop-head')) scrollToShop();
    return;
  }
  const sort = t.closest('[data-sort]');
  if (sort) {
    state.sort = sort.dataset.sort;
    persist();
    $$('[data-sort]', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.sort === state.sort));
    closeDrops();
    renderResults();
    return;
  }
  const size = t.closest('[data-size]');
  if (size) {
    state.size = size.dataset.size;
    persist();
    renderSettings();
    renderResults();
    return;
  }
  if (t.closest('[data-types-reset]')) {
    state.types = [];
    renderTypes();
    renderResults();
    return;
  }
  const col = t.closest('[data-collapse]');
  if (col) {
    const k = col.dataset.collapse;
    state.closed[k] = !state.closed[k];
    if (!state.closed[k]) delete state.closed[k];
    persist();
    renderResults();
    return;
  }
  const more = t.closest('[data-more]');
  if (more) {
    const k = more.dataset.more;
    const next = !showsAll(k);
    state.all[k] = next;
    persist();
    renderResults();
    if (!next) more.closest('.section')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  if (t.closest('[data-reset]')) {
    state.q = ''; state.tab = 'all'; state.types = [];
    render();
  }
}

function onChange(e) {
  const t = e.target;
  if (t.matches('[data-type]')) {
    const v = t.dataset.type;
    state.types = t.checked ? [...new Set([...state.types, v])] : state.types.filter((x) => x !== v);
    renderTypes();
    renderResults();
    return;
  }
  if (t.matches('[data-set]')) {
    const k = t.dataset.set;
    if (k === 'hoverVideo') { store.setSettings({ hoverVideo: t.checked ? undefined : false }); if (!t.checked) stopTileVideos(); return; }
    state[k] = t.checked;
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
