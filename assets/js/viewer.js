// Detailfenster: schwarze Bühne mit 3D-Karte, Infos, Shop-Historie, Wunschliste/Spind.
import { $, esc, fmtNum, fmtDate, fmtAgo, fmtSpan, fmtEur, icons, copyText, toast, todayNum, DAY } from './util.js';
import { api } from './api.js';
import { store } from './store.js';
import { getShop, loadShop, normalizeBr, historyStats, cheapestOfferFor, loadIndex, brImages } from './data.js';
import { vb, snapOf, leaveText } from './components.js';
import { rarityColors, rarityImage, rarityLabel, typeLabel } from './labels.js';
import { cheapestTopUps } from './vbmath.js';

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
  document.body.classList.remove('no-scroll');
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
    <div class="viewer__stage" data-v-stage>
      <button class="btn viewer__close" type="button" data-v-close>${icons.close}<span>Schließen</span></button>
      <div data-v-stage-body style="position:absolute;inset:0"></div>
      <div class="viewer__hud" data-v-hud></div>
    </div>
    <aside class="viewer__panel" data-v-panel></aside>`;
  $('#viewer-root').append(root);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  $('[data-v-close]', root).focus({ preventScroll: true });
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

/* ---------- Infopanel ---------- */
function renderPanel(m) {
  lastModel = m;
  const s = m.subject;
  const o = m.offer;
  const tags = [];
  if (!m.isBundle && s?.rarity && s.kind === 'br') tags.push(`<span class="rar" style="--c1:${m.colors[0]}">${esc(s.rarityLabel || rarityLabel(s.rarity))}</span>`);
  tags.push(`<span class="rar rar--plain">${esc(m.isBundle ? 'Paket' : (s?.typeLabel || typeLabel(s?.type)))}</span>`);
  if (s?.chapter && !m.isBundle) tags.push(`<span class="rar rar--plain">Kapitel ${s.chapter} · Saison ${s.season}</span>`);
  if (o?.section && o.section.id !== '_alc') tags.push(`<span class="rar rar--plain">${esc(o.section.name)}</span>`);

  const desc = m.isBundle ? (o.offerTag || `${o.items.length} Items in einem Paket.`) : (s?.description || '');
  const st = m.stats;
  const wishId = s?.id;
  const wished = wishId && store.isWished(wishId);
  const owned = wishId && store.isOwned(wishId);
  if (s) snapOf(s, m.colors);

  let buy = '';
  if (o) {
    const bal = store.balance;
    let afford = '';
    if (bal != null) {
      const need = o.price - bal;
      if (need <= 0) afford = `<span class="muted">Dein Guthaben (${fmtNum(bal)}) reicht${bal - o.price > 0 ? ` – danach ${fmtNum(bal - o.price)} übrig` : ' genau'}.</span>`;
      else {
        const best = cheapestTopUps(need, { allowExact: false })[0];
        afford = `<span class="muted">Dir fehlen ${fmtNum(need)} V-Bucks${best ? ` – günstigste Aufladung: ${esc(best.label)} für ${fmtEur(best.cents / 100)}` : ''}. <a href="#/vbucks">Rechner</a></span>`;
      }
    } else {
      afford = '<span class="muted"><button class="linkbtn" type="button" data-balance-btn>Guthaben eintragen</button>, um zu sehen, was fehlt.</span>';
    }
    buy = `<div class="buyline">
      <span class="label">Heute im Shop${o.isBundle && !m.isBundle ? ` · im Paket ${esc(quoted(o.title))}` : ''}</span>
      ${vb(o.price, o.regular)}
      ${o.outAt ? `<span class="label" data-until="${o.outAt}" data-fmt="leave">${esc(leaveText(o.outAt))}</span>` : ''}
      ${afford}
    </div>`;
  } else if (st.last != null) {
    buy = `<div class="buyline"><span class="label">Gerade nicht im Shop</span><span style="font:400 var(--t-xl)/1 var(--f-display);text-transform:uppercase">Zuletzt ${esc(fmtAgo(st.since))}</span><span class="muted">am ${esc(fmtDate(st.last))}. Merk es dir – taucht es wieder auf, siehst du es im Shop und im Spind.</span></div>`;
  } else {
    buy = '<div class="buyline"><span class="label">Noch nie im Shop</span><span class="muted">Das kann ein Battle-Pass- oder Event-Item sein, eine Belohnung oder ein Leak, der noch nicht erschienen ist.</span></div>';
  }

  const history = st.count ? `<section style="display:grid;gap:12px">
      <p class="label" style="margin:0">Shop-Historie</p>
      <dl class="kv">
        <dt>Erstes Mal</dt><dd>${esc(fmtDate(st.first))}</dd>
        <dt>Zuletzt</dt><dd>${esc(fmtDate(st.last))} <span class="muted">(${esc(fmtAgo(st.since))})</span></dd>
        <dt>Im Shop</dt><dd>${fmtNum(st.runs)}× · ${fmtNum(st.count)} Tage insgesamt</dd>
        ${st.maxGap ? `<dt>Längste Pause</dt><dd>${esc(fmtSpan(st.maxGap))}</dd>` : ''}
        ${st.runs > 1 && st.runList ? `<dt>Pause im Schnitt</dt><dd>${esc(fmtSpan(Math.round(avgGap(st.runList))))}</dd>` : ''}
      </dl>
      ${st.runList ? timeline(st.runList, m.colors[0]) : ''}
    </section>` : '';

  const bundle = m.isBundle ? `<section style="display:grid;gap:10px"><p class="label" style="margin:0">Im Paket</p>
    <div class="bundle-items">${o.items.map((it) => `<a href="#/item/${encodeURIComponent(it.id)}" style="--c1:${it.colors[0]};--c3:${it.colors[2]}"><img src="${esc(it.images.icon || it.images.small || '')}" alt="" loading="lazy"><span>${esc(it.name)}</span><span class="faint">${esc(it.typeLabel || typeLabel(it.type))}</span></a>`).join('')}</div></section>` : '';

  const alsoIn = !m.isBundle && o?.isBundle ? `<p class="muted" style="margin:0;font-size:var(--t-sm)">Gibt es heute im Paket <a href="#/offer/${encodeURIComponent(o.key)}">${esc(quoted(o.title))}</a>.</p>` : '';

  $('[data-v-panel]', root).innerHTML = `
    <div>
      <p class="label" style="margin:0 0 8px">${esc([m.isBundle ? 'Paket' : s?.typeLabel, s?.set && !m.isBundle ? `Set: ${s.set}` : ''].filter(Boolean).join(' · '))}</p>
      <h2 id="viewer-title">${esc(m.title)}</h2>
    </div>
    <div class="viewer__tags">${tags.join('')}</div>
    ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
    ${buy}
    ${alsoIn}
    ${wishId ? `<div class="actions">
      <button class="btn${wished ? ' btn--primary' : ''}" type="button" data-v-wish aria-pressed="${!!wished}">${icons.heart}<span>${wished ? 'Gemerkt' : 'Merken'}</span></button>
      <button class="btn${owned ? ' btn--primary' : ''}" type="button" data-v-own aria-pressed="${!!owned}">${icons.check}<span>Besitze ich</span></button>
      <button class="btn btn--ghost" type="button" data-v-copy>${icons.link}<span>Link kopieren</span></button>
    </div>` : ''}
    ${bundle}
    ${history}
    ${s?.introText && !m.isBundle ? `<p class="label faint" style="margin:0">${esc(s.introText)}</p>` : ''}
    ${s?.id && !m.isBundle ? `<p class="label faint" style="margin:0">ID: ${esc(s.id)}</p>` : ''}`;
}

function avgGap(runs) {
  let sum = 0;
  for (let i = 1; i < runs.length; i++) sum += runs[i].start - runs[i - 1].end;
  return sum / (runs.length - 1);
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
    ticks += `<line x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="10" y2="56" stroke="#222d48" stroke-width="1"/><text x="${(xx + 3).toFixed(1)}" y="72">${y}</text>`;
  }
  const bars = runs.map((r) => {
    const a = x(r.start), b = x(r.end + 1);
    return `<rect x="${a.toFixed(1)}" y="20" width="${Math.max(2, b - a).toFixed(1)}" height="28" fill="${color}"/>`;
  }).join('');
  const tx = x(t1);
  return `<svg class="timeline" viewBox="0 0 ${W} 80" role="img" aria-label="Shop-Auftritte von ${fmtDate(runs[0].start)} bis heute: ${runs.length} Mal">
    <line x1="0" x2="${W - padR}" y1="34" y2="34" stroke="#18213a" stroke-width="28"/>
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

