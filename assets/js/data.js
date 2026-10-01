// Gemeinsamer Datenzustand: Shop (live), Archiv-Index (vom Workflow), Konfiguration.
import { api, local } from './api.js';
import { dayNum, hex, norm, runsOf, shade, todayNum, nextReset } from './util.js';
import { rarityColors, registerRarities, typeLabel } from './labels.js';

/* ---------- Normalisierung ---------- */

export function historyDays(list) {
  if (!Array.isArray(list)) return [];
  const set = new Set();
  for (const d of list) { const n = dayNum(d); if (Number.isFinite(n)) set.add(n); }
  return [...set].sort((a, b) => a - b);
}

/** Kennzahlen aus einer Liste von Shop-Tagen */
export function historyStats(days, refDay = todayNum()) {
  if (!days?.length) return { count: 0, runs: 0, first: null, last: null, maxGap: null, since: null };
  const runs = runsOf(days);
  let maxGap = null;
  for (let i = 1; i < runs.length; i++) {
    const gap = runs[i].start - runs[i - 1].end;
    if (maxGap == null || gap > maxGap) maxGap = gap;
  }
  const last = days[days.length - 1];
  return { count: days.length, runs: runs.length, first: days[0], last, maxGap, since: refDay - last, runList: runs };
}

export function normalizeBr(b) {
  const series = b.series ? { name: b.series.value, colors: b.series.colors || [], image: b.series.image || null } : null;
  return {
    kind: 'br',
    id: b.id,
    name: b.name || b.id,
    description: b.description || '',
    type: b.type?.value || 'misc',
    typeLabel: b.type?.displayValue || typeLabel(b.type?.value),
    rarity: b.rarity?.value || 'common',
    rarityLabel: b.rarity?.displayValue || '',
    series,
    colors: rarityColors(b.rarity?.value, series),
    set: b.set?.value || '',
    chapter: Number(b.introduction?.chapter) || 0,
    season: Number(b.introduction?.season) || 0,
    introText: b.introduction?.text || '',
    images: { small: b.images?.smallIcon || null, icon: b.images?.icon || null, featured: b.images?.featured || null },
    video: b.showcaseVideo || null,
    added: b.added || null,
    history: historyDays(b.shopHistory),
  };
}

function normalizeTrack(t) {
  return {
    kind: 'track', id: t.id, name: t.title || t.id,
    description: [t.artist, t.releaseYear].filter(Boolean).join(' · '),
    artist: t.artist || '', type: 'track', typeLabel: 'Jam-Song', rarity: 'common', rarityLabel: '',
    series: null, colors: ['#7d6bff', '#3a2a8c', '#120b33'], set: '', chapter: 0, season: 0, introText: '',
    images: { small: t.albumArt, icon: t.albumArt, featured: null }, video: null, added: t.added || null,
    history: historyDays(t.shopHistory),
  };
}

function normalizeSimple(x, kind) {
  const series = x.series ? { name: x.series.value, colors: x.series.colors || [], image: x.series.image || null } : null;
  return {
    kind, id: x.id, name: x.name || x.id, description: x.description || '',
    type: kind, typeLabel: x.type?.displayValue || typeLabel(kind), rarity: x.rarity?.value || 'common',
    rarityLabel: x.rarity?.displayValue || '', series, colors: rarityColors(x.rarity?.value, series),
    set: '', chapter: 0, season: 0, introText: '',
    images: { small: x.images?.small || x.images?.smallIcon || null, icon: x.images?.large || x.images?.icon || x.images?.small || null, featured: null },
    video: null, added: x.added || null, history: historyDays(x.shopHistory),
  };
}

const MAIN_PRIORITY = ['outfit', 'sidekick', 'pickaxe', 'glider', 'emote', 'backpack', 'wrap', 'shoe'];
function pickMain(items) {
  for (const t of MAIN_PRIORITY) { const f = items.find((i) => i.type === t); if (f) return f; }
  return items[0] || null;
}

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '');
const tileSpan = (s) => Math.min(4, Math.max(1, Number(/Size_(\d)_x/.exec(s || '')?.[1]) || 1));

