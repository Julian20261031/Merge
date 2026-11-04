// Hulls the player can refit onto. The hull decides the deck grid (= the backpack), toughness and handling;
// everything about the boat's shape is derived from the grid so modules always sit on the cells you see.
import { StrKey } from '../i18n/zh';

export type HullId = 'dinghy' | 'skiff' | 'trawler' | 'barge';
export interface HullDef {
  id: HullId; name: StrKey; desc: StrKey;
  w: number; h: number;          // deck grid, columns × rows (row 0 = bow)
  hp: number; speed: number; turn: number;
  bow: number;                   // how long and pointed the bow is (1 = trawler)
  unlock: number;                // captain level needed
  drums: boolean;                // lashed float drums at the bow
}

export const HULLS: Record<HullId, HullDef> = {
  dinghy: { id: 'dinghy', name: 'hull_dinghy', desc: 'hulld_dinghy', w: 3, h: 3, hp: 70, speed: 14, turn: 1.3, bow: 0.75, unlock: 1, drums: false },
  skiff: { id: 'skiff', name: 'hull_skiff', desc: 'hulld_skiff', w: 3, h: 5, hp: 90, speed: 17.5, turn: 1.25, bow: 1.15, unlock: 2, drums: false },
  trawler: { id: 'trawler', name: 'hull_trawler', desc: 'hulld_trawler', w: 3, h: 6, hp: 120, speed: 15, turn: 1, bow: 1, unlock: 3, drums: true },
  barge: { id: 'barge', name: 'hull_barge', desc: 'hulld_barge', w: 4, h: 7, hp: 175, speed: 12.5, turn: 0.78, bow: 0.65, unlock: 5, drums: true },
};
export const HULL_ORDER: HullId[] = ['dinghy', 'skiff', 'trawler', 'barge'];
export const DEFAULT_HULL: HullId = 'dinghy';

export const DECK = 1.4, CELL = 4;

/** Geometry of a hull in boat-local units: x across (port −), z along (bow −). */
export function hullGeom(H: HullDef) {
  const gx = -H.w * CELL / 2, gz = -11 - (H.h - 6) * 2;
  const zTop = gz, zBot = gz + H.h * CELL, hw = H.w * CELL / 2 + 2.4;
  const bowTip = zTop - 9.5 * H.bow, stern = zBot + 3;
  return { gx, gz, zTop, zBot, hw, bowTip, stern, beam: hw / 8.4 };
}

/** Centre of a w×h block of cells at (c, r), on the deck. */
export function cellCenter(H: HullDef, c: number, r: number, w: number, h: number) {
  const { gx, gz } = hullGeom(H);
  return { x: gx + (c + w / 2) * CELL, y: DECK, z: gz + (r + h / 2) * CELL };
}

// The trawler outline (tenths of a unit); other hulls stretch it to their own grid.
const BASE = [[0, -205], [36, -172], [64, -128], [79, -80], [84, 0], [82, 90], [76, 140], [62, 160], [-62, 160], [-76, 140], [-82, 90], [-84, 0], [-79, -80], [-64, -128], [-36, -172]];
export function hullOutline(H: HullDef): number[][] {
  const g = hullGeom(H);
  return BASE.map(([x0, z0]) => {
    const x = x0 * 0.1, z = z0 * 0.1;
    // a blunt bow keeps more of its width forward
    const bx = z < -11 ? x * (1 + (1 - H.bow) * 0.9 * Math.min(1, (-11 - z) / 9.5)) : x;
    const zz = z < -11 ? g.zTop + (z + 11) * H.bow : z > 13 ? g.zBot + (z - 13) : g.zTop + ((z + 11) / 24) * (g.zBot - g.zTop);
    return [Math.sign(bx) * Math.min(Math.abs(bx) * (g.hw / 8.4), g.hw), zz];
  });
}
