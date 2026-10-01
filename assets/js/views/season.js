// Saison-Überblick: Kapitel/Saison, Countdown, Event, In-Game-News, Karte, Neues seit der Pause.
import { esc, fmtDate, fmtClock, fmtNum, fmtShort, fmtTime, nextReset, todayNum, dayNum } from '../util.js';
import { api } from '../api.js';
import { loadConfig, loadIndex } from '../data.js';
import { errorBox } from '../components.js';

let el;

export async function init(container) {
  el = container;
  const cfg = await loadConfig();
  const s = cfg.season || {};
  const meta = cfg.meta;
  const now = Date.now();
  const start = Date.parse(s.start), end = Date.parse(s.end);
  const mismatch = meta?.chapter && (Number(meta.chapter) !== Number(s.chapter) || Number(meta.season) !== Number(s.season));
  const over = Number.isFinite(end) && now > end;
  const chapter = mismatch ? meta.chapter : s.chapter;
  const season = mismatch ? meta.season : s.season;
  const showDetails = !mismatch && !over && Number.isFinite(start) && Number.isFinite(end);
  const total = showDetails ? Math.max(1, Math.round((end - start) / 86400000)) : 0;
  const day = showDetails ? Math.min(total, Math.max(1, Math.ceil((now - start) / 86400000))) : 0;
  const pct = showDetails ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 0;

  el.innerHTML = `
    <section class="season-hero">
      <p class="label">Aktuelle Saison</p>
      <h1 class="display">Kapitel ${esc(chapter ?? '?')} <span>/</span> Saison ${esc(season ?? '?')}</h1>
      ${showDetails ? `
        <p class="display" style="margin:0;font-size:var(--t-2xl);color:var(--text-dim)">${esc(s.name || '')}</p>
        <div style="display:grid;gap:8px;max-width:720px">
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${day}" aria-label="Saisonfortschritt"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="result-line"><span class="label">Tag ${day} von ${total} · ${esc(fmtDate(s.start))} – ${esc(fmtDate(s.end))}${s.endApprox ? ' (Ende ca.)' : ''}</span>
          <span class="label">Endet in <span class="num" data-until="${end}" data-fmt="short">${esc(fmtShort(end - now))}</span></span></div>
        </div>` : `<div class="notice"><p>${mismatch ? 'Neue Saison erkannt. Name und Enddatum fehlen noch – trag sie in <code>config/season.json</code> ein.' : 'Die eingetragene Saison ist vorbei. Aktualisiere <code>config/season.json</code> für die neue Saison.'}</p></div>`}
    </section>

    <div class="cols">
      ${(showDetails ? s.events || [] : []).filter((ev) => Date.parse(ev.end) > now).map((ev) => {
        const live = Date.parse(ev.start) <= now;
        const target = live ? Date.parse(ev.end) : Date.parse(ev.start);
        return `<article class="panel"><p class="label" style="margin:0 0 6px">${live ? 'Event läuft' : 'Event startet bald'}</p><h3>${esc(ev.name)}</h3>
          <p class="muted" style="margin:0 0 12px">${esc(ev.text || '')}</p>
          <p class="label" style="margin:0">${live ? 'Noch' : 'Start in'} <span class="num" data-until="${target}" data-fmt="short">${esc(fmtShort(target - now))}</span></p></article>`;
      }).join('')}
      <article class="panel"><p class="label" style="margin:0 0 6px">Täglicher Shop-Wechsel</p><h3>${esc(fmtTime(nextReset()))} Uhr</h3>
        <p class="muted" style="margin:0 0 12px">Der Item-Shop wechselt jeden Tag um 00:00 UTC – bei dir ${esc(fmtTime(nextReset()))} Uhr. An Update-Tagen kommen neue Items oft erst nach den Server-Wartungen.</p>
        <p class="label" style="margin:0">Nächster in <span class="num" data-until-reset data-fmt="clock">${fmtClock(nextReset() - now)}</span></p></article>
      <article class="panel"><p class="label" style="margin:0 0 6px">Battle Pass</p><h3>800 V-Bucks</h3>
        <p class="muted" style="margin:0">Seit März 2026 kostet der Battle Pass 800 V-Bucks und bringt beim Durchspielen genau 800 zurück – genug für den nächsten.</p></article>
    </div>

    <section class="section" data-news><div class="section-head"><h2>Im Spiel gerade</h2><span class="rule" aria-hidden="true"></span></div><div class="news"><div class="skeleton" style="height:280px"></div><div class="skeleton" style="height:280px"></div></div></section>

    <section class="section" data-map><div class="section-head"><h2>Aktuelle Karte</h2><span class="rule" aria-hidden="true"></span></div><div class="skeleton" style="height:320px"></div></section>

    <section class="section">
      <div class="section-head"><h2>Neu seit deiner Pause</h2><span class="rule" aria-hidden="true"></span></div>
      <div class="since" data-since>${since().join('')}</div>
    </section>`;

  api.news().then(renderNews).catch((err) => { el.querySelector('[data-news] .news').outerHTML = errorBox(err, { retry: false, title: 'News nicht verfügbar' }); });
  api.map().then(renderMap).catch((err) => { el.querySelector('[data-map] .skeleton').outerHTML = errorBox(err, { retry: false, title: 'Karte nicht verfügbar' }); });
  loadIndex().then((idx) => idx && enrichSince(idx)).catch(() => {});
}

