// Spind: Wunschliste und eigene Sammlung (lokal), Benachrichtigungen, Sicherung.
import { $, esc, fmtNum, toast } from '../util.js';
import { store } from '../store.js';
import { loadShop, getShop, cheapestOfferFor, loadIndex } from '../data.js';
import { itemTile, emptyBox } from '../components.js';
import { typeLabel, TYPE_ORDER } from '../labels.js';

let el;
let index = null;
const state = { tab: 'wish' };

function repoInfo() {
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  if (!m) return null;
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return repo ? { owner: m[1], repo } : null;
}

export async function init(container) {
  el = container;
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  window.addEventListener('store', (e) => { if (['wish', 'owned', 'settings'].includes(e.detail) && !el.hidden) render(); });
  render();
  loadShop().then(render).catch(() => {});
  loadIndex().then((i) => { index = i; render(); }).catch(() => {});
}

export function onShow() { render(); }

function enrich(snap) {
  const ix = index?.byId.get(snap.id);
  return {
    ...snap, ...(ix ? { last: ix.last, since: ix.since, runs: ix.runs, rarity: ix.rarity || snap.rarity, type: ix.type || snap.type } : {}),
    images: { icon: snap.img, small: snap.img },
  };
}

function render() {
  const wish = store.wishList();
  const owned = store.ownedList();
  const list = state.tab === 'wish' ? wish : owned;
  const shop = getShop();
  const s = store.settings;
  const notifState = !('Notification' in window) ? 'unsupported' : Notification.permission;
  const repo = repoInfo();
  const byType = new Map();
  for (const o of owned) byType.set(o.type, (byType.get(o.type) || 0) + 1);

  el.innerHTML = `
    <header class="view-head"><div>
      <p class="label kicker">Deine Sammlung</p>
      <h1 class="display">Spind</h1>
      <p class="lead">Merk dir Items mit dem Herz und markier im Detailfenster, was du schon besitzt. Alles bleibt in diesem Browser.</p>
    </div></header>

    <div class="tabs" role="tablist" aria-label="Spind">
      <button class="chip" role="tab" type="button" data-tab="wish" aria-selected="${state.tab === 'wish'}" aria-pressed="${state.tab === 'wish'}">Wunschliste <span class="count">${fmtNum(wish.length)}</span></button>
      <button class="chip" role="tab" type="button" data-tab="owned" aria-selected="${state.tab === 'owned'}" aria-pressed="${state.tab === 'owned'}">Besitze ich <span class="count">${fmtNum(owned.length)}</span></button>
    </div>

    ${state.tab === 'owned' && owned.length ? `<ul class="facts" style="margin:0">${[...byType.entries()].sort((a, b) => (TYPE_ORDER.indexOf(a[0]) + 1 || 99) - (TYPE_ORDER.indexOf(b[0]) + 1 || 99)).map(([t, n]) => `<li><b>${fmtNum(n)}</b><span class="label">${esc(typeLabel(t, n !== 1))}</span></li>`).join('')}</ul>` : ''}

    <div role="tabpanel">
      ${list.length ? `<div class="grid grid--compact">${list.map((snap) => {
        const it = enrich(snap);
        let badge = '';
        if (state.tab === 'wish' && shop) {
          const o = cheapestOfferFor(shop, snap.id);
          if (o) badge = `<span class="badge badge--new">Im Shop · ${fmtNum(o.price)} V-Bucks</span>`;
        }
        return itemTile(it, { badge, seen: it.last !== undefined });
      }).join('')}</div>`
      : state.tab === 'wish'
        ? emptyBox('Noch nichts gemerkt', 'Tipp im Shop oder Archiv auf das Herz an einem Item. Taucht es im Shop auf, siehst du es hier und oben im Shop.', '<a class="btn btn--primary" href="#/archiv">Zum Archiv</a>')
        : emptyBox('Noch nichts markiert', 'Öffne ein Item und tipp auf „Besitze ich“. So behältst du den Überblick, was dir noch fehlt.')}
    </div>

    <div class="cols">
      <section class="panel">
        <h3>Benachrichtigungen</h3>
        <p class="muted" style="margin:0 0 12px;font-size:var(--t-sm)">Der Browser meldet sich, wenn ein Item von deiner Wunschliste im Shop ist – solange die Seite in einem Tab offen ist.</p>
        ${notifState === 'unsupported' ? '<p class="muted">Dein Browser unterstützt keine Benachrichtigungen.</p>'
          : notifState === 'denied' ? '<p class="muted">Benachrichtigungen sind für diese Seite blockiert. Du kannst sie in den Website-Einstellungen deines Browsers freigeben.</p>'
          : `<label class="inline"><input type="checkbox" id="notify-toggle" data-notify ${s.notify && notifState === 'granted' ? 'checked' : ''}> <span>Benachrichtigen, wenn Wunsch-Items im Shop sind</span></label>`}
        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
        <h3 style="font-size:var(--t-lg)">Alarm per Mail (auch wenn die Seite zu ist)</h3>
        <p class="muted" style="margin:0 0 12px;font-size:var(--t-sm)">Der GitHub-Workflow prüft mehrmals täglich den Shop und die Spieldateien. Taucht ein Begriff aus deiner Watchlist auf, öffnet er ein Issue – GitHub schickt dir dann eine Mail und eine Push-Nachricht in der GitHub-App. Voreingestellt: Nikki, Obsession, One Wish Willow.</p>
        ${repo ? `<a class="btn btn--sm" href="https://github.com/${esc(repo.owner)}/${esc(repo.repo)}/edit/main/config/watch.json" target="_blank" rel="noopener">Watchlist auf GitHub bearbeiten</a>` : '<p class="muted" style="font-size:var(--t-sm)">Datei: <code>config/watch.json</code> im Repository.</p>'}
      </section>

      <section class="panel">
        <h3>Sicherung</h3>
        <p class="muted" style="margin:0 0 12px;font-size:var(--t-sm)">Wunschliste und Spind auf ein anderes Gerät mitnehmen: Datei exportieren und dort importieren.</p>
        <div class="actions">
          <button class="btn btn--sm" type="button" data-export>Exportieren</button>
          <label class="btn btn--sm btn--ghost" for="import-file">Importieren</label>
          <input class="sr-only" id="import-file" type="file" accept="application/json,.json" data-import>
        </div>
      </section>

      <section class="panel">
        <h3>Warum kein Epic-Login?</h3>
        <p class="muted" style="margin:0;font-size:var(--t-sm)">Epic bietet keine offizielle Schnittstelle, über die eine Website deinen Fortnite-Spind auslesen darf. Seiten, die das trotzdem anbieten, lassen dich Login-Codes deines Epic-Kontos einfügen – damit könnten sie deinen Account übernehmen. Deshalb markierst du hier selbst, was du hast. Deine Stats gibt es trotzdem: über den API-Key im Setup.</p>
      </section>
    </div>`;
}

async function onClick(e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; render(); return; }
  if (e.target.closest('[data-export]')) {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shopradar-spind-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Sicherung heruntergeladen');
  }
}

async function onChange(e) {
  if (e.target.matches('[data-notify]')) {
    if (e.target.checked) {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { e.target.checked = false; toast('Benachrichtigungen nicht erlaubt'); store.setSettings({ notify: false }); return; }
      store.setSettings({ notify: true });
      toast('Benachrichtigungen an');
    } else {
      store.setSettings({ notify: false });
    }
    return;
  }
  if (e.target.matches('[data-import]')) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      store.importData(JSON.parse(await file.text()));
      toast('Sicherung importiert');
    } catch (err) {
      toast(err.message || 'Datei konnte nicht gelesen werden');
    }
  }
}
