// The ship-as-backpack: a deck grid with fixed modules, a small safe box, and an unsafe temporary pile.
import { ItemDef } from './items';
import { StrKey } from '../i18n/zh';

export type Where = 'deck' | 'safe' | 'pile';
export interface Item { uid: number; def: ItemDef; rot: boolean; where: Where | null; x: number; y: number }
export const iw = (it: Item) => (it.rot ? it.def.h : it.def.w);
export const ih = (it: Item) => (it.rot ? it.def.w : it.def.h);

export interface ModuleSlot { key: StrKey; c: number; r: number; w: number; h: number }
export const DECK_W = 3, DECK_H = 6;
export const MODULES: ModuleSlot[] = [
  { key: 'mod_cannon', c: 1, r: 0, w: 1, h: 1 },
  { key: 'mod_gun', c: 0, r: 1, w: 1, h: 2 },
  { key: 'mod_armor', c: 2, r: 1, w: 1, h: 2 },
  { key: 'mod_fuel', c: 0, r: 4, w: 1, h: 1 },
  { key: 'mod_safe', c: 1, r: 4, w: 1, h: 1 },
  { key: 'mod_engine', c: 0, r: 5, w: 3, h: 1 },
];
export const PILE_CAP = 2;

export class Grid {
  cells: number[];   // 0 empty, -1 module, >0 item uid
  constructor(public w: number, public h: number, blocked: ModuleSlot[] = []) {
    this.cells = new Array(w * h).fill(0);
    for (const m of blocked) for (let y = m.r; y < m.r + m.h; y++) for (let x = m.c; x < m.c + m.w; x++) this.cells[y * w + x] = -1;
  }
  fits(x: number, y: number, w: number, h: number, ignore = 0): boolean {
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const c = this.cells[j * this.w + i];
      if (c !== 0 && c !== ignore) return false;
    }
    return true;
  }
  fill(it: Item, v: number) {
    for (let j = it.y; j < it.y + ih(it); j++) for (let i = it.x; i < it.x + iw(it); i++) this.cells[j * this.w + i] = v;
  }
  findSpot(it: Item): { x: number; y: number; rot: boolean } | null {
    for (const rot of [it.rot, !it.rot]) {
      const w = rot ? it.def.h : it.def.w, h = rot ? it.def.w : it.def.h;
      for (let y = 0; y <= this.h - h; y++) for (let x = 0; x <= this.w - w; x++) if (this.fits(x, y, w, h)) return { x, y, rot };
    }
    return null;
  }
}

let nextUid = 1;
export class Inventory {
  deck = new Grid(DECK_W, DECK_H, MODULES);
  safe = new Grid(2, 1);
  items: Item[] = [];
  listeners: Array<() => void> = [];

  onChange(f: () => void) { this.listeners.push(f); }
  reset() {
    this.deck = new Grid(DECK_W, DECK_H, MODULES);
    this.safe = new Grid(2, 1);
    this.items = [];
    this.emit();
  }
  emit() { this.listeners.forEach((f) => f()); }
  grid(w: Where) { return w === 'deck' ? this.deck : this.safe; }
  pile() { return this.items.filter((i) => i.where === 'pile'); }
  pending() { return this.items.filter((i) => i.where === null); }
  stowed() { return this.items.filter((i) => i.where !== null); }
  weight() { return this.stowed().reduce((s, i) => s + i.def.weight, 0); }
  value(filter?: (i: Item) => boolean) { return this.items.filter((i) => i.where !== null && (!filter || filter(i))).reduce((s, i) => s + i.def.value, 0); }

  /** New loot goes onto the deck if it fits, else the temporary pile, else stays pending until the player decides. */
  add(def: ItemDef): Item {
    const it: Item = { uid: nextUid++, def, rot: false, where: null, x: 0, y: 0 };
    this.items.push(it);
    const spot = this.deck.findSpot(it);
    if (spot) { it.rot = spot.rot; this.put(it, 'deck', spot.x, spot.y); }
    else if (this.pile().length < PILE_CAP) this.put(it, 'pile', 0, 0);
    this.emit();
    return it;
  }
  lift(it: Item) {
    if (it.where === 'deck' || it.where === 'safe') this.grid(it.where).fill(it, 0);
    it.where = null;
  }
  put(it: Item, where: Where, x: number, y: number) {
    it.where = where; it.x = x; it.y = y;
    if (where !== 'pile') this.grid(where).fill(it, it.uid);
  }
  /** Try to move an item; on failure it goes back where it was. */
  tryMove(it: Item, where: Where, x: number, y: number, rot: boolean): boolean {
    const prev = { where: it.where, x: it.x, y: it.y, rot: it.rot };
    this.lift(it);
    it.rot = rot;
    let ok = false;
    if (where === 'pile') ok = this.pile().length < PILE_CAP;
    else ok = this.grid(where).fits(x, y, iw(it), ih(it));
    if (ok) this.put(it, where, x, y);
    else { it.rot = prev.rot; if (prev.where) this.put(it, prev.where, prev.x, prev.y); }
    this.emit();
    return ok;
  }
  discard(it: Item) {
    this.lift(it);
    this.items = this.items.filter((i) => i !== it);
    this.emit();
  }
  /** On sinking only the safe box survives. */
  keepOnlySafe() {
    this.items = this.items.filter((i) => i.where === 'safe');
  }
}
