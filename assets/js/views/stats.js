// Spieler-Stats über fortnite-api.com — braucht den API-Key aus dem Einmal-Setup.
import { $, esc, fmtNum, fmtDate } from '../util.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { errorBox } from '../components.js';

let el;
let last = null;
const state = { input: 'all', timeWindow: 'lifetime' };

const MODES = [['overall', 'Gesamt'], ['solo', 'Solo'], ['duo', 'Duo'], ['trio', 'Trio'], ['squad', 'Squad'], ['ltm', 'Spezialmodi']];
const INPUTS = [['all', 'Alle Eingaben'], ['keyboardMouse', 'Maus & Tastatur'], ['gamepad', 'Controller'], ['touch', 'Touch']];

export function errorText(err) {
  switch (err?.status) {
    case 401: return 'Der API-Key ist ungültig. Prüf ihn im Setup – er steht in deinem Dashboard auf dash.fortnite-api.com.';
    case 403: return 'Die Stats dieses Accounts sind privat. Im Spiel: Einstellungen → Konto und Datenschutz → „In Bestenliste anzeigen“ einschalten. Danach kann es ein paar Minuten dauern.';
    case 404: return 'Kein Account mit diesem Namen gefunden (oder er hat noch keine Matches gespielt). Achte auf die genaue Schreibweise und die Plattform.';
    case 429: return 'Zu viele Anfragen in kurzer Zeit. Warte eine Minute und versuch es nochmal.';
    default: return err?.message || 'Unbekannter Fehler.';
  }
}

export async function init(container) {
  el = container;
  el.addEventListener('submit', onSubmit);
  el.addEventListener('click', onClick);
  window.addEventListener('store', (e) => { if (e.detail === 'settings' && !el.hidden) render(); });
  render();
  const s = store.settings;
  if (s.apiKey && s.epicName) fetchStats(s.epicName, s.accountType || 'epic');
}

export function onShow() {
  const s = store.settings;
  render();
  if (!last && s.apiKey && s.epicName) fetchStats(s.epicName, s.accountType || 'epic');
}

function head() {
  return `<header class="view-head"><div>
    <p class="label kicker">Battle Royale</p>
    <h1 class="display">Stats</h1>
    <p class="lead">Siege, K/D, Spielzeit und Battle-Pass-Stufe – für dich oder jeden anderen Spieler mit öffentlichen Stats.</p>
  </div></header>`;
}

