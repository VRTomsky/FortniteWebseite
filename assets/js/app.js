// App-Kern: Router, Topbar-Countdown, Guthaben, Wunschliste, Benachrichtigungen.
import { $, $$, esc, fmtClock, fmtNum, fmtShort, fmtTime, nextReset, toast } from './util.js';
import { store } from './store.js';
import { loadShop, onShop, getShop, pollForNewShop } from './data.js';
import { getSnap, leaveText, leaveShort } from './components.js';

const VIEWS = {
  shop: { title: 'Item-Shop', load: () => import('./views/shop.js') },
  archiv: { title: 'Archiv', load: () => import('./views/archive.js') },
  leaks: { title: 'Leaks', load: () => import('./views/leaks.js') },
  season: { title: 'Season', load: () => import('./views/season.js') },
  vbucks: { title: 'V-Bucks', load: () => import('./views/vbucks.js') },
  spind: { title: 'Spind', load: () => import('./views/locker.js') },
  stats: { title: 'Stats', load: () => import('./views/stats.js') },
  setup: { title: 'Einstellungen', load: () => import('./views/setup.js') },
};

const main = $('#main');
const mounted = {};
const scrollPos = {};
let active = null;
let lastView = 'shop';
let viewerFromApp = false;
let viewerMod = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [route, ...rest] = h.split('/');
  return { route: route || 'shop', arg: decodeURIComponent(rest.join('/')) };
}

async function showView(name) {
  if (!VIEWS[name]) name = 'shop';
  if (active && active !== name) scrollPos[active] = window.scrollY;
  for (const k of Object.keys(mounted)) mounted[k].el.hidden = k !== name;
  $$('[data-nav]').forEach((a) => (a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${VIEWS[name].title} · Shopradar`;
  const first = !mounted[name];
  if (first) {
    const el = document.createElement('section');
    el.className = 'view';
    el.dataset.view = name;
    el.setAttribute('aria-label', VIEWS[name].title);
    main.append(el);
    mounted[name] = { el, mod: null };
    try {
      const mod = await VIEWS[name].load();
      mounted[name].mod = mod;
      active = name;
      await mod.init(el);
    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="error" role="alert"><h3>Seite konnte nicht geladen werden</h3><p>${esc(err.message)}</p></div>`;
    }
  }
  active = name;
  if (!first) mounted[name].mod?.onShow?.();
  window.scrollTo({ top: first ? 0 : (scrollPos[name] || 0) });
}

async function route() {
  const { route: r, arg } = parseHash();
  if (r === 'item' || r === 'offer') {
    if (!active) await showView(lastView);
    viewerMod ||= await import('./viewer.js');
    viewerMod.open(r, arg, { onClose: closeViewer });
    return;
  }
  if (viewerMod?.isOpen()) viewerMod.close();
  viewerFromApp = false;
  lastView = VIEWS[r] ? r : 'shop';
  await showView(lastView);
}

function closeViewer() {
  if (viewerFromApp) history.back();
  else location.hash = `#/${lastView}`;
}

window.addEventListener('hashchange', (e) => {
  const to = parseHash().route;
  const from = new URL(e.oldURL).hash.replace(/^#\/?/, '').split('/')[0] || 'shop';
  if ((to === 'item' || to === 'offer') && !(from === 'item' || from === 'offer')) viewerFromApp = true;
  route();
});

/* ---------- Ticker: alle Countdowns auf der Seite ---------- */
let resetAt = nextReset();
let resetFired = false;
function tick() {
  const now = Date.now();
  if (now >= resetAt && !resetFired) {
    resetFired = true;
    toast('Shop-Wechsel – der neue Shop wird geladen …');
    pollForNewShop(() => { toast('Der neue Shop ist da'); resetAt = nextReset(); resetFired = false; });
  }
  const clock = fmtClock(resetAt - now);
  $$('[data-until-reset]').forEach((el) => { el.textContent = clock; });
  $$('[data-until][data-fmt="clock"]').forEach((el) => { el.textContent = fmtClock(Number(el.dataset.until) - now); });
}
function tickSlow() {
  const now = Date.now();
  $$('[data-until][data-fmt="leave"]').forEach((el) => {
    const t = Number(el.dataset.until);
    el.textContent = leaveText(t);
    el.classList.toggle('is-soon', t - now < 86400000);
  });
  $$('[data-until][data-fmt="leave-short"]').forEach((el) => {
    const t = Number(el.dataset.until);
    el.textContent = leaveShort(t);
    el.title = leaveText(t);
    el.classList.toggle('is-soon', t - now < 86400000);
  });
  $$('[data-until][data-fmt="short"]').forEach((el) => { el.textContent = fmtShort(Number(el.dataset.until) - now); });
}
setInterval(tick, 1000);
setInterval(tickSlow, 60000);

/* ---------- Guthaben ---------- */
function renderBalance() {
  const b = store.balance;
  $$('[data-balance]').forEach((el) => { el.textContent = b == null ? 'Guthaben' : fmtNum(b); });
}
let pop = null;
function closePop() { pop?.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); }
function outside(e) { if (pop && !pop.contains(e.target) && !e.target.closest('[data-balance-btn]')) closePop(); }
function openBalance(btn) {
  if (pop) { closePop(); return; }
  const r = btn.getBoundingClientRect();
  pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'V-Bucks-Guthaben');
  pop.innerHTML = `<h3>Dein Guthaben</h3>
    <p>Trag ein, wie viele V-Bucks du gerade hast. Damit zeigt dir die Seite, was du dir leisten kannst und was beim Aufladen fehlt. Bleibt nur in diesem Browser.</p>
    <form class="row" data-balance-form>
      <label class="sr-only" for="balance-input">V-Bucks</label>
      <input class="input num" id="balance-input" type="number" min="0" step="50" inputmode="numeric" placeholder="z. B. 800" value="${store.balance ?? ''}">
      <button class="btn btn--primary" type="submit">Speichern</button>
    </form>`;
  document.body.append(pop);
  const w = pop.offsetWidth;
  pop.style.top = `${r.bottom + 8}px`;
  pop.style.left = `${Math.max(16, Math.min(window.innerWidth - w - 16, r.right - w))}px`;
  const input = pop.querySelector('input');
  input.focus();
  input.select();
  pop.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    store.setSettings({ balance: v === '' ? undefined : Math.max(0, Math.round(Number(v))) });
    toast(v === '' ? 'Guthaben entfernt' : `Guthaben: ${fmtNum(Number(v))} V-Bucks`);
    closePop();
  });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); btn.focus(); } });
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
}

