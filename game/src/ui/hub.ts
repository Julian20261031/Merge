// Between runs: pick where to sail, refit the ship layout at the dock, look over what you have brought home.
import { t, StrKey } from '../i18n/zh';
import { Layout, Placed, MODS, ModType, DECK_W, DECK_H, pw, ph } from '../inventory/modules';
import { newUid } from '../inventory/grid';
import { ITEMS, ItemKind, itemName } from '../inventory/items';
import { MAPS, MapDef } from '../world/maps';
import { inkFor } from './panel';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};
const MOD_COLOR: Record<ModType, string> = { cannon: '#5d6764', gun: '#8c3b28', armor: '#2b5c9e', cargo: '#b89668', fuel: '#a8402a', engine: '#3a3833', safe: '#d6a92a' };
const level = (n: number) => t((['low', 'mid', 'high'] as StrKey[])[Math.max(0, Math.min(2, n))]);

type Tab = 'sail' | 'dock' | 'stash';

export class Hub {
  root: HTMLElement;
  onDepart: ((m: MapDef) => void) | null = null;
  onSave: (() => void) | null = null;
  private tab: Tab = 'sail';
  private main: HTMLElement;
  private totalEl: HTMLElement;
  private navBtns = new Map<Tab, HTMLButtonElement>();
  private cs = 40;
  private drag: { p: Placed; isNew: boolean; ghost: HTMLElement; offX: number; offY: number; sx: number; sy: number; t0: number; moved: boolean; pid: number } | null = null;
  private deckEl: HTMLElement | null = null;
  private hl: HTMLElement;

