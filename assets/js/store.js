// Alles Persönliche bleibt im Browser (localStorage): Wunschliste, Spind, Einstellungen, API-Key.
import { lsGet, lsSet, lsDel } from './util.js';

const K = { wish: 'sr.wish.v1', owned: 'sr.owned.v1', settings: 'sr.settings.v1', notified: 'sr.notified.v1' };
let wish = lsGet(K.wish, {});
let owned = lsGet(K.owned, {});
let settings = lsGet(K.settings, {});

const emit = (what) => window.dispatchEvent(new CustomEvent('store', { detail: what }));

window.addEventListener('storage', (e) => {
  if (e.key === K.wish) { wish = lsGet(K.wish, {}); emit('wish'); }
  if (e.key === K.owned) { owned = lsGet(K.owned, {}); emit('owned'); }
  if (e.key === K.settings) { settings = lsGet(K.settings, {}); emit('settings'); }
});

function toggle(map, key, snap) {
  if (map[snap.id]) delete map[snap.id];
  else map[snap.id] = { ...snap, at: Date.now() };
  lsSet(key, map);
  return !!map[snap.id];
}

export const store = {
  get settings() { return { ...settings }; },
  setSettings(patch) {
    settings = { ...settings, ...patch };
    for (const k of Object.keys(settings)) if (settings[k] === undefined) delete settings[k];
    lsSet(K.settings, settings);
    emit('settings');
  },
  get balance() { const b = Number(settings.balance); return Number.isFinite(b) && settings.balance !== '' && settings.balance != null ? b : null; },

  isWished: (id) => !!wish[id],
  wishList: () => Object.values(wish).sort((a, b) => b.at - a.at),
  toggleWish(snap) { const on = toggle(wish, K.wish, snap); emit('wish'); return on; },

  isOwned: (id) => !!owned[id],
  ownedList: () => Object.values(owned).sort((a, b) => b.at - a.at),
  toggleOwned(snap) { const on = toggle(owned, K.owned, snap); emit('owned'); return on; },

  /** Einmal pro Shop-Tag und Item benachrichtigen */
  shouldNotify(id, day) {
    const n = lsGet(K.notified, {});
    if (n[id] === day) return false;
    n[id] = day;
    lsSet(K.notified, n);
    return true;
  },

  exportData() {
    return { app: 'shopradar', version: 1, exported: new Date().toISOString(), wish, owned, balance: settings.balance ?? null };
  },
  importData(obj) {
    if (!obj || obj.app !== 'shopradar') throw new Error('Das ist keine Shopradar-Sicherung.');
    wish = { ...wish, ...(obj.wish || {}) };
    owned = { ...owned, ...(obj.owned || {}) };
    lsSet(K.wish, wish); lsSet(K.owned, owned);
    if (obj.balance != null && settings.balance == null) this.setSettings({ balance: obj.balance });
    emit('wish'); emit('owned');
  },
  resetAll() {
    Object.values(K).forEach(lsDel);
    wish = {}; owned = {}; settings = {};
    emit('wish'); emit('owned'); emit('settings');
  },
};