async function mountStage(m, token) {
  const body = $('[data-v-stage-body]', root);
  const hud = $('[data-v-hud]', root);
  const spec = cardSpec(m);
  hud.innerHTML = `
    <button class="btn btn--sm" type="button" data-v-rotate aria-pressed="true">${icons.rotate}<span>Auto-Drehen</span></button>
    <button class="btn btn--sm" type="button" data-v-flip>${icons.cube}<span>Umdrehen</span></button>
    ${m.video ? `<button class="btn btn--sm btn--primary" type="button" data-v-video>${icons.play}<span>Im Spiel ansehen</span></button>` : ''}
    <span class="viewer__hint"><span class="hint-long">Ziehen zum Drehen · Scrollen oder zwei Finger zum Zoomen · Doppelklick setzt zurück</span><span class="hint-short">Ziehen zum Drehen · zwei Finger zum Zoomen</span></span>`;
  body.innerHTML = '<div class="viewer__load">3D-Karte wird gebaut …</div>';
  try {
    const { mountCard } = await import('./card3d.js');
    if (token !== current) return;
    const c = await mountCard(body, spec);
    if (token !== current) { c.dispose(); return; }
    card = c;
    body.querySelector('.viewer__load')?.remove();
    $('[data-v-rotate]', root).setAttribute('aria-pressed', c.auto);
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
}

function showVideo(id) {
  teardownStage();
  const body = $('[data-v-stage-body]', root);
  body.innerHTML = `<div class="viewer__video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1" title="Item im Spiel (Showcase-Video)" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  const hud = $('[data-v-hud]', root);
  hud.innerHTML = '<button class="btn btn--sm btn--primary" type="button" data-v-back3d>Zurück zur 3D-Karte</button>';
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
