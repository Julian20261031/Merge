// Procedural weathered textures: chipped paint, rust runs, salt, algae. No image files.
import * as THREE from 'three';
import { RGB, rgb, mixc, mul, c01, ss, fbm, n2, hs } from '../core/noise';

export const FD = "'Noto Serif SC', 'Songti SC', 'STSong', serif";
const RUST: RGB = [176, 83, 42], RUSTD: RGB = [110, 46, 24], SALT: RGB = [214, 208, 192], ALGAE: RGB = [58, 74, 52];

interface WOpts { seed?: number; rust?: number; fade?: number; grime?: number; corr?: number; edge?: boolean }

export function wcol(c: RGB, i: number, j: number, vDown: number, o: WOpts): RGB {
  const S = o.seed ?? 1, R = o.rust ?? 0.35, F = o.fade ?? 0.25, G = o.grime ?? 0.35;
  const n = fbm(i * 0.045 + S * 13, j * 0.045 + S * 7, 3);
  c = mixc(c, mul(c, 0.55), n * 0.6);
  c = mixc(c, SALT, F * (0.4 + 0.9 * fbm(i * 0.02 + S, j * 0.02 + S * 2, 2)));
  if (o.corr) c = mul(c, 0.82 + 0.18 * Math.sin((i / o.corr) * 6.2832));
  if (R > 0) {
    const chip = fbm(i * 0.085 + S * 5, j * 0.085 + S * 3, 3);
    const rm = ss(0.7 - R * 0.22, 0.74 - R * 0.22, chip);
    c = mixc(c, mixc(RUST, RUSTD, fbm(i * 0.16 + S, j * 0.16, 2)), rm);
    const st = ss(0.6, 0.74, fbm(i * 0.24 + S * 9, j * 0.014 + S, 3)) * (0.2 + 0.8 * vDown) * R * 1.7;
    c = mixc(c, RUSTD, c01(st) * 0.65);
  }
  c = mul(c, 1 - G * ss(0.5, 1, vDown) * (0.4 + fbm(i * 0.05, j * 0.05 + S, 2)));
  if (n2(i * 0.9 + S * 31, j * 0.9 + S) > 0.94) c = mul(c, 0.72);
  return c;
}

type Pix = (i: number, j: number, w: number, h: number) => number[];
export function weather(paint: number, o: WOpts = {}): Pix {
  const P = rgb(paint);
  return (i, j, w, h) => {
    let c = wcol(P, i, j, j / h, o);
    const e = Math.min(i, j, w - 1 - i, h - 1 - j);
    if (o.edge !== false && e < 3) c = mixc(c, [176, 170, 152], 0.45 * (1 - e / 3));
    return c;
  };
}

const TEXT_REDRAW: Array<() => void> = [];
interface GOpts { repeat?: [number, number]; offset?: [number, number]; text?: boolean }
export function genTex(w: number, h: number, pix: Pix | null, after?: ((x: CanvasRenderingContext2D, w: number, h: number) => void) | null, o: GOpts = {}): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!;
  let id: ImageData | null = null;
  if (pix) {
    id = x.createImageData(w, h);
    const d = id.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = pix(i, j, w, h), k = (j * w + i) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = c.length > 3 ? c[3] : 255;
    }
    x.putImageData(id, 0, 0);
  }
  if (after) { x.save(); after(x, w, h); x.restore(); }
  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 4;
  if (o.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(o.repeat[0], o.repeat[1]);
    if (o.offset) t.offset.set(o.offset[0], o.offset[1]);
  }
  if (o.text && after) TEXT_REDRAW.push(() => {
    x.clearRect(0, 0, w, h);
    if (id) x.putImageData(id, 0, 0);
    x.save(); after(x, w, h); x.restore();
    t.needsUpdate = true;
  });
  return t;
}
/** Canvas text drawn before the web font loaded is redrawn once it has. */
export const redrawTextTextures = () => TEXT_REDRAW.forEach((f) => f());

