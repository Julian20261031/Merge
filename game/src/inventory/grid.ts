// Generic cell grid used by the ship layout and by every container in the hold.
export class Grid {
  cells: number[];   // 0 empty, -1 blocked, >0 occupant uid
  constructor(public w: number, public h: number) {
    this.cells = new Array(w * h).fill(0);
  }
  fits(x: number, y: number, w: number, h: number, ignore = 0): boolean {
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const c = this.cells[j * this.w + i];
      if (c !== 0 && c !== ignore) return false;
    }
    return true;
  }
  fill(x: number, y: number, w: number, h: number, v: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.cells[j * this.w + i] = v;
  }
  findSpot(w: number, h: number, rot: boolean): { x: number; y: number; rot: boolean } | null {
    for (const r of [rot, !rot]) {
      const ww = r ? h : w, hh = r ? w : h;
      for (let y = 0; y <= this.h - hh; y++) for (let x = 0; x <= this.w - ww; x++) if (this.fits(x, y, ww, hh)) return { x, y, rot: r };
    }
    return null;
  }
  used() { return this.cells.filter((c) => c > 0).length; }
}

let nextUid = 1;
export const newUid = () => nextUid++;