function render() {
  const s = store.settings;
  if (!s.apiKey) {
    el.innerHTML = `${head()}<section class="panel"><h2>Erst einmal einrichten</h2>
      <p class="muted">Für Stats brauchst du deinen kostenlosen API-Key von fortnite-api.com. Du trägst ihn einmal im Setup ein; er bleibt nur in diesem Browser.</p>
      <a class="btn btn--primary" href="#/setup">Zum Setup</a></section>`;
    return;
  }
  el.innerHTML = `${head()}
    <form class="toolbar" style="position:static" data-form>
      <div class="toolbar__row">
        <label class="sr-only" for="st-name">Epic-Name</label>
        <input class="input" style="flex:1 1 220px;width:auto;min-height:38px" id="st-name" name="name" placeholder="Epic-Anzeigename" value="${esc(last?.query?.name || s.epicName || '')}" autocomplete="off" required>
        <label class="sr-only" for="st-type">Plattform</label>
        <select class="select" id="st-type" name="accountType">
          ${[['epic', 'Epic'], ['psn', 'PlayStation'], ['xbl', 'Xbox']].map(([v, l]) => `<option value="${v}"${(last?.query?.accountType || s.accountType || 'epic') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <label class="sr-only" for="st-window">Zeitraum</label>
        <select class="select" id="st-window" name="timeWindow">
          <option value="lifetime"${state.timeWindow === 'lifetime' ? ' selected' : ''}>Gesamte Zeit</option>
          <option value="season"${state.timeWindow === 'season' ? ' selected' : ''}>Diese Saison</option>
        </select>
        <button class="btn btn--primary" type="submit">Stats laden</button>
      </div>
    </form>
    <div data-out>${last ? '' : '<p class="muted">Gib einen Epic-Namen ein.</p>'}</div>`;
  if (last) draw();
}

async function fetchStats(name, accountType) {
  const out = $('[data-out]', el);
  if (out) out.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  try {
    const data = await api.stats({ name, accountType, timeWindow: state.timeWindow, key: store.settings.apiKey });
    last = { data, query: { name, accountType } };
    draw();
  } catch (err) {
    last = null;
    if (out) out.innerHTML = errorBox({ message: errorText(err) }, { retry: false, title: 'Stats nicht verfügbar' });
  }
}

const pct = (v) => (v == null ? '–' : `${(Math.round(v * 10) / 10).toLocaleString('de-DE')} %`);
const dec = (v, d = 2) => (v == null ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const hours = (m) => (m == null ? '–' : `${fmtNum(Math.round(m / 60))} Std`);

function draw() {
  const out = $('[data-out]', el);
  if (!out || !last) return;
  const { data } = last;
  const group = data.stats?.[state.input] || null;
  const ov = group?.overall;
  const bp = data.battlePass;
  out.innerHTML = `
    <section class="panel" style="display:grid;gap:18px">
      <div class="result-line">
        <div><p class="label" style="margin:0 0 6px">Spieler</p><h2 class="display" style="margin:0;font-size:var(--t-2xl)">${esc(data.account?.name || last.query.name)}</h2></div>
        ${bp ? `<div style="min-width:200px"><p class="label" style="margin:0 0 6px">Battle Pass · Stufe ${fmtNum(bp.level)}</p><div class="progress"><i style="width:${Math.min(100, bp.progress || 0)}%"></i></div></div>` : ''}
      </div>
      <div class="tabs">${INPUTS.map(([v, l]) => `<button class="chip" type="button" data-input="${v}" aria-pressed="${state.input === v}"${data.stats?.[v] ? '' : ' disabled'}>${l}</button>`).join('')}</div>
      ${ov ? `<div class="stats">
        ${stat('Siege', fmtNum(ov.wins))}${stat('Siegquote', pct(ov.winRate))}${stat('K/D', dec(ov.kd))}${stat('Kills', fmtNum(ov.kills))}
        ${stat('Matches', fmtNum(ov.matches))}${stat('Top 10', fmtNum(ov.top10))}${stat('Kills pro Match', dec(ov.killsPerMatch))}${stat('Spielzeit', hours(ov.minutesPlayed))}
      </div>` : '<p class="muted">Für diese Eingabeart gibt es keine Daten.</p>'}
      ${ov?.lastModified ? `<p class="label faint" style="margin:0">Zuletzt aktualisiert: ${esc(fmtDate(ov.lastModified))}</p>` : ''}
    </section>
    ${group ? `<div class="modes">${MODES.slice(1).filter(([k]) => group[k]).map(([k, l]) => {
      const m = group[k];
      return `<article class="mode"><h3>${l}</h3><dl>
        <div><dt>Siege</dt><dd>${fmtNum(m.wins)}</dd></div>
        <div><dt>Quote</dt><dd>${pct(m.winRate)}</dd></div>
        <div><dt>K/D</dt><dd>${dec(m.kd)}</dd></div>
        <div><dt>Kills</dt><dd>${fmtNum(m.kills)}</dd></div>
        <div><dt>Matches</dt><dd>${fmtNum(m.matches)}</dd></div>
        <div><dt>Top 10</dt><dd>${m.top10 != null ? fmtNum(m.top10) : (m.top5 != null ? fmtNum(m.top5) : '–')}</dd></div>
      </dl></article>`;
    }).join('')}</div>` : ''}`;
}

const stat = (label, value) => `<div class="stat"><span class="label">${label}</span><b>${value}</b></div>`;

function onSubmit(e) {
  if (!e.target.matches('[data-form]')) return;
  e.preventDefault();
  const f = new FormData(e.target);
  state.timeWindow = f.get('timeWindow');
  fetchStats(String(f.get('name')).trim(), f.get('accountType'));
}

function onClick(e) {
  const b = e.target.closest('[data-input]');
  if (b && !b.disabled) { state.input = b.dataset.input; draw(); }
}
