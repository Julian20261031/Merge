// A seeded patch of drowned city: rooftops, salvage points, the extraction dock, junk and ruined towers in the haze.
import * as THREE from 'three';
import { TX, concTop, concSide } from '../render/textures';
import { toon, part, box, cyl, dent } from '../render/toon';
import { mulberry32, hs } from '../core/noise';
import { Calm, waveH } from '../render/water';
import { MapDef } from './maps';

export interface Roof { x: number; z: number; w: number; d: number; rot: number; top: number; type: 'tank' | 'shack' | 'stair' | 'garden' }
export interface Spot { x: number; z: number; richness: number; looted: boolean; progress: number; group: THREE.Group; ring: THREE.Mesh; spark: THREE.Mesh; sink: number }
export interface Dock { x: number; z: number; r: number; pier: Roof }

let ROOF_TEX: { tops: THREE.Texture[]; sides: THREE.Texture[] } | null = null;

export interface World {
  roofs: Roof[]; spots: Spot[]; dock: Dock; calm: Calm[]; radius: number;
  dockRing: THREE.Mesh;
  update(t: number, dt: number): void;
}

const PLANT = 0x5b7a3e, PLANT2 = 0x7a8f4a, ROPE = 0x8a7550, TYRE = 0x2b2a27;

function brokenParapet(g: THREE.Group, R: Roof, seed: number) {
  const hw = R.w / 2, hd = R.d / 2, T = R.top;
  const edges = [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]];
  edges.forEach(([x0, z0, x1, z1], e) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 2.6));
    for (let k = 0; k < n; k++) {
      if (hs(seed, e, k) < 0.24) continue;
      const u = (k + 0.5) / n, cx = x0 + (x1 - x0) * u, cz = z0 + (z1 - z0) * u;
      const inX = x1 - x0 !== 0, sl = (L / n) * 0.96, ht = 0.4 + hs(seed, e, k, 2) * 0.35;
      part(g, dent(box(inX ? sl : 0.5, ht, inX ? 0.5 : sl), 0.06), toon(0, TX.parapet), cx - (inX ? 0 : Math.sign(cx) * 0.25), T + ht / 2, cz - (inX ? Math.sign(cz) * 0.25 : 0), { outline: false });
    }
  });
  for (let k = 0; k < 4; k++) part(g, cyl(0.06, 1.2 + hs(seed, k) * 1.2, 5), toon(0x6e2e18), hw - 0.6 - k * 0.3, T + 0.7, -hd + 0.4 + (k % 2) * 0.4, { rz: (hs(seed, k, 4) - 0.5) * 0.9, rx: (hs(seed, k, 5) - 0.5) * 0.7, outline: false });
}

