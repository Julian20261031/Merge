// The hold during a run: arrange loot inside the cargo boxes, the safe box and the temporary pile, or throw it overboard.
// The ship layout itself cannot be changed here — only at the dock.
import { t } from '../i18n/zh';
import { Hold, Item, Container, PILE_CAP, iw, ih } from '../inventory/hold';
import { itemName } from '../inventory/items';
import { view } from '../core/view';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

export function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#22170f' : '#f1e6cc';
}
const sideName = (s: number) => (s < 0 ? t('sidePort') : s > 0 ? t('sideStar') : t('sideMid'));

type Target = { kind: 'grid'; id: string; x: number; y: number; ok: boolean } | { kind: 'pile'; ok: boolean } | { kind: 'trash' } | { kind: 'none' };

export class Panel {
  wrap: HTMLElement;
  isOpen = false;
  onClose: (() => void) | null = null;
  onToast: ((m: string) => void) | null = null;
  private cs = 40;
  private gridsEl: HTMLElement;
  private gridEls = new Map<string, HTMLElement>();
  private pileEl: HTMLElement;
  private incomingBox: HTMLElement;
  private incomingEl: HTMLElement;
  private trashEl: HTMLElement;
  private infoEl: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private hl: HTMLElement;
  private drag: { it: Item; ghost: HTMLElement; offX: number; offY: number; sx: number; sy: number; t0: number; moved: boolean; rot: boolean; pid: number } | null = null;

