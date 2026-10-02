// Song-Vorschau (30 s Original über die iTunes-Suche) und Mini-Player für Emote-Videos ohne Fortnite.GG-Video (YouTube).
import { esc, norm, lsGet, lsSet, toast, icons } from './util.js';

const CACHE_KEY = 'sr.previews.v1';
const cache = lsGet(CACHE_KEY, {});
const missing = new Set(Object.entries(cache).filter(([, v]) => v.none && Date.now() - v.at < 7 * 86400000).map(([k]) => k));
let audio = null;
let current = null;
let fadeTimer = null;
const listeners = new Set();

export const onAudio = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function state() {
  return {
    key: current?.key || null,
    mode: current?.mode || null,
    loading: !!current?.loading,
    playing: !!(audio && !audio.paused),
    p: audio && audio.duration ? audio.currentTime / audio.duration : 0,
    meta: current,
  };
}
const emit = () => { const s = state(); listeners.forEach((fn) => fn(s)); };
export const isMissing = (meta) => missing.has(cacheKey(meta));
const cacheKey = (m) => norm(`${m.artist}|${m.title}`);
const mainArtist = (a) => norm(String(a || '').split(/\s(?:ft\.?|feat\.?|x)\s|,|&/i)[0]);
const BAD = /instrumental|karaoke|originally performed|tribute|made famous|cover version|in the style of/i;