function buildRoof(scene: THREE.Object3D, R: Roof, idx: number, tops: THREE.Texture[], sides: THREE.Texture[]) {
  const g = new THREE.Group();
  g.position.set(R.x, 0, R.z);
  g.rotation.y = R.rot;
  scene.add(g);
  const hw = R.w / 2, hd = R.d / 2, T = R.top;
  const sideM = toon(0, sides[Math.min(sides.length - 1, Math.floor((T - 1.5) / 0.7))]);
  part(g, box(R.w, T + 6, R.d), [sideM, sideM, toon(0, tops[idx % tops.length]), sideM, sideM, sideM], 0, (T - 6) / 2, 0, { outline: 'thick' });
  brokenParapet(g, R, idx + 7);
  const s = (k: number) => hs(idx, k);
  if (R.type === 'tank') {
    const tank = new THREE.Group();
    tank.position.set(hw - 3.4, T, -hd + 3.2);
    tank.rotation.z = 0.07;
    g.add(tank);
    part(tank, dent(cyl(2.0, 2.6, 16), 0.16), toon(0, TX.tank), 0, 2.2, 0, { outline: 'mid' });
    for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) part(tank, cyl(0.12, 1.0, 5), toon(0, TX.dark), a, 0.5, b, { outline: false });
    for (let i = 0; i < Math.floor(R.w / 6); i++) part(g, dent(box(3.0, 1.3, 2.4), 0.1), toon(0, TX.steel), -hw + 3.6 + i * 4.2, T + 0.65, hd - 2.4, { ry: (s(i) - 0.5) * 0.2 });
  } else if (R.type === 'shack') {
    const sx = -hw + 4.2, sz = hd - 4.2;
    part(g, dent(box(5.0, 2.4, 4.0), 0.18), toon(0, TX.corrRust), sx, T + 1.2, sz, { ry: 0.08, outline: 'mid' });
    part(g, dent(box(6.0, 0.12, 5.0), 0.2), toon(0, TX.tarp), sx, T + 2.55, sz, { rx: 0.12, ry: 0.08 });
    part(g, box(1.2, 1.8, 0.1), toon(0x1c1a17), sx + 1.2, T + 0.9, sz - 2.05, { ry: 0.08, outline: false });
    part(g, dent(box(2.6, 2.0, 2.2), 0.12), toon(0, TX.wood), hw - 3.0, T + 1.0, -hd + 3.0);
  } else if (R.type === 'stair') {
    part(g, dent(box(4.0, 2.6, 5.0), 0.1), toon(0, TX.parapet), -hw + 3.2, T + 1.3, -hd + 3.8, { outline: 'mid' });
    part(g, box(2.2, 1.8, 0.2), toon(0, TX.primer), -hw + 3.2, T + 1.0, -hd + 6.4);
    part(g, cyl(0.1, 6, 6), toon(0, TX.dark), -hw + 3.2, T + 5.6, -hd + 2.8, { rz: 0.12, outline: false });
    part(g, dent(box(3.4, 0.2, 4.2), 0.08), toon(0x2f4a5a), hw - 3.4, T + 0.8, 0, { rx: -0.35 });
  } else {
    for (let i = 0; i < 10; i++) {
      const r = 0.6 + s(i + 20) * 0.9;
      part(g, dent(new THREE.IcosahedronGeometry(r, 1), 0.2), toon(i % 3 ? PLANT : PLANT2), -hw + 2 + s(i + 40) * (R.w - 4), T + r * 0.6, -hd + 2 + s(i + 60) * (R.d - 4));
    }
  }
}

function buildDock(scene: THREE.Object3D, d: Dock) {
  const g = new THREE.Group();
  g.position.set(d.pier.x, 0, d.pier.z);
  scene.add(g);
  const P = d.pier;
  part(g, dent(box(P.w, 1.2, P.d), 0.08), [toon(0, TX.dark), toon(0, TX.dark), toon(0, TX.pier), toon(0, TX.dark), toon(0, TX.dark), toon(0, TX.dark)], 0, P.top - 0.6, 0, { outline: 'thick' });
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) part(g, dent(cyl(1.0, 2.6, 12), 0.1), toon(0, i % 2 ? TX.drumBlue : TX.drum), -P.w / 2 + 1.6 + i * (P.w - 3.2) / 5, 0.2, s * (P.d / 2 - 1.2), { rx: Math.PI / 2, outline: false });
  for (let i = 0; i < 5; i++) part(g, new THREE.TorusGeometry(0.8, 0.34, 8, 14), toon(TYRE), -P.w / 2 + 2 + i * (P.w - 4) / 4, P.top - 0.2, -P.d / 2 - 0.3, { outline: false });
  // harbour shack, lamp post and flag so the dock reads from far away
  part(g, dent(box(5, 3, 4), 0.15), toon(0, TX.corr), P.w / 2 - 4, P.top + 1.5, 0.5, { outline: 'mid' });
  part(g, dent(box(5.8, 0.15, 4.8), 0.15), toon(0, TX.corrRust), P.w / 2 - 4, P.top + 3.1, 0.5, { rx: 0.1 });
  part(g, cyl(0.15, 9, 6), toon(0, TX.steel), -P.w / 2 + 2, P.top + 4.5, 0);
  part(g, box(1.0, 0.8, 1.0), new THREE.MeshBasicMaterial({ color: 0xf2c230 }), -P.w / 2 + 2, P.top + 9.2, 0, { outline: 'thin' });
  for (let k = 0; k < 3; k++) part(g, new THREE.TorusGeometry(0.8 - k * 0.07, 0.14, 6, 14), toon(ROPE), 1, P.top + 0.15 + k * 0.22, 1.2, { rx: Math.PI / 2, outline: false });
}

