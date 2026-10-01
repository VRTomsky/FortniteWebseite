// Wiederverwendbare HTML-Bausteine.
import { esc, fmtNum, fmtAgo, fmtShort, fmtAfter, icons } from './util.js';
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

/** Play-Knopf: Song-Vorschau (track) oder Emote-Video (video) */
export function playBtn(item) {
  if (item.kind === 'track') {
    return `<button class="play" type="button" data-play="track" data-key="track:${esc(item.id)}" data-title="${esc(item.name)}" data-artist="${esc(item.artist || '')}" data-art="${esc(item.images?.icon || '')}" aria-label="Vorschau von ${esc(item.name)} abspielen">${PLAY_ICONS}</button>`;
  }
  if (item.type === 'emote' && item.video) {
    return `<button class="play" type="button" data-play="video" data-video="${esc(item.video)}" data-title="${esc(item.name)}" aria-label="${esc(item.name)} mit Ton ansehen">${PLAY_ICONS}</button>`;
  }
  return '';
}

function favBtn(id, name) {
  const on = store.isWished(id);
  return `<button class="fav" type="button" data-fav="${esc(id)}" aria-pressed="${on}" aria-label="${esc(name)} ${on ? 'von der Wunschliste nehmen' : 'auf die Wunschliste'}">${icons.heart}</button>`;
}

/* ---------- Shop-Kachel ---------- */
export function offerTile(o, { watch } = {}) {
  const main = o.main;
  if (main) snapOf(main);
  const badges = [];
  if (watch) badges.push(`<span class="badge badge--watch" title="Watchlist: ${esc(watch)}">Watchlist</span>`);
  if (o.isNew) badges.push('<span class="badge badge--new">Zum ersten Mal</span>');
  else if (o.comeback >= 30) badges.push(`<span class="badge badge--comeback">Nach ${esc(fmtAfter(o.comeback))}</span>`);
  if (o.discount) badges.push(`<span class="badge badge--deal">−${fmtNum(o.discount)} V-Bucks</span>`);
  else if (o.banner) badges.push(`<span class="badge">${esc(o.banner)}</span>`);
  if (main && store.isOwned(main.id)) badges.push('<span class="badge badge--owned">Besitzt du</span>');

  const leave = o.outAt
    ? `<span class="tile__leave${o.outAt - Date.now() < 86400000 ? ' is-soon' : ''}" data-until="${o.outAt}" data-fmt="leave-short" title="${esc(leaveText(o.outAt))}">${esc(leaveShort(o.outAt))}</span>`
    : '';
  const klass = ['tile', o.span > 1 ? `tile--w${o.span}` : '', o.cover ? 'tile--cover' : ''].filter(Boolean).join(' ');
  const play = main && !o.isBundle ? playBtn(main) : '';
  const trackAttr = main?.kind === 'track' && !o.isBundle ? ` data-track-tile="track:${esc(main.id)}"` : '';
  return `<article class="${klass}" style="${vars(o.colors, o.pattern)}"${trackAttr}>
    <div class="tile__bg"></div>
    ${o.image ? `<img class="tile__img" src="${esc(o.image)}"${fallbackAttr(o.fallbacks)} alt="" loading="lazy" decoding="async">` : ''}
    <div class="tile__badges">${badges.slice(0, 3).join('')}</div>
    ${main ? favBtn(main.id, o.title) : ''}
    ${play}
    <div class="tile__band">
      <span class="tile__kicker">${esc(o.subtitle)}</span>
      <h3 class="tile__name">${esc(o.title)}</h3>
      <div class="tile__foot"><span class="tile__price">${vb(o.price, o.regular)}</span>${leave}</div>
    </div>
    <a class="tile__link" href="#/offer/${encodeURIComponent(o.key)}" aria-label="${esc(o.title)}, ${fmtNum(o.price)} V-Bucks – Details"></a>
  </article>`;
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
  const badges = [];
  if (badge) badges.push(badge);
  if (owned ?? store.isOwned(it.id)) badges.push('<span class="badge badge--owned">Besitzt du</span>');
  let seenLine = '';
  if (seen) {
    seenLine = it.last != null
      ? `<div class="tile__seen">Zuletzt <b>${esc(fmtAgo(it.since))}</b>${it.runs ? ` · ${fmtNum(it.runs)}× im Shop` : ''}</div>`
      : '<div class="tile__seen">Noch nie im Shop</div>';
  }
  const src = imgs.icon || imgs.small;
  const fb = [imgs.small, imgs.featured].filter((x) => x && x !== src);
  return `<article class="tile tile--item" style="${vars(colors, pattern)}">
    <div class="tile__bg"></div>
    ${src ? `<img class="tile__img" src="${esc(src)}"${fallbackAttr(fb)} alt="" loading="lazy" decoding="async">` : ''}
    <div class="tile__badges">${badges.join('')}</div>
    ${favBtn(it.id, it.name)}
    ${playBtn(it)}
    <div class="tile__band">
      <span class="tile__kicker">${esc(typeLabel(it.type))}${it.rarity ? ` · ${esc(rarityLabel(it.rarity))}` : ''}</span>
      <h3 class="tile__name">${esc(it.name)}</h3>
      ${seenLine}
    </div>
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
