// V-Bucks-Preise (Stand: Preisänderung vom 19.03.2026, offizielle EUR-Preise) und günstigste Aufladung.
export const PACKS = [
  { vb: 800, cents: 899 },
  { vb: 2400, cents: 2299 },
  { vb: 4500, cents: 3699 },
  { vb: 12500, cents: 8999 },
];
/** Genau-Betrag-Paket: 50 V-Bucks für 0,99 € (nicht überall/auf jeder Plattform verfügbar) */
export const EXACT = { vb: 50, cents: 99 };
/** Alte Karten werden laut Epic weiter zum aufgedruckten Wert eingelöst */
export const OLD_CARDS = [
  { vb: 1000, cents: 899 },
  { vb: 2800, cents: 2299 },
  { vb: 5000, cents: 3699 },
  { vb: 13500, cents: 8999 },
];
export const CREW = { cents: 1199, vb: 800 };
export const REWARDS = 0.2;

export const perThousand = (vb, cents) => (cents / 100) / (vb / 1000);

function label(c) {
  const parts = [];
  if (c.a) parts.push(`${c.a}× 12.500er`);
  if (c.b) parts.push(`${c.b}× 4.500er`);
  if (c.c) parts.push(`${c.c}× 2.400er`);
  if (c.d) parts.push(`${c.d}× 800er`);
  if (c.e) parts.push(`${c.e * 50} V-Bucks genau`);
  return parts.join(' + ');
}

/** Die drei günstigsten Wege, mindestens `needed` V-Bucks zu kaufen */
export function cheapestTopUps(needed, { allowExact = true } = {}) {
  if (!(needed > 0)) return [];
  const seen = new Map();
  const add = (a, b, c, d, e) => {
    const vb = a * 12500 + b * 4500 + c * 2400 + d * 800 + e * 50;
    if (vb < needed) return;
    const cents = a * 8999 + b * 3699 + c * 2299 + d * 899 + e * 99;
    const key = `${a}.${b}.${c}.${d}.${e}`;
    if (!seen.has(key)) seen.set(key, { a, b, c, d, e, vb, cents, leftover: vb - needed });
  };
  const maxA = Math.ceil(needed / 12500) + 1;
  for (let a = 0; a <= maxA; a++) {
    for (let b = 0; b <= Math.ceil(needed / 4500) + 1; b++) {
      for (let c = 0; c <= Math.ceil(needed / 2400) + 1; c++) {
        const base = a * 12500 + b * 4500 + c * 2400;
        const rem = Math.max(0, needed - base);
        const d = Math.ceil(rem / 800);
        add(a, b, c, d, 0);
        if (allowExact && rem > 0) {
          add(a, b, c, 0, Math.ceil(rem / 50));
          if (d > 0) add(a, b, c, d - 1, Math.ceil(Math.max(0, rem - (d - 1) * 800) / 50));
        }
      }
    }
  }
  const list = [...seen.values()].sort((x, y) => (x.cents - y.cents) || (y.leftover - x.leftover));
  const out = [];
  for (const o of list) {
    if (out.some((p) => p.cents === o.cents)) continue;
    // Variante, die mehr kostet und trotzdem weniger V-Bucks bringt, ist sinnlos
    if (out.some((p) => p.cents <= o.cents && p.vb >= o.vb)) continue;
    out.push({ ...o, label: label(o), usesExact: o.e > 0 });
    if (out.length === 3) break;
  }
  return out;
}
