// Läuft im GitHub-Workflow (Node 22): baut data/index.json, data/meta.json und data/gg.json
// und öffnet Alarm-Issues, wenn Begriffe aus config/watch.json im Shop oder in den Spieldateien auftauchen.
// Lokal testen: node scripts/build-data.mjs   (ohne GITHUB_TOKEN wird kein Issue erstellt; ALARM_DRY_RUN=1 zeigt Treffer)
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const API = 'https://fortnite-api.com';
const DAY = 86400000;
const dayNum = (s) => Math.floor(Date.parse(s) / DAY);
const hex = (c) => { const s = String(c ?? '').replace(/[^0-9a-f]/gi, '').slice(0, 6); return s.length === 6 ? `#${s.toLowerCase()}` : null; };
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9äöüß]+/g, ' ').trim();
const log = (...a) => console.log('[shopradar]', ...a);

const repo = process.env.GITHUB_REPOSITORY || '';
const [owner, repoName] = repo.split('/');
const siteUrl = owner && repoName ? `https://${owner.toLowerCase()}.github.io/${repoName}/` : null;

async function get(path, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(API + path, { headers: { 'User-Agent': 'shopradar-build' }, signal: AbortSignal.timeout(120000) });
      const body = await res.json();
      if (res.ok && body.status === 200) return body.data;
      lastErr = new Error(`${path} → ${body.status} ${body.error || ''}`);
      if (res.status === 404) break;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
  }
  throw lastErr;
}

/** Zuordnung Epic-ID → Fortnite.GG-ID für die Videos (360°-Drehung, Emotes mit Ton). Ohne CORS, darum hier statt im Browser. */
const GG_SKIP = /^(spray|spid|loadingscreen|lsid|musicpack|banner|homebasebannericon)_/i;
async function buildGg() {
  const res = await fetch('https://fortnite.gg/api/items.json', { headers: { 'User-Agent': 'shopradar-build (GitHub Pages fan site)' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`fortnite.gg → ${res.status}`);
  const raw = await res.json();
  const map = {};
  for (const [id, n] of Object.entries(raw)) {
    const g = Number(n);
    if (!GG_SKIP.test(id) && Number.isInteger(g) && g > 0) map[id.toLowerCase()] = g;
  }
  if (Object.keys(map).length < 1000) throw new Error('fortnite.gg: unerwartet wenige Items');
  return { v: 1, built: new Date().toISOString(), map };
}

/** Letzte veröffentlichte Fassung: von der Seite oder (bei Pages aus dem Branch) aus dem Branch „data“ */
async function previous(file) {
  const urls = [];
  if (siteUrl) urls.push(siteUrl + file);
  if (repo) urls.push(`https://raw.githubusercontent.com/${repo}/data/${file.replace(/^data\//, '')}`);
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
    } catch { /* nächste Quelle */ }
  }
  return null;
}

function buildIndex(br) {
  const types = [], rarities = [], sets = [];
  const ti = new Map(), ri = new Map(), si = new Map();
  const idx = (map, arr, v) => { if (!map.has(v)) { map.set(v, arr.length); arr.push(v); } return map.get(v); };
  const rarityInfo = {};
  const items = [];
  for (const c of br) {
    const type = c.type?.value || 'misc';
    const rarity = c.rarity?.value || 'common';
    rarityInfo[rarity] ||= { label: c.rarity?.displayValue || rarity };
    if (c.series && !rarityInfo[rarity].colors) {
      const cols = (c.series.colors || []).map(hex).filter(Boolean);
      if (cols.length >= 3) rarityInfo[rarity].colors = [cols[0], cols[Math.min(2, cols.length - 1)], cols[cols.length - 1]];
      if (c.series.image) rarityInfo[rarity].image = c.series.image;
    }
    const days = [...new Set((c.shopHistory || []).map(dayNum).filter(Number.isFinite))].sort((a, b) => a - b);
    let runs = days.length ? 1 : 0, maxGap = 0;
    for (let i = 1; i < days.length; i++) {
      const gap = days[i] - days[i - 1];
      if (gap > 1) { runs++; if (gap > maxGap) maxGap = gap; }
    }
    items.push([
      c.id, c.name || c.id, idx(ti, types, type), idx(ri, rarities, rarity), c.set?.value ? idx(si, sets, c.set.value) : -1,
      Number(c.introduction?.chapter) || 0, Number(c.introduction?.season) || 0, c.added ? dayNum(c.added) : 0,
      days[0] || 0, days[days.length - 1] || 0, days.length, runs, maxGap, c.images?.featured ? 1 : 0,
    ]);
  }
  return { v: 1, built: new Date().toISOString(), types, rarities, sets, rarityInfo, items };
}

