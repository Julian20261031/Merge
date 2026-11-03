// The player's salvaged boat. Deck cells map 1:1 to the inventory grid (row 0 = bow).
import * as THREE from 'three';
import { TX } from '../render/textures';
import { toon, part, box, cyl, dent, ringGeo, offsetPoly } from '../render/toon';
import { hs } from '../core/noise';
import { DECK_W, DECK_H, Layout, Placed, pw, ph, sideOf } from '../inventory/modules';

export const HULL2D = [[0, -205], [36, -172], [64, -128], [79, -80], [84, 0], [82, 90], [76, 140], [62, 160], [-62, 160], [-76, 140], [-82, 90], [-84, 0], [-79, -80], [-64, -128], [-36, -172]];
export const DECK = 1.4, CELL = 4, GX = -6, GZ = -11;
const ROPE = 0x8a7550, TYRE = 0x2b2a27;

export const cellCenter = (c: number, r: number, w: number, h: number) => new THREE.Vector3(GX + (c + w / 2) * CELL, DECK, GZ + (r + h / 2) * CELL);

function hullGeo(pts: number[][], s: number, depth: number) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x * s, -y * s) : sh.moveTo(x * s, -y * s)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

export interface BoatModel {
  group: THREE.Group;
  cargoFill: THREE.Object3D[];      // one per cargo box, in Layout.cargoBoxes() order; scale.y = how full
  props: THREE.Object3D[];
  flag: { m: THREE.Mesh; base: Float32Array; w: number };
  exhaust: THREE.Vector3;
}

