// Ship layout: modules on the deck grid. Edited only at the dock, never during a run.
import { Grid, newUid } from './grid';
import { StrKey } from '../i18n/zh';
import { HULLS, HullDef, HullId, DEFAULT_HULL } from '../boat/hulls';

export type ModType = 'cannon' | 'gun' | 'armor' | 'cargo' | 'fuel' | 'engine' | 'safe';
export interface ModDef { type: ModType; w: number; h: number; key: StrKey; desc: StrKey; fixed?: boolean; cargo?: [number, number]; fuel?: number }

export const MODS: Record<ModType, ModDef> = {
  cannon: { type: 'cannon', w: 1, h: 1, key: 'mod_cannon', desc: 'modd_cannon' },
  gun: { type: 'gun', w: 1, h: 2, key: 'mod_gun', desc: 'modd_gun' },
  armor: { type: 'armor', w: 1, h: 2, key: 'mod_armor', desc: 'modd_armor' },
  cargo: { type: 'cargo', w: 1, h: 2, key: 'mod_cargo', desc: 'modd_cargo', cargo: [3, 3] },
  fuel: { type: 'fuel', w: 1, h: 1, key: 'mod_fuel', desc: 'modd_fuel', fuel: 40 },
  engine: { type: 'engine', w: 3, h: 1, key: 'mod_engine', desc: 'modd_engine', fixed: true },
  safe: { type: 'safe', w: 1, h: 1, key: 'mod_safe', desc: 'modd_safe', fixed: true },
};
export const BASE_FUEL = 60;
export const SAFE_SIZE: [number, number] = [2, 1];
export type ModGroup = 'equip' | 'weapon';
export const MOD_GROUP: Record<ModType, ModGroup> = { cannon: 'weapon', gun: 'weapon', armor: 'equip', cargo: 'equip', fuel: 'equip', engine: 'equip', safe: 'equip' };

export interface Placed { uid: number; type: ModType; c: number; r: number; rot: boolean }
export const pw = (p: Placed) => (p.rot ? MODS[p.type].h : MODS[p.type].w);
export const ph = (p: Placed) => (p.rot ? MODS[p.type].w : MODS[p.type].h);

/** Where the engine and the safe box sit on a hull: the engine across the stern, the safe just ahead of it. */
const fixedFor = (H: HullDef): Omit<Placed, 'uid'>[] => [
  { type: 'engine', c: Math.floor((H.w - 3) / 2), r: H.h - 1, rot: false },
  { type: 'safe', c: Math.floor(H.w / 2), r: H.h - 2, rot: false },
];
// the starter dinghy (3×3): a machine gun and a bow gun up front, one cargo box; engine and safe box fill the rest
const DEFAULT_LAYOUT: Omit<Placed, 'uid'>[] = [
  { type: 'gun', c: 0, r: 0, rot: false },
  { type: 'cannon', c: 1, r: 0, rot: false },
  { type: 'cargo', c: 2, r: 0, rot: false },
];
const DEFAULT_OWNED: Record<string, number> = { cannon: 2, gun: 2, armor: 2, cargo: 4, fuel: 3 };

export class Layout {
  hull: HullDef = HULLS[DEFAULT_HULL];
  grid = new Grid(this.hull.w, this.hull.h);
  placed: Placed[] = [];
  owned: Record<string, number> = { ...DEFAULT_OWNED };

  static from(saved: { type: string; c: number; r: number; rot: boolean }[] | null, owned: Record<string, number> | null, hull?: string): Layout {
    const L = new Layout();
    if (owned) for (const k of Object.keys(DEFAULT_OWNED)) L.owned[k] = Math.max(DEFAULT_OWNED[k], owned[k] ?? 0);
    L.setHull(HULLS[hull as HullId] ?? HULLS[DEFAULT_HULL], (saved ?? DEFAULT_LAYOUT).filter((p) => MODS[p.type as ModType]).map((p) => ({ ...p, type: p.type as ModType, uid: newUid() })));
    return L;
  }

  /** Swap hulls, keeping every module that still fits where it was; the rest go back to the spares. */
  setHull(H: HullDef, mods: Placed[] = this.placed) {
    const keep = mods.filter((p) => !MODS[p.type].fixed);
    this.hull = H;
    this.grid = new Grid(H.w, H.h);
    this.placed = [];
    for (const f of fixedFor(H)) this.place({ ...f, uid: newUid() });
    for (const p of keep) this.place(p);
  }
  side(p: Placed) { return sideOf(p, this.hull.w); }
  at(c: number, r: number) { const u = this.grid.cells[r * this.grid.w + c]; return u > 0 ? this.placed.find((p) => p.uid === u) ?? null : null; }
  toJSON() { return this.placed.map(({ type, c, r, rot }) => ({ type, c, r, rot })); }

  place(p: Placed): boolean {
    if (!this.grid.fits(p.c, p.r, pw(p), ph(p), p.uid)) return false;
    this.placed = this.placed.filter((q) => q.uid !== p.uid);
    this.grid.fill(p.c, p.r, pw(p), ph(p), p.uid);
    this.placed.push(p);
    return true;
  }
  remove(p: Placed) {
    this.grid.fill(p.c, p.r, pw(p), ph(p), 0);
    this.placed = this.placed.filter((q) => q !== p);
  }
  /** Move or rotate an existing module; on failure it stays where it was. */
  move(p: Placed, c: number, r: number, rot: boolean): boolean {
    const prev = { c: p.c, r: p.r, rot: p.rot };
    this.grid.fill(p.c, p.r, pw(p), ph(p), 0);
    Object.assign(p, { c, r, rot });
    if (this.grid.fits(c, r, pw(p), ph(p))) { this.grid.fill(c, r, pw(p), ph(p), p.uid); return true; }
    Object.assign(p, prev);
    this.grid.fill(p.c, p.r, pw(p), ph(p), p.uid);
    return false;
  }
  count(t: ModType) { return this.placed.filter((p) => p.type === t).length; }
  spare(t: ModType) { return (this.owned[t] ?? 0) - this.count(t); }
  fuelMax() { return BASE_FUEL + this.count('fuel') * (MODS.fuel.fuel ?? 0); }
  cargoBoxes() { return this.placed.filter((p) => p.type === 'cargo').sort((a, b) => a.r - b.r || a.c - b.c); }
  cargoCells() { return this.cargoBoxes().length * 9; }
}

/** Which side of the boat a module sits on: -1 port, 0 centre, 1 starboard. */
export const sideOf = (p: Placed, deckW: number) => (p.c + pw(p) / 2 < deckW / 2 - 0.01 ? -1 : p.c + pw(p) / 2 > deckW / 2 + 0.01 ? 1 : 0);
