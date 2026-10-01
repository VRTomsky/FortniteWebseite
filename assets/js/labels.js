// Deutsche Bezeichnungen und Spielfarben.
import { hex } from './util.js';

const TYPE = {
  outfit: ['Outfit', 'Outfits'],
  backpack: ['Rücken-Accessoire', 'Rücken-Accessoires'],
  pickaxe: ['Spitzhacke', 'Spitzhacken'],
  glider: ['Gleiter', 'Gleiter'],
  emote: ['Emote', 'Emotes'],
  wrap: ['Lackierung', 'Lackierungen'],
  contrail: ['Kondensstreifen', 'Kondensstreifen'],
  loadingscreen: ['Ladebildschirm', 'Ladebildschirme'],
  music: ['Musik', 'Musik'],
  spray: ['Spray', 'Sprays'],
  emoji: ['Emoticon', 'Emoticons'],
  banner: ['Banner', 'Banner'],
  pet: ['Haustier', 'Haustiere'],
  petcarrier: ['Haustier', 'Haustiere'],
  toy: ['Spielzeug', 'Spielzeuge'],
  aura: ['Aura', 'Auren'],
  shoe: ['Kicks', 'Kicks'],
  sidekick: ['Begleiter', 'Begleiter'],
  track: ['Jam-Song', 'Jam-Songs'],
  car: ['Auto-Teil', 'Autos'],
  instrument: ['Instrument', 'Instrumente'],
  lego: ['LEGO-Set', 'LEGO'],
  bundle: ['Paket', 'Pakete'],
};
export const TYPE_ORDER = ['outfit', 'bundle', 'pickaxe', 'emote', 'backpack', 'glider', 'wrap', 'sidekick', 'shoe', 'aura', 'contrail', 'loadingscreen', 'music', 'spray', 'emoji', 'banner', 'pet', 'petcarrier', 'toy', 'track', 'car', 'instrument', 'lego'];
export function typeLabel(t, plural = false) {
  return TYPE[t]?.[plural ? 1 : 0] ?? (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Item');
}

// Basis-Seltenheiten wie im Spiel (Mitte → Rand). Reihen (Ikonen, Marvel …) kommen mit eigenen Farben aus der API.
const BASE = {
  common: ['#b9bcc4', '#6b6f78', '#2d3038'],
  uncommon: ['#8ae83c', '#2f8f16', '#0e3d09'],
  rare: ['#3fd2ff', '#1d6fd4', '#0a2b66'],
  epic: ['#e766ff', '#8b2fd6', '#341066'],
  legendary: ['#ffad55', '#d9601b', '#5c200a'],
  mythic: ['#ffe36b', '#c99b20', '#4f3a04'],
  exotic: ['#8ff0ff', '#2a9db0', '#0d3c44'],
  transcendent: ['#5ce6ff', '#2b45b8', '#0f1148'],
  icon: ['#5cf2f3', '#258a92', '#0b3a3e'],
  marvel: ['#ff4d4d', '#b81c1c', '#3d0707'],
  dc: ['#6f8fff', '#2a3f9a', '#0c1440'],
  starwars: ['#c8d3ff', '#3e4a8a', '#0b0f2a'],
  gaminglegends: ['#8078ff', '#3e1398', '#0d0027'],
  dark: ['#ff4ff2', '#7a0f8f', '#24042e'],
  frozen: ['#c4e8ff', '#5aa6d6', '#163a57'],
  lava: ['#ffb14a', '#c2410e', '#3b0b02'],
  shadow: ['#9b9b9b', '#3a3a3a', '#0b0b0b'],
  slurp: ['#5ef2e8', '#119a95', '#043634'],
};
const RARITY_DE = {
  common: 'Gewöhnlich', uncommon: 'Ungewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär',
  mythic: 'Mythisch', exotic: 'Exotisch', transcendent: 'Transzendent', icon: 'Ikonen-Reihe', marvel: 'Marvel-Reihe',
  dc: 'DC-Reihe', starwars: 'Star Wars-Reihe', gaminglegends: 'Gaming-Legenden-Reihe', dark: 'Dunkle Reihe',
  frozen: 'Eisreihe', lava: 'Lavareihe', shadow: 'Schattenreihe', slurp: 'Schlürfreihe',
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'transcendent', 'icon', 'gaminglegends', 'marvel', 'dc', 'starwars', 'dark', 'frozen', 'lava', 'shadow', 'slurp'];

// Vom Archiv-Index nachgeliefert (echte Reihenfarben/-bilder aus der API)
const extra = {};
export function registerRarities(info = {}) {
  for (const [k, v] of Object.entries(info)) extra[k] = v;
}
export function rarityLabel(r) {
  return extra[r]?.label || RARITY_DE[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : '');
}
const SAFE_IMG = /^https:\/\/(cdn\.)?fortnite-api\.com\//;
export const safeImg = (u) => (typeof u === 'string' && SAFE_IMG.test(u) ? u : null);
export function rarityImage(r) { return safeImg(extra[r]?.image); }

/** [Mitte, Mitte-Rand, Rand] für Verläufe */
export function rarityColors(rarity, series) {
  const c = (series?.colors || []).map(hex).filter(Boolean);
  if (c.length >= 3) return [c[0], c[Math.min(2, c.length - 1)], c[c.length - 1]];
  const x = (extra[rarity]?.colors || []).map(hex).filter(Boolean);
  if (x.length >= 3) return x;
  return BASE[rarity] || BASE.common;
}
