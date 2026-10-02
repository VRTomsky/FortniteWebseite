// Wiederverwendbare HTML-Bausteine.
import { esc, fmtNum, fmtAgo, fmtShort, icons } from './util.js';
import { store } from './store.js';
import { rarityColors, rarityImage, rarityLabel, typeLabel, safeImg } from './labels.js';
import { brImages } from './data.js';

export const VBUCK = 'https://fortnite-api.com/images/vbuck.png';

export function vb(n, regular) {
  return `<span class="vb"><img src="${VBUCK}" alt="V-Bucks" width="16" height="16">${fmtNum(n)}${regular && regular > n ? `<s>${fmtNum(regular)}</s>` : ''}</span>`;
}

/* ---------- Snapshots für Wunschliste/Spind ---------- */
const snaps = new Map();
export function snapOf(it, colors) {
  const s = {
    id: it.id, name: it.name, type: it.type, rarity: it.rarity,
    img: it.images?.icon || it.images?.small || (it.kind === 'br' || !it.kind ? brImages(it.id).icon : null),
    colors: colors || it.colors || rarityColors(it.rarity, it.series),
  };
  snaps.set(s.id, s);
  return s;
}
export const getSnap = (id) => snaps.get(id);

const vars = (c, pattern) => { const p = safeImg(pattern); return `--c1:${c[0]};--c2:${c[1]};--c3:${c[2]};${p ? `--pattern:url('${p}');` : ''}`; };
const fallbackAttr = (list) => (list?.length ? ` data-fallback="${esc(list.join('|'))}"` : '');

const cls = (svg, c) => svg.replace('<svg ', `<svg class="${c}" `);
const PLAY_ICONS = cls(icons.play, 'i-play') + cls(icons.pause, 'i-pause') + cls(icons.spin, 'i-spin');

/** Play-Knopf: Song-Vorschau (track) oder Emote-Video mit Ton (video, Fortnite.GG bzw. YouTube als Ersatz) */
export function playBtn(item) {
  if (item.kind === 'track') {
    return `<button class="play" type="button" data-play="track" data-key="track:${esc(item.id)}" data-title="${esc(item.name)}" data-artist="${esc(item.artist || '')}" data-art="${esc(item.images?.icon || '')}" aria-label="Vorschau von ${esc(item.name)} abspielen">${PLAY_ICONS}</button>`;
  }
  if (item.type === 'emote') {
    return `<button class="play" type="button" data-play="video" data-yt="${esc(item.video || '')}" data-title="${esc(item.name)}" aria-label="${esc(item.name)} mit Ton ansehen">${PLAY_ICONS}</button>`;
  }
  return '';
}

function favBtn(id, name) {
  const on = store.isWished(id);
  return `<button class="fav" type="button" data-fav="${esc(id)}" aria-pressed="${on}" aria-label="${esc(name)} ${on ? 'von der Wunschliste nehmen' : 'auf die Wunschliste'}">${icons.heart}</button>`;
}

/** Video-Vorschau beim Drüberfahren (Fortnite.GG): welche Item-ID, welcher Typ */
const videoAttr = (it) => (it && it.id && it.type !== 'track' ? ` data-vid="${esc(it.id)}" data-vtype="${esc(it.type)}"` : '');

/* ---------- Shop-Kachel (Aufbau wie bei Fortnite.GG: Bild mit Name und Preis, darunter Restzeit) ---------- */
export function offerTile(o, { watch } = {}) {
  const main = o.main;
  if (main) snapOf(main);
  const tags = [];
  if (watch) tags.push(`<span class="tag tag--watch" title="Watchlist: ${esc(watch)}">Watchlist</span>`);
  if (o.isNew) tags.push('<span class="tag tag--new">Neu</span>');
  if (o.discount) tags.push(`<span class="tag tag--deal">−${fmtNum(o.discount)}</span>`);
  else if (o.banner) tags.push(`<span class="tag">${esc(o.banner)}</span>`);
  if (main && store.isOwned(main.id)) tags.push('<span class="tag tag--owned">Besitzt du</span>');

  const play = main && !o.isBundle ? playBtn(main) : '';
  const trackAttr = main?.kind === 'track' && !o.isBundle ? ` data-track-tile="track:${esc(main.id)}"` : '';
  const vAttr = o.isBundle ? '' : videoAttr(main);
  const soon = o.outAt && o.outAt - Date.now() < 86400000;
  const leave = o.outAt
    ? `<span class="tile__left${soon ? ' is-soon' : ''}" title="${esc(leaveText(o.outAt))}">${icons.clock}<span data-until="${o.outAt}" data-fmt="strip">${esc(stripTime(o.outAt))}</span></span>`
    : `<span class="tile__left">${icons.clock}<span>Ohne Enddatum</span></span>`;
  const back = o.isNew
    ? ''
    : o.comeback >= 2 ? `<span class="tile__back" title="Zuletzt vor ${fmtNum(o.comeback)} Tagen im Shop">${o.comeback >= 100 ? '<b>' : ''}↺ ${esc(fmtGap(o.comeback))}${o.comeback >= 100 ? '</b>' : ''}</span>` : '';
  const klass = ['tile', o.cover ? 'tile--cover' : '', play ? 'tile--play' : ''].filter(Boolean).join(' ');
  return `<article class="${klass}" style="${vars(o.colors, o.pattern)}"${trackAttr}${vAttr}>
    <div class="tile__media">
      ${o.image ? `<img class="tile__img" src="${esc(o.image)}"${fallbackAttr(o.fallbacks)} alt="" loading="lazy" decoding="async">` : ''}
      <div class="tile__tags">${tags.slice(0, 3).join('')}</div>
      ${main ? favBtn(main.id, o.title) : ''}
      ${play}
      <div class="tile__info">
        <h3 class="tile__name">${esc(o.title)}</h3>
        <span class="tile__price">${vb(o.price, o.regular)}</span>
      </div>
    </div>
    <div class="tile__strip">${leave}${back}</div>
    <a class="tile__link" href="#/offer/${encodeURIComponent(o.key)}" aria-label="${esc(o.title)}, ${fmtNum(o.price)} V-Bucks – Details"></a>
  </article>`;
}

