// Einmal-Setup im Browser: API-Key, Epic-Name, Guthaben. Danach verschwindet es aus der Navigation.
import { $, esc, fmtNum, toast } from '../util.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { errorText } from './stats.js';

let el;
let confirmReset = false;

export async function init(container) {
  el = container;
  el.addEventListener('submit', onSubmit);
  el.addEventListener('click', onClick);
  render();
}

export function onShow() { confirmReset = false; render(); }

const mask = (k) => (k ? `${k.slice(0, 4)}••••••••${k.slice(-4)}` : '–');

function fields(s) {
  return `
    <div class="step">
      <div class="step__head"><span class="step__no">1</span><h2>API-Key</h2></div>
      <p>Hol dir deinen kostenlosen Key auf <a href="https://dash.fortnite-api.com" target="_blank" rel="noopener">dash.fortnite-api.com</a> (Login mit Discord) und füg ihn hier ein. Er wird nur für die Stats gebraucht – Shop, Archiv und Leaks laufen ohne.</p>
      <div class="inline">
        <label class="sr-only" for="setup-key">API-Key</label>
        <input class="input" id="setup-key" name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${s.apiKey ? 'Gespeichert: ' + esc(mask(s.apiKey)) + ' – leer lassen zum Behalten' : 'z. B. 1a2b3c4d-…'}">
        <button class="btn btn--ghost btn--sm" type="button" data-show-key>Anzeigen</button>
      </div>
    </div>
    <div class="step">
      <div class="step__head"><span class="step__no">2</span><h2>Dein Epic-Name</h2></div>
      <p>Damit die Stats-Seite direkt deine Werte zeigt. Optional.</p>
      <div class="inline">
        <label class="sr-only" for="setup-name">Epic-Anzeigename</label>
        <input class="input" id="setup-name" name="epicName" autocomplete="off" placeholder="Epic-Anzeigename" value="${esc(s.epicName || '')}">
        <label class="sr-only" for="setup-type">Plattform</label>
        <select class="select" id="setup-type" name="accountType" style="width:auto">
          ${[['epic', 'Epic (PC)'], ['psn', 'PlayStation'], ['xbl', 'Xbox']].map(([v, l]) => `<option value="${v}"${(s.accountType || 'epic') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="step">
      <div class="step__head"><span class="step__no">3</span><h2>Dein V-Bucks-Guthaben</h2></div>
      <p>Dann zeigt dir der Shop, was du dir leisten kannst, und der Rechner, was beim Aufladen fehlt. Optional, jederzeit oben rechts änderbar.</p>
      <div class="inline">
        <label class="sr-only" for="setup-balance">V-Bucks</label>
        <input class="input num" id="setup-balance" name="balance" type="number" min="0" step="50" inputmode="numeric" placeholder="z. B. 800" value="${s.balance ?? ''}" style="max-width:220px">
      </div>
    </div>`;
}

function render() {
  const s = store.settings;
  const done = !!s.setupDone;
  el.innerHTML = `
    <header class="view-head"><div>
      <p class="label kicker">${done ? 'Alles bleibt in diesem Browser' : 'Dauert eine Minute'}</p>
      <h1 class="display">${done ? 'Einstellungen' : 'Einmal-Setup'}</h1>
      <p class="lead">${done
        ? 'Hier änderst du Key, Namen und Guthaben. Nichts davon landet auf GitHub oder einem Server – es liegt nur im Speicher dieses Browsers.'
        : 'Trag die Daten einmal ein, teste sie und speichere. Danach verschwindet das Setup aus der Navigation. Dein Key liegt nur im Speicher dieses Browsers und geht ausschließlich an fortnite-api.com, wenn du Stats abrufst.'}</p>
    </div></header>
    ${done ? `<dl class="kv panel" style="max-width:760px">
        <dt>API-Key</dt><dd>${esc(mask(s.apiKey))}</dd>
        <dt>Epic-Name</dt><dd>${esc(s.epicName || '–')}</dd>
        <dt>Guthaben</dt><dd>${s.balance != null ? `${fmtNum(s.balance)} V-Bucks` : '–'}</dd>
      </dl>` : ''}
    <form class="setup" data-setup autocomplete="off">
      ${fields(s)}
      <div class="step">
        <div class="step__head"><span class="step__no">4</span><h2>${done ? 'Speichern' : 'Testen & speichern'}</h2></div>
        <p>${done ? 'Ein neuer Key wird vorher kurz geprüft.' : 'Die Seite fragt einmal deine Stats ab. Klappt das, ist alles richtig eingerichtet.'}</p>
        <div class="actions">
          <button class="btn btn--primary" type="submit">${done ? 'Speichern' : 'Testen & speichern'}</button>
          ${done ? '' : '<button class="btn btn--ghost" type="button" data-skip>Ohne Key weiter</button>'}
        </div>
        <div data-status aria-live="polite"></div>
      </div>
    </form>
    ${done ? `<section class="panel" style="max-width:760px"><h3>Zurücksetzen</h3>
      <p class="muted" style="margin:0 0 12px;font-size:var(--t-sm)">Löscht Key, Namen, Guthaben, Wunschliste und Spind aus diesem Browser. Danach erscheint das Setup wieder.</p>
      <div class="actions">
        <button class="btn btn--sm" type="button" data-remove-key${s.apiKey ? '' : ' disabled'}>Nur Key entfernen</button>
        <button class="btn btn--sm${confirmReset ? ' btn--primary' : ''}" type="button" data-reset>${confirmReset ? 'Ja, wirklich alles löschen' : 'Alles zurücksetzen'}</button>
      </div></section>` : ''}`;
}

function status(html, tone = 'ok') {
  const box = $('[data-status]', el);
  if (box) box.innerHTML = `<div class="notice notice--${tone}" style="margin-top:6px"><p>${html}</p></div>`;
}

async function onSubmit(e) {
  if (!e.target.matches('[data-setup]')) return;
  e.preventDefault();
  const s = store.settings;
  const f = new FormData(e.target);
  const key = String(f.get('apiKey') || '').trim() || s.apiKey || '';
  const name = String(f.get('epicName') || '').trim();
  const accountType = f.get('accountType') || 'epic';
  const balRaw = String(f.get('balance') || '').trim();
  const balance = balRaw === '' ? undefined : Math.max(0, Math.round(Number(balRaw)));
  const btn = e.target.querySelector('[type="submit"]');

  if (!key) { status('Ohne Key gibt es keine Stats. Trag einen ein oder nimm „Ohne Key weiter“.', 'warn'); return; }
  btn.disabled = true;
  status('Teste den Key …', 'ok');
  let preview = '';
  try {
    const data = await api.stats({ name: name || 'Ninja', accountType: name ? accountType : 'epic', key });
    if (name) {
      const ov = data.stats?.all?.overall;
      preview = ` Gefunden: <strong>${esc(data.account?.name || name)}</strong>${data.battlePass ? ` · Battle Pass Stufe ${fmtNum(data.battlePass.level)}` : ''}${ov ? ` · ${fmtNum(ov.wins)} Siege` : ''}.`;
    }
  } catch (err) {
    btn.disabled = false;
    if (err.status === 401 || err.status === 0) { status(esc(errorText(err)), 'warn'); return; }
    if (name && (err.status === 403 || err.status === 404)) {
      preview = ` Key funktioniert, aber: ${esc(errorText(err))}`;
    }
    // Ohne Namen bedeutet 403/404 beim Testkonto: Key ist gültig
  }
  btn.disabled = false;
  store.setSettings({ apiKey: key, epicName: name || undefined, accountType, balance, setupDone: true, setupDismissed: true });
  const wasDone = !!s.setupDone;
  render();
  status(`${wasDone ? 'Gespeichert.' : 'Fertig eingerichtet.'}${preview} ${wasDone ? '' : 'Das Setup ist jetzt aus der Navigation verschwunden – ändern kannst du alles über „Einstellungen“ unten auf der Seite.'} <a href="#/stats">Zu den Stats</a> · <a href="#/shop">Zum Shop</a>`, 'ok');
  toast(wasDone ? 'Einstellungen gespeichert' : 'Setup abgeschlossen');
}

function onClick(e) {
  if (e.target.closest('[data-show-key]')) {
    const input = $('#setup-key', el);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.target.closest('[data-show-key]').textContent = show ? 'Verbergen' : 'Anzeigen';
    return;
  }
  if (e.target.closest('[data-skip]')) {
    const f = new FormData($('[data-setup]', el));
    const balRaw = String(f.get('balance') || '').trim();
    store.setSettings({ setupDone: true, setupDismissed: true, epicName: String(f.get('epicName') || '').trim() || undefined, balance: balRaw === '' ? undefined : Math.max(0, Math.round(Number(balRaw))) });
    toast('Setup übersprungen – Stats kannst du später freischalten');
    location.hash = '#/shop';
    return;
  }
  if (e.target.closest('[data-remove-key]')) {
    store.setSettings({ apiKey: undefined });
    toast('Key entfernt');
    render();
    return;
  }
  if (e.target.closest('[data-reset]')) {
    if (!confirmReset) { confirmReset = true; render(); return; }
    confirmReset = false;
    store.resetAll();
    toast('Alles zurückgesetzt');
    render();
  }
}