/** Aktuelle Saison: Build-Hauptversion (z. B. 42) = fortlaufende Saisonnummer der Cosmetics */
function currentSeason(br, build) {
  const major = Number(/Release-(\d+)\./.exec(build || '')?.[1]);
  if (major) {
    const hit = br.find((c) => c.introduction?.backendValue === major);
    if (hit) return { chapter: Number(hit.introduction.chapter), season: Number(hit.introduction.season), seasonNumber: major };
  }
  let best = null;
  for (const c of br) {
    const iv = c.introduction;
    if (!iv?.backendValue || !c.shopHistory?.length) continue;
    if (!best || iv.backendValue > best.backendValue) best = iv;
  }
  return best ? { chapter: Number(best.chapter), season: Number(best.season), seasonNumber: best.backendValue } : null;
}

async function alarm({ shop, br, watch }) {
  const kws = (watch.keywords || []).map(norm).filter(Boolean);
  if (!kws.length) { log('Alarm: keine Begriffe in config/watch.json'); return; }
  // Ganze Wörter/Phrasen: „Sora“ trifft nicht „Sorana“
  const hit = (...t) => { const h = ` ${norm(t.filter(Boolean).join(' '))} `; return kws.find((k) => h.includes(` ${k} `)) || null; };
  const found = new Map();
  if (watch.notifyShop !== false && shop) {
    for (const e of shop.entries || []) {
      const items = [...(e.brItems || []), ...(e.tracks || []).map((t) => ({ ...t, name: t.title, images: { icon: t.albumArt } }))];
      for (const it of items) {
        const kw = hit(it.name, it.set?.value, e.bundle?.name);
        if (!kw) continue;
        const key = `shop:${it.id}@${String(e.inDate || '').slice(0, 10)}`;
        const prev = found.get(key);
        if (prev && prev.price <= e.finalPrice) continue;
        found.set(key, { kind: 'shop', key, id: it.id, name: it.name, kw, price: e.finalPrice, bundle: e.bundle?.name || null, inDate: e.inDate, outDate: e.outDate, img: it.images?.icon || it.images?.smallIcon });
      }
    }
  }
  if (watch.notifyLeaks !== false && br) {
    for (const c of br) {
      if (c.shopHistory?.length) continue;
      const kw = hit(c.name, c.set?.value);
      if (!kw) continue;
      const key = `leak:${c.id}`;
      found.set(key, { kind: 'leak', key, id: c.id, name: c.name, kw, set: c.set?.value || null, type: c.type?.displayValue || '', img: c.images?.icon || c.images?.smallIcon });
    }
  }
  const hits = [...found.values()];
  log(`Alarm: ${hits.length} Treffer`, hits.map((h) => `${h.kind}:${h.name}`).join(', '));
  if (!hits.length) return;
  const token = process.env.GITHUB_TOKEN;
  if (process.env.ALARM_DRY_RUN || !token || !repo) { log('Alarm: Probelauf – keine Issues erstellt'); return; }

  const gh = (path, opt = {}) => fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...opt,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
  });
  await gh('/labels', { method: 'POST', body: JSON.stringify({ name: 'shop-alarm', color: 'ffe23f', description: 'Automatischer Shop-/Leak-Alarm von Shopradar' }) }).catch(() => {});
  const existing = new Set();
  for (let page = 1; page <= 10; page++) {
    const r = await gh(`/issues?labels=shop-alarm&state=all&per_page=100&page=${page}`);
    if (!r.ok) { log('Alarm: Issues konnten nicht gelesen werden', r.status); return; }
    const list = await r.json();
    for (const i of list) { const m = /\[sr:([^\]]+)\]/.exec(i.body || ''); if (m) existing.add(m[1]); }
    if (list.length < 100) break;
  }
  const fmt = (n) => new Intl.NumberFormat('de-DE').format(n);
  const date = (s) => (s ? new Date(s).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '–');
  let created = 0;
  for (const h of hits) {
    if (existing.has(h.key) || created >= 5) continue;
    const link = siteUrl ? `${siteUrl}#/item/${encodeURIComponent(h.id)}` : null;
    const title = h.kind === 'shop' ? `🛒 Im Shop: ${h.name}` : `🕵️ In den Spieldateien: ${h.name}`;
    const lines = h.kind === 'shop'
      ? [`@${owner} **${h.name}** ist im Fortnite Item-Shop!`, '', h.img ? `<img src="${h.img}" width="256" alt="${h.name}">` : '', '',
        `- **Preis:** ${fmt(h.price)} V-Bucks${h.bundle ? ` (im Paket „${h.bundle}“)` : ''}`,
        `- **Im Shop:** ab ${date(h.inDate)} · bis ${date(h.outDate)}`,
        `- **Watchlist-Begriff:** ${h.kw}`]
      : [`@${owner} **${h.name}** ist in den Spieldateien aufgetaucht – noch nicht im Shop, aber geleakt.`, '', h.img ? `<img src="${h.img}" width="256" alt="${h.name}">` : '', '',
        `- **Typ:** ${h.type || '–'}${h.set ? ` · Set: ${h.set}` : ''}`,
        `- **Watchlist-Begriff:** ${h.kw}`,
        '- Geleakte Items können sich noch ändern oder später erscheinen.'];
    if (link) lines.push('', `[Auf Shopradar ansehen](${link})`);
    lines.push('', '<sub>Automatisch erstellt vom Shopradar-Workflow. Begriffe änderst du in `config/watch.json`. Schließ das Issue einfach, wenn du es gesehen hast.</sub>', `<!-- [sr:${h.key}] -->`);
    const r = await gh('/issues', { method: 'POST', body: JSON.stringify({ title, body: lines.join('\n'), labels: ['shop-alarm'] }) });
    log(`Alarm: Issue „${title}“ → ${r.status}`);
    if (r.ok) created++;
  }
}

