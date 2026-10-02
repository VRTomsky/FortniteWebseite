// Detailfenster wie bei Fortnite.GG: links das Video (360°-Drehung, Emotes mit Ton) ohne Ränder, sonst die 3D-Karte;
// rechts Name, Preis, Restzeit, Infos, Vorkommen, Enthält und das Set.
import { $, esc, fmtNum, fmtDate, fmtAgo, fmtSpan, fmtEur, icons, copyText, toast, todayNum, DAY } from './util.js';
import { api } from './api.js';
import { store } from './store.js';
import { getShop, loadShop, normalizeBr, historyStats, cheapestOfferFor, loadIndex, brImages, ggId, ggVideoUrl } from './data.js';
import { vb, snapOf, leaveText, playBtn } from './components.js';
import { rarityColors, rarityImage, rarityLabel, typeLabel, TYPE_ORDER } from './labels.js';
import { cheapestTopUps } from './vbmath.js';
import { stop as stopAudio, closeMini } from './audio.js';
import { stopAll as stopTileVideos, NO_VIDEO, hasNoVideo, markNoVideo } from './video.js';

let root = null;
let current = null;
let card = null;
let onCloseCb = null;
let lastFocus = null;
let lastModel = null;
const quoted = (t) => (/^[„"«‚]/.test(t) ? t : `„${t}“`);

export const isOpen = () => !!root;

window.addEventListener('store', (e) => {
  if (root && lastModel && (e.detail === 'settings' || e.detail === 'wish' || e.detail === 'owned')) renderPanel(lastModel);
});

export async function open(kind, arg, { onClose } = {}) {
  onCloseCb = onClose;
  if (!root) mountShell();
  else teardownStage();
  const token = (current = { kind, arg });
  $('[data-v-panel]', root).innerHTML = '<div class="skeleton" style="height:56px"></div><div class="skeleton" style="height:160px"></div><div class="skeleton" style="height:120px"></div>';
  $('[data-v-stage-body]', root).innerHTML = '<div class="viewer__load">Lädt …</div>';
  let model;
  try {
    model = await resolve(kind, arg);
  } catch (err) {
    if (token !== current) return;
    $('[data-v-panel]', root).innerHTML = `<div class="error" role="alert"><h3>Nicht gefunden</h3><p>${esc(err.message)}</p><a class="btn" href="#/shop">Zum Shop</a></div>`;
    $('[data-v-stage-body]', root).innerHTML = '';
    return;
  }
  if (token !== current) return;
  document.title = `${model.title} · Shopradar`;
  renderPanel(model);
  mountStage(model, token);
}

export function close() {
  if (!root) return;
  teardownStage();
  root.remove();
  root = null;
  current = null;
  lastModel = null;
  document.body.classList.remove('no-scroll', 'viewer-open');
  document.removeEventListener('keydown', onKey);
  lastFocus?.focus?.({ preventScroll: true });
}

function mountShell() {
  lastFocus = document.activeElement;
  root = document.createElement('div');
  root.className = 'viewer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'viewer-title');
  root.innerHTML = `
    <div class="viewer__backdrop" data-v-close></div>
    <div class="viewer__box">
      <div class="viewer__stage" data-v-stage>
        <div class="viewer__body" data-v-stage-body></div>
        <div class="viewer__hud" data-v-hud></div>
      </div>
      <aside class="viewer__panel" data-v-panel></aside>
      <button class="viewer__x" type="button" data-v-close aria-label="Schließen" title="Schließen (Esc)">${icons.close}</button>
    </div>`;
  $('#viewer-root').append(root);
  document.body.classList.add('no-scroll', 'viewer-open');
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  $('.viewer__x', root).focus({ preventScroll: true });
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); onCloseCb?.(); return; }
  if (e.key === 'Tab' && root) {
    const f = [...root.querySelectorAll('a[href], button:not([disabled]), input, select, iframe, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* ---------- Daten zusammenführen ---------- */
async function resolve(kind, arg) {
  if (kind === 'offer') {
    const shop = getShop() || await loadShop();
    const offer = shop.byKey.get(arg);
    if (!offer) throw new Error('Dieses Angebot ist nicht mehr im Shop. Der Shop wechselt täglich – vielleicht hast du einen alten Link.');
    return buildModel({ item: offer.isBundle ? null : offer.main, offer });
  }
  const shop = getShop() || await loadShop().catch(() => null);
  const offer = shop ? cheapestOfferFor(shop, arg) : null;
  let item = offer?.items.find((i) => i.id === arg) || null;
  if (!item || item.kind === 'br') {
    try {
      item = normalizeBr(await api.cosmetic(arg));
    } catch (err) {
      if (!item) {
        const idx = await loadIndex().catch(() => null);
        const ix = idx?.byId.get(arg);
        if (!ix) throw new Error(err.status === 404 ? 'Dieses Item gibt es in der Datenbank nicht (mehr).' : err.message);
        item = { kind: 'br', id: ix.id, name: ix.name, description: '', type: ix.type, typeLabel: typeLabel(ix.type), rarity: ix.rarity, rarityLabel: rarityLabel(ix.rarity), series: null, colors: rarityColors(ix.rarity), set: ix.set, chapter: ix.chapter, season: ix.season, introText: ix.chapter ? `Eingeführt in Kapitel ${ix.chapter}, Saison ${ix.season}.` : '', images: brImages(ix.id, ix.featured), video: null, history: [] };
        item.indexStats = ix;
      }
    }
  }
  return buildModel({ item, offer });
}

function buildModel({ item, offer }) {
  const subject = item || offer.main;
  const colors = offer && !item ? offer.colors : (subject?.colors || rarityColors(subject?.rarity, subject?.series));
  const history = subject?.history || [];
  let stats = historyStats(history);
  if (!history.length && subject?.indexStats?.last) {
    const ix = subject.indexStats;
    stats = { count: ix.count, runs: ix.runs, first: ix.first, last: ix.last, maxGap: ix.maxGap, since: ix.since, runList: null };
  }
  const images = offer && !item
    ? [offer.image, ...offer.fallbacks]
    : [subject?.images?.featured, offer && offer.items.length === 1 ? offer.image : null, subject?.images?.icon, subject?.images?.small];
  return {
    title: offer && !item ? offer.title : subject?.name || 'Item',
    item, offer, subject, colors, history, stats,
    images: images.filter(Boolean),
    pattern: subject?.series?.image || rarityImage(subject?.rarity) || null,
    video: item?.video || null,
    isBundle: !!(offer && !item && offer.isBundle),
  };
}

/* ---------- Infopanel (Aufbau wie bei Fortnite.GG) ---------- */
const fmtLeave = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function affordLine(o) {
  const bal = store.balance;
  if (bal == null) return '<p class="vp-small"><button class="linkbtn" type="button" data-balance-btn>Guthaben eintragen</button>, um zu sehen, was fehlt.</p>';
  const need = o.price - bal;
  if (need <= 0) return `<p class="vp-small">Dein Guthaben (${fmtNum(bal)}) reicht${bal - o.price > 0 ? ` – danach ${fmtNum(bal - o.price)} übrig` : ' genau'}.</p>`;
  const best = cheapestTopUps(need, { allowExact: false })[0];
  return `<p class="vp-small">Dir fehlen ${fmtNum(need)} V-Bucks${best ? ` – günstigste Aufladung: ${esc(best.label)} für ${fmtEur(best.cents / 100)}` : ''}. <a href="#/vbucks">Rechner</a></p>`;
}

/** Kleine Item-Kachel für „Enthält“ und „Teil des Sets“ */
function miniTile(it) {
  const c = it.colors || rarityColors(it.rarity, it.series);
  const img = it.images?.icon || it.images?.small || brImages(it.id).icon;
  return `<a class="vp-item" href="#/item/${encodeURIComponent(it.id)}" style="--c1:${c[0]};--c3:${c[2]}" title="${esc(it.name)}">
    <img src="${esc(img)}" alt="" loading="lazy" decoding="async"><span class="sr-only">${esc(it.name)}</span></a>`;
}

function renderPanel(m) {
  lastModel = m;
  const s = m.subject;
  const o = m.offer;
  const st = m.stats;
  const isItem = !m.isBundle && !!s;
  if (s) snapOf(s, m.colors);
  const rarity = isItem && s.kind === 'br' ? (s.series?.name || s.rarityLabel || rarityLabel(s.rarity)) : '';
  const typeTxt = m.isBundle ? 'Paket' : (s?.typeLabel || typeLabel(s?.type));
  const desc = m.isBundle ? (o.offerTag || `${o.items.length} Items in einem Paket.`) : (s?.description || '');
  const wishId = s?.id;
  const wished = !!wishId && store.isWished(wishId);
  const owned = !!wishId && store.isOwned(wishId);

  let shop;
  if (o) {
    shop = `<div class="vp-price">${vb(o.price, o.regular)}</div>
      ${o.outAt ? `<p class="vp-leave" title="${esc(leaveText(o.outAt))}">${icons.clock}<span>Verlässt den Shop am ${esc(fmtLeave.format(new Date(o.outAt)))}</span></p>` : ''}
      ${o.isBundle && !m.isBundle ? `<p class="vp-small">Heute im Paket <a href="#/offer/${encodeURIComponent(o.key)}">${esc(quoted(o.title))}</a></p>` : ''}
      <a class="vp-shop" href="https://www.fortnite.com/item-shop?lang=de" target="_blank" rel="noopener">Im Shop auf Fortnite.com</a>
      ${affordLine(o)}`;
  } else if (st.last != null) {
    shop = `<p class="vp-off">Gerade nicht im Shop · zuletzt ${esc(fmtAgo(st.since))}</p>`;
  } else {
    shop = `<p class="vp-off">${isItem ? 'Noch nie im Shop' : ''}</p>`;
  }

  const rows = [];
  if (isItem) {
    if (st.count || o) rows.push(['Quelle', 'Shop']);
    if (s.chapter) rows.push(['Eingeführt', `Kapitel ${s.chapter}, Saison ${s.season}`]);
    if (s.added) rows.push(['Erschienen', fmtDate(s.added)]);
  }
  if (st.last != null) rows.push(['Zuletzt gesehen', `${fmtDate(st.last)} (${fmtAgo(st.since)})`]);
  if (st.maxGap) rows.push(['Längste Pause', fmtSpan(st.maxGap)]);
  const occ = st.count ? `<div class="vp-row"><dt>Vorkommen:</dt><dd><button class="vp-occ" type="button" data-v-occ aria-expanded="false">${fmtNum(st.count)}${icons.chevron}</button></dd></div>` : '';
  const info = rows.length || occ ? `<div class="vp-info">
      <dl>${rows.map(([k, v]) => `<div class="vp-row"><dt>${esc(k)}:</dt><dd>${esc(v)}</dd></div>`).join('')}${occ}</dl>
      ${st.count ? `<div class="vp-occ-list" data-v-occ-list hidden>${st.runList ? `${timeline(st.runList, m.colors[0])}${occurrences(st.runList)}` : `<p class="vp-small">${fmtNum(st.runs)}× im Shop, zuerst am ${esc(fmtDate(st.first))}.</p>`}</div>` : ''}
    </div>` : '';

  const incl = o ? (m.isBundle ? o.items : o.items.filter((i) => i.id !== s?.id)) : [];

  $('[data-v-panel]', root).innerHTML = `
    <div class="vp-head">
      <h2 id="viewer-title">${esc(m.title)}</h2>
      <p class="vp-kind">${rarity ? `<span class="vp-rar" style="--c1:${m.colors[0]};--c3:${m.colors[2]}">${esc(rarity)}</span>` : ''}<span>${esc(typeTxt)}</span></p>
      ${shop}
    </div>
    ${desc ? `<p class="vp-desc">${esc(desc)}</p>` : ''}
    ${s?.kind === 'track' && !m.isBundle ? `<div class="audio-line">${playBtn(s)}<p>30-Sekunden-Vorschau des Originals über Apple Music.</p></div>` : ''}
    ${info}
    ${wishId ? `<div class="vp-btns">
      <button class="vp-btn${wished ? ' is-on' : ''}" type="button" data-v-wish aria-pressed="${wished}">${wished ? icons.check : icons.plus}<span>Wunschliste</span></button>
      <button class="vp-btn${owned ? ' is-on' : ''}" type="button" data-v-own aria-pressed="${owned}">${owned ? icons.check : icons.plus}<span>Spind</span></button>
      <button class="vp-icon" type="button" data-v-copy aria-label="Link kopieren" title="Link kopieren">${icons.link}</button>
    </div>` : ''}
    ${incl.length ? `<section class="vp-sec"><h3>${m.isBundle ? 'Im Paket' : 'Enthält'}</h3><div class="vp-items">${incl.map(miniTile).join('')}</div></section>` : ''}
    ${isItem && s.set ? `<section class="vp-sec" data-v-set hidden><h3>Teil des Sets <b>${esc(s.set)}</b></h3><div class="vp-items"></div></section>` : ''}
    ${isItem && s.id ? `<p class="vp-id">ID: ${esc(s.id)}</p>` : ''}`;

  if (isItem && s.set) fillSet(m);
}

/** Übrige Items aus demselben Set (aus dem Archiv-Index) */
async function fillSet(m) {
  const idx = await loadIndex().catch(() => null);
  const box = root && $('[data-v-set]', root);
  if (!idx || !box || lastModel !== m) return;
  const order = (t) => (TYPE_ORDER.indexOf(t) + 1) || 99;
  const list = idx.items
    .filter((x) => x.set === m.subject.set && x.id !== m.subject.id)
    .sort((a, b) => order(a.type) - order(b.type) || a.name.localeCompare(b.name, 'de'))
    .slice(0, 30);
  if (!list.length) return;
  box.querySelector('.vp-items').innerHTML = list.map((x) => miniTile({ ...x, images: brImages(x.id) })).join('');
  box.hidden = false;
}

/** Auftritte als Tabelle wie bei Fortnite.GG (neueste zuerst) */
function occurrences(runs) {
  const t = todayNum();
  const MAX = 8;
  const rows = [...runs].reverse().slice(0, MAX).map((r) => {
    const now = r.end >= t;
    const range = r.start === r.end ? fmtDate(r.start) : `${fmtDate(r.start)} – ${now ? 'heute' : fmtDate(r.end)}`;
    return `<tr${now ? ' class="is-now"' : ''}><td>${esc(range)}</td><td>${esc(now ? 'jetzt im Shop' : fmtAgo(t - r.end))}</td></tr>`;
  }).join('');
  return `<table class="occ"><thead><tr><th>Im Shop</th><th>Zuletzt</th></tr></thead><tbody>${rows}</tbody></table>
    ${runs.length > MAX ? `<p class="faint" style="margin:0;font-size:var(--t-xs)">… und ${runs.length - MAX} weitere Male davor</p>` : ''}`;
}

function timeline(runs, color) {
  const t1 = todayNum();
  const t0 = Math.min(runs[0].start, t1 - 60);
  const W = 400, padL = 2, padR = 4;
  const x = (d) => padL + ((d - t0) / (t1 - t0)) * (W - padL - padR);
  const y0 = new Date(t0 * DAY).getUTCFullYear(), y1 = new Date(t1 * DAY).getUTCFullYear();
  let ticks = '';
  const yearsSpan = y1 - y0;
  for (let y = y0 + 1; y <= y1; y++) {
    if (yearsSpan > 6 && (y - y0) % 2) continue;
    const xx = x(Date.UTC(y, 0, 1) / DAY);
    ticks += `<line x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="10" y2="56" stroke="#3a3d44" stroke-width="1"/><text x="${(xx + 3).toFixed(1)}" y="72">${y}</text>`;
  }
  const bars = runs.map((r) => {
    const a = x(r.start), b = x(r.end + 1);
    return `<rect x="${a.toFixed(1)}" y="20" width="${Math.max(2, b - a).toFixed(1)}" height="28" fill="${color}"/>`;
  }).join('');
  const tx = x(t1);
  return `<svg class="timeline" viewBox="0 0 ${W} 80" role="img" aria-label="Shop-Auftritte von ${fmtDate(runs[0].start)} bis heute: ${runs.length} Mal">
    <line x1="0" x2="${W - padR}" y1="34" y2="34" stroke="#2d3036" stroke-width="28"/>
    ${ticks}${bars}
    <line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="6" y2="58" stroke="#ffe23f" stroke-width="2"/>
    <text x="${(tx - 4).toFixed(1)}" y="16" text-anchor="end" style="fill:#ffe23f">heute</text>
  </svg>`;
}

/* ---------- Bühne ---------- */
function cardSpec(m) {
  const s = m.subject;
  const st = m.stats;
  const rows = [];
  if (m.isBundle) {
    rows.push(['Paket', `${m.offer.items.length} Items`]);
    for (const it of m.offer.items.slice(0, 4)) rows.push([it.typeLabel || typeLabel(it.type), it.name]);
  } else {
    if (s?.typeLabel) rows.push(['Typ', s.typeLabel]);
    if (s?.rarity && s.kind === 'br') rows.push(['Seltenheit', s.rarityLabel || rarityLabel(s.rarity)]);
    if (s?.set) rows.push(['Set', s.set]);
    if (s?.chapter) rows.push(['Eingeführt', `Kapitel ${s.chapter}, Saison ${s.season}`]);
    if (st.first != null) rows.push(['Erstes Mal im Shop', fmtDate(st.first)]);
    if (st.last != null) rows.push(['Im Shop', `${st.runs}× · zuletzt ${fmtAgo(st.since)}`]);
  }
  return {
    title: m.title,
    subtitle: m.isBundle ? `Paket · ${m.offer.items.length} Items` : [s?.typeLabel, s?.kind === 'br' ? (s.rarityLabel || rarityLabel(s.rarity)) : ''].filter(Boolean).join(' · '),
    colors: m.colors,
    images: m.images,
    pattern: m.pattern,
    rarity: s?.rarity,
    priceVb: m.offer ? m.offer.price : null,
    footer: st.last != null ? `Zuletzt im Shop: ${fmtDate(st.last)}` : 'Noch nie im Shop',
    rows,
    id: m.isBundle ? '' : s?.id,
  };
}

/** Erst das Video (falls es eins gibt), sonst die 3D-Karte */
async function mountStage(m, token, view = 'video') {
  stopTileVideos();
  if (m.gg === undefined) {
    const canVideo = !m.isBundle && m.subject?.id && !NO_VIDEO.has(m.subject.type);
    const g = canVideo ? await ggId(m.subject.id).catch(() => null) : null;
    if (token !== current) return;
    m.gg = g && !hasNoVideo(g) ? g : null;
  }
  if (view === 'video' && m.gg) mountClip(m, token);
  else await mount3d(m, token);
}

// Outfits & Co. haben keine Tonspur – die Videos starten stumm, alles andere mit Ton
const SILENT = new Set(['outfit', 'backpack', 'shoe', 'wrap', 'glider', 'contrail', 'sidekick', 'pet', 'petcarrier']);

/** Video füllt die Bühne ganz aus; die Bühne nimmt das Seitenverhältnis des Videos an */
function mountClip(m, token) {
  teardownStage();
  const stage = $('[data-v-stage]', root);
  const body = $('[data-v-stage-body]', root);
  const hud = $('[data-v-hud]', root);
  const silent = SILENT.has(m.subject.type);
  stage.classList.add('is-clip');
  body.innerHTML = `<div class="viewer__clip" data-v-clip>
    <video src="${esc(ggVideoUrl(m.gg))}"${m.images[0] ? ` poster="${esc(m.images[0])}"` : ''} playsinline loop autoplay muted disablepictureinpicture disableremoteplayback></video>
    <span class="clip-state" aria-hidden="true">${icons.play}</span>
  </div>`;
  const v = body.querySelector('video');
  v.addEventListener('loadedmetadata', () => {
    if (v.videoWidth && v.videoHeight) stage.style.setProperty('--ar', (v.videoWidth / v.videoHeight).toFixed(4));
  });
  v.addEventListener('error', () => {
    markNoVideo(m.gg);
    m.gg = null;
    if (token === current) mount3d(m, token);
  }, { once: true });
  const sync = () => { body.querySelector('[data-v-clip]')?.classList.toggle('is-paused', v.paused); syncSound(v); };
  v.addEventListener('play', sync);
  v.addEventListener('pause', sync);
  v.addEventListener('volumechange', sync);
  if (!silent) {
    stopAudio(); closeMini();
    v.muted = false; // Klick zum Öffnen erlaubt Ton – sonst unten stumm weiter
  }
  v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  // Das Fortnite.GG-Wasserzeichen ist im Video, die Quelle steht zusätzlich in der Fußzeile
  hud.innerHTML = `<span class="hud-right">
      ${silent ? '' : `<button class="hud-btn" type="button" data-v-sound aria-label="Ton aus" title="Ton an/aus">${icons.volume}</button>`}
      <button class="hud-btn hud-btn--txt" type="button" data-v-view="3d" title="Als 3D-Karte ansehen">3D</button>
    </span>`;
  sync();
}

function syncSound(v) {
  const b = root?.querySelector('[data-v-sound]');
  if (!b) return;
  b.innerHTML = v.muted ? icons.mute : icons.volume;
  b.setAttribute('aria-label', v.muted ? 'Ton an' : 'Ton aus');
  b.classList.toggle('is-off', v.muted);
}

async function mount3d(m, token) {
  teardownStage();
  const stage = $('[data-v-stage]', root);
  const body = $('[data-v-stage-body]', root);
  const hud = $('[data-v-hud]', root);
  const spec = cardSpec(m);
  stage.classList.remove('is-clip');
  stage.style.removeProperty('--ar');
  hud.innerHTML = `
    <span class="viewer__hint" title="Scrollen zum Zoomen · Doppelklick setzt zurück">Ziehen zum Drehen</span>
    <span class="hud-right">
      <button class="hud-btn" type="button" data-v-rotate aria-pressed="true" title="Auto-Drehen">${icons.rotate}</button>
      <button class="hud-btn" type="button" data-v-flip title="Umdrehen">${icons.cube}</button>
      ${m.gg ? '<button class="hud-btn hud-btn--txt" type="button" data-v-view="video" title="Zurück zum Video">Video</button>' : m.video ? `<button class="hud-btn hud-btn--txt" type="button" data-v-video title="Im Spiel ansehen (YouTube)">${icons.play}<span>Trailer</span></button>` : ''}
    </span>`;
  body.innerHTML = '<div class="viewer__load">3D-Karte wird gebaut …</div>';
  try {
    const { mountCard } = await import('./card3d.js');
    if (token !== current) return;
    const c = await mountCard(body, spec);
    if (token !== current) { c.dispose(); return; }
    card = c;
    body.querySelector('.viewer__load')?.remove();
    $('[data-v-rotate]', root)?.setAttribute('aria-pressed', c.auto);
  } catch (err) {
    if (token !== current) return;
    console.warn('3D nicht verfügbar, zeige 2D-Karte:', err);
    await mountFallback(body, spec, hud);
  }
}

async function mountFallback(body, spec, hud) {
  const { drawFront, firstImg, loadImg, fontsReady } = await import('./cardfaces.js');
  await fontsReady();
  const [img, pattern] = await Promise.all([firstImg(spec.images), loadImg(spec.pattern)]);
  const cv = drawFront(document.createElement('canvas'), spec, { img, pattern, vbIcon: null });
  body.innerHTML = '<div class="fallback-card"></div>';
  const wrap = body.firstElementChild;
  wrap.append(cv);
  hud.querySelector('[data-v-rotate]')?.remove();
  hud.querySelector('[data-v-flip]')?.remove();
  hud.querySelector('.viewer__hint').textContent = 'Bewegen zum Kippen';
  wrap.addEventListener('pointermove', (e) => {
    const r = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    cv.style.transform = `rotateY(${px * 30}deg) rotateX(${-py * 22}deg)`;
  });
  wrap.addEventListener('pointerleave', () => { cv.style.transform = ''; });
}

function teardownStage() {
  card?.dispose();
  card = null;
  const v = root?.querySelector('.viewer__clip video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
}

function showVideo(id) {
  stopAudio();
  closeMini();
  teardownStage();
  $('[data-v-stage]', root).classList.remove('is-clip');
  const body = $('[data-v-stage-body]', root);
  body.innerHTML = `<div class="viewer__video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1" title="Item im Spiel (Showcase-Video)" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  const hud = $('[data-v-hud]', root);
  hud.innerHTML = `<span class="hud-right"><button class="hud-btn hud-btn--txt" type="button" data-v-back3d>Zurück</button></span>`;
}

/* ---------- Aktionen ---------- */
async function onClick(e) {
  const t = e.target;
  if (t.closest('[data-v-close]')) { onCloseCb?.(); return; }
  if (t.closest('[data-v-rotate]')) {
    if (!card) return;
    card.setAuto(!card.auto);
    t.closest('[data-v-rotate]').setAttribute('aria-pressed', card.auto);
    return;
  }
  if (t.closest('[data-v-flip]')) { card?.flip(); return; }
  if (t.closest('[data-v-video]')) {
    if (lastModel?.video) showVideo(lastModel.video);
    return;
  }
  if (t.closest('[data-v-back3d]')) {
    if (lastModel) mountStage(lastModel, current);
    return;
  }
  if (t.closest('[data-v-sound]')) {
    const v = root.querySelector('.viewer__clip video');
    if (v) { v.muted = !v.muted; if (v.paused) v.play().catch(() => {}); }
    return;
  }
  const clip = t.closest('[data-v-clip]');
  if (clip) {
    const v = clip.querySelector('video');
    if (v.paused) v.play().catch(() => {}); else v.pause();
    return;
  }
  const occBtn = t.closest('[data-v-occ]');
  if (occBtn) {
    const list = root.querySelector('[data-v-occ-list]');
    const open = list.hidden;
    list.hidden = !open;
    occBtn.setAttribute('aria-expanded', String(open));
    return;
  }
  const view = t.closest('[data-v-view]');
  if (view) {
    if (lastModel && view.getAttribute('aria-pressed') !== 'true') mountStage(lastModel, current, view.dataset.vView);
    return;
  }
  const s = getSnapFromPanel();
  if (t.closest('[data-v-wish]') && s) {
    const on = store.toggleWish(s);
    toast(on ? `${s.name} gemerkt` : `${s.name} von der Wunschliste entfernt`);
    refreshPanel();
    return;
  }
  if (t.closest('[data-v-own]') && s) {
    const on = store.toggleOwned(s);
    toast(on ? `${s.name} als „Besitze ich“ markiert` : `${s.name} aus dem Spind entfernt`);
    refreshPanel();
    return;
  }
  if (t.closest('[data-v-copy]')) {
    const ok = await copyText(location.href);
    toast(ok ? 'Link kopiert' : 'Kopieren nicht möglich – Adresse aus der Adresszeile nehmen');
  }
}

function getSnapFromPanel() { return lastModel?.subject ? snapOf(lastModel.subject, lastModel.colors) : null; }
function refreshPanel() { if (lastModel) renderPanel(lastModel); }