  constructor(parent: HTMLElement, private layout: Layout, private stash: Record<string, number>, private lifetime: () => number) {
    this.root = h('div', 'hub', parent);
    const head = h('header', 'hub-head', this.root, `<b>${t('hubTitle')}</b><small>${t('hubSub')}</small>`);
    this.totalEl = h('span', 'hub-total', head);
    const nav = h('nav', 'hub-nav', this.root);
    for (const [k, label] of [['sail', 'tabSail'], ['dock', 'tabDock'], ['stash', 'tabStash']] as [Tab, StrKey][]) {
      const b = h('button', '', nav, t(label)) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => { this.tab = k; this.render(); });
      this.navBtns.set(k, b);
    }
    this.main = h('main', 'hub-main', this.root);
    this.hl = h('div', 'drop-hl', document.body);
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('resize', () => { if (this.root.style.display !== 'none') this.render(); });
  }

  show(tab?: Tab) { if (tab) this.tab = tab; this.root.style.display = ''; this.render(); }
  hide() { this.root.style.display = 'none'; }

  render() {
    this.totalEl.innerHTML = `${t('totalValue')} <b>${this.lifetime().toLocaleString('en-US')}</b>`;
    this.navBtns.forEach((b, k) => b.classList.toggle('on', k === this.tab));
    this.main.innerHTML = '';
    this.deckEl = null;
    if (this.tab === 'sail') this.renderSail();
    else if (this.tab === 'dock') this.renderDock();
    else this.renderStash();
  }

  private renderSail() {
    const wrap = h('div', 'maps', this.main);
    if (!this.layout.count('cargo')) h('p', 'warn', this.main, t('noCargoWarn'));
    MAPS.forEach((m, i) => {
      const c = h('section', `map-card d${m.danger}`, wrap);
      h('h2', '', c, t(m.name));
      h('p', '', c, t(m.desc));
      h('dl', '', c, `<dt>${t('richness')}</dt><dd>${level(i)}</dd><dt>${t('danger')}</dt><dd>${level(m.danger - 1)}<small>${t('dangerSoon')}</small></dd><dt>${t('area')}</dt><dd>${[t('small'), t('mid'), t('big')][i]}</dd>`);
      const b = h('button', 'btn-primary', c, t('depart')) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => this.onDepart?.(m));
    });
  }

  private renderStash() {
    const kinds = Object.keys(this.stash).filter((k) => this.stash[k] > 0) as ItemKind[];
    const box = h('div', 'stash', this.main);
    if (!kinds.length) { h('p', 'empty', box, t('stashEmpty')); return; }
    const ul = h('ul', 'stash-list', box);
    let total = 0;
    kinds.sort((a, b) => ITEMS[b].value * this.stash[b] - ITEMS[a].value * this.stash[a]).forEach((k) => {
      const d = ITEMS[k], v = d.value * this.stash[k];
      total += v;
      h('li', d.rare ? 'rare' : '', ul, `<i style="background:${d.color}"></i><span>${itemName(k)}</span><em>×${this.stash[k]}</em><b>${v}</b>`);
    });
    h('div', 'stash-total', box, `<span>${t('value')}</span><b>${total}</b>`);
    h('p', 'note', box, t('stashNote'));
  }

  // ---------------------------------------------------------------- dock editor
  private renderDock() {
    const L = this.layout;
    const byH = (window.innerHeight - 130) / (DECK_H + 1.5);
    this.cs = Math.round(Math.max(28, Math.min(54, byH)));
    const cs = this.cs;
    const body = h('div', 'dock', this.main);
    body.style.setProperty('--cs', `${cs}px`);
    // hull with the layout grid
    const W = DECK_W * cs, H = DECK_H * cs, pad = cs * 0.42, bow = cs * 1.3, tw = W + pad * 2, th = H + pad + bow;
    const hull = h('div', 'hull', body);
    hull.style.width = `${tw}px`;
    hull.style.height = `${th}px`;
    h('div', 'hull-svg', hull, `<svg width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}"><path d="M${tw / 2} 2 C ${tw * 0.82} ${bow * 0.55}, ${tw - 3} ${bow}, ${tw - 3} ${bow + H * 0.35} L ${tw - 6} ${th - 4} L 6 ${th - 4} L 3 ${bow + H * 0.35} C 3 ${bow}, ${tw * 0.18} ${bow * 0.55}, ${tw / 2} 2 Z" fill="#a98d66" stroke="#22170f" stroke-width="3"/></svg>`);
    const deck = h('div', 'grid deck', hull);
    Object.assign(deck.style, { left: `${pad}px`, top: `${bow}px`, width: `${W}px`, height: `${H}px` });
    this.deckEl = deck;
    for (const p of L.placed) {
      const d = this.modTile(p, false);
      Object.assign(d.style, { left: `${p.c * cs + 2}px`, top: `${p.r * cs + 2}px` });
      deck.appendChild(d);
    }
    // spare modules + stats
    const side = h('div', 'dock-side', body);
    h('p', 'hint', side, t('dockHint'));
    h('h3', '', side, t('spare'));
    const pal = h('div', 'palette', side);
    for (const type of ['cargo', 'fuel', 'cannon', 'gun', 'armor'] as ModType[]) {
      const n = L.spare(type);
      if (n <= 0) continue;
      const cell = h('div', 'pal-cell', pal);
      const tile = this.modTile({ uid: 0, type, c: 0, r: 0, rot: false }, true);
      cell.appendChild(tile);
      h('em', '', cell, `×${n}`);
    }
    if (!pal.children.length) h('p', 'note', pal, '—');
    const weapons = L.count('cannon') + L.count('gun');
    h('dl', 'stats', side, `<dt>${t('fuelMax')}</dt><dd>${L.fuelMax()}</dd><dt>${t('cargoCells')}</dt><dd>${L.cargoCells()} ${t('cells')}</dd><dt>${t('weapons')}</dt><dd>${weapons}</dd><dt>${t('armor')}</dt><dd>${L.count('armor')}</dd>`);
    h('div', 'info', side).id = 'dock-info';
  }

  private modTile(p: Placed, isNew: boolean): HTMLElement {
    const def = MODS[p.type], cs = this.cs;
    const d = h('div', `tile mod-tile${def.fixed ? ' fixed' : ''}`);
    d.style.width = `${pw(p) * cs - 4}px`;
    d.style.height = `${ph(p) * cs - 4}px`;
    d.style.background = MOD_COLOR[p.type];
    d.style.color = inkFor(MOD_COLOR[p.type]);
    d.innerHTML = `<span>${t(def.key)}</span>`;
    if (isNew) d.style.position = 'relative';
    d.addEventListener('pointerdown', (e) => {
      const info = document.getElementById('dock-info');
      if (info) info.innerHTML = `<b>${t(def.key)}</b><span>${t(def.desc)}</span>`;
      if (def.fixed || this.drag) return;
      e.preventDefault();
      const r = d.getBoundingClientRect();
      const placed: Placed = isNew ? { uid: newUid(), type: p.type, c: 0, r: 0, rot: false } : p;
      const ghost = h('div', 'tile mod-tile ghost', document.body, d.innerHTML);
      Object.assign(ghost.style, { background: d.style.background, color: d.style.color, width: d.style.width, height: d.style.height });
      this.drag = { p: placed, isNew, ghost, offX: e.clientX - r.left, offY: e.clientY - r.top, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, pid: e.pointerId };
      d.classList.add('lifted');
      this.onMove(e, true);
    });
    return d;
  }

  private cellAt(left: number, top: number) {
    const r = this.deckEl!.getBoundingClientRect();
    return { c: Math.round((left - r.left) / this.cs), r: Math.round((top - r.top) / this.cs), rect: r };
  }

  private onMove(e: PointerEvent, force = false) {
    const d = this.drag;
    if (!d || !this.deckEl || (!force && e.pointerId !== d.pid)) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.moved = true;
    const left = e.clientX - d.offX, top = e.clientY - d.offY;
    d.ghost.style.left = `${left}px`;
    d.ghost.style.top = `${top}px`;
    const { c, r, rect } = this.cellAt(left, top);
    const over = e.clientX > rect.left - this.cs && e.clientX < rect.right + this.cs && e.clientY > rect.top - this.cs && e.clientY < rect.bottom + this.cs;
    if (over && d.moved) {
      const ok = this.layout.grid.fits(c, r, pw(d.p), ph(d.p), d.p.uid);
      Object.assign(this.hl.style, { display: 'block', left: `${rect.left + c * this.cs}px`, top: `${rect.top + r * this.cs}px`, width: `${pw(d.p) * this.cs}px`, height: `${ph(d.p) * this.cs}px` });
      this.hl.classList.toggle('bad', !ok);
      d.ghost.classList.remove('trashing');
    } else {
      this.hl.style.display = 'none';
      d.ghost.classList.toggle('trashing', d.moved && !d.isNew);
    }
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const L = this.layout;
    if (!d.moved && performance.now() - d.t0 < 400) {
      if (!d.isNew) L.move(d.p, d.p.c, d.p.r, !d.p.rot);   // tap = rotate in place if it fits
    } else if (this.deckEl) {
      const { c, r, rect } = this.cellAt(e.clientX - d.offX, e.clientY - d.offY);
      const over = e.clientX > rect.left - this.cs && e.clientX < rect.right + this.cs && e.clientY > rect.top - this.cs && e.clientY < rect.bottom + this.cs;
      if (over) {
        if (d.isNew) { d.p.c = c; d.p.r = r; L.place(d.p); } else L.move(d.p, c, r, d.p.rot);
      } else if (!d.isNew) L.remove(d.p);   // dragged off the hull: back to the spares
    }
    d.ghost.remove();
    this.drag = null;
    this.hl.style.display = 'none';
    this.onSave?.();
    this.render();
  }
}
