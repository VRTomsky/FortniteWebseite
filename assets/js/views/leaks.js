// Leaks: Items aus dem letzten Update, die noch nie im Shop waren.
import { $, esc, fmtNum, fmtDate } from '../util.js';
import { api } from '../api.js';
import { normalizeBr, historyStats, loadConfig, watchHit } from '../data.js';
import { itemTile, skeletonTiles, errorBox, emptyBox } from '../components.js';
import { typeLabel } from '../labels.js';

let el;

export async function init(container) {
  el = container;
  el.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); });
  await load();
}

const version = (build) => (/Release-(\d+\.\d+)/.exec(build || '')?.[1] ? `v${/Release-(\d+\.\d+)/.exec(build)[1]}` : 'unbekannt');

async function load() {
  el.innerHTML = `${head()}${skeletonTiles(12, true)}`;
  let data, cfg;
  try {
    [data, cfg] = await Promise.all([api.newCosmetics(), loadConfig()]);
  } catch (err) {
    el.innerHTML = head() + errorBox(err);
    return;
  }
  const watch = cfg.watch;
  const br = (data.items?.br || []).map((raw) => {
    const it = normalizeBr(raw);
    const st = historyStats(it.history);
    return { ...it, ...st, hit: watchHit(watch, it.name, it.set) };
  });
  const never = br.filter((i) => !i.last);
  const seen = br.filter((i) => i.last);
  const hits = never.filter((i) => i.hit);
  const groups = new Map();
  for (const it of never) {
    const k = it.set || 'Ohne Set';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const sorted = [...groups.entries()].sort((a, b) => (a[0] === 'Ohne Set') - (b[0] === 'Ohne Set') || b[1].length - a[1].length);
  const other = data.items || {};
  const extra = [['tracks', 'Jam-Songs'], ['cars', 'Auto-Teile'], ['instruments', 'Instrumente'], ['lego', 'LEGO-Teile']]
    .map(([k, l]) => [l, other[k]?.length || 0]).filter(([, n]) => n);

  el.innerHTML = `${head(data)}
    <ul class="facts" style="margin:0">
      <li><b>${esc(version(data.build))}</b><span class="label">Update vom ${esc(fmtDate(data.date))}</span></li>
      <li data-tone="new"><b>${fmtNum(never.length)}</b><span class="label">noch nie im Shop</span></li>
      <li><b>${fmtNum(seen.length)}</b><span class="label">geändert, schon mal im Shop</span></li>
      ${extra.map(([l, n]) => `<li><b>${fmtNum(n)}</b><span class="label">${esc(l)}</span></li>`).join('')}
    </ul>
    <div class="notice"><p>Diese Items stecken in den Spieldateien, sind aber noch nicht erschienen. Geleakte Items können sich noch ändern, später kommen oder nie veröffentlicht werden. Neue Leaks tauchen hier auf, sobald fortnite-api.com das jeweils neueste Update ausgelesen hat.</p></div>
    ${hits.length ? `<section class="section"><div class="section-head"><h2>Treffer aus deiner Watchlist</h2><span class="count">${hits.length}</span><span class="rule"></span></div>
      <div class="grid grid--compact">${hits.map((i) => itemTile(i, { badge: `<span class="badge badge--watch" title="Watchlist: ${esc(i.hit)}">Watchlist</span>`, seen: false })).join('')}</div></section>` : ''}
    ${never.length ? sorted.map(([set, items]) => `<section class="section">
      <div class="section-head"><h2>${esc(set)}</h2><span class="count">${items.length}</span><span class="rule" aria-hidden="true"></span></div>
      <div class="grid grid--compact">${items.map((i) => itemTile(i, { seen: false, badge: `<span class="badge">${esc(typeLabel(i.type))}</span>` })).join('')}</div>
    </section>`).join('') : emptyBox('Keine neuen Leaks', 'Im letzten ausgelesenen Update stecken keine Items, die noch nie im Shop waren.')}
    ${seen.length ? `<details class="panel"><summary class="label" style="cursor:pointer">Geänderte Items, die schon im Shop waren (${seen.length})</summary>
      <div class="grid grid--compact" style="margin-top:14px">${seen.map((i) => itemTile(i)).join('')}</div></details>` : ''}`;
}

function head() {
  return `<header class="view-head"><div>
    <p class="label kicker">Aus den Spieldateien</p>
    <h1 class="display">Leaks</h1>
    <p class="lead">Neue Items aus dem letzten Fortnite-Update, die es noch nie im Shop gab. Was hier auftaucht, kommt oft in den nächsten Tagen oder Wochen.</p>
  </div></header>`;
}
