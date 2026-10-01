// Kleine Helfer: DOM, Escaping, Datum, Zahlen, Storage.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const DAY = 86400000;

/** 'YYYY-MM-DD' (UTC) aus Datum/ISO-String */
export function dayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? '' : x.toISOString().slice(0, 10);
}
/** Ganze Tage seit 1970 (UTC) — kompakt und gut zu vergleichen */
export const dayNum = (d) => Math.floor((d instanceof Date ? d.getTime() : Date.parse(d)) / DAY);
export const numToDate = (n) => new Date(n * DAY);
export const todayNum = () => Math.floor(Date.now() / DAY);

const fmtD = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const fmtDLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtN = new Intl.NumberFormat('de-DE');
const fmtE = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const fmtDate = (d) => (d == null ? '–' : fmtD.format(typeof d === 'number' ? numToDate(d) : new Date(d)));
export const fmtDateLong = (d) => fmtDLong.format(typeof d === 'number' ? numToDate(d) : new Date(d));
export const fmtTime = (d) => fmtT.format(new Date(d));
export const fmtNum = (n) => fmtN.format(n ?? 0);
export const fmtEur = (n) => fmtE.format(n ?? 0);

const years = (days) => { const y = (days / 365.25).toFixed(1); return y.endsWith('.0') ? y.slice(0, -2) : y.replace('.', ','); };

/** "heute", "gestern", "vor 12 Tagen", "vor 3 Monaten", "vor 2 Jahren" */
export function fmtAgo(days) {
  if (days == null || isNaN(days)) return 'nie';
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 60) return `vor ${days} Tagen`;
  if (days < 730) return `vor ${Math.round(days / 30.44)} Monaten`;
  return `vor ${days >= 3652 ? Math.round(days / 365.25) : years(days)} Jahren`;
}
/** Abstand in Tagen als knappes Label: "251 Tage", "1,4 Jahre" */
export function fmtSpan(days) {
  if (days == null) return '–';
  if (days < 365) return `${fmtNum(days)} ${days === 1 ? 'Tag' : 'Tage'}`;
  const y = years(days);
  return `${y} ${y === '1' ? 'Jahr' : 'Jahre'}`;
}
/** Dativ für „nach …“: "nach 251 Tagen", "nach 1,3 Jahren" */
export function fmtAfter(days) {
  if (days < 365) return `${fmtNum(days)} ${days === 1 ? 'Tag' : 'Tagen'}`;
  const y = years(days);
  return `${y} ${y === '1' ? 'Jahr' : 'Jahren'}`;
}

/** Countdown "HH:MM:SS" bzw. "2 T 04:12:09" */
export function fmtClock(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return d > 0 ? `${d} T ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}
/** Grober Countdown "3 T 4 Std", "5 Std 12 Min", "8 Min" */
export function fmtShort(ms) {
  if (ms <= 0) return 'jetzt';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d} T ${h} Std`;
  if (h > 0) return `${h} Std ${m % 60} Min`;
  return `${Math.max(1, m)} Min`;
}

/** Nächster Shop-Wechsel: täglich 00:00 UTC */
export function nextReset(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** 'f1c200ff' → '#f1c200' */
export function hex(c) {
  if (!c) return null;
  const s = String(c).replace(/[^0-9a-f]/gi, '').slice(0, 6);
  return s.length === 6 ? `#${s.toLowerCase()}` : null;
}
/** Farbe abdunkeln/aufhellen (amt -1..1) */
export function shade(color, amt) {
  const n = parseInt(color.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Für Suche: klein, ohne Akzente/Satzzeichen */
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9äöüß]+/g, ' ').trim();

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function lsDel(key) {
  try { localStorage.removeItem(key); } catch { /* egal */ }
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Tage zwischen sortierten Day-Nummern → Läufe (zusammenhängende Shop-Tage) */
export function runsOf(days) {
  const runs = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && d - last.end <= 1) last.end = d; else runs.push({ start: d, end: d });
  }
  return runs;
}

export const icons = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zm5.3-2.2L21 21"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" d="M5 5l14 14M19 5L5 19"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4v16l13-8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.8" d="M4 12.5l5 5L20 6.5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/></svg>',
};
