// Archiv: jedes Cosmetic durchsuchen — wann zuletzt im Shop, wie oft, längste Pause.
import { $, esc, fmtNum, fmtDate, debounce, norm, icons, lsGet, lsSet } from '../util.js';
import { loadIndex, getShop, loadShop, normalizeBr, historyStats } from '../data.js';
import { api } from '../api.js';
import { itemTile, skeletonTiles, errorBox, emptyBox } from '../components.js';
import { typeLabel, rarityLabel, TYPE_ORDER, RARITY_ORDER } from '../labels.js';

const PAGE = 60;
const KEY = 'sr.archive.v1';
const PRESETS = [
  { id: 'pause', label: 'Längste Pause', set: { type: 'outfit', status: 'seen', sort: 'since-desc' } },
  { id: 'today', label: 'Heute im Shop', set: { type: 'all', status: 'today', sort: 'name' } },
  { id: 'once', label: 'Nur 1× im Shop', set: { type: 'outfit', status: 'once', sort: 'since-desc' } },
  { id: 'never', label: 'Nie im Shop', set: { type: 'outfit', status: 'never', sort: 'added-desc' } },
  { id: 'fresh', label: 'Neu im Spiel', set: { type: 'all', status: 'all', sort: 'added-desc' } },
];
const STATUS = [
  ['all', 'Alle'], ['seen', 'Schon im Shop gewesen'], ['today', 'Heute im Shop'], ['once', 'Nur 1× im Shop'],
  ['year', 'Über 1 Jahr nicht gesehen'], ['never', 'Nie im Shop'],
];
const SORTS = [
  ['relevance', 'Beste Treffer'], ['since-desc', 'Längste Pause zuerst'], ['last-desc', 'Zuletzt im Shop'],
  ['count-desc', 'Am häufigsten im Shop'], ['count-asc', 'Am seltensten im Shop'], ['added-desc', 'Neueste zuerst'], ['name', 'Name A–Z'],
];

let el;
let index = null;
let live = false;
let results = [];
let observer = null;
const liveCache = new Map();
const state = { q: '', type: 'outfit', rarity: 'all', chapter: 'all', status: 'seen', sort: 'since-desc', preset: 'pause', shown: PAGE, ...lsGet(KEY, {}) };
const persist = () => lsSet(KEY, { type: state.type, rarity: state.rarity, chapter: state.chapter, status: state.status, sort: state.sort, preset: state.preset });

export async function init(container) {
  el = container;
  el.innerHTML = head() + skeletonTiles(18, true);
  el.addEventListener('input', debounce(onInput, 160));
  el.addEventListener('change', onChange);
  el.addEventListener('click', onClick);
  loadShop().then(() => { if (state.status === 'today') run(); }).catch(() => {});
  try {
    index = await loadIndex();
  } catch { index = null; }
  live = !index;
  renderShell();
  run();
}

function head() {
  return `<header class="view-head"><div>
    <p class="label kicker">Alle Cosmetics</p>
    <h1 class="display">Archiv</h1>
    <p class="lead">Such jedes Item, das es in Fortnite gibt, und sieh, wann es zuletzt im Shop war, wie oft es kam und wie lange es schon weg ist.</p>
  </div></header>`;
}

