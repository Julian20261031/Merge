// Ship layout: modules on the deck grid. Edited only at the dock, never during a run.
import { Grid, newUid } from './grid';
import { StrKey } from '../i18n/zh';

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
export const DECK_W = 3, DECK_H = 6;
export const BASE_FUEL = 60;
export const SAFE_SIZE: [number, number] = [2, 1];

export interface Placed { uid: number; type: ModType; c: number; r: number; rot: boolean }
export const pw = (p: Placed) => (p.rot ? MODS[p.type].h : MODS[p.type].w);
export const ph = (p: Placed) => (p.rot ? MODS[p.type].w : MODS[p.type].h);

const DEFAULT_LAYOUT: Omit<Placed, 'uid'>[] = [
  { type: 'engine', c: 0, r: 5, rot: false },
  { type: 'safe', c: 1, r: 4, rot: false },
  { type: 'cannon', c: 1, r: 0, rot: false },
  { type: 'gun', c: 0, r: 1, rot: false },
  { type: 'armor', c: 2, r: 1, rot: false },
  { type: 'cargo', c: 1, r: 1, rot: false },
  { type: 'cargo', c: 0, r: 3, rot: false },
  { type: 'fuel', c: 2, r: 3, rot: false },
];
const DEFAULT_OWNED: Record<string, number> = { cannon: 1, gun: 1, armor: 1, cargo: 3, fuel: 2 };

export class Layout {
  grid = new Grid(DECK_W, DECK_H);
  placed: Placed[] = [];
  owned: Record<string, number> = { ...DEFAULT_OWNED };

  static from(saved: { type: string; c: number; r: number; rot: boolean }[] | null, owned: Record<string, number> | null): Layout {
    const L = new Layout();
    if (owned) L.owned = { ...DEFAULT_OWNED, ...owned };
    for (const p of saved ?? DEFAULT_LAYOUT) if (MODS[p.type as ModType]) L.place({ ...p, type: p.type as ModType, uid: newUid() });
    // the engine and safe box are part of the hull
    for (const f of DEFAULT_LAYOUT.filter((d) => MODS[d.type].fixed)) if (!L.placed.some((p) => p.type === f.type)) L.place({ ...f, uid: newUid() });
    return L;
  }
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
export const sideOf = (p: Placed) => (p.c + pw(p) / 2 < DECK_W / 2 - 0.01 ? -1 : p.c + pw(p) / 2 > DECK_W / 2 + 0.01 ? 1 : 0);