/* ---------- Setup-Hinweis & Navigation ---------- */
function renderSetupState() {
  const s = store.settings;
  $('[data-setup-link]').hidden = !!(s.setupDone || s.setupDismissed);
  const slot = $('#banner-slot');
  const existing = slot.querySelector('[data-banner="setup"]');
  if (s.setupDone || s.setupDismissed) { existing?.remove(); return; }
  if (existing) return;
  slot.insertAdjacentHTML('beforeend', `<div class="banner" data-banner="setup"><div class="banner__inner">
    <p><strong>Einmal-Setup</strong>Trag einmal deinen API-Key und Epic-Namen ein, dann siehst du deine Stats. Dauert eine Minute, bleibt nur in diesem Browser.</p>
    <a class="btn btn--primary btn--sm" href="#/setup">Setup starten</a>
    <button class="btn btn--ghost btn--sm" type="button" data-dismiss-setup>Später</button>
  </div></div>`);
}

/* ---------- Wunschliste ↔ Shop ---------- */
function checkWishHits(shop) {
  const hits = store.wishList().filter((w) => shop.byItem.has(w.id));
  const dot = $('[data-wish-dot]');
  if (dot) dot.hidden = hits.length === 0;
  const s = store.settings;
  if (!hits.length || !s.notify || !('Notification' in window) || Notification.permission !== 'granted') return hits;
  const day = (shop.date || '').slice(0, 10);
  const fresh = hits.filter((h) => store.shouldNotify(h.id, day));
  if (fresh.length) {
    try {
      new Notification(fresh.length === 1 ? `${fresh[0].name} ist im Shop` : `${fresh.length} Items von deiner Wunschliste sind im Shop`, {
        body: fresh.map((h) => h.name).join(', '),
        icon: fresh[0].img || 'assets/img/favicon.svg',
        tag: `sr-${day}`,
      });
    } catch { /* manche Browser erlauben das nur per Service Worker */ }
  }
  return hits;
}

/* ---------- Globale Ereignisse ---------- */
document.addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault();
    const id = fav.dataset.fav;
    const snap = getSnap(id) || { id, name: id };
    const on = store.toggleWish(snap);
    toast(on ? `${snap.name} gemerkt` : `${snap.name} von der Wunschliste entfernt`);
    return;
  }
  const bal = e.target.closest('[data-balance-btn]');
  if (bal) { openBalance(bal); return; }
  if (e.target.closest('[data-dismiss-setup]')) { store.setSettings({ setupDismissed: true }); }
});

window.addEventListener('store', (e) => {
  if (e.detail === 'wish') {
    $$('[data-fav]').forEach((b) => {
      const on = store.isWished(b.dataset.fav);
      b.setAttribute('aria-pressed', on);
    });
    const s = getShop();
    if (s) checkWishHits(s);
  }
  if (e.detail === 'settings') { renderBalance(); renderSetupState(); }
});

// Bild-Fallbacks: nächstes Bild aus data-fallback probieren, sonst ausblenden
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const list = (img.dataset.fallback || '').split('|').filter(Boolean);
  if (list.length) { img.dataset.fallback = list.slice(1).join('|'); img.src = list[0]; }
  else img.style.visibility = 'hidden';
}, true);

// Tab wieder sichtbar und Daten älter als 20 Min. → still neu laden
document.addEventListener('visibilitychange', () => {
  const s = getShop();
  if (document.visibilityState === 'visible' && s && Date.now() - s.loadedAt > 20 * 60000) loadShop({ force: true }).catch(() => {});
});

onShop((shop) => checkWishHits(shop));

/* ---------- Start ---------- */
renderBalance();
renderSetupState();
tick();
route();
loadShop().catch(() => { /* die Shop-Ansicht zeigt den Fehler */ });

export { checkWishHits };
export const resetTimeLabel = () => fmtTime(nextReset());