/** Restzeit in der Leiste unter der Kachel: "29 T 11 Std" */
export const stripTime = (outAt) => (outAt - Date.now() <= 0 ? 'Läuft aus' : fmtShort(outAt - Date.now()));

/** Abstand knapp: "251 T", "3 J" */
function fmtGap(days) {
  if (days < 365) return `${fmtNum(days)} T`;
  return `${(days / 365.25).toFixed(1).replace('.', ',').replace(',0', '')} J`;
}

/** Kurz für Kacheln: "noch 4 T", "noch 8 Std", "noch 31 Min" */
export function leaveShort(outAt) {
  const ms = outAt - Date.now();
  if (ms <= 0) return 'läuft aus';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `noch ${Math.max(1, m)} Min`;
  if (m < 1440) return `noch ${Math.floor(m / 60)} Std`;
  return `noch ${Math.floor(m / 1440)} T`;
}

export function leaveText(outAt) {
  const ms = outAt - Date.now();
  if (ms <= 0) return 'läuft aus';
  return ms < 86400000 ? `weg in ${fmtShort(ms)}` : `noch ${fmtShort(ms)}`;
}

/* ---------- Item-Kachel (Archiv, Leaks, Spind) ---------- */
export function itemTile(it, { badge, seen = true, owned } = {}) {
  const imgs = it.images || brImages(it.id, it.featured);
  const colors = it.colors || rarityColors(it.rarity, it.series);
  const pattern = it.series?.image || rarityImage(it.rarity);
  snapOf({ ...it, images: imgs }, colors);
  const tags = [];
  if (badge) tags.push(badge);
  if (owned ?? store.isOwned(it.id)) tags.push('<span class="tag tag--owned">Besitzt du</span>');
  const play = playBtn(it);
  let strip = '';
  if (seen) {
    strip = it.last != null
      ? `<span class="tile__left">${icons.clock}<span>${esc(fmtAgo(it.since).replace(/^vor /, 'vor '))}</span></span>${it.runs ? `<span class="tile__back">${fmtNum(it.runs)}× im Shop</span>` : ''}`
      : `<span class="tile__left">${icons.clock}<span>Noch nie im Shop</span></span>`;
  } else {
    strip = `<span class="tile__left">${esc(typeLabel(it.type))}</span>${it.rarity ? `<span class="tile__back">${esc(rarityLabel(it.rarity))}</span>` : ''}`;
  }
  const src = imgs.icon || imgs.small;
  const fb = [imgs.small, imgs.featured].filter((x) => x && x !== src);
  return `<article class="tile tile--item${play ? ' tile--play' : ''}" style="${vars(colors, pattern)}"${videoAttr(it)}>
    <div class="tile__media">
      ${src ? `<img class="tile__img" src="${esc(src)}"${fallbackAttr(fb)} alt="" loading="lazy" decoding="async">` : ''}
      <div class="tile__tags">${tags.join('')}</div>
      ${favBtn(it.id, it.name)}
      ${play}
      <div class="tile__info">
        <h3 class="tile__name">${esc(it.name)}</h3>
        <span class="tile__kind">${esc(typeLabel(it.type))}</span>
      </div>
    </div>
    <div class="tile__strip">${strip}</div>
    <a class="tile__link" href="#/item/${encodeURIComponent(it.id)}" aria-label="${esc(it.name)} – Details"></a>
  </article>`;
}

export function skeletonTiles(n = 12, compact = false) {
  return `<div class="grid${compact ? ' grid--compact' : ''}" aria-hidden="true">${'<div class="skeleton"></div>'.repeat(n)}</div>`;
}

export function errorBox(err, { retry = true, title = 'Laden fehlgeschlagen' } = {}) {
  return `<div class="error" role="alert"><h3>${esc(title)}</h3><p>${esc(err?.message || err || 'Unbekannter Fehler.')}</p>${retry ? '<button class="btn btn--primary" type="button" data-retry>Nochmal versuchen</button>' : ''}</div>`;
}

export function emptyBox(title, text, actionHTML = '') {
  return `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${actionHTML}</div>`;
}
