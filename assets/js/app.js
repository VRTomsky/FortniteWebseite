// App-Kern: Router, Topbar (transparent → Glas), Profil-Menü, Countdowns, Guthaben, Wunschliste, Audio.
import { $, $$, esc, fmtClock, fmtNum, fmtShort, nextReset, toast, icons } from './util.js';
import { store } from './store.js';
import { loadShop, onShop, getShop, pollForNewShop } from './data.js';
import { getSnap, leaveText, stripTime } from './components.js';
import { playTrack, leaveHover, onAudio, isMissing } from './audio.js';
import { startTile, leaveTile, onVideo, videoState, stopAll as stopTileVideos, fallback as videoFallback } from './video.js';

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
const topbar = $('[data-topbar]');
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
  if (active && active !== name) { scrollPos[active] = window.scrollY; stopTileVideos(); }
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
  updateTopbar();
}

async function route() {
  closeMenus();
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

/* ---------- Topbar: über dem Shop-Intro transparent, sonst Glas ---------- */
function updateTopbar() {
  const solid = active !== 'shop' || window.scrollY > 24 || !$('[data-mobile-menu]').hidden;
  topbar.classList.toggle('is-solid', solid);
}
window.addEventListener('scroll', updateTopbar, { passive: true });

/* ---------- Menüs ---------- */
const burger = $('[data-burger]');
const mobileMenu = $('[data-mobile-menu]');
const userBtn = $('[data-user-btn]');
const userMenu = $('[data-user-menu]');

function closeMenus() {
  mobileMenu.hidden = true;
  burger.setAttribute('aria-expanded', 'false');
  userMenu.hidden = true;
  userBtn.setAttribute('aria-expanded', 'false');
  updateTopbar();
}

function renderUser() {
  const s = store.settings;
  const name = s.epicName || '';
  $('[data-user-name]').textContent = name || (s.setupDone ? 'Profil' : 'Setup');
  const av = $('[data-avatar]');
  av.innerHTML = name ? esc(name.charAt(0).toUpperCase()) : (s.setupDone ? icons.user : '!');
  const bal = store.balance;
  userMenu.innerHTML = `
    <div class="menu__head">
      <span class="label">${name ? 'Angemeldet als' : 'Noch nicht eingerichtet'}</span>
      <strong>${esc(name || 'Gast')}</strong>
      ${bal != null ? `<span class="muted" style="font-size:var(--t-sm)">${fmtNum(bal)} V-Bucks Guthaben</span>` : ''}
    </div>
    <a href="#/stats" role="menuitem">Meine Stats</a>
    <a href="#/spind" role="menuitem">Spind & Wunschliste</a>
    <a href="#/vbucks" role="menuitem">V-Bucks-Rechner</a>
    <a href="#/setup" role="menuitem">Einstellungen</a>
    ${s.setupDone ? '' : '<a class="menu__cta" href="#/setup" role="menuitem">Einmal-Setup starten</a>'}`;
}

/* ---------- Countdowns ---------- */
let resetAt = nextReset();
let resetFired = false;
const pad = (n) => String(n).padStart(2, '0');
function tick() {
  const now = Date.now();
  if (now >= resetAt && !resetFired) {
    resetFired = true;
    toast('Shop-Wechsel – der neue Shop wird geladen …');
    pollForNewShop(() => { toast('Der neue Shop ist da'); resetAt = nextReset(); resetFired = false; });
  }
  const left = Math.max(0, resetAt - now);
  const clock = fmtClock(left);
  $$('[data-until-reset]').forEach((el) => { el.textContent = clock; });
  const s = Math.floor(left / 1000);
  const parts = { h: pad(Math.floor(s / 3600)), m: pad(Math.floor((s % 3600) / 60)), s: pad(s % 60) };
  $$('[data-cd]').forEach((el) => { const v = parts[el.dataset.cd]; if (el.textContent !== v) el.textContent = v; });
  $$('[data-until][data-fmt="clock"]').forEach((el) => { el.textContent = fmtClock(Number(el.dataset.until) - now); });
}
function tickSlow() {
  const now = Date.now();
  $$('[data-until][data-fmt="leave"]').forEach((el) => {
    const t = Number(el.dataset.until);
    el.textContent = leaveText(t);
    el.classList.toggle('is-soon', t - now < 86400000);
  });
  $$('[data-until][data-fmt="strip"]').forEach((el) => {
    const t = Number(el.dataset.until);
    el.textContent = stripTime(t);
    el.parentElement.title = leaveText(t);
    el.parentElement.classList.toggle('is-soon', t - now < 86400000);
  });
  $$('[data-until][data-fmt="short"]').forEach((el) => { el.textContent = fmtShort(Number(el.dataset.until) - now); });
}
setInterval(tick, 1000);
setInterval(tickSlow, 60000);

/* ---------- Guthaben ---------- */
function renderBalance() {
  const b = store.balance;
  $$('[data-balance]').forEach((el) => { el.textContent = b == null ? 'Guthaben' : fmtNum(b); });
  $$('.pill--vb').forEach((el) => el.classList.toggle('is-empty', b == null));
}
let pop = null;
function closePop() { pop?.remove(); pop = null; document.removeEventListener('pointerdown', outsidePop, true); }
function outsidePop(e) { if (pop && !pop.contains(e.target) && !e.target.closest('[data-balance-btn]')) closePop(); }
function openBalance(btn) {
  if (pop) { closePop(); return; }
  const r = btn.getBoundingClientRect();
  pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'V-Bucks-Guthaben');
  pop.innerHTML = `<h3>Dein Guthaben</h3>
    <p>Trag ein, wie viele V-Bucks du gerade hast. Dann siehst du, was du dir leisten kannst und was beim Aufladen fehlt. Bleibt nur in diesem Browser.</p>
    <form class="row" data-balance-form>
      <label class="sr-only" for="balance-input">V-Bucks</label>
      <input class="input num" id="balance-input" type="number" min="0" step="50" inputmode="numeric" placeholder="z. B. 800" value="${store.balance ?? ''}">
      <button class="btn btn--primary" type="submit">Speichern</button>
    </form>`;
  document.body.append(pop);
  const w = pop.offsetWidth;
  pop.style.top = `${r.bottom + 10}px`;
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
  setTimeout(() => document.addEventListener('pointerdown', outsidePop, true));
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
        body: fresh.map((h) => h.name).join(', '), icon: fresh[0].img || 'assets/img/favicon.svg', tag: `sr-${day}`,
      });
    } catch { /* nur per Service Worker erlaubt */ }
  }
  return hits;
}

