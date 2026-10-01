// Item-Shop: live, mit Sektionen, Filtern, Comebacks und Countdowns.
import { $, esc, fmtNum, fmtDateLong, fmtTime, icons, debounce, nextReset, lsGet, lsSet, norm, fmtClock } from '../util.js';
import { loadShop, onShop, getShop, loadConfig, watchHit } from '../data.js';
import { offerTile, skeletonTiles, errorBox, emptyBox } from '../components.js';
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

export async function init(container) {
  el = container;
  el.innerHTML = `<div class="shop-head"><div><p class="label kicker">Fortnite Item-Shop</p><h1 class="display">Item-Shop</h1></div></div>${skeletonTiles(12)}`;
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
    el.innerHTML = `<div class="shop-head"><div><p class="label kicker">Fortnite Item-Shop</p><h1 class="display">Item-Shop</h1></div></div>${errorBox(err)}`;
  }
}

export function onShow() {
  if (getShop()) renderWishHits();
}

function render() {
  const shop = getShop();
  if (!shop) return;
  const resetAt = nextReset();
  const counts = {
    all: shop.offers.length,
    new: shop.offers.filter((o) => o.isNew).length,
    comeback: shop.offers.filter((o) => o.comeback >= 100).length,
    leaving: shop.offers.filter((o) => o.leavesToday).length,
  };
  el.innerHTML = `
    <header class="shop-head">
      <div>
        <p class="label kicker">Fortnite Item-Shop</p>
        <h1 class="display">Item-Shop</h1>
        <p class="date">${esc(fmtDateLong(shop.date || Date.now()))}</p>
      </div>
      <div class="big-clock" aria-live="off">
        <div class="digits" data-until-reset data-fmt="clock">${fmtClock(resetAt - Date.now())}</div>
        <span class="label">bis zum neuen Shop · ${esc(fmtTime(resetAt))} Uhr</span>
      </div>
      <ul class="facts">
        <li><b>${fmtNum(counts.all)}</b><span class="label">Angebote</span></li>
        <li data-tone="new"><b>${fmtNum(counts.new)}</b><button class="linkbtn label" type="button" data-quick="new">zum ersten Mal im Shop</button></li>
        <li data-tone="comeback"><b>${fmtNum(counts.comeback)}</b><button class="linkbtn label" type="button" data-quick="comeback">Comebacks nach 100+ Tagen</button></li>
        <li data-tone="leaving"><b>${fmtNum(counts.leaving)}</b><button class="linkbtn label" type="button" data-quick="leaving">gehen heute Nacht</button></li>
      </ul>
    </header>
    <div data-wishhits></div>
    <div class="toolbar" role="search">
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
  renderTypes();
  renderWishHits();
  renderResults();
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
  slot.innerHTML = `<div class="banner--wish"><div class="banner__inner" style="margin:0">
    <p><strong>Wunschliste</strong>${hits.length === 1 ? 'Ein Item von deiner Wunschliste ist' : `${hits.length} Items von deiner Wunschliste sind`} heute im Shop: ${hits.map((h) => `<a href="#/item/${encodeURIComponent(h.id)}">${esc(h.name)}</a>`).join(', ')}.</p>
    <button class="btn btn--sm" type="button" data-flag-on="wish">Nur diese zeigen</button>
  </div></div>`;
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
    return;
  }
  const visible = new Set(list.map((o) => o.key));
  out.innerHTML = `<div style="display:grid;gap:34px">${shop.sections.map((s) => {
    const offers = s.offers.filter((o) => visible.has(o.key));
    if (!offers.length) return '';
    const open = filtered || isOpen(s);
    return `<section class="section" aria-labelledby="sec-${esc(s.id)}">
      <div class="section-head">
        <h2 id="sec-${esc(s.id)}">${esc(s.name)}</h2>
        <span class="count">${fmtNum(offers.length)}</span>
        <span class="rule" aria-hidden="true"></span>
        ${filtered ? '' : `<button class="btn btn--ghost btn--sm toggle" type="button" data-toggle="${esc(sectionKey(s))}" aria-expanded="${open}">${open ? 'Einklappen' : 'Anzeigen'}</button>`}
      </div>
      ${open ? `<div class="grid">${offers.map(tileFor).join('')}</div>` : ''}
    </section>`;
  }).join('')}</div>`;
}

function onClick(e) {
  const t = e.target;
  if (t.closest('[data-retry]')) { el.innerHTML = skeletonTiles(12); load(); return; }
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
    $('.toolbar', el)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