export function buildBoat(layout: Layout): BoatModel {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  part(g, hullGeo(HULL2D, 0.1, DECK), [toon(0, TX.deck), toon(0, TX.hull)], 0, 0, 0, { outline: 'thick' });

  // deck grid = the backpack
  {
    const v: number[] = [];
    for (let i = 0; i <= DECK_W; i++) v.push(GX + i * CELL, DECK + 0.03, GZ, GX + i * CELL, DECK + 0.03, GZ + DECK_H * CELL);
    for (let j = 0; j <= DECK_H; j++) v.push(GX, DECK + 0.03, GZ + j * CELL, GX + DECK_W * CELL, DECK + 0.03, GZ + j * CELL);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xf0e4c8, transparent: true, opacity: 0.45 })));
  }

  // raised welded gunwale and scavenged railings
  const HULLW = HULL2D.map(([x, y]) => [x * 0.1, y * 0.1]);
  const RIM_H = 0.6;
  {
    const rim = new THREE.Mesh(ringGeo(offsetPoly(HULLW, -0.02), offsetPoly(HULLW, -0.62), RIM_H), toon(0, TX.rim));
    rim.position.y = DECK - 0.01; g.add(rim);
    const ink = new THREE.Mesh(ringGeo(offsetPoly(HULLW, 0.12), offsetPoly(HULLW, -0.78), RIM_H + 0.14), new THREE.MeshBasicMaterial({ color: 0x22170f, side: THREE.BackSide }));
    ink.position.y = DECK - 0.06; g.add(ink);
    const path = offsetPoly(HULLW, -0.32), top = DECK + RIM_H;
    const pts: number[][] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.6));
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
    }
    const gunPorts = layout.placed.filter((p) => p.type === 'gun' && sideOf(p) !== 0).map((p) => ({ side: sideOf(p), z0: GZ + p.r * CELL - 1.2, z1: GZ + (p.r + ph(p)) * CELL + 1.2 }));
    const gap = ([x, z]: number[]) => z < -18.5 || (z > 15.5 && Math.abs(x) < 3.2) || gunPorts.some((g) => Math.sign(x) === g.side && z > g.z0 && z < g.z1);
    const railM = toon(0, TX.steel);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      if (!gap(p)) part(g, cyl(0.09, 1.25, 6), railM, p[0], top + 0.62, p[1], { rz: (hs(i, 71) - 0.5) * 0.12 });
      if (gap(p) || gap(q)) return;
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, L = Math.hypot(q[0] - p[0], q[1] - p[1]), ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
      const r = hs(i, 72);
      if (r < 0.14) return;
      if (r < 0.4) { part(g, dent(box(0.1, 1.0, L * 0.98), 0.06), toon(0, TX.corrRust), mx, top + 0.5, mz, { ry: ang }); return; }
      [0.62, 1.18].forEach((y, k) => {
        const sag = k === 1 && r > 0.85 ? -0.25 : 0;
        part(g, cyl(0.07, L, 6), railM, mx, top + y + sag, mz, { rx: Math.PI / 2, ry: ang, rz: sag ? 0.15 : 0, order: 'YXZ' });
      });
    });
  }

  // lashed blue drums, tyre fenders
  for (const s of [-1, 1]) {
    part(g, dent(cyl(1.1, 3.6, 14), 0.12), toon(0, TX.drumBlue), s * 9.4, 0.55, -12.2, { rx: Math.PI / 2, outline: 'mid' });
    for (const dz of [-0.9, 0.9]) part(g, new THREE.TorusGeometry(1.16, 0.09, 5, 16), toon(ROPE), s * 9.4, 0.55, -12.2 + dz, { outline: false });
  }
  for (const [s, z] of [[-1, 4], [-1, 11.2], [1, 4.5], [1, 11.2]]) part(g, new THREE.TorusGeometry(0.85, 0.36, 8, 16), toon(TYRE), s * (z > 10 ? 8.1 : 8.7), 0.85, z, { ry: Math.PI / 2 });

  // bow: scaffold-pipe mast, faded flag, rope coil, wheel-rim anchor
  part(g, cyl(0.17, 7.6, 8), toon(0, TX.steel), 0.6, DECK + 3.8, -16, { rz: 0.04 });
  part(g, box(2.6, 0.14, 0.14), toon(0, TX.dark), 0.75, DECK + 5.6, -16, { outline: false });
  const fg = new THREE.PlaneGeometry(3, 1.8, 10, 4);
  fg.translate(1.5, 0, 0);
  const flagMesh = new THREE.Mesh(fg, toon(0, TX.flagMe, { side: THREE.DoubleSide, alphaTest: 0.5 }));
  flagMesh.position.set(0.75, DECK + 6.6, -16);
  g.add(flagMesh);
  for (let k = 0; k < 3; k++) part(g, new THREE.TorusGeometry(0.9 - k * 0.08, 0.15, 6, 16), toon(ROPE), -2.3, DECK + 0.15 + k * 0.24, -13.6, { rx: Math.PI / 2, outline: k === 2 ? 'thin' : false });
  part(g, new THREE.TorusGeometry(0.75, 0.24, 6, 14), toon(TYRE), 2.4, DECK + 0.45, -13.4, { rx: 1.2 });

  const props: THREE.Object3D[] = [];
  const cargoFill: THREE.Object3D[] = [];
  let exhaust = new THREE.Vector3();
  const boxes = layout.cargoBoxes();
  for (const m of layout.placed) {
    const res = buildModule(g, m);
    if (res.props) props.push(...res.props);
    if (res.exhaust) exhaust = res.exhaust;
    if (res.fill) cargoFill[boxes.indexOf(m)] = res.fill;
  }
  return { group: g, cargoFill, props, flag: { m: flagMesh, base: Float32Array.from(fg.attributes.position.array as Float32Array), w: 3 }, exhaust };
}

interface ModRes { props?: THREE.Object3D[]; exhaust?: THREE.Vector3; fill?: THREE.Object3D }