function flagTex(base: RGB, seed: number) {
  return genTex(128, 80, (i, j, w) => {
    const rag = w - 8 - 30 * fbm(j * 0.08 + seed, 3, 2) - (j % 13 < 3 ? 9 : 0);
    const a = i > rag || n2(i * 0.12 + seed * 5, j * 0.12) > 0.86 ? 0 : 255;
    let c = mixc(base, SALT, 0.35 * fbm(i * 0.04 + seed, j * 0.04, 2));
    c = mul(c, 1 - 0.4 * ss(0.4, 1, i / w));
    return [c[0], c[1], c[2], a];
  }, (x) => {
    x.globalAlpha = 0.75; x.strokeStyle = '#e6dcc6'; x.lineWidth = 5;
    x.beginPath(); x.arc(36, 40, 17, 0, 6.3); x.stroke();
    x.beginPath(); x.moveTo(36, 23); x.lineTo(36, 57); x.moveTo(22, 40); x.lineTo(50, 40); x.stroke();
  });
}

export function concTop(seed: number) {
  return genTex(256, 256, (i, j, w, h) => {
    let c = mixc([172, 164, 148], [118, 112, 100], fbm(i * 0.03 + seed, j * 0.03, 4));
    c = mul(c, 0.9 + 0.18 * n2(i * 0.7, j * 0.7));
    c = mixc(c, [92, 88, 80], ss(0.56, 0.76, fbm(i * 0.014 + seed * 3, j * 0.014, 3)) * 0.6);
    const e = Math.min(i, j, w - 1 - i, h - 1 - j) / w;
    return mixc(c, [84, 106, 60], ss(0.14, 0, e) * ss(0.38, 0.62, fbm(i * 0.07 + seed, j * 0.07, 3)) * 0.85);
  }, (x, w, h) => {
    x.strokeStyle = 'rgba(38,32,26,.75)'; x.lineWidth = 1.6;
    for (let k = 0; k < 7; k++) {
      let px = hs(seed, k, 1) * w, py = hs(seed, k, 2) * h, a = hs(seed, k, 3) * 6.28;
      x.beginPath(); x.moveTo(px, py);
      for (let s = 0; s < 14; s++) { a += (hs(seed, k, s) - 0.5) * 1.2; px += Math.cos(a) * 7; py += Math.sin(a) * 7; x.lineTo(px, py); }
      x.stroke();
    }
    x.fillStyle = 'rgba(235,232,222,.8)';
    for (let k = 0; k < 50; k++) { x.beginPath(); x.arc(hs(seed, k, 8) * w, hs(seed, k, 9) * h, 1 + hs(seed, k, 10) * 2.2, 0, 6.3); x.fill(); }
  });
}
export function concSide(seed: number, top: number) {
  const wy = (256 * top) / (top + 6);
  return genTex(256, 256, (i, j, _w, h) => {
    let c = mixc([150, 142, 128], [104, 98, 88], fbm(i * 0.03 + seed, j * 0.03, 3));
    const wi = i % 48;
    if (j > wy * 0.2 && j < wy * 0.78 && wi > 10 && wi < 38) c = hs(seed, Math.floor(i / 48)) > 0.75 ? [120, 96, 64] : [28, 30, 30];
    c = wcol(c, i, j, j / h, { seed, rust: 0.15, fade: 0.15, grime: 0.2 });
    if (j > wy) c = mixc(c, [44, 66, 52], 0.7);
    else if (j > wy - 12) { c = mixc(c, [64, 86, 58], ss(wy - 12, wy, j) * 0.8); if (n2(i * 0.5, j * 0.5) > 0.8) c = [196, 192, 176]; }
    return c;
  });
}

export const TX = {} as Record<string, THREE.CanvasTexture>;