function buildSpot(scene: THREE.Object3D, sp: { x: number; z: number; richness: number }, i: number): Spot {
  const g = new THREE.Group();
  g.position.set(sp.x, 0, sp.z);
  scene.add(g);
  const rich = sp.richness > 0.6;
  part(g, dent(box(2.8, 1.6, 2.2), 0.15), toon(0, rich ? TX.safeTop : TX.wood), 0, 0.2, 0, { ry: hs(i, 1) * 3, outline: 'mid' });
  part(g, dent(cyl(1.0, 2.2, 12), 0.15), toon(0, hs(i, 2) > 0.5 ? TX.drum : TX.drumBlue), 2.4, 0, 1.2, { rz: Math.PI / 2, ry: hs(i, 3) * 3, outline: 'thin' });
  part(g, dent(box(1.6, 0.4, 1.0), 0.1), toon(0xe2ddcc), -2.0, 0, 1.5, { ry: hs(i, 4) * 3, outline: 'thin' });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.16, 6, 48), new THREE.MeshBasicMaterial({ color: 0xf2c230 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  g.add(ring);
  const spark = part(g, new THREE.OctahedronGeometry(rich ? 0.95 : 0.7, 0), new THREE.MeshBasicMaterial({ color: 0xf2c230 }), 0, 3.4, 0, { outline: 'thin' });
  return { x: sp.x, z: sp.z, richness: sp.richness, looted: false, progress: 0, group: g, ring, spark, sink: 0 };
}

export function buildWorld(scene: THREE.Object3D, seed: number, map: MapDef): World {
  const R0 = map.radius;
  const rand = mulberry32(seed);
  const pier: Roof = { x: 0, z: 0, w: 22, d: 7, rot: 0, top: 1.6, type: 'garden' };
  const dock: Dock = { x: 0, z: -14, r: 14, pier };

  const roofs: Roof[] = [];
  const types: Roof['type'][] = ['tank', 'shack', 'stair', 'garden'];
  for (let tries = 0; roofs.length < map.roofs && tries < 800; tries++) {
    const a = rand() * Math.PI * 2, r = 45 + rand() * (R0 - 55);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (roofs.some((o) => Math.hypot(o.x - x, o.z - z) < 40)) continue;
    if (Math.hypot(x, z + 10) < 50) continue;
    roofs.push({ x, z, w: 12 + rand() * 12, d: 10 + rand() * 10, rot: (rand() - 0.5) * 1.2, top: 1.7 + rand() * 1.6, type: types[Math.floor(rand() * 4)] });
  }
  const spots: { x: number; z: number; richness: number }[] = [];
  for (let tries = 0; spots.length < map.spots && tries < 1500; tries++) {
    const a = rand() * Math.PI * 2, r = 40 + rand() * (R0 - 47);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (roofs.some((o) => Math.hypot(o.x - x, o.z - z) < Math.max(o.w, o.d) / 2 + 14)) continue;
    if (spots.some((o) => Math.hypot(o.x - x, o.z - z) < 26)) continue;
    if (Math.hypot(x - dock.x, z - dock.z) < 34) continue;
    spots.push({ x, z, richness: map.rich[0] + (map.rich[1] - map.rich[0]) * Math.min(1, r / (R0 - 7)) });
  }

  // shared roof textures (texture generation is the slowest part of loading)
  if (!ROOF_TEX) ROOF_TEX = { tops: [0, 1, 2, 3].map((k) => concTop(k + 1)), sides: [0, 1, 2].map((k) => concSide(k + 3, 1.7 + k * 0.7)) };
  const { tops, sides } = ROOF_TEX;
  roofs.forEach((R, i) => buildRoof(scene, R, i, tops, sides));
  buildDock(scene, dock);
  const spotObjs = spots.map((s, i) => buildSpot(scene, s, i));

  const dockRing = new THREE.Mesh(new THREE.TorusGeometry(dock.r, 0.2, 6, 72), new THREE.MeshBasicMaterial({ color: 0xbfe3c8, transparent: true, opacity: 0.85 }));
  dockRing.rotation.x = Math.PI / 2;
  dockRing.position.set(dock.x, 0.4, dock.z);
  scene.add(dockRing);

  // collapsed towers in the haze, all around the edge
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + rand() * 0.3, r = R0 + 40 + rand() * 60, w = 8 + rand() * 6, h = 10 + rand() * 30;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.rotation.set(0, rand() * 1.2, (rand() - 0.5) * 0.18);
    scene.add(g);
    const tx = TX.ruin.clone();
    tx.needsUpdate = true;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(w / 8, (h + 6) / 8);
    part(g, box(w, h + 6, w * 0.85), toon(0, tx), 0, (h - 6) / 2, 0, { outline: 'thick' });
    for (let j = 0; j < 3; j++) {
      const bw = w * (0.25 + rand() * 0.35), bh = 1.5 + rand() * 5;
      part(g, dent(box(bw, bh, bw * 0.8), 0.3), toon(0, tx), (rand() - 0.5) * (w - bw), h + bh / 2, (rand() - 0.5) * (w * 0.85 - bw), { outline: 'mid' });
    }
  }

  // floating junk
  const junk: { m: THREE.Object3D; x: number; z: number; lift: number }[] = [];
  for (let c = 0; c < 12; c++) {
    const a = rand() * Math.PI * 2, r = 30 + rand() * (R0 - 35), cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (roofs.some((o) => Math.hypot(o.x - cx, o.z - cz) < Math.max(o.w, o.d) / 2 + 8)) continue;
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * 9, z = cz + (rand() - 0.5) * 7, tp = Math.floor(rand() * 4);
      let m: THREE.Mesh;
      if (tp === 0) m = part(scene, cyl(0.2, 0.9, 7), toon([0xd8dccf, 0x7fb0c4, 0x6b9a5a][k % 3]), x, 0, z, { rz: Math.PI / 2, ry: rand() * 6, outline: false });
      else if (tp === 1) m = part(scene, dent(box(1.3, 0.45, 0.9), 0.12), toon(0xe2ddcc), x, 0, z, { ry: rand() * 6 });
      else if (tp === 2) { m = part(scene, dent(new THREE.IcosahedronGeometry(0.55, 1), 0.2), toon(0xdfe3e6), x, 0, z); m.scale.y = 0.35; }
      else m = part(scene, new THREE.TorusGeometry(1.0, 0.42, 8, 14), toon(TYRE), x, 0, z, { rx: Math.PI / 2, outline: 'thin' });
      junk.push({ m, x, z, lift: tp === 2 ? 0.02 : 0.08 });
    }
  }

  const calm: Calm[] = [...roofs.map((r) => ({ x: r.x, z: r.z, hx: r.w / 2, hz: r.d / 2, rot: r.rot })), { x: pier.x, z: pier.z, hx: pier.w / 2, hz: pier.d / 2, rot: 0 }];

  return {
    roofs: [...roofs, pier], spots: spotObjs, dock, calm, dockRing, radius: R0,
    update(t: number, dt: number) {
      for (const j of junk) j.m.position.y = waveH(j.x, j.z, t) + j.lift;
      for (const s of spotObjs) {
        const h = waveH(s.x, s.z, t);
        if (s.looted) {
          s.sink = Math.min(1, s.sink + dt * 0.4);
          s.group.position.y = h - s.sink * 3;
          s.ring.visible = false; s.spark.visible = false;
          if (s.sink >= 1) s.group.visible = false;
          continue;
        }
        s.group.position.y = h * 0.9 - 0.2;
        s.ring.rotation.z = t * 0.6;
        s.spark.rotation.y = t * 2;
        s.spark.position.y = 3.4 + 0.3 * Math.sin(t * 3);
      }
      dockRing.position.y = 0.4 + waveH(dock.x, dock.z, t) * 0.3;
    },
  };
}