function offerColors(e, main) {
  const c1 = hex(e.colors?.color1), c3 = hex(e.colors?.color3), c2 = hex(e.colors?.color2);
  if (c1 && c3) return [c1, c2 || c3, shade(c3, -0.62)];
  return main?.colors || rarityColors('common');
}

export function normalizeOffer(e, i, resetAt) {
  const items = [
    ...(e.brItems || []).map(normalizeBr),
    ...(e.tracks || []).map(normalizeTrack),
    ...(e.instruments || []).map((x) => normalizeSimple(x, 'instrument')),
    ...(e.cars || []).map((x) => normalizeSimple(x, 'car')),
    ...(e.legoKits || []).map((x) => normalizeSimple(x, 'lego')),
  ];
  const main = pickMain(items);
  const isBundle = !!e.bundle;
  const kind = isBundle ? 'bundle' : (main?.kind === 'br' ? 'item' : main?.kind || 'item');
  const type = isBundle ? 'bundle' : (main?.kind === 'br' ? main.type : main?.kind || 'misc');
  const image = e.bundle?.image || e.newDisplayAsset?.renderImages?.[0]?.image || main?.images.featured || main?.images.icon || main?.images.small || null;
  const fallbacks = [main?.images.featured, main?.images.icon, main?.images.small].filter((x) => x && x !== image);

  const inDay = e.inDate ? dayNum(e.inDate) : todayNum();
  const hist = main?.history || [];
  const prior = hist.filter((d) => d < inDay);
  const isNew = items.length > 0 && hist.length > 0 && prior.length === 0;
  const comeback = prior.length ? inDay - prior[prior.length - 1] : null;
  const outAt = e.outDate ? Date.parse(e.outDate) : null;

  const regular = Number(e.regularPrice) || 0;
  const price = Number(e.finalPrice) || 0;
  const title = e.bundle?.name || main?.name || 'Angebot';
  const key = String(e.offerId || '').replace(/^v2:\//, '') || `o${i}`;
  const itemTypes = [...new Set(items.map((x) => x.type))];

  return {
    key, index: i, kind, type, isBundle, items, main, title,
    subtitle: isBundle ? `${typeLabel('bundle')} · ${items.length} Items` : (main?.kind === 'track' ? ['Jam-Song', main.artist].filter(Boolean).join(' · ') : (main?.typeLabel || typeLabel(type))),
    image, fallbacks,
    cover: main?.kind === 'track' && !isBundle,
    price, regular, discount: regular > price ? regular - price : 0,
    banner: stripTags(e.banner?.value), offerTag: stripTags(e.offerTag?.text),
    inDate: e.inDate || null, outDate: e.outDate || null, outAt,
    leavesToday: outAt != null && outAt <= resetAt + 60000,
    section: e.layout ? { id: e.layout.id, name: e.layout.name, index: e.layout.index ?? 999 } : { id: '_alc', name: 'Einzeln erhältlich', index: 9999 },
    sortPriority: e.sortPriority ?? 0,
    span: tileSpan(e.tileSize),
    colors: offerColors(e, main),
    pattern: main?.series?.image || null,
    isNew, comeback, timesSeen: historyStats(hist).runs,
    itemTypes,
    search: norm([title, ...items.map((x) => `${x.name} ${x.set || ''} ${x.artist || ''}`), e.layout?.name].join(' ')),
  };
}

export function normalizeShop(data) {
  const resetAt = nextReset();
  const offers = (data.entries || []).map((e, i) => normalizeOffer(e, i, resetAt)).filter((o) => o.items.length || o.isBundle);
  const sectionMap = new Map();
  for (const o of offers) {
    if (!sectionMap.has(o.section.id)) sectionMap.set(o.section.id, { ...o.section, offers: [] });
    sectionMap.get(o.section.id).offers.push(o);
  }
  const sections = [...sectionMap.values()].sort((a, b) => a.index - b.index);
  for (const s of sections) s.offers.sort((a, b) => (b.sortPriority - a.sortPriority) || (a.index - b.index));

  const byItem = new Map();
  for (const o of offers) for (const it of o.items) {
    if (!byItem.has(it.id)) byItem.set(it.id, []);
    byItem.get(it.id).push(o);
  }
  return { date: data.date, hash: data.hash, vbuckIcon: data.vbuckIcon, offers, sections, byItem, byKey: new Map(offers.map((o) => [o.key, o])), loadedAt: Date.now() };
}

/** Günstigstes Angebot, in dem ein Item steckt */
export function cheapestOfferFor(shop, id) {
  const list = shop?.byItem.get(id);
  if (!list?.length) return null;
  return [...list].sort((a, b) => (a.items.length - b.items.length) || (a.price - b.price))[0];
}

/* ---------- Shop-Zustand ---------- */

const listeners = new Set();
let shop = null;
let shopPromise = null;
let pollTimer = null;

export const getShop = () => shop;
export function onShop(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function loadShop({ force = false } = {}) {
  if (shopPromise && !force) return shopPromise;
  shopPromise = api.shop()
    .then((raw) => {
      const changed = !shop || shop.hash !== raw.hash;
      shop = normalizeShop(raw);
      if (changed) listeners.forEach((fn) => fn(shop));
      return shop;
    })
    .catch((err) => { shopPromise = null; throw err; });
  return shopPromise;
}

/** Nach dem Reset jede Minute nachsehen, bis der neue Shop da ist (max. 45 Min.) */
export function pollForNewShop(onDone) {
  if (pollTimer) return;
  const oldHash = shop?.hash;
  let tries = 0;
  const tick = async () => {
    tries++;
    try {
      const s = await loadShop({ force: true });
      if (s.hash !== oldHash) { clearInterval(pollTimer); pollTimer = null; onDone?.(s); return; }
    } catch { /* nächster Versuch */ }
    if (tries >= 45) { clearInterval(pollTimer); pollTimer = null; }
  };
  pollTimer = setInterval(tick, 60000);
  setTimeout(tick, 15000);
}

/* ---------- Archiv-Index (data/index.json vom Workflow) ---------- */

let indexPromise = null;
export function loadIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = local('data/index.json').then((raw) => {
    if (!raw?.items) return null;
    registerRarities(raw.rarityInfo);
    const today = todayNum();
    const items = raw.items.map((r) => {
      const [id, name, ti, ri, si, chapter, season, added, first, last, count, runs, maxGap, flags] = r;
      return {
        id, name, type: raw.types[ti], rarity: raw.rarities[ri], set: si >= 0 ? raw.sets[si] : '',
        chapter, season, added, first: first || null, last: last || null, count, runs, maxGap: maxGap || null,
        since: last ? today - last : null, featured: !!(flags & 1),
        search: norm(`${name} ${si >= 0 ? raw.sets[si] : ''}`),
      };
    });
    return { built: raw.built, items, byId: new Map(items.map((x) => [x.id, x])), types: raw.types, rarities: raw.rarities };
  });
  return indexPromise;
}

/** Bild-URLs für BR-Cosmetics lassen sich aus der ID ableiten */
export function brImages(id, featured = false) {
  const base = `https://fortnite-api.com/images/cosmetics/br/${String(id).toLowerCase()}`;
  return { small: `${base}/smallicon.png`, icon: `${base}/icon.png`, featured: featured ? `${base}/featured.png` : null };
}

/* ---------- Konfiguration ---------- */

let configPromise = null;
export function loadConfig() {
  if (configPromise) return configPromise;
  configPromise = Promise.all([local('config/season.json'), local('config/watch.json'), local('data/meta.json')])
    .then(([season, watch, meta]) => ({ season, watch: watch || { keywords: [] }, meta }));
  return configPromise;
}

export function watchHit(watch, ...texts) {
  const kws = (watch?.keywords || []).map(norm).filter(Boolean);
  if (!kws.length) return null;
  const hay = ` ${norm(texts.join(' '))} `;
  return kws.find((k) => hay.includes(` ${k} `)) || null;
}