  constructor(parent: HTMLElement, private hold: Hold) {
    this.wrap = h('div', 'panel-wrap', parent);
    const panel = h('div', 'panel', this.wrap);
    h('header', 'panel-head', panel, `<b>${t('panelTitle')}</b><small>${t('slowmo')} · ${t('tapRotate')}</small>`);
    const body = h('div', 'panel-body', panel);
    this.gridsEl = h('div', 'grids', body);
    const side = h('div', 'side-col', body);
    const s2 = h('section', 'box pile-box', side, `<h3>${t('pile')}</h3><p>${t('pileHint')}</p>`);
    this.pileEl = h('div', 'pile', s2);
    this.incomingBox = h('section', 'box incoming-box', side, `<h3>${t('incoming')}</h3>`);
    this.incomingEl = h('div', 'pile incoming', this.incomingBox);
    this.trashEl = h('div', 'trash', side, t('trash'));
    this.infoEl = h('div', 'info', side);
    this.closeBtn = h('button', 'btn-close', side) as HTMLButtonElement;
    this.closeBtn.type = 'button';
    this.closeBtn.addEventListener('click', () => this.close());
    this.hl = h('div', 'drop-hl', document.body);

    hold.onChange(() => { if (this.isOpen) this.render(); });
    window.addEventListener('resize', () => { if (this.isOpen) { this.layout(); this.render(); } });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  open() {
    this.isOpen = true;
    this.wrap.classList.add('open');
    this.layout();
    this.render();
  }
  close() {
    if (this.hold.pending().length) { this.onToast?.(t('resolvePending')); return; }
    this.isOpen = false;
    this.wrap.classList.remove('open');
    this.cancelDrag();
    this.onClose?.();
  }

  /** Cell size so the whole hold fits a landscape phone without scrolling where possible. */
  private layout() {
    const n = this.hold.containers.length;
    const byH = (view.h - 150) / 3.9;
    const byW = (view.w - 300) / (n * 3.6);
    this.cs = Math.round(Math.max(26, Math.min(52, byH, byW)));
    this.wrap.style.setProperty('--cs', `${this.cs}px`);
  }

  private tile(it: Item, fit?: number): HTMLElement {
    const cs = this.cs, w = iw(it), hh = ih(it);
    const k = fit ? Math.min(1, fit / Math.max(w, hh)) : 1;
    const d = h('div', `tile${it.def.rare ? ' rare' : ''}${k < 1 ? ' mini' : ''}`);
    d.style.width = `${w * cs * k - 4}px`;
    d.style.height = `${hh * cs * k - 4}px`;
    d.style.background = it.def.color;
    d.style.color = inkFor(it.def.color);
    d.innerHTML = `<span>${itemName(it.def.kind)}</span><em>${it.def.value}</em>`;
    d.addEventListener('pointerdown', (e) => this.onDown(e, it, d));
    return d;
  }

  render() {
    const cs = this.cs;
    this.gridsEl.innerHTML = '';
    this.gridEls.clear();
    for (const c of this.hold.containers) {
      const box = h('section', `box cont${c.safe ? ' safe-box' : ''}`, this.gridsEl);
      h('h3', '', box, c.safe ? t('safeBox') : `${t('cargo')} ${c.index + 1}<small>${sideName(c.side)}</small>`);
      if (c.safe) h('p', '', box, t('safeHint'));
      const g = h('div', `grid${c.safe ? ' safe' : ''}`, box);
      g.style.width = `${c.grid.w * cs}px`;
      g.style.height = `${c.grid.h * cs}px`;
      this.gridEls.set(c.id, g);
      for (const it of this.hold.items) {
        if (it.where !== c.id) continue;
        const d = this.tile(it);
        d.style.left = `${it.x * cs + 2}px`;
        d.style.top = `${it.y * cs + 2}px`;
        g.appendChild(d);
      }
    }
    this.pileEl.innerHTML = '';
    const pile = this.hold.pile();
    for (let i = 0; i < PILE_CAP; i++) {
      const slot = h('div', 'slot', this.pileEl);
      if (pile[i]) slot.appendChild(this.tile(pile[i], 1.6));
    }
    const pend = this.hold.pending();
    this.incomingEl.innerHTML = '';
    this.incomingBox.style.display = pend.length ? '' : 'none';
    for (const it of pend) h('div', 'slot', this.incomingEl).appendChild(this.tile(it, 1.6));
    this.closeBtn.textContent = pend.length ? t('resolvePending') : t('close');
    this.closeBtn.classList.toggle('blocked', pend.length > 0);
  }

  private info(it: Item) {
    this.infoEl.innerHTML = `<b>${itemName(it.def.kind)}</b>${it.def.rare ? `<i>${t('rare')}</i>` : ''}<span>${t('value')} ${it.def.value} · ${t('weight')} ${it.def.weight} · ${t('size')} ${iw(it)}×${ih(it)}</span>`;
  }

  private onDown(e: PointerEvent, it: Item, tile: HTMLElement) {
    if (this.drag) return;
    e.preventDefault();
    e.stopPropagation();
    const r = tile.getBoundingClientRect();
    const mini = tile.classList.contains('mini');
    const ghost = h('div', `tile ghost${it.def.rare ? ' rare' : ''}`, document.body, tile.innerHTML);
    ghost.style.background = it.def.color;
    ghost.style.color = inkFor(it.def.color);
    this.drag = {
      it, ghost, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, rot: it.rot, pid: e.pointerId,
      offX: mini ? (iw(it) * this.cs) / 2 : e.clientX - r.left,
      offY: mini ? (ih(it) * this.cs) / 2 : e.clientY - r.top,
    };
    const w = iw(it), hh = ih(it);
    ghost.style.width = `${w * this.cs - 4}px`;
    ghost.style.height = `${hh * this.cs - 4}px`;
    tile.classList.add('lifted');
    this.info(it);
    this.onMove(e, true);
  }

  private targetAt(px: number, py: number, left: number, top: number): Target {
    const d = this.drag!;
    const w = d.rot ? d.it.def.h : d.it.def.w, hh = d.rot ? d.it.def.w : d.it.def.h;
    const inside = (el: HTMLElement, pad = 0) => { const r = el.getBoundingClientRect(); return px >= r.left - pad && px <= r.right + pad && py >= r.top - pad && py <= r.bottom + pad; };
    if (inside(this.trashEl)) return { kind: 'trash' };
    for (const c of this.hold.containers as Container[]) {
      const el = this.gridEls.get(c.id);
      if (!el || !inside(el, this.cs * 0.5)) continue;
      const r = el.getBoundingClientRect();
      const x = Math.round((left - r.left) / this.cs), y = Math.round((top - r.top) / this.cs);
      return { kind: 'grid', id: c.id, x, y, ok: c.grid.fits(x, y, w, hh, d.it.uid) };
    }
    if (inside(this.pileEl.parentElement as HTMLElement)) return { kind: 'pile', ok: d.it.where === 'pile' || this.hold.pile().length < PILE_CAP };
    return { kind: 'none' };
  }

  private onMove(e: PointerEvent, force = false) {
    const d = this.drag;
    if (!d || (!force && e.pointerId !== d.pid)) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.moved = true;
    const left = e.clientX - d.offX, top = e.clientY - d.offY;
    d.ghost.style.left = `${left}px`;
    d.ghost.style.top = `${top}px`;
    const tg = this.targetAt(e.clientX, e.clientY, left, top);
    d.ghost.classList.toggle('bad', (tg.kind === 'grid' || tg.kind === 'pile') && !tg.ok);
    d.ghost.classList.toggle('trashing', tg.kind === 'trash');
    if (tg.kind === 'grid' && d.moved) {
      const r = this.gridEls.get(tg.id)!.getBoundingClientRect();
      const w = d.rot ? d.it.def.h : d.it.def.w, hh = d.rot ? d.it.def.w : d.it.def.h;
      Object.assign(this.hl.style, { display: 'block', left: `${r.left + tg.x * this.cs}px`, top: `${r.top + tg.y * this.cs}px`, width: `${w * this.cs}px`, height: `${hh * this.cs}px` });
      this.hl.classList.toggle('bad', !tg.ok);
    } else this.hl.style.display = 'none';
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const it = d.it;
    if (!d.moved && performance.now() - d.t0 < 400) {
      // tap = rotate in place
      if (it.where && it.where !== 'pile') {
        if (!this.hold.tryMove(it, it.where, it.x, it.y, !it.rot)) this.onToast?.(t('noFit'));
      } else { it.rot = !it.rot; this.hold.emit(); }
    } else {
      const tg = this.targetAt(e.clientX, e.clientY, e.clientX - d.offX, e.clientY - d.offY);
      if (tg.kind === 'trash') this.hold.discard(it);
      else if (tg.kind === 'grid') { if (!this.hold.tryMove(it, tg.id, tg.x, tg.y, d.rot)) this.onToast?.(t('noFit')); }
      else if (tg.kind === 'pile') { if (!this.hold.tryMove(it, 'pile', 0, 0, d.rot)) this.onToast?.(t('noFit')); }
    }
    this.cancelDrag();
    if (this.isOpen) this.render();
  }

  private cancelDrag() {
    if (this.drag) this.drag.ghost.remove();
    this.drag = null;
    this.hl.style.display = 'none';
  }
}
