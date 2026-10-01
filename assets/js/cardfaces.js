// Zeichnet Vorder- und Rückseite der Sammelkarte auf Canvas (ohne Three.js, auch für den Fallback).
export const CARD_W = 1000;
export const CARD_H = 1400;
const DISPLAY = '"FN Display", "Anton", Impact, sans-serif';
const UI = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = '"Barlow", system-ui, sans-serif';

export function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export async function firstImg(list) {
  for (const src of list.filter(Boolean)) {
    const im = await loadImg(src);
    if (im) return im;
  }
  return null;
}

export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`400 110px ${DISPLAY}`),
      document.fonts.load(`700 44px ${UI}`),
      document.fonts.load(`600 44px ${BODY}`),
    ]);
  } catch { /* Fallback-Schrift reicht */ }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, x, y, maxW, size, family, min = 56) {
  let s = size;
  ctx.font = `400 ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > min) { s -= 4; ctx.font = `400 ${s}px ${family}`; }
  let t = text;
  while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2);
  if (t !== text) t = t.replace(/\s*\S?$/, '') + '…';
  ctx.fillText(t, x, y);
}

function cover(ctx, img, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
}

/**
 * spec: { title, subtitle, colors:[c1,c2,c3], footer, priceVb }
 * assets: { img, pattern, vbIcon }
 */
export function drawFront(canvas, spec, assets) {
  const W = CARD_W, H = CARD_H, R = 46;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [c1, c2, c3] = spec.colors;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRect(ctx, 0, 0, W, H, R);
  ctx.clip();

  const g = ctx.createRadialGradient(W / 2, H * 0.34, 30, W / 2, H * 0.42, H * 0.8);
  g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c3);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (assets.pattern) {
    ctx.globalAlpha = 0.25;
    ctx.globalCompositeOperation = 'overlay';
    cover(ctx, assets.pattern, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Schräge Lichtbahnen wie in den Shop-Kacheln
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath(); ctx.moveTo(380, 0); ctx.lineTo(560, 0); ctx.lineTo(220, H); ctx.lineTo(40, H); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath(); ctx.moveTo(640, 0); ctx.lineTo(700, 0); ctx.lineTo(360, H); ctx.lineTo(300, H); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  if (assets.img) {
    const box = { x: 40, y: 60, w: 920, h: 1010 };
    const s = Math.min(box.w / assets.img.width, box.h / assets.img.height);
    const w = assets.img.width * s, h = assets.img.height * s;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 20;
    ctx.drawImage(assets.img, box.x + (box.w - w) / 2, box.y + box.h - h, w, h);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = `400 220px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('?', W / 2, 640);
    ctx.textAlign = 'left';
  }

  // Namensband mit schräger Oberkante
  ctx.fillStyle = 'rgba(5,7,13,0.95)';
  ctx.beginPath(); ctx.moveTo(0, 1094); ctx.lineTo(W, 1038); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  ctx.strokeStyle = c1; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(0, 1094); ctx.lineTo(W, 1038); ctx.stroke();

  ctx.fillStyle = '#ffffff';
  fitText(ctx, String(spec.title || '').toUpperCase(), 60, 1214, 880, 116, DISPLAY);
  ctx.fillStyle = 'rgba(238,241,247,0.7)';
  ctx.font = `700 42px ${UI}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  ctx.fillText(String(spec.subtitle || '').toUpperCase(), 62, 1276);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  if (spec.priceVb != null) {
    if (assets.vbIcon) ctx.drawImage(assets.vbIcon, 58, 1300, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = `400 68px ${DISPLAY}`;
    ctx.fillText(new Intl.NumberFormat('de-DE').format(spec.priceVb), assets.vbIcon ? 134 : 62, 1358);
  } else if (spec.footer) {
    ctx.fillStyle = 'rgba(238,241,247,0.5)';
    ctx.font = `600 36px ${UI}`;
    ctx.fillText(spec.footer, 62, 1350);
  }
  ctx.restore();

  ctx.save();
  roundRect(ctx, 12, 12, W - 24, H - 24, R - 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  return canvas;
}

/** spec: { colors, rows:[[label, value]], id } */
export function drawBack(canvas, spec) {
  const W = CARD_W, H = CARD_H, R = 46;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [c1, c2] = spec.colors;
  ctx.save();
  roundRect(ctx, 0, 0, W, H, R);
  ctx.clip();
  ctx.fillStyle = '#070a12';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 420, 20, W / 2, 420, 760);
  g.addColorStop(0, c2 + '88'); g.addColorStop(1, '#070a1200');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 2;
  for (let x = -H; x < W + H; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - H * 0.47, H); ctx.stroke(); }

  // Radar-Zeichen
  ctx.strokeStyle = '#ffe23f';
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(500, 360, 150, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.arc(500, 360, 96, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffe23f';
  ctx.beginPath(); ctx.arc(500, 360, 22, 0, Math.PI * 2); ctx.fill();

  ctx.font = `400 120px ${DISPLAY}`;
  const wShop = ctx.measureText('SHOP').width, wRadar = ctx.measureText('RADAR').width;
  const x0 = (W - wShop - wRadar - 14) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SHOP', x0, 540);
  ctx.fillStyle = '#ffe23f';
  ctx.fillText('RADAR', x0 + wShop + 14, 540);

  ctx.fillStyle = c1;
  ctx.fillRect(80, 600, W - 160, 6);

  let y = 690;
  for (const [label, value] of (spec.rows || []).slice(0, 6)) {
    ctx.fillStyle = 'rgba(238,241,247,0.5)';
    ctx.font = `700 32px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillText(String(label).toUpperCase(), 84, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 46px ${BODY}`;
    let v = String(value ?? '–');
    while (ctx.measureText(v).width > 830 && v.length > 4) v = v.slice(0, -2);
    if (v !== String(value ?? '–')) v += '…';
    ctx.fillText(v, 84, y + 54);
    y += 112;
  }
  if (spec.id) {
    ctx.fillStyle = 'rgba(238,241,247,0.28)';
    ctx.font = `600 26px ${UI}`;
    ctx.fillText(spec.id, 84, H - 60);
  }
  ctx.restore();
  ctx.save();
  roundRect(ctx, 12, 12, W - 24, H - 24, R - 10);
  ctx.strokeStyle = c1;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
  return canvas;
}
