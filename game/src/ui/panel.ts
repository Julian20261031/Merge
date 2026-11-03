// The hold: drag loot around the deck grid, into the safe box or the temporary pile, or overboard.
import { t } from '../i18n/zh';
import { Inventory, Item, Where, MODULES, DECK_W, DECK_H, PILE_CAP, iw, ih } from '../inventory/grid';
import { itemName } from '../inventory/items';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#22170f' : '#f1e6cc';
}

type Target = { kind: 'deck' | 'safe'; x: number; y: number; ok: boolean } | { kind: 'pile'; ok: boolean } | { kind: 'trash' } | { kind: 'none' };

export class Panel {
  wrap: HTMLElement;
  isOpen = false;
  onClose: (() => void) | null = null;
  onToast: ((m: string) => void) | null = null;
  private cs = 56;
  private deckEl: HTMLElement;
  private safeEl: HTMLElement;
  private pileEl: HTMLElement;
  private incomingBox: HTMLElement;
  private incomingEl: HTMLElement;
  private trashEl: HTMLElement;
  private infoEl: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private hullSvg: HTMLElement;
  private hl: HTMLElement;
  private drag: { it: Item; ghost: HTMLElement; offX: number; offY: number; sx: number; sy: number; t0: number; moved: boolean; rot: boolean; pid: number } | null = null;