function pickBest(results, title, artist) {
  const t = norm(title.replace(/\(.*?\)/g, ''));
  const a = mainArtist(artist);
  let best = null, bestScore = 0;
  for (const r of results) {
    if (!r.previewUrl || BAD.test(r.trackName || '') || BAD.test(r.collectionName || '')) continue;
    const rt = norm((r.trackName || '').replace(/\(.*?\)/g, ''));
    const ra = norm(r.artistName);
    if (!a || !ra.includes(a)) continue;
    let s = rt === t ? 4 : rt.startsWith(t) ? 3 : rt.includes(t) || t.includes(rt) ? 2 : 0;
    if (!s) continue;
    if (!/\b(live|remix|sped up|slowed)\b/i.test(r.trackName || '')) s += 1;
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best;
}

/** Vorschau suchen (gecacht). null, wenn es keine passende gibt. */
export async function findPreview(meta) {
  const k = cacheKey(meta);
  const hit = cache[k];
  if (hit?.url) return hit;
  if (hit?.none && Date.now() - hit.at < 7 * 86400000) return null;
  const term = `${mainArtist(meta.artist)} ${String(meta.title).replace(/\(.*?\)/g, '')}`.trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: 'song', limit: '15', country: 'DE' })}`, { signal: ctrl.signal });
    const data = await res.json();
    const best = pickBest(data.results || [], meta.title, meta.artist);
    cache[k] = best ? { url: best.previewUrl, link: best.trackViewUrl || null, at: Date.now() } : { none: true, at: Date.now() };
  } finally {
    clearTimeout(timer);
  }
  if (cache[k].none) missing.add(k);
  lsSet(CACHE_KEY, cache);
  return cache[k].url ? cache[k] : null;
}

/** Song abspielen. mode 'hover' = leise Anspielen, 'click' = festhalten (mit „Läuft gerade“-Leiste). */
export async function playTrack(meta, { mode = 'click' } = {}) {
  // Ein angeklickter Song läuft weiter, Hover über andere Kacheln unterbricht ihn nicht
  if (mode === 'hover' && current?.mode === 'click' && current.key !== meta.key) return;
  if (current?.key === meta.key) {
    if (mode === 'hover') return;
    if (current.mode === 'hover') { current.mode = 'click'; window.dispatchEvent(new Event('sr-audio')); if (audio) audio.volume = 1; if (audio?.paused) await audio.play().catch(() => {}); renderNow(); emit(); return; }
    if (audio?.paused) await audio.play().catch(() => {}); else audio?.pause();
    emit();
    return;
  }
  closeMini();
  stop(true);
  if (mode === 'click') window.dispatchEvent(new Event('sr-audio'));
  current = { ...meta, mode, loading: true };
  emit();
  let found = null;
  try { found = await findPreview(meta); } catch { found = null; }
  if (current?.key !== meta.key) return;
  if (!found) {
    current = null;
    emit();
    if (mode === 'click') toast('Für diesen Song gibt es leider keine Vorschau.');
    return;
  }
  const a = new Audio(found.url);
  a.preload = 'auto';
  a.volume = mode === 'hover' ? 0.5 : 1;
  audio = a;
  current.link = found.link;
  a.addEventListener('timeupdate', emit);
  a.addEventListener('pause', emit);
  a.addEventListener('playing', () => { if (current) current.loading = false; emit(); });
  a.addEventListener('ended', () => stop());
  a.addEventListener('error', () => { if (current?.mode === 'click') toast('Die Vorschau konnte nicht geladen werden.'); stop(); });
  try {
    await a.play();
  } catch {
    // Browser blockt Ton, bis man einmal auf der Seite geklickt hat → beim Hover still aufgeben
    if (mode === 'hover') { stop(); return; }
    if (current) current.loading = false;
  }
  if (mode === 'click') renderNow();
  emit();
}

export function stop(silent = false) {
  clearInterval(fadeTimer);
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
  current = null;
  renderNow();
  if (!silent) emit();
}

/** Hover-Vorschau sanft ausblenden (geklickte Songs laufen weiter) */
export function leaveHover(key) {
  if (!current || current.key !== key || current.mode !== 'hover') return;
  if (!audio) { stop(); return; }
  const a = audio;
  clearInterval(fadeTimer);
  fadeTimer = setInterval(() => {
    if (a !== audio) { clearInterval(fadeTimer); return; }
    a.volume = Math.max(0, a.volume - 0.08);
    if (a.volume <= 0.02) stop();
  }, 40);
}

/* ---------- „Läuft gerade“-Leiste ---------- */
function root() { return document.getElementById('player-root'); }

function renderNow() {
  const r = root();
  if (!r) return;
  const old = r.querySelector('.now');
  if (!current || current.mode !== 'click') { old?.remove(); return; }
  if (old && old.dataset.key === current.key) return;
  old?.remove();
  r.querySelector('.mini')?.remove();
  r.insertAdjacentHTML('beforeend', `<div class="now" data-key="${esc(current.key)}" role="region" aria-label="Läuft gerade">
    ${current.art ? `<img src="${esc(current.art)}" alt="">` : ''}
    <div class="now__txt">
      <strong>${esc(current.title)}</strong>
      <span>${esc(current.artist || '')} · Vorschau${current.link ? ` · <a href="${esc(current.link)}" target="_blank" rel="noopener">Apple Music</a>` : ''}</span>
      <div class="now__bar"><i></i></div>
    </div>
    <button class="iconbtn iconbtn--main" type="button" data-now-toggle aria-label="Pause">${icons.pause}</button>
    <button class="iconbtn" type="button" data-now-close aria-label="Vorschau beenden">${icons.close}</button>
  </div>`);
  const el = r.querySelector('.now');
  el.querySelector('[data-now-toggle]').addEventListener('click', () => { if (!audio) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
  el.querySelector('[data-now-close]').addEventListener('click', () => stop());
}

onAudio((s) => {
  const el = root()?.querySelector('.now');
  if (!el) return;
  el.style.setProperty('--p', s.p.toFixed(4));
  const btn = el.querySelector('[data-now-toggle]');
  if (btn) {
    btn.innerHTML = s.playing ? icons.pause : icons.play;
    btn.setAttribute('aria-label', s.playing ? 'Pause' : 'Weiter abspielen');
  }
});

/* ---------- Mini-Player für Emote-Videos ---------- */
export function openMini({ video, title }) {
  stop();
  window.dispatchEvent(new Event('sr-audio'));
  const r = root();
  if (!r) return;
  closeMini();
  r.insertAdjacentHTML('beforeend', `<div class="mini" role="dialog" aria-label="${esc(title)} – Video mit Ton">
    <div class="mini__bar"><span>${esc(title)}</span><button class="iconbtn" type="button" data-mini-close aria-label="Video schließen">${icons.close}</button></div>
    <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(video)}?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="${esc(title)} im Spiel" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  </div>`);
  r.querySelector('[data-mini-close]').addEventListener('click', closeMini);
}
export function closeMini() { root()?.querySelector('.mini')?.remove(); }