/** One deck module at its cells. Side-mounted guns and armour face outward. */
function buildModule(g: THREE.Group, m: Placed): ModRes {
  const w = pw(m), h = ph(m), p = cellCenter(m.c, m.r, w, h), side = sideOf(m);
  const W = w * CELL, D = h * CELL;
  switch (m.type) {
    case 'cannon': {
      part(g, new THREE.TorusGeometry(1.25, 0.32, 8, 18), toon(TYRE), p.x, DECK + 0.32, p.z, { rx: Math.PI / 2 });
      part(g, cyl(0.75, 0.7, 10), toon(0, TX.steel), p.x, DECK + 0.45, p.z);
      part(g, dent(cyl(0.32, 3.8, 10), 0.05), toon(0, TX.dark), p.x, DECK + 1.05, p.z - 2.0, { rx: Math.PI / 2 });
      part(g, dent(new THREE.CylinderGeometry(1.9, 1.9, 1.5, 14, 2, true, Math.PI - 1.1, 2.2), 0.14), toon(0, TX.corrRust, { side: THREE.DoubleSide }), p.x, DECK + 1.0, p.z, { outline: false });
      return {};
    }
    case 'gun': {
      const len = Math.max(W, D);
      part(g, dent(box(W - 1.2, 0.3, D - 1.2), 0.12), toon(0, TX.primer), p.x, DECK + 0.15, p.z);
      for (let i = 0; i < 5; i++) {
        const a = (i / 4 - 0.5) * 2.4 + (side < 0 ? Math.PI : side > 0 ? 0 : -Math.PI / 2);
        const sb = part(g, new THREE.IcosahedronGeometry(0.62, 1), toon(0, TX.sand), p.x + Math.cos(a) * 1.4, DECK + 0.5, p.z + Math.sin(a) * Math.min(1.4, len / 3), { ry: i });
        sb.scale.set(1, 0.6, 1.3);
      }
      part(g, cyl(0.55, 0.7, 10), toon(0, TX.steel), p.x, DECK + 0.6, p.z);
      part(g, dent(box(1.3, 0.8, 1.6), 0.06), toon(0, TX.dark), p.x, DECK + 1.15, p.z);
      if (side === 0) part(g, cyl(0.2, 4.6, 8), toon(0, TX.dark), p.x, DECK + 1.2, p.z - 2.6, { rx: Math.PI / 2 });
      else part(g, cyl(0.2, 4.6, 8), toon(0, TX.dark), p.x + side * 2.6, DECK + 1.2, p.z, { rz: Math.PI / 2 });
      return {};
    }
    case 'armor': {
      const along = D >= W;   // plate runs along the hull
      part(g, dent(box(along ? 1.6 : W - 0.8, 0.12, along ? D - 0.8 : 1.6), 0.1), toon(0, TX.corr), p.x - side * 0.7, DECK + 0.08, p.z, { outline: false });
      const rm = toon(0, TX.corrRust);
      if (side === 0 || !along) {
        part(g, dent(box(W - 0.6, 0.2, D - 0.6), 0.08), [rm, rm, toon(0, TX.sign), rm, rm, rm], p.x, DECK + 0.4, p.z, { outline: 'mid' });
        return {};
      }
      const faces = side > 0 ? [rm, toon(0, TX.sign), rm, rm, rm, rm] : [toon(0, TX.sign), rm, rm, rm, rm, rm];
      part(g, dent(box(0.2, 3.4, D - 0.4), 0.09), faces, p.x + side * 1.0, DECK + 1.5, p.z, { rz: -side * 0.5, outline: 'mid' });
      return {};
    }
    case 'fuel':
      part(g, dent(cyl(1.45, 2.2, 16), 0.18), toon(0, TX.drum), p.x, DECK + 1.1, p.z, { outline: 'mid' });
      return {};
    case 'safe': {
      const sm = toon(0, TX.safeSide);
      part(g, dent(box(3.0, 1.8, 3.0), 0.05), [sm, sm, toon(0, TX.safeTop), sm, sm, sm], p.x, DECK + 0.9, p.z, { outline: 'mid' });
      part(g, cyl(0.6, 0.2, 12), toon(0xe0d4b8), p.x - 0.4, DECK + 1.9, p.z);
      return {};
    }
    case 'cargo': {
      // an open, battered crate; its contents rise as it fills
      const cw = W - 0.6, cd = D - 0.6, ch = 1.9, t = 0.25, wood = toon(0, TX.wood);
      part(g, box(cw, 0.25, cd), wood, p.x, DECK + 0.13, p.z, { outline: false });
      part(g, dent(box(cw, ch, t), 0.06), wood, p.x, DECK + ch / 2, p.z - cd / 2 + t / 2);
      part(g, dent(box(cw, ch, t), 0.06), wood, p.x, DECK + ch / 2, p.z + cd / 2 - t / 2);
      part(g, dent(box(t, ch, cd), 0.06), wood, p.x - cw / 2 + t / 2, DECK + ch / 2, p.z);
      part(g, dent(box(t, ch, cd), 0.06), wood, p.x + cw / 2 - t / 2, DECK + ch / 2, p.z);
      part(g, box(cw + 0.1, 0.18, 0.4), toon(0, TX.steel), p.x, DECK + ch - 0.1, p.z - cd / 4, { outline: false });
      const fill = new THREE.Group();
      fill.position.set(p.x, DECK + 0.25, p.z);
      g.add(fill);
      const stuff = [TX.corrRust, TX.drum, TX.jerry, TX.olive, TX.tarp, TX.steel];
      for (let i = 0; i < 6; i++) {
        const bw = 0.9 + hs(m.c, m.r, i) * 0.9, bd = 0.9 + hs(m.r, i, 3) * 1.2;
        part(fill, dent(box(bw, 1, bd), 0.12), toon(0, stuff[i]), (hs(i, m.c, 7) - 0.5) * (cw - bw - 0.6), 0.5, (hs(i, m.r, 9) - 0.5) * (cd - bd - 0.6), { ry: hs(i, 11) * 2, outline: false });
      }
      fill.scale.y = 0.001;
      fill.visible = false;
      return { fill };
    }
    case 'engine': {
      part(g, dent(box(W - 4.4, 2.0, 2.8), 0.14), toon(0, TX.dark), p.x - 1, DECK + 1.0, p.z, { outline: 'mid' });
      part(g, dent(box(W - 7, 0.5, 1.4), 0.06), toon(0, TX.primer), p.x - 1, DECK + 2.25, p.z);
      part(g, cyl(0.9, 0.5, 12), toon(0, TX.steel), p.x + 3.7, DECK + 2.25, p.z);
      part(g, cyl(0.3, 4.6, 8), toon(0, TX.dark), p.x - 3.6, DECK + 3.0, p.z + 0.9, { rz: 0.06 });
      part(g, cyl(0.3, 1.4, 8), toon(0, TX.dark), p.x - 3.15, DECK + 5.45, p.z + 0.9, { rz: -1.1, outline: false });
      const props: THREE.Object3D[] = [];
      for (const px of [-2.4, 2.4]) {
        part(g, cyl(0.28, 4.2, 8), toon(0, TX.steel), p.x + px, 0.3, p.z + 2.6, { rx: Math.PI / 2 - 0.25 });
        const prop = new THREE.Group();
        prop.position.set(p.x + px, -0.2, p.z + 4.8);
        g.add(prop);
        for (let b = 0; b < 3; b++) {
          const bl = part(prop, box(0.5, 2.0, 0.15), toon(0, TX.steel), 0, 0, 0);
          bl.position.set(Math.cos(b * 2.094) * 0.9, Math.sin(b * 2.094) * 0.9, 0);
          bl.rotation.z = b * 2.094 + Math.PI / 2;
        }
        props.push(prop);
      }
      return { props, exhaust: new THREE.Vector3(p.x - 2.6, DECK + 5.8, p.z + 0.9) };
    }
  }
}