function opts(list, cur) { return list.map(([v, l]) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join(''); }

function renderShell() {
  const types = index ? [...new Set(index.items.map((i) => i.type))] : TYPE_ORDER.filter((t) => !['bundle', 'track', 'car', 'instrument', 'lego'].includes(t));
  types.sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
  const rarities = index ? [...new Set(index.items.map((i) => i.rarity))] : RARITY_ORDER;
  rarities.sort((a, b) => (RARITY_ORDER.indexOf(a) + 1 || 99) - (RARITY_ORDER.indexOf(b) + 1 || 99));
  const chapters = index ? [...new Set(index.items.map((i) => i.chapter).filter(Boolean))].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7];

  el.innerHTML = `${head()}
    ${live ? `<div class="notice"><p><strong>Live-Suche.</strong> Der Schnell-Index wird vom GitHub-Workflow erzeugt und ist hier (noch) nicht vorhanden. Du kannst trotzdem nach Namen suchen; Listen wie „Längste Pause“ gehen erst mit Index.</p></div>` : ''}
    <div class="toolbar" role="search">
      <div class="toolbar__row">
        <div class="search">
          ${icons.search}
          <label class="sr-only" for="arc-q">Item suchen</label>
          <input class="input" id="arc-q" type="search" placeholder="${live ? 'Name eingeben, z. B. Renegade' : 'Skin, Spitzhacke, Emote …'}" value="${esc(state.q)}" autocomplete="off" data-q>
        </div>
        <label class="sr-only" for="arc-type">Typ</label>
        <select class="select" id="arc-type" data-f="type">${opts([['all', 'Alle Typen'], ...types.map((t) => [t, typeLabel(t, true)])], state.type)}</select>
        <label class="sr-only" for="arc-rarity">Seltenheit</label>
        <select class="select" id="arc-rarity" data-f="rarity">${opts([['all', 'Alle Seltenheiten'], ...rarities.map((r) => [r, rarityLabel(r)])], state.rarity)}</select>
        <label class="sr-only" for="arc-chapter">Kapitel</label>
        <select class="select" id="arc-chapter" data-f="chapter">${opts([['all', 'Alle Kapitel'], ...chapters.map((c) => [c, `Kapitel ${c}`])], state.chapter)}</select>
        <label class="sr-only" for="arc-status">Shop-Status</label>
        <select class="select" id="arc-status" data-f="status">${opts(STATUS, state.status)}</select>
        <label class="sr-only" for="arc-sort">Sortierung</label>
        <select class="select" id="arc-sort" data-f="sort">${opts(SORTS, state.sort)}</select>
      </div>
      ${live ? '' : `<div class="toolbar__row toolbar__row--scroll">${PRESETS.map((p) => `<button class="chip" type="button" data-preset="${p.id}" aria-pressed="${state.preset === p.id}">${esc(p.label)}</button>`).join('')}</div>`}
    </div>
    <div class="result-line"><p class="label" data-count></p>${index ? `<p class="label faint">Index vom ${esc(fmtDate(index.built))}</p>` : ''}</div>
    <div data-results></div>
    <div class="more" data-more hidden><button class="btn" type="button" data-loadmore>Mehr laden</button></div>
    <div data-sentinel aria-hidden="true" style="height:1px"></div>`;

  observer?.disconnect();
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && state.shown < results.length) more();
  }, { rootMargin: '600px 0px' });
  observer.observe($('[data-sentinel]', el));
}

function inShopToday(id) { return !!getShop()?.byItem.has(id); }

function filterSort(items, q) {
  const s = state;
  const list = items.filter((it) => {
    if (q && !it.search.includes(q)) return false;
    if (s.type !== 'all' && it.type !== s.type) return false;
    if (s.rarity !== 'all' && it.rarity !== s.rarity) return false;
    if (s.chapter !== 'all' && String(it.chapter) !== String(s.chapter)) return false;
    switch (s.status) {
      case 'seen': if (!it.last) return false; break;
      case 'today': if (!inShopToday(it.id)) return false; break;
      case 'once': if (it.runs !== 1) return false; break;
      case 'year': if (!(it.since >= 365)) return false; break;
      case 'never': if (it.last) return false; break;
      default: break;
    }
    return true;
  });
  const by = {
    relevance: (a, b) => rel(a, q) - rel(b, q) || (b.last ?? 0) - (a.last ?? 0),
    'since-desc': (a, b) => (b.since ?? -1) - (a.since ?? -1),
    'last-desc': (a, b) => (b.last ?? 0) - (a.last ?? 0),
    'count-desc': (a, b) => (b.runs ?? 0) - (a.runs ?? 0),
    'count-asc': (a, b) => (a.runs || 9e9) - (b.runs || 9e9),
    'added-desc': (a, b) => (b.added ?? 0) - (a.added ?? 0),
    name: (a, b) => a.name.localeCompare(b.name, 'de'),
  };
  const sort = s.sort === 'relevance' && !q ? 'last-desc' : s.sort;
  return list.sort(by[sort] || by['last-desc']);
}