export function buildTextures() {
  TX.steel = genTex(128, 128, weather(0x6f7a72, { seed: 1, rust: 0.55 }));
  TX.primer = genTex(128, 128, weather(0x8c3b28, { seed: 2, rust: 0.35 }));
  TX.corr = genTex(128, 128, weather(0x8a8f86, { seed: 4, rust: 0.6, corr: 7 }));
  TX.corrRust = genTex(128, 128, weather(0x7a4a2c, { seed: 5, rust: 0.85, corr: 7 }));
  TX.dark = genTex(128, 128, weather(0x3a3833, { seed: 6, rust: 0.4, fade: 0.1 }));
  TX.tank = genTex(128, 128, weather(0x8a5a3a, { seed: 16, rust: 0.9, fade: 0.15 }));
  TX.drum = genTex(128, 128, weather(0xa8402a, { seed: 7, rust: 0.5 }), (x, w, h) => { x.globalAlpha = 0.32; x.fillStyle = '#e8d9a8'; x.fillRect(0, h * 0.42, w, h * 0.14); });
  TX.drumBlue = genTex(128, 128, weather(0x2f5f8a, { seed: 8, rust: 0.55, fade: 0.35 }));
  TX.jerry = genTex(128, 128, weather(0x4f86a8, { seed: 9, rust: 0, fade: 0.55, grime: 0.3 }));
  TX.olive = genTex(64, 64, weather(0x5f6438, { seed: 10, rust: 0.45 }));
  TX.sand = genTex(64, 64, (i, j) => mul([150, 132, 96], (0.78 + 0.35 * fbm(i * 0.3, j * 0.3, 2)) * ((i + j) % 4 < 2 ? 1 : 0.9)));
  TX.parapet = genTex(128, 128, weather(0x9a9282, { seed: 17, rust: 0.08, fade: 0.25, grime: 0.45 }));
  TX.safeTop = genTex(128, 128, weather(0xd9a92a, { seed: 12, rust: 0.4, fade: 0.2 }));
  TX.safeSide = genTex(128, 128, (i, j, _w, h) => wcol(((i + j) % 40) < 20 ? [214, 170, 40] : [38, 32, 26], i, j, j / h, { seed: 13, rust: 0.45, fade: 0.15 }));
  TX.rim = genTex(128, 128, weather(0x6b6458, { seed: 23, rust: 0.6, fade: 0.25 }), null, { repeat: [0.3, 0.3] });
  TX.wood = genTex(128, 128, (i, j, _w, h) => {
    const pl = Math.floor(j / 32);
    let c: RGB = [[178, 150, 104], [160, 128, 86], [150, 140, 118]][Math.floor(hs(pl, 2) * 3)];
    c = mul(c, 0.78 + 0.32 * fbm(i * 0.02 + pl * 5, j * 0.4, 3));
    if (j % 32 < 2) c = [50, 38, 28];
    c = mixc(c, SALT, 0.32 * fbm(i * 0.03, j * 0.03 + 4, 2));
    return mul(c, 1 - 0.3 * ss(0.6, 1, j / h));
  });
  TX.crate = genTex(128, 128, null, (x, w, h) => {
    x.drawImage(TX.wood.image as HTMLCanvasElement, 0, 0);
    x.globalAlpha = 0.55; x.fillStyle = '#2a2016'; x.font = `44px ${FD}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('零件', w / 2, h / 2 + 2);
  }, { text: true });
  TX.sign = genTex(256, 128, (i, j, _w, h) => wcol([43, 92, 158], i, j, j / h, { seed: 14, rust: 0.4, fade: 0.38 }), (x, w, h) => {
    x.globalAlpha = 0.85; x.strokeStyle = '#e6e2d6'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = '#eae6da'; x.textBaseline = 'middle'; x.font = `46px ${FD}`; x.fillText('滨海大道', 26, 52);
    x.font = `26px ${FD}`; x.fillText('出口 3 km →', 28, 98);
    x.globalAlpha = 1;
    for (let k = 0; k < 7; k++) {
      const bx = 30 + hs(k, 61) * 196, by = 20 + hs(k, 62) * 88;
      x.fillStyle = 'rgba(20,14,10,.92)'; x.beginPath(); x.arc(bx, by, 4, 0, 6.3); x.fill();
      x.strokeStyle = 'rgba(176,83,42,.85)'; x.lineWidth = 2.5; x.beginPath(); x.arc(bx, by, 6.5, 0, 6.3); x.stroke();
    }
  }, { text: true });
  TX.med = genTex(128, 128, weather(0xd8d4c8, { seed: 31, rust: 0.1, fade: 0.1, grime: 0.3 }), (x, w, h) => {
    x.fillStyle = '#b5302a'; x.fillRect(w / 2 - 12, h / 2 - 36, 24, 72); x.fillRect(w / 2 - 36, h / 2 - 12, 72, 24);
  });
  TX.solar = genTex(128, 128, (i, j, _w, h) => {
    let c: RGB = mixc([30, 52, 78], [52, 84, 112], fbm(i * 0.05, j * 0.05, 2));
    if (i % 32 < 2 || j % 32 < 2) c = [170, 176, 176];
    return wcol(c, i, j, j / h, { seed: 33, rust: 0.05, fade: 0.2, grime: 0.25 });
  }, (x) => { x.strokeStyle = 'rgba(230,236,240,.7)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(20, 30); x.lineTo(60, 70); x.lineTo(54, 110); x.moveTo(60, 70); x.lineTo(100, 64); x.stroke(); });
  TX.tarp = genTex(128, 128, (i, j, _w, h) => {
    let c = mixc([62, 104, 140], SALT, 0.3 + 0.4 * fbm(i * 0.02, j * 0.02, 3));
    c = mul(c, 0.85 + 0.2 * fbm(i * 0.1, j * 0.1, 2));
    if (i > 70 && i < 110 && j > 20 && j < 60) c = mixc([150, 120, 70], SALT, 0.3);
    return mul(c, 1 - 0.3 * ss(0.6, 1, j / h));
  });
  TX.flagMe = flagTex([92, 128, 120], 1);
  TX.flagEnemy = flagTex([170, 46, 38], 2);
  TX.tarSide = genTex(256, 64, (i, j, _w, h) => {
    let c = wcol([44, 37, 34], i, j, 1 - j / h, { seed: 15, rust: 0.12, fade: 0.06 });
    if (j < 22) c = mixc(c, ALGAE, 0.7);
    return c;
  }, null, { repeat: [0.1, 1 / 1.2], offset: [0, 0.2 / 1.2] });
  TX.tarDeck = genTex(128, 128, (i, j) => { let c: RGB = mul([62, 52, 44], 0.75 + 0.4 * fbm(i * 0.4, j * 0.02, 3)); if (i % 21 < 2) c = [26, 20, 16]; return wcol(c, i, j, 0.5, { seed: 18, rust: 0.05, fade: 0.08, grime: 0.2 }); }, null, { repeat: [0.12, 0.12] });
  TX.teeth = genTex(256, 64, (i, j, _w, h) => wcol([44, 37, 34], i, j, j / h, { seed: 19, rust: 0.1, fade: 0.05 }), (x, w, h) => {
    x.globalAlpha = 0.9; x.fillStyle = '#a8322a';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w, h * 0.32);
    for (let k = 10; k >= 0; k--) x.lineTo((k * w) / 10, h * (k % 2 ? 0.78 : 0.32));
    x.fill();
    x.fillStyle = '#e4dfcf';
    for (let k = 0; k < 10; k++) { x.beginPath(); x.moveTo((k * w) / 10 + 3, h * 0.33); x.lineTo((k * w) / 10 + w / 20, h * 0.7); x.lineTo(((k + 1) * w) / 10 - 3, h * 0.33); x.fill(); }
  });
  TX.ruin = genTex(128, 128, (i, j) => {
    let c = mixc([118, 116, 108], [84, 82, 76], fbm(i * 0.04, j * 0.04, 3));
    const fi = i % 32, fj = j % 32;
    if (fi > 8 && fi < 24 && fj > 8 && fj < 22) c = hs(Math.floor(i / 32), Math.floor(j / 32), 5) > 0.82 ? [96, 80, 60] : [24, 26, 28];
    return wcol(c, i, j, (j % 64) / 64, { seed: 30, rust: 0.12, fade: 0.1, grime: 0.2 });
  });
  TX.hull = genTex(512, 128, (i, j, _w, h) => {
    const pw = 72, p = Math.floor(i / pw);
    const cols: RGB[] = [[63, 106, 133], [140, 59, 40], [184, 178, 160], [111, 122, 114], [93, 122, 90]];
    let c = wcol(cols[Math.floor(hs(p, 9) * 5)], i, j, 1 - j / h, { seed: 20 + p, rust: 0.55, fade: 0.32, grime: 0.15 });
    const wl = 50 + 4 * Math.sin(i * 0.05);
    if (j < wl) { c = mixc(c, ALGAE, 0.55 + 0.4 * ss(wl, wl - 26, j)); if (n2(i * 0.45, j * 0.45 + 7) > 0.78 && j > wl - 18) c = [200, 196, 178]; }
    else if (j < wl + 4) c = mixc(c, SALT, 0.6);
    if (i % pw < 2) c = mul(c, 0.45);
    if (i % pw >= 4 && i % pw <= 6 && j % 12 === 6 && j > wl) c = [60, 44, 34];
    if (j > h - 6) c = mixc(c, [190, 182, 160], 0.5);
    return c;
  }, null, { repeat: [0.08, 1 / 1.4], offset: [0, 0.4 / 1.4] });
  TX.deck = genTex(256, 512, (i, j) => {
    const pw = 21, k = Math.floor(i / pw), seg = Math.floor(j / 170 + hs(k, 3));
    const cols: RGB[] = [[168, 156, 134], [146, 118, 86], [120, 104, 84], [176, 170, 150], [132, 128, 104], [150, 96, 70]];
    let c = cols[Math.floor(hs(k, seg, 1) * 6)];
    c = mul(c, 0.8 + 0.32 * fbm(i * 0.35 + k * 7, j * 0.02 + seg, 3));
    if (i % pw < 2) c = [40, 30, 22];
    if (Math.abs((j + hs(k, 4) * 170) % 170) < 1.5) c = [50, 38, 28];
    c = mixc(c, SALT, 0.28 * fbm(i * 0.012, j * 0.012 + 3, 3));
    const s = fbm(i * 0.03 + 5, j * 0.03, 3);
    if (s > 0.6) c = mul(c, 1 - (s - 0.6) * 1.4);
    return c;
  }, (x) => {
    x.save(); x.beginPath(); x.moveTo(78, 44); x.lineTo(182, 38); x.lineTo(190, 124); x.lineTo(70, 132); x.closePath(); x.clip();
    for (let a = 0; a < 256; a += 64) for (let b = 0; b < 512; b += 64) x.drawImage(TX.corrRust.image as HTMLCanvasElement, a, b, 64, 64);
    x.restore();
    x.strokeStyle = 'rgba(30,22,16,.85)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(78, 44); x.lineTo(182, 38); x.lineTo(190, 124); x.lineTo(70, 132); x.closePath(); x.stroke();
  }, { repeat: [1 / 18, 1 / 37], offset: [0.5, 16 / 37] });
  TX.pier = genTex(128, 128, (i, j, _w, h) => {
    const pl = Math.floor(i / 21);
    let c: RGB = [[128, 108, 82], [110, 96, 76], [140, 126, 100]][Math.floor(hs(pl, 5) * 3)];
    c = mul(c, 0.75 + 0.35 * fbm(i * 0.4, j * 0.03 + pl, 3));
    if (i % 21 < 2) c = [30, 24, 18];
    return wcol(c, i, j, j / h, { seed: 41, rust: 0.05, fade: 0.3, grime: 0.2 });
  }, null, { repeat: [0.25, 0.25] });
}