function renderNews(data) {
  const motds = (data?.motds || []).filter((m) => !m.hidden);
  const box = el.querySelector('[data-news] .news');
  if (!motds.length) { box.outerHTML = '<p class="muted">Gerade keine News im Spiel.</p>'; return; }
  box.innerHTML = motds.map((m) => `<article>
    <img src="${esc(m.tileImage || m.image)}" alt="" loading="lazy" decoding="async">
    <div class="body"><h3>${esc(m.title || m.tabTitle || '')}</h3><p>${esc(m.body || '')}</p></div>
  </article>`).join('');
}

function renderMap(data) {
  const box = el.querySelector('[data-map] .skeleton');
  const pois = [...new Set((data?.pois || []).map((p) => p.name).filter((n) => n && !/^\s*$/.test(n)))].sort((a, b) => a.localeCompare(b, 'de'));
  const src = data?.images?.pois || data?.images?.blank;
  box.outerHTML = `<div class="cols cols--2">
    <a class="mapbox" href="${esc(src)}" target="_blank" rel="noopener" aria-label="Karte in voller Größe öffnen"><img src="${esc(src)}" alt="Aktuelle Fortnite-Karte mit Ortsnamen" loading="lazy" decoding="async" width="1024" height="1024"></a>
    <div class="panel"><h3>${fmtNum(pois.length)} benannte Orte</h3><ul class="poi-list">${pois.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="muted" style="margin:14px 0 0;font-size:var(--t-sm)">Tipp: Karte anklicken für die volle Auflösung (ca. 2,5 MB).</p></div>
  </div>`;
}

const SINCE = [
  ['Zero Build', 'Battle Royale ohne Bauen, als eigener Modus neben der klassischen Variante.'],
  ['Reload', 'Kleinere Karte mit Wiederbelebung, solange ein Teammitglied lebt. Kurze, schnelle Runden.'],
  ['Fortnite OG', 'Die klassische Karte aus Kapitel 1 als dauerhafter eigener Modus.'],
  ['Blitz Royale', 'Sehr kurze Battle-Royale-Runden mit schneller Zone.'],
  ['LEGO Fortnite & Festival', 'Survival-Bauspiel im LEGO-Stil und ein Musik-Rhythmusspiel – daher die vielen Jam-Songs im Shop.'],
  ['Ranked', 'Gewertete Matches mit Rängen, für Battle Royale und Zero Build.'],
  ['Begleiter', 'Kleine Sidekicks, die neben dir herlaufen; manche schalten über Aufträge neue Teile frei.', 'sidekick'],
  ['Kicks', 'Schuhe als eigene Cosmetic-Kategorie, passend zu vielen Outfits.', 'shoe'],
  ['Auren & mehr', 'Neue Cosmetic-Typen wie Auren, Auto-Teile und Instrumente.', 'aura'],
  ['Overrides', 'Die Mechanik dieser Saison: Module, die die Regeln eines Matches verändern.'],
  ['Sprites', 'Kleine Wesen in Kapitel 7, die dir im Match Fähigkeiten geben.'],
  ['Neue V-Bucks-Preise', 'Seit März 2026 gibt es weniger V-Bucks pro Euro. Details im V-Bucks-Rechner.'],
];
function since() {
  return SINCE.map(([t, d, type]) => `<article><h3>${esc(t)}</h3><p>${esc(d)}</p>${type ? `<p class="label" data-count-type="${type}"></p>` : ''}</article>`);
}
function enrichSince(idx) {
  const counts = new Map();
  for (const it of idx.items) counts.set(it.type, (counts.get(it.type) || 0) + 1);
  el.querySelectorAll('[data-count-type]').forEach((p) => {
    const n = counts.get(p.dataset.countType);
    if (n) p.textContent = `${fmtNum(n)} Items im Archiv`;
  });
}