function rel(it, q) {
  if (!q) return 0;
  const n = norm(it.name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return 3;
}

async function run() {
  const out = $('[data-results]', el);
  if (!out) return;
  const q = norm(state.q);
  state.shown = PAGE;
  if (live) {
    if (q.length < 2) {
      results = [];
      $('[data-count]', el).textContent = '';
      out.innerHTML = emptyBox('Wonach suchst du?', 'Gib mindestens zwei Buchstaben ein, z. B. „Peely“ oder „Raven“.');
      $('[data-more]', el).hidden = true;
      return;
    }
    out.innerHTML = skeletonTiles(12, true);
    try {
      results = filterSort(await liveSearch(q), q);
    } catch (err) {
      if (err.status === 404) results = [];
      else { out.innerHTML = errorBox(err); return; }
    }
  } else {
    results = filterSort(index.items, q);
  }
  draw();
}

async function liveSearch(q) {
  if (liveCache.has(q)) return liveCache.get(q);
  const data = await api.search({ name: q });
  const items = (data || []).map((raw) => {
    const it = normalizeBr(raw);
    const st = historyStats(it.history);
    return { ...it, first: st.first, last: st.last, count: st.count, runs: st.runs, maxGap: st.maxGap, since: st.since, added: raw.added ? Math.floor(Date.parse(raw.added) / 86400000) : 0, search: norm(`${it.name} ${it.set}`) };
  });
  liveCache.set(q, items);
  return items;
}

function draw() {
  const out = $('[data-results]', el);
  const total = results.length;
  $('[data-count]', el).textContent = `${fmtNum(total)} ${total === 1 ? 'Treffer' : 'Treffer'}`;
  if (!total) {
    out.innerHTML = emptyBox('Keine Treffer', 'Probier einen anderen Namen oder lockere die Filter.');
    $('[data-more]', el).hidden = true;
    return;
  }
  out.innerHTML = `<div class="grid grid--compact" data-grid>${results.slice(0, state.shown).map(tile).join('')}</div>`;
  $('[data-more]', el).hidden = state.shown >= total;
}

function tile(it) {
  const badge = inShopToday(it.id) ? '<span class="tag tag--new">Heute im Shop</span>' : '';
  return itemTile(it, { badge });
}

function more() {
  const grid = $('[data-grid]', el);
  if (!grid) return;
  const next = results.slice(state.shown, state.shown + PAGE);
  state.shown += next.length;
  grid.insertAdjacentHTML('beforeend', next.map(tile).join(''));
  $('[data-more]', el).hidden = state.shown >= results.length;
}

function syncControls() {
  for (const k of ['type', 'rarity', 'chapter', 'status', 'sort']) {
    const s = $(`[data-f="${k}"]`, el);
    if (s) s.value = String(state[k]);
  }
  el.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === state.preset));
}

function onInput(e) {
  if (!e.target.matches('[data-q]')) return;
  state.q = e.target.value;
  if (state.q && state.sort !== 'relevance') { state.sort = 'relevance'; state.preset = null; syncControls(); }
  run();
}

function onChange(e) {
  const f = e.target.dataset.f;
  if (!f) return;
  state[f] = e.target.value;
  state.preset = null;
  syncControls();
  persist();
  run();
}

function onClick(e) {
  const p = e.target.closest('[data-preset]');
  if (p) {
    const preset = PRESETS.find((x) => x.id === p.dataset.preset);
    Object.assign(state, { rarity: 'all', chapter: 'all' }, preset.set, { preset: preset.id, q: '' });
    const qi = $('[data-q]', el); if (qi) qi.value = '';
    syncControls();
    persist();
    run();
    return;
  }
  if (e.target.closest('[data-loadmore]')) { more(); return; }
  if (e.target.closest('[data-retry]')) run();
}