/* ---------- Beim Drüberfahren: Songs spielen an, Kacheln mit Video (Fortnite.GG) bewegen sich ---------- */
const metaOf = (btn) => ({ key: btn.dataset.key, title: btn.dataset.title, artist: btn.dataset.artist, art: btn.dataset.art });
let hoverTimer = null;
let hoverTile = null;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse' || !finePointer.matches) return;
  const tile = e.target.closest('[data-track-tile], [data-vid]');
  if (!tile || tile === hoverTile) return;
  hoverTile = tile;
  clearTimeout(hoverTimer);
  if (tile.dataset.trackTile) {
    const btn = tile.querySelector('[data-play="track"]');
    if (!btn || isMissing(metaOf(btn)) || videoState().playing) return;
    hoverTimer = setTimeout(() => playTrack(metaOf(btn), { mode: 'hover' }), 420);
  } else if (store.settings.hoverVideo !== false) {
    hoverTimer = setTimeout(() => startTile(tile, 'hover'), 260);
  }
});
document.addEventListener('pointerout', (e) => {
  const tile = e.target.closest('[data-track-tile], [data-vid]');
  if (!tile || tile.contains(e.relatedTarget)) return;
  clearTimeout(hoverTimer);
  if (tile.dataset.trackTile) leaveHover(tile.dataset.trackTile);
  else leaveTile(tile);
  if (hoverTile === tile) hoverTile = null;
});
onVideo((s) => {
  $$('[data-play="video"]').forEach((b) => {
    const mine = s.tile && s.tile.contains(b);
    const st = mine ? (s.loading ? 'loading' : s.playing ? 'playing' : 'paused') : 'idle';
    if (b.dataset.state !== st) b.dataset.state = st;
    b.style.setProperty('--p', mine ? s.p.toFixed(4) : 0);
    b.setAttribute('aria-pressed', mine && s.playing ? 'true' : 'false');
  });
});
onAudio((s) => {
  $$('[data-play="track"]').forEach((b) => {
    const mine = b.dataset.key === s.key;
    const st = mine ? (s.loading ? 'loading' : s.playing ? 'playing' : 'paused') : (isMissing(metaOf(b)) ? 'missing' : 'idle');
    if (b.dataset.state !== st) b.dataset.state = st;
    b.style.setProperty('--p', mine ? s.p.toFixed(4) : 0);
    b.setAttribute('aria-pressed', mine && s.playing ? 'true' : 'false');
  });
});

/* ---------- Globale Klicks ---------- */
document.addEventListener('click', (e) => {
  const play = e.target.closest('[data-play]');
  if (play) {
    e.preventDefault();
    e.stopPropagation();
    if (play.dataset.play === 'track') { playTrack(metaOf(play), { mode: 'click' }); return; }
    const tile = play.closest('[data-vid]');
    if (tile) startTile(tile, 'click').then((ok) => { if (!ok) videoFallback(tile); });
    else videoFallback(play.closest('.tile, .audio-line') || play.parentElement);
    return;
  }
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
  if (bal) { closeMenus(); openBalance(bal); return; }
  if (e.target.closest('[data-burger]')) {
    const open = mobileMenu.hidden;
    closeMenus();
    mobileMenu.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    updateTopbar();
    return;
  }
  if (e.target.closest('[data-user-btn]')) {
    const open = userMenu.hidden;
    closeMenus();
    userMenu.hidden = !open;
    userBtn.setAttribute('aria-expanded', String(open));
    return;
  }
  if (!e.target.closest('[data-user-menu]') && !userMenu.hidden) closeMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (!userMenu.hidden || !mobileMenu.hidden)) closeMenus(); });

window.addEventListener('store', (e) => {
  if (e.detail === 'wish') {
    $$('[data-fav]').forEach((b) => b.setAttribute('aria-pressed', store.isWished(b.dataset.fav)));
    const s = getShop();
    if (s) checkWishHits(s);
  }
  if (e.detail === 'settings') { renderBalance(); renderUser(); }
});

// Bild-Fallbacks: nächstes Bild probieren, sonst ausblenden
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const list = (img.dataset.fallback || '').split('|').filter(Boolean);
  if (list.length) { img.dataset.fallback = list.slice(1).join('|'); img.src = list[0]; }
  else img.style.visibility = 'hidden';
}, true);

document.addEventListener('visibilitychange', () => {
  const s = getShop();
  if (document.visibilityState === 'visible' && s && Date.now() - s.loadedAt > 20 * 60000) loadShop({ force: true }).catch(() => {});
});

onShop((shop) => checkWishHits(shop));

/* ---------- Start ---------- */
renderBalance();
renderUser();
tick();
route();
loadShop().catch(() => { /* die Shop-Ansicht zeigt den Fehler */ });