  constructor(parent: HTMLElement, private inv: Inventory) {
    this.wrap = h('div', 'panel-wrap', parent);
    const panel = h('div', 'panel', this.wrap);
    h('header', 'panel-head', panel, `<b>${t('panelTitle')}</b><small>${t('slowmo')} · ${t('tapRotate')}</small>`);
    const body = h('div', 'panel-body', panel);
    const deckCol = h('div', 'deck-col', body);
    const hull = h('div', 'hull', deckCol);
    this.hullSvg = h('div', 'hull-svg', hull);
    this.deckEl = h('div', 'grid deck', hull);
    h('div', 'cap', deckCol, t('deck'));
    const side = h('div', 'side-col', body);
    const s1 = h('section', 'box safe-box', side, `<h3>${t('safeBox')}</h3><p>${t('safeHint')}</p>`);
    this.safeEl = h('div', 'grid safe', s1);
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

    inv.onChange(() => { if (this.isOpen) this.render(); });
    window.addEventListener('resize', () => { if (this.isOpen) { this.layout(); this.render(); } });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => {
      if (!this.drag || e.key.toLowerCase() !== 'r') return;
      this.drag.rot = !this.drag.rot;
      this.sizeGhost();
      this.onMove({ clientX: this.drag.sx, clientY: this.drag.sy, pointerId: this.drag.pid } as PointerEvent, true);
    });
  }

  open() {
    this.isOpen = true;
    this.wrap.classList.add('open');
    this.layout();
    this.render();
  }
  close() {
    if (this.inv.pending().length) { this.onToast?.(t('resolvePending')); return; }
    this.isOpen = false;
    this.wrap.classList.remove('open');
    this.cancelDrag();
    this.onClose?.();
  }

  private layout() {
    const portrait = window.innerHeight > window.innerWidth;
    const byH = (window.innerHeight - (portrait ? 330 : 150)) / (DECK_H + 1.4);
    const byW = portrait ? (window.innerWidth - 60) / 6.5 : (window.innerWidth - 120) / 9;
    this.cs = Math.round(Math.max(34, Math.min(66, byH, byW)));
    this.wrap.style.setProperty('--cs', `${this.cs}px`);
    const W = DECK_W * this.cs, H = DECK_H * this.cs, pad = this.cs * 0.42, bow = this.cs * 1.3;
    const tw = W + pad * 2, th = H + pad + bow;
    this.hullSvg.innerHTML = `<svg width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}"><path d="M${tw / 2} 2 C ${tw * 0.82} ${bow * 0.55}, ${tw - 3} ${bow}, ${tw - 3} ${bow + H * 0.35} L ${tw - 6} ${th - 4} L 6 ${th - 4} L 3 ${bow + H * 0.35} C 3 ${bow}, ${tw * 0.18} ${bow * 0.55}, ${tw / 2} 2 Z" fill="#a98d66" stroke="#22170f" stroke-width="3"/></svg>`;
    this.deckEl.style.left = `${pad}px`;
    this.deckEl.style.top = `${bow}px`;
    (this.deckEl.parentElement as HTMLElement).style.width = `${tw}px`;
    (this.deckEl.parentElement as HTMLElement).style.height = `${th}px`;
  }

  private tile(it: Item, fit?: number): HTMLElement {
    const cs = this.cs, w = iw(it), hh = ih(it);
    const k = fit ? Math.min(1, fit / Math.max(w, hh)) : 1;
    const d = h('div', `tile${it.def.rare ? ' rare' : ''}`);
    d.style.width = `${w * cs * k - 4}px`;
    d.style.height = `${hh * cs * k - 4}px`;
    d.style.background = it.def.color;
    d.style.color = inkFor(it.def.color);
    d.innerHTML = `<span>${itemName(it.def.kind)}</span><em>${it.def.value}</em>`;
    if (k < 1) d.classList.add('mini');
    d.addEventListener('pointerdown', (e) => this.onDown(e, it, d));
    return d;
  }

  render() {
    const cs = this.cs;
    // deck
    this.deckEl.innerHTML = '';
    this.deckEl.style.width = `${DECK_W * cs}px`;
    this.deckEl.style.height = `${DECK_H * cs}px`;
    for (const m of MODULES) {
      const d = h('div', 'module', this.deckEl, `<span>${t(m.key)}</span>`);
      Object.assign(d.style, { left: `${m.c * cs + 2}px`, top: `${m.r * cs + 2}px`, width: `${m.w * cs - 4}px`, height: `${m.h * cs - 4}px` });
      if (m.key === 'mod_safe') d.classList.add('safe-mod');
    }
    const place = (container: HTMLElement, it: Item) => {
      const d = this.tile(it);
      d.style.left = `${it.x * cs + 2}px`;
      d.style.top = `${it.y * cs + 2}px`;
      container.appendChild(d);
    };
    for (const it of this.inv.items) if (it.where === 'deck') place(this.deckEl, it);
    // safe box
    this.safeEl.innerHTML = '';
    this.safeEl.style.width = `${this.inv.safe.w * cs}px`;
    this.safeEl.style.height = `${this.inv.safe.h * cs}px`;
    for (const it of this.inv.items) if (it.where === 'safe') place(this.safeEl, it);
    // pile + incoming
    this.pileEl.innerHTML = '';
    const pile = this.inv.pile();
    for (let i = 0; i < PILE_CAP; i++) {
      const slot = h('div', 'slot', this.pileEl);
      if (pile[i]) slot.appendChild(this.tile(pile[i], 2));
    }
    const pend = this.inv.pending();
    this.incomingEl.innerHTML = '';
    this.incomingBox.style.display = pend.length ? '' : 'none';
    for (const it of pend) { const slot = h('div', 'slot', this.incomingEl); slot.appendChild(this.tile(it, 2)); }
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
    const ghost = h('div', 'tile ghost', document.body, tile.innerHTML);
    ghost.style.background = it.def.color;
    ghost.style.color = inkFor(it.def.color);
    if (it.def.rare) ghost.classList.add('rare');
    this.drag = {
      it, ghost, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, rot: it.rot, pid: e.pointerId,
      offX: mini ? (iw(it) * this.cs) / 2 : e.clientX - r.left,
      offY: mini ? (ih(it) * this.cs) / 2 : e.clientY - r.top,
    };
    this.sizeGhost();
    tile.classList.add('lifted');
    this.info(it);
    this.onMove(e, true);
  }

  private sizeGhost() {
    if (!this.drag) return;
    const { it, rot, ghost } = this.drag;
    const w = rot ? it.def.h : it.def.w, hh = rot ? it.def.w : it.def.h;
    ghost.style.width = `${w * this.cs - 4}px`;
    ghost.style.height = `${hh * this.cs - 4}px`;
  }

  private targetAt(px: number, py: number, left: number, top: number): Target {
    const d = this.drag!;
    const w = d.rot ? d.it.def.h : d.it.def.w, hh = d.rot ? d.it.def.w : d.it.def.h;
    const inside = (el: HTMLElement, pad = 0) => { const r = el.getBoundingClientRect(); return px >= r.left - pad && px <= r.right + pad && py >= r.top - pad && py <= r.bottom + pad; };
    if (inside(this.trashEl)) return { kind: 'trash' };
    for (const [kind, el] of [['deck', this.deckEl], ['safe', this.safeEl]] as const) {
      if (!inside(el, this.cs * 0.6)) continue;
      const r = el.getBoundingClientRect();
      const x = Math.round((left - r.left) / this.cs), y = Math.round((top - r.top) / this.cs);
      const g = this.inv.grid(kind as Where);
      return { kind, x, y, ok: g.fits(x, y, w, hh, d.it.uid) };
    }
    if (inside(this.pileEl.parentElement as HTMLElement)) return { kind: 'pile', ok: d.it.where === 'pile' || this.inv.pile().length < PILE_CAP };
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
    d.ghost.classList.toggle('bad', (tg.kind === 'deck' || tg.kind === 'safe' || tg.kind === 'pile') && !tg.ok);
    d.ghost.classList.toggle('trashing', tg.kind === 'trash');
    if ((tg.kind === 'deck' || tg.kind === 'safe') && d.moved) {
      const r = (tg.kind === 'deck' ? this.deckEl : this.safeEl).getBoundingClientRect();
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
      if (it.where === 'deck' || it.where === 'safe') {
        if (!this.inv.tryMove(it, it.where, it.x, it.y, !it.rot)) this.onToast?.(t('noFit'));
      } else { it.rot = !it.rot; this.inv.emit(); }
    } else {
      const left = e.clientX - d.offX, top = e.clientY - d.offY;
      const tg = this.targetAt(e.clientX, e.clientY, left, top);
      if (tg.kind === 'trash') this.inv.discard(it);
      else if (tg.kind === 'deck' || tg.kind === 'safe') { if (!this.inv.tryMove(it, tg.kind, tg.x, tg.y, d.rot)) this.onToast?.(t('noFit')); }
      else if (tg.kind === 'pile') { if (!this.inv.tryMove(it, 'pile', 0, 0, d.rot)) this.onToast?.(t('noFit')); }
      else this.render();
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