async function main() {
  await mkdir('data', { recursive: true });
  const watch = JSON.parse(await readFile('config/watch.json', 'utf8').catch(() => '{}'));
  const [brR, shopR, newR] = await Promise.allSettled([
    get('/v2/cosmetics/br?language=de&responseFlags=4'),
    get('/v2/shop?language=de&responseFlags=4'),
    get('/v2/cosmetics/new?language=de'),
  ]);
  const br = brR.status === 'fulfilled' ? brR.value : null;
  const shop = shopR.status === 'fulfilled' ? shopR.value : null;
  const fresh = newR.status === 'fulfilled' ? newR.value : null;
  for (const [n, r] of [['Cosmetics', brR], ['Shop', shopR], ['Neu', newR]]) if (r.status === 'rejected') log(`${n} nicht geladen:`, r.reason?.message);

  let index = br ? buildIndex(br) : null;
  if (!index) { index = await previous('data/index.json'); log(index ? 'Index: vorherige Version übernommen' : 'Index: nicht verfügbar – die Seite nutzt dann die Live-Suche'); }
  if (index) {
    await writeFile('data/index.json', JSON.stringify(index));
    log(`Index: ${index.items.length} Items, ${(JSON.stringify(index).length / 1e6).toFixed(2)} MB`);
  }

  let gg = await buildGg().catch((e) => { log('Fortnite.GG-Zuordnung nicht geladen:', e.message); return null; });
  if (!gg) { gg = await previous('data/gg.json'); if (gg) log('Fortnite.GG: vorherige Version übernommen'); }
  if (gg) {
    await writeFile('data/gg.json', JSON.stringify(gg));
    // Kleiner Auszug nur für den heutigen Shop, damit die Shop-Seite nicht die ganze Liste laden muss
    const today = {};
    for (const e of shop?.entries || []) {
      for (const k of ['brItems', 'tracks', 'instruments', 'cars', 'legoKits']) {
        for (const x of e[k] || []) { const id = String(x.id).toLowerCase(); if (gg.map[id]) today[id] = gg.map[id]; }
      }
    }
    await writeFile('data/gg-shop.json', JSON.stringify({ v: 1, built: gg.built, shop: shop?.date || null, map: today }));
    log(`Fortnite.GG: ${Object.keys(gg.map).length} Items, davon ${Object.keys(today).length} im Shop`);
  }

  const season = br ? currentSeason(br, fresh?.build) : null;
  const old = season ? null : await previous('data/meta.json');
  const counts = {};
  if (br) for (const c of br) counts[c.type?.value || 'misc'] = (counts[c.type?.value || 'misc'] || 0) + 1;
  const meta = {
    built: new Date().toISOString(),
    build: fresh?.build || old?.build || null,
    buildDate: fresh?.date || old?.buildDate || null,
    chapter: season?.chapter ?? old?.chapter ?? null,
    season: season?.season ?? old?.season ?? null,
    seasonNumber: season?.seasonNumber ?? old?.seasonNumber ?? null,
    counts: br ? counts : old?.counts || null,
    shop: shop ? { date: shop.date, hash: shop.hash, entries: shop.entries?.length || 0 } : null,
  };
  await writeFile('data/meta.json', JSON.stringify(meta, null, 2));
  log('Meta:', JSON.stringify({ chapter: meta.chapter, season: meta.season, build: meta.build }));

  try { await alarm({ shop, br, watch }); } catch (e) { log('Alarm fehlgeschlagen:', e.message); }
}

main().catch((e) => { console.error(e); process.exitCode = 0; });
