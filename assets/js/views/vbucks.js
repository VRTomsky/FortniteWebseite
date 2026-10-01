// V-Bucks: was fehlt mir, günstigste Aufladung, Angebots-Check, Spartipps.
import { $, esc, fmtEur, fmtNum } from '../util.js';
import { store } from '../store.js';
import { loadShop, getShop, cheapestOfferFor } from '../data.js';
import { PACKS, OLD_CARDS, CREW, REWARDS, EXACT, cheapestTopUps, perThousand } from '../vbmath.js';
import { vb } from '../components.js';

let el;
const state = { target: 1500, exact: true };

export async function init(container) {
  el = container;
  const best = Math.min(...PACKS.map((p) => perThousand(p.vb, p.cents)));
  el.innerHTML = `
    <header class="view-head"><div>
      <p class="label kicker">Aufladen ohne Fehlkauf</p>
      <h1 class="display">V-Bucks</h1>
      <p class="lead">Rechne aus, was dir für ein Item fehlt, welches Paket am wenigsten kostet und ob ein Angebot wirklich günstig ist. Preise: offizielle Euro-Preise nach der Preisänderung vom 19.03.2026.</p>
    </div></header>

    <section class="panel">
      <h2>Was fehlt mir?</h2>
      <div class="calc">
        <div class="field"><label class="label" for="vb-balance">Mein Guthaben</label>
          <input class="input num" id="vb-balance" type="number" min="0" step="50" inputmode="numeric" placeholder="z. B. 800" value="${store.balance ?? ''}" data-in="balance"></div>
        <div class="field"><label class="label" for="vb-target">Item kostet</label>
          <input class="input num" id="vb-target" type="number" min="0" step="50" inputmode="numeric" value="${state.target}" data-in="target"></div>
        <label class="inline" style="min-height:42px"><input type="checkbox" id="vb-exact" data-in="exact" ${state.exact ? 'checked' : ''}> <span class="muted" style="font-size:var(--t-sm)">Genau-Betrag-Kauf einrechnen (50 V-Bucks = 0,99 €, nicht überall verfügbar)</span></label>
      </div>
      <div class="toolbar__row" style="margin-top:14px" data-quick>
        <span class="label">Übliche Preise:</span>
        ${[800, 1200, 1500, 2000].map((n) => `<button class="chip" type="button" data-target="${n}">${fmtNum(n)}</button>`).join('')}
      </div>
      <div style="margin-top:18px;display:grid;gap:12px" data-result></div>
    </section>

    <div class="cols cols--2">
      <section class="panel">
        <h2>Offizielle Pakete</h2>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Paket</th><th class="r">Preis</th><th class="r">€ / 1.000</th><th class="r">mit Epic Rewards</th></tr></thead>
          <tbody>
            ${PACKS.map((p) => {
              const k = perThousand(p.vb, p.cents);
              return `<tr class="${k === best ? 'is-best' : ''}"><td>${vb(p.vb)}${k === best ? '<span class="tag">Bester Kurs</span>' : ''}</td><td class="r">${fmtEur(p.cents / 100)}</td><td class="r">${fmtEur(k)}</td><td class="r">${fmtEur(k * (1 - REWARDS))}</td></tr>`;
            }).join('')}
            <tr><td>${vb(EXACT.vb)} genau</td><td class="r">${fmtEur(EXACT.cents / 100)}</td><td class="r">${fmtEur(perThousand(EXACT.vb, EXACT.cents))}</td><td class="r">–</td></tr>
            <tr><td>Fortnite Crew (Abo)</td><td class="r">${fmtEur(CREW.cents / 100)}/Monat</td><td class="r" colspan="2">${fmtNum(CREW.vb)} V-Bucks + Battle Pass + Skin</td></tr>
          </tbody>
        </table></div>
        <p class="muted" style="font-size:var(--t-sm);margin:12px 0 0">Epic Rewards: 20 % zurück als Guthaben, wenn du auf dem PC über Epic bezahlst (auch bei V-Bucks). Das Guthaben ist kein Bargeld, sondern für Fortnite und den Epic Store.</p>
      </section>

      <section class="panel">
        <h2>Angebot prüfen</h2>
        <p class="muted" style="margin:0 0 14px;font-size:var(--t-sm)">Karte im Laden oder Aktion gesehen? Trag ein, was sie bringt und kostet.</p>
        <div class="calc">
          <div class="field"><label class="label" for="deal-vb">V-Bucks</label><input class="input num" id="deal-vb" type="number" min="1" step="50" value="2800" data-deal="vb"></div>
          <div class="field"><label class="label" for="deal-eur">Preis in €</label><input class="input num" id="deal-eur" type="number" min="0.01" step="0.01" value="22.99" data-deal="eur"></div>
        </div>
        <div style="margin-top:14px" data-verdict></div>
        <div class="table-wrap" style="margin-top:14px"><table class="table">
          <thead><tr><th>Alte Karten (aufgedruckter Wert)</th><th class="r">Preis</th><th class="r">€ / 1.000</th></tr></thead>
          <tbody>${OLD_CARDS.map((p) => `<tr><td>${vb(p.vb)}</td><td class="r">${fmtEur(p.cents / 100)}</td><td class="r">${fmtEur(perThousand(p.vb, p.cents))}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>
    </div>

    <section class="section">
      <div class="section-head"><h2>So sparst du wirklich</h2><span class="rule" aria-hidden="true"></span></div>
      <ul class="tips">
        <li><h4>Auf dem PC über Epic bezahlen</h4><p>Du bekommst 20 % des Preises als Epic Rewards zurück. Beim 2.400er-Paket sind das rund 4,60 €, die du für den nächsten Kauf nutzen kannst.</p></li>
        <li><h4>Alte Guthabenkarten zuerst</h4><p>Karten, auf denen noch die alten Werte stehen (z. B. 1.000 oder 2.800 V-Bucks), werden laut Epic weiterhin zum aufgedruckten Wert eingelöst. Liegen solche noch im Laden, bekommst du mehr V-Bucks fürs gleiche Geld.</p></li>
        <li><h4>Karten nur offiziell einlösen</h4><p>V-Bucks-Karten löst du auf fortnite.com/vbuckscard ein. Karten gibt es im Supermarkt, in der Drogerie und im Elektronikmarkt; achte auf Rabattaktionen und Bonuspunkte der Händler.</p></li>
        <li><h4>Battle Pass refinanziert sich</h4><p>Er kostet 800 V-Bucks und gibt dir beim Durchspielen 800 zurück. Wer ihn fertig spielt, zahlt nur einmal.</p></li>
        <li><h4>Finger weg von Billig-V-Bucks</h4><p>Seiten, die V-Bucks weit unter Ladenpreis verkaufen, arbeiten oft mit gestohlenen Karten oder Accounts. Epic kann die V-Bucks zurückbuchen oder deinen Account sperren.</p></li>
      </ul>
      <p class="muted" style="font-size:var(--t-sm);margin:0">Quelle Preise: <a href="https://www.fortnite.com/news/fortnite-v-bucks-price-increase" target="_blank" rel="noopener">fortnite.com – V-Bucks-Preisänderung (19.03.2026)</a>. Regionale Preise können abweichen.</p>
    </section>`;

  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput);
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-target]');
    if (t) { state.target = Number(t.dataset.target); $('[data-in="target"]', el).value = state.target; renderResult(); }
  });
  window.addEventListener('store', (e) => {
    if (e.detail !== 'settings') return;
    const input = $('[data-in="balance"]', el);
    if (input && document.activeElement !== input) input.value = store.balance ?? '';
    renderResult();
  });
  renderResult();
  renderVerdict();
  loadShop().then(addWishChips).catch(() => {});
}

export function onShow() { renderResult(); }

function addWishChips() {
  const shop = getShop();
  const hits = store.wishList().map((w) => ({ w, o: cheapestOfferFor(shop, w.id) })).filter((x) => x.o);
  if (!hits.length) return;
  $('[data-quick]', el).insertAdjacentHTML('beforeend', `<span class="label" style="margin-left:8px">Gemerkt & im Shop:</span>${hits.slice(0, 4).map(({ w, o }) => `<button class="chip" type="button" data-target="${o.price}">${esc(w.name)} · ${fmtNum(o.price)}</button>`).join('')}`);
}

function onInput(e) {
  const k = e.target.dataset.in;
  if (k === 'balance') {
    const v = e.target.value.trim();
    store.setSettings({ balance: v === '' ? undefined : Math.max(0, Math.round(Number(v))) });
  } else if (k === 'target') {
    state.target = Math.max(0, Number(e.target.value) || 0);
    renderResult();
  } else if (k === 'exact') {
    state.exact = e.target.checked;
    renderResult();
  } else if (e.target.dataset.deal) {
    renderVerdict();
  }
}

function renderResult() {
  const box = $('[data-result]', el);
  if (!box) return;
  const bal = store.balance ?? 0;
  const need = Math.max(0, state.target - bal);
  if (!state.target) { box.innerHTML = ''; return; }
  if (need === 0) {
    box.innerHTML = `<div class="verdict" data-tone="good">Passt: Mit ${fmtNum(bal)} V-Bucks kannst du dir das leisten. Danach bleiben ${fmtNum(bal - state.target)} übrig.</div>`;
    return;
  }
  const opts = cheapestTopUps(need, { allowExact: state.exact });
  box.innerHTML = `<p class="display" style="margin:0;font-size:var(--t-2xl)">Dir fehlen <span style="color:var(--shop)">${fmtNum(need)}</span> V-Bucks</p>
    <div class="options">${opts.map((o, i) => `<div class="option${i === 0 ? ' is-best' : ''}">
      <h4>${esc(o.label)}${i === 0 ? '<span class="tag">Günstigste</span>' : ''}</h4>
      <div class="price">${fmtEur(o.cents / 100)}</div>
      <p>${fmtNum(o.vb)} V-Bucks · danach ${fmtNum(bal + o.vb - state.target)} übrig${o.usesExact ? '' : ` · mit Epic Rewards effektiv ${fmtEur((o.cents / 100) * (1 - REWARDS))}`}</p>
    </div>`).join('')}</div>`;
}

function renderVerdict() {
  const vbv = Number($('[data-deal="vb"]', el)?.value);
  const eur = Number($('[data-deal="eur"]', el)?.value);
  const box = $('[data-verdict]', el);
  if (!box) return;
  if (!(vbv > 0) || !(eur > 0)) { box.innerHTML = ''; return; }
  const k = (eur / vbv) * 1000;
  const best = Math.min(...PACKS.map((p) => perThousand(p.vb, p.cents)));
  const worst = perThousand(PACKS[0].vb, PACKS[0].cents);
  let tone = 'mid', text;
  const same = PACKS.find((p) => Math.abs(p.cents / 100 - eur) < 0.005);
  if (same && vbv > same.vb && k >= best * 0.6) { tone = 'good'; text = `Lohnt sich: Für ${fmtEur(eur)} gibt es offiziell nur ${fmtNum(same.vb)} V-Bucks – hier bekommst du ${fmtNum(vbv - same.vb)} mehr (${fmtEur(k)} pro 1.000).`; }
  else if (k < best * 0.6) { tone = 'bad'; text = `Verdächtig billig: ${fmtEur(k)} pro 1.000 V-Bucks liegt weit unter jedem offiziellen Preis. Bei solchen Angeboten droht eine Rückbuchung oder Sperre.`; }
  else if (k <= best + 0.005) { tone = 'good'; text = `Gutes Angebot: ${fmtEur(k)} pro 1.000 V-Bucks – mindestens so günstig wie das beste offizielle Paket (${fmtEur(best)}).`; }
  else if (k < worst) { tone = 'mid'; text = `Okay: ${fmtEur(k)} pro 1.000 V-Bucks – günstiger als das 800er-Paket (${fmtEur(worst)}), aber teurer als das große Paket (${fmtEur(best)}).`; }
  else { tone = 'bad'; text = `Teuer: ${fmtEur(k)} pro 1.000 V-Bucks – sogar teurer als das kleinste offizielle Paket (${fmtEur(worst)}).`; }
  box.innerHTML = `<div class="verdict" data-tone="${tone}">${esc(text)}</div>`;
}
