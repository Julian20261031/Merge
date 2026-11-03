// 3D models for loot. Each sits on its deck cells, so the grid you arrange is what you see on board.
import * as THREE from 'three';
import { TX } from '../render/textures';
import { toon, part, box, cyl, dent } from '../render/toon';
import { ItemDef } from '../inventory/items';
import { CELL } from './model';

/** Builds a model centred at the origin, sitting on y = 0, filling a w×h cell footprint (x by z). */
export function itemModel(def: ItemDef, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const W = w * CELL - 0.7, D = h * CELL - 0.7;
  switch (def.kind) {
    case 'scrap':
      part(g, dent(box(W * 0.9, 0.7, D * 0.8), 0.25), toon(0, TX.corrRust), 0, 0.35, 0, { ry: 0.2 });
      part(g, dent(box(W * 0.6, 0.5, D * 0.5), 0.2), toon(0, TX.steel), 0.3, 0.9, -0.2, { ry: -0.4 });
      break;
    case 'cans':
      for (let i = 0; i < 4; i++) part(g, cyl(0.55, 1.0, 10), toon(0, TX.drum), (i % 2 - 0.5) * 1.3, 0.5, (Math.floor(i / 2) - 0.5) * 1.3);
      part(g, cyl(0.55, 1.0, 10), toon(0, TX.olive), 0, 1.5, 0);
      break;
    case 'crate':
      part(g, dent(box(W, 1.6, D), 0.12), toon(0, TX.crate), 0, 0.8, 0, { outline: 'mid' });
      break;
    case 'water':
      part(g, dent(box(W * 0.8, 2.2, D * 0.9), 0.1), toon(0, TX.jerry), 0, 1.1, 0, { outline: 'mid' });
      part(g, cyl(0.28, 0.4, 8), toon(0xc9302a), 0.4, 2.4, -D * 0.3);
      break;
    case 'tarp':
      part(g, dent(cyl(1.0, W * 0.95, 14), 0.08), toon(0, TX.tarp), 0, 1.0, 0, { rz: Math.PI / 2, outline: 'mid' });
      break;
    case 'pipes':
      for (let i = 0; i < 3; i++) part(g, cyl(0.38, D * 0.95, 10), toon(0, TX.steel), (i - 1) * 0.85, 0.4 + (i === 1 ? 0.6 : 0), 0, { rx: Math.PI / 2 });
      break;
    case 'med':
      part(g, dent(box(W * 0.85, 1.3, D * 0.85), 0.05), toon(0, TX.med), 0, 0.65, 0, { outline: 'mid' });
      break;
    case 'solar':
      part(g, dent(box(W * 0.95, 0.25, D * 0.95), 0.05), [toon(0, TX.steel), toon(0, TX.steel), toon(0, TX.solar), toon(0, TX.steel), toon(0, TX.steel), toon(0, TX.steel)], 0, 0.5, 0, { rx: 0.12, outline: 'mid' });
      break;
    case 'battery':
      part(g, dent(box(W * 0.75, 1.5, D * 0.85), 0.05), toon(0x2c3236), 0, 0.75, 0);
      part(g, box(W * 0.8, 0.35, D * 0.9), new THREE.MeshBasicMaterial({ color: 0xf2c230 }), 0, 1.0, 0, { outline: false });
      part(g, cyl(0.22, 0.4, 8), toon(0xb5302a), -0.5, 1.7, -0.8);
      part(g, cyl(0.22, 0.4, 8), toon(0x1e1e1e), 0.5, 1.7, -0.8);
      break;
  }
  return g;
}
