// Deterministic hashing, seeded random and fast tileable value noise.

export function hs(...a: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of a) {
    h = Math.imul(h ^ ((Math.round(v * 997) | 0) >>> 0), 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAT = new Float32Array(65536);
for (let i = 0; i < 65536; i++) LAT[i] = hs(i, 991);

export function n2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = xi & 255, y0 = yi & 255, x1 = (xi + 1) & 255, y1 = (yi + 1) & 255;
  const a = LAT[y0 * 256 + x0], b = LAT[y0 * 256 + x1], c = LAT[y1 * 256 + x0], d = LAT[y1 * 256 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, o = 4): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { s += a * n2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export type RGB = number[];
export const rgb = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ss = (a: number, b: number, x: number) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
