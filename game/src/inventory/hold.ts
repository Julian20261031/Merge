// The hold during a run: one 3×3 grid per cargo box, the safe box, and an unsafe temporary pile.
import { Grid, newUid } from './grid';
import { ItemDef } from './items';
import { Placed, MODS, SAFE_SIZE, sideOf } from './modules';

export interface Item { uid: number; def: ItemDef; rot: boolean; where: string | null; x: number; y: number }
export const iw = (it: Item) => (it.rot ? it.def.h : it.def.w);
export const ih = (it: Item) => (it.rot ? it.def.w : it.def.h);
export interface Container { id: string; index: number; side: number; grid: Grid; safe: boolean }
export const PILE_CAP = 2;

export class Hold {
  containers: Container[] = [];
  items: Item[] = [];
  private listeners: Array<() => void> = [];

  onChange(f: () => void) { this.listeners.push(f); }
  emit() { this.listeners.forEach((f) => f()); }

  setup(boxes: Placed[], deckW: number) {
    this.containers = boxes.map((b, i) => {
      const [w, h] = MODS.cargo.cargo!;
      return { id: `cargo${i}`, index: i, side: sideOf(b, deckW), grid: new Grid(w, h), safe: false };
    });
    this.containers.push({ id: 'safe', index: 0, side: 0, grid: new Grid(SAFE_SIZE[0], SAFE_SIZE[1]), safe: true });
    this.items = [];
    this.emit();
  }
  get(id: string) { return this.containers.find((c) => c.id === id); }
  pile() { return this.items.filter((i) => i.where === 'pile'); }
  pending() { return this.items.filter((i) => i.where === null); }
  stowed() { return this.items.filter((i) => i.where !== null); }
  weight() { return this.stowed().reduce((s, i) => s + i.def.weight, 0); }
  value() { return this.stowed().reduce((s, i) => s + i.def.value, 0); }
  fill(id: string) { const c = this.get(id); return c ? c.grid.used() / (c.grid.w * c.grid.h) : 0; }

  /** New loot goes into the first cargo box with room, else the temporary pile, else waits for the player. */
  add(def: ItemDef): Item {
    const it: Item = { uid: newUid(), def, rot: false, where: null, x: 0, y: 0 };
    this.items.push(it);
    for (const c of this.containers) {
      if (c.safe) continue;
      const s = c.grid.findSpot(def.w, def.h, false);
      if (s) { it.rot = s.rot; this.put(it, c.id, s.x, s.y); this.emit(); return it; }
    }
    if (this.pile().length < PILE_CAP) this.put(it, 'pile', 0, 0);
    this.emit();
    return it;
  }
  private lift(it: Item) {
    const c = it.where ? this.get(it.where) : undefined;
    if (c) c.grid.fill(it.x, it.y, iw(it), ih(it), 0);
    it.where = null;
  }
  private put(it: Item, where: string, x: number, y: number) {
    it.where = where; it.x = x; it.y = y;
    this.get(where)?.grid.fill(x, y, iw(it), ih(it), it.uid);
  }
  tryMove(it: Item, where: string, x: number, y: number, rot: boolean): boolean {
    const prev = { where: it.where, x: it.x, y: it.y, rot: it.rot };
    this.lift(it);
    it.rot = rot;
    const c = this.get(where);
    const ok = where === 'pile' ? this.pile().length < PILE_CAP : !!c && c.grid.fits(x, y, iw(it), ih(it));
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
  keepOnlySafe() { this.items = this.items.filter((i) => i.where === 'safe'); }
}
