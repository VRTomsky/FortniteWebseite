// Videos von Fortnite.GG in den Kacheln: Outfits & Co. drehen sich beim Drüberfahren (stumm),
// Emotes tanzen mit Ton. Ein Klick auf den Play-Knopf eines Emotes hält das Video fest – wie bei den Songs.
import { lsGet, lsSet, toast } from './util.js';
import { ggId, ggVideoUrl } from './data.js';
import { state as audioState, stop as stopAudio, openMini, closeMini } from './audio.js';

const KEY = 'sr.novideo.v1';
const TTL = 3 * 86400000; // Fortnite.GG reicht Videos für neue Items oft nach
const noVideo = lsGet(KEY, {});
for (const [k, t] of Object.entries(noVideo)) if (Date.now() - t > TTL) delete noVideo[k];

/** Typen ohne Video bei Fortnite.GG */
export const NO_VIDEO = new Set(['track', 'spray', 'loadingscreen', 'music', 'banner', 'lego', 'bundle']);
/** Beim Drüberfahren mit Ton */
const HOVER_SOUND = new Set(['emote']);

export const hasNoVideo = (g) => !!noVideo[g] && Date.now() - noVideo[g] < TTL;
export function markNoVideo(g) { noVideo[g] = Date.now(); lsSet(KEY, noVideo); }

const listeners = new Set();
export const onVideo = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { const s = videoState(); listeners.forEach((fn) => fn(s)); };

let hover = null; // { tile, v }
let held = null; // { tile, v } – per Klick gestartet, läuft weiter
let pending = null;

export function videoState() {
  const v = held?.v;
  return { tile: held?.tile || null, loading: !!held && !held.ready, playing: !!(v && !v.paused), p: v && v.duration ? v.currentTime / v.duration : 0 };
}

function makeVideo(tile, g, { sound, volume }) {
  const v = document.createElement('video');
  v.className = 'tile__video';
  v.playsInline = true;
  v.loop = true;
  v.preload = 'auto';
  v.muted = !sound;
  v.volume = volume;
  v.disablePictureInPicture = true;
  v.setAttribute('aria-hidden', 'true');
  v.src = ggVideoUrl(g, true);
  tile.querySelector('.tile__media')?.append(v);
  return v;
}

function kill(slot) {
  if (!slot) return;
  const { tile, v } = slot;
  if (v) {
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
  }
  if (!(hover?.tile === tile && hover !== slot) && !(held?.tile === tile && held !== slot)) tile.classList.remove('is-video');
}

export function stopHover() { const s = hover; hover = null; kill(s); }
export function stopHeld() { const s = held; held = null; kill(s); emit(); }
export function stopAll() { pending = null; stopHover(); stopHeld(); }

async function play(v) {
  try { await v.play(); return true; } catch {
    if (!v.muted) { v.muted = true; try { await v.play(); return true; } catch { /* weiter unten */ } }
    return false;
  }
}

/**
 * Video in einer Kachel starten. mode 'hover' = Vorschau beim Drüberfahren, 'click' = festhalten (Play-Knopf).
 * Gibt false zurück, wenn es für das Item kein Video gibt.
 */
export async function startTile(tile, mode = 'hover') {
  const id = tile?.dataset.vid;
  const type = tile?.dataset.vtype;
  if (!id || NO_VIDEO.has(type)) return false;

  if (mode === 'hover') {
    if (held?.tile === tile || hover?.tile === tile) return true;
    stopHover();
  } else if (held?.tile === tile) {
    if (!held.v) return true; // lädt noch
    if (held.v.paused) await play(held.v); else held.v.pause();
    emit();
    return true;
  } else if (hover?.tile === tile && hover.ready) {
    // Vorschau läuft schon → festhalten, laut machen, von vorn
    stopHeld();
    held = hover; hover = null;
    stopAudio(); closeMini();
    held.v.muted = false; held.v.volume = 1; held.v.currentTime = 0;
    await play(held.v);
    emit();
    return true;
  }

  const token = (pending = { tile, mode });
  if (mode === 'click') { stopHeld(); stopHover(); held = { tile, v: null, ready: false }; emit(); }
  const g = await ggId(id);
  if (pending !== token) return false;
  pending = null;
  if (!g || hasNoVideo(g)) { if (mode === 'click') { held = null; emit(); } return false; }

  const trackHeld = audioState().mode === 'click' && audioState().playing;
  const sound = mode === 'click' || (HOVER_SOUND.has(type) && !trackHeld && !(held?.v && !held.v.paused && !held.v.muted));
  if (sound) { if (mode === 'click' || audioState().mode !== 'click') stopAudio(); closeMini(); }
  const v = makeVideo(tile, g, { sound, volume: mode === 'hover' ? 0.6 : 1 });
  const slot = { tile, v, ready: false };
  if (mode === 'click') held = slot; else hover = slot;

  v.addEventListener('playing', () => { slot.ready = true; tile.classList.add('is-video'); emit(); });
  v.addEventListener('pause', emit);
  v.addEventListener('timeupdate', () => {
    if (!v.isConnected) { if (held === slot) stopHeld(); else if (hover === slot) stopHover(); return; }
    if (held === slot) emit();
  });
  v.addEventListener('error', () => {
    markNoVideo(g);
    if (held === slot) { held = null; kill(slot); emit(); fallback(tile); }
    else if (hover === slot) stopHover();
  });
  const ok = await play(v);
  if (!ok && hover === slot) stopHover();
  return true;
}

/** Ohne Fortnite.GG-Video: offizielles YouTube-Video im Mini-Player, sonst Hinweis */
export function fallback(tile) {
  const btn = tile?.querySelector('[data-play="video"]');
  if (btn?.dataset.yt) openMini({ video: btn.dataset.yt, title: btn.dataset.title });
  else toast('Für dieses Emote gibt es leider kein Video.');
}

export function leaveTile(tile) {
  if (pending?.tile === tile && pending.mode === 'hover') pending = null;
  if (hover?.tile === tile) stopHover();
}

// Startet irgendwo ein Song, verstummen die Emote-Videos
window.addEventListener('sr-audio', () => {
  if (held?.v && !held.v.muted) stopHeld();
  if (hover?.v) hover.v.muted = true;
});
