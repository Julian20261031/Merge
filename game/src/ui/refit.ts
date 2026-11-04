// Refit screen over the 3D boat: pick a hull, then drag equipment and weapons from the tray at the bottom
// onto the deck grid. Modules on the deck can be tapped to rotate or dragged off the boat to take them down.
import { t, StrKey } from '../i18n/zh';
import { Layout, Placed, MODS, ModType, MOD_GROUP, pw, ph } from '../inventory/modules';
import { newUid } from '../inventory/grid';
import { HULLS, HULL_ORDER, HullDef } from '../boat/hulls';
import type { Game } from '../game';
import { ICONS } from './icons';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};
export const MOD_COLOR: Record<ModType, string> = { cannon: '#5d6764', gun: '#8c3b28', armor: '#2b5c9e', cargo: '#b89668', fuel: '#a8402a', engine: '#3a3833', safe: '#d6a92a' };
const shape = (w: number, hh: number, color: string) =>
  `<i class="shape" style="--w:${w};--h:${hh}">${'<b></b>'.repeat(w * hh).replace(/<b>/g, `<b style="background:${color}">`)}</i>`;
const hullShape = (H: HullDef) => `<i class="shape hull-shape" style="--w:${H.w};--h:${H.h}">${'<b></b>'.repeat(H.w * H.h)}</i>`;

type Tab = 'hull' | 'equip' | 'weapon';
const EQUIP: ModType[] = ['cargo', 'fuel', 'armor'];
const WEAPON: ModType[] = ['cannon', 'gun'];

interface Drag { p: Placed; isNew: boolean; ghost: HTMLElement; sx: number; sy: number; t0: number; moved: boolean; pid: number; touch: boolean; drop: { c: number; r: number; on: boolean } | null }

export class Refit {
  root: HTMLElement;
  onClose: (() => void) | null = null;
  onChange: (() => void) | null = null;
  private tab: Tab = 'equip';
  private tabs = new Map<Tab, HTMLButtonElement>();
  private stats: HTMLElement;
  private info: HTMLElement;
  private hint: HTMLElement;
  private list: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private drag: Drag | null = null;

  constructor(parent: HTMLElement, private layout: Layout, private game: Game, private level: () => number) {
    this.root = h('div', 'refit', parent);
    this.root.style.display = 'none';
    const head = h('header', 'refit-head', this.root);
    const back = h('button', 'btn-back', head, `${ICONS.back}<span>${t('back')}</span>`) as HTMLButtonElement;
    back.type = 'button';
    back.addEventListener('click', () => this.close());
    h('b', 'refit-title', head, t('tabDock'));
    // left: the three refit modes, stacked
    const seg = h('nav', 'refit-tabs', this.root);
    for (const [k, key, icon] of [['hull', 'tabHull', 'ship'], ['equip', 'tabEquip', 'crate'], ['weapon', 'tabWeapon', 'gun']] as [Tab, StrKey, keyof typeof ICONS][]) {
      const b = h('button', '', seg, `${ICONS[icon]}<span>${t(key)}</span>`) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => this.setTab(k));
      this.tabs.set(k, b);
    }
    // right: what you picked, then the boat's numbers
    const side = h('aside', 'refit-side', this.root);
    this.info = h('div', 'refit-info', side);
    this.stats = h('dl', 'refit-stats', side);
    // the deck: touches here pick up modules already on the boat
    const deck = h('div', 'refit-deck', this.root);
    deck.addEventListener('pointerdown', (e) => this.onDeckDown(e));
    const tray = h('div', 'tray', this.root);
    this.hint = h('p', 'tray-hint', tray);
    this.list = h('div', 'tray-list', tray);
    this.toastEl = h('div', 'toast hub-toast', this.root);
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  open() { this.root.style.display = ''; this.info.innerHTML = ''; this.setTab(this.tab); }
  close() {
    this.root.style.display = 'none';
    this.game.setRefit('off');
    this.onClose?.();
  }
  private setTab(k: Tab, keepInfo = false) {
    if (!keepInfo) this.info.innerHTML = '';
    this.tab = k;
    this.game.setRefit(k);
    this.render();
  }
  private toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }
  private changed() { this.onChange?.(); this.render(); }

  render() {
    const L = this.layout, H = L.hull;
    this.tabs.forEach((b, k) => b.classList.toggle('on', k === this.tab));
    const weapons = L.count('cannon') + L.count('gun');
    this.stats.innerHTML = `<dt>${t('hullHp')}</dt><dd>${H.hp}</dd><dt>${t('speed')}</dt><dd>${H.speed}</dd><dt>${t('fuelMax')}</dt><dd>${L.fuelMax()}</dd>`
      + `<dt>${t('cargoCells')}</dt><dd>${L.cargoCells()}</dd><dt>${t('weapons')}</dt><dd>${weapons}</dd><dt>${t('armor')}</dt><dd>${L.count('armor')}</dd>`;
    this.list.innerHTML = '';
    if (this.tab === 'hull') {
      this.hint.textContent = t('hullHint');
      for (const id of HULL_ORDER) this.hullCard(HULLS[id]);
      return;
    }
    this.hint.textContent = t('refitHint');
    for (const type of this.tab === 'equip' ? EQUIP : WEAPON) this.modCard(type);
  }

  private hullCard(Hd: HullDef) {
    const cur = this.layout.hull.id === Hd.id, locked = this.level() < Hd.unlock;
    const c = h('button', `card-h${cur ? ' on' : ''}${locked ? ' locked' : ''}`, this.list,
      `${hullShape(Hd)}<span class="ct"><b>${t(Hd.name)}</b><small>${t('deckSize')} ${Hd.w}×${Hd.h} · ${t('hullHp')} ${Hd.hp} · ${t('speed')} ${Hd.speed}</small>`
      + `<em>${cur ? t('inUse') : locked ? `${ICONS.lock} Lv.${Hd.unlock} ${t('unlockLv')}` : t('useHull')}</em></span>`) as HTMLButtonElement;
    c.type = 'button';
    c.addEventListener('click', () => {
      this.info.innerHTML = `<b>${t(Hd.name)}</b><span>${t(Hd.desc)}</span>`;
      if (cur || locked) return;
      this.layout.setHull(Hd);
      this.changed();
    });
  }

  private modCard(type: ModType) {
    const def = MODS[type], n = this.layout.spare(type), on = this.layout.count(type);
    const c = h('div', `card-m${n <= 0 ? ' empty' : ''}`, this.list,
      `${shape(def.w, def.h, MOD_COLOR[type])}<span class="ct"><b>${t(def.key)}</b><small>${t('installed')} ${on} · ${t('spare')} ${Math.max(0, n)}</small></span>`);
    c.addEventListener('pointerdown', (e) => {
      this.showInfo(type);
      if (n <= 0) { this.toast(t('noSpare')); return; }
      e.preventDefault();
      this.startDrag({ uid: newUid(), type, c: 0, r: 0, rot: false }, true, e);
    });
  }

  private showInfo(type: ModType) { this.info.innerHTML = `<b>${t(MODS[type].key)}</b><span>${t(MODS[type].desc)}</span>`; }

  private onDeckDown(e: PointerEvent) {
    if (this.drag || this.tab === 'hull') return;
    const at = this.game.deckAt(e.clientX, e.clientY);
    if (!at) return;
    const c = Math.floor(at.c), r = Math.floor(at.r), H = this.layout.hull;
    if (c < 0 || r < 0 || c >= H.w || r >= H.h) return;
    const p = this.layout.at(c, r);
    if (!p) return;
    this.showInfo(p.type);
    if (MODS[p.type].fixed) { this.toast(t('fixedMod')); return; }
    // modules belong to a tab; switch so the tray matches what you are holding
    if (MOD_GROUP[p.type] !== this.tab) this.setTab(MOD_GROUP[p.type], true);
    e.preventDefault();
    this.startDrag(p, false, e);
  }

  private startDrag(p: Placed, isNew: boolean, e: PointerEvent) {
    const cs = 26;
    const ghost = h('div', 'refit-ghost', document.body, shape(pw(p), ph(p), MOD_COLOR[p.type]));
    ghost.style.setProperty('--cs', `${cs}px`);
    this.drag = { p, isNew, ghost, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: isNew, pid: e.pointerId, touch: e.pointerType !== 'mouse', drop: null };
    this.onMove(e, true);
  }

  private onMove(e: PointerEvent, force = false) {
    const d = this.drag;
    if (!d || (!force && e.pointerId !== d.pid)) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.moved = true;
    // lift the drop point above a finger so the module isn't hidden under it
    const lift = d.touch ? 44 : 0, x = e.clientX, y = e.clientY - lift;
    d.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(-3deg)`;
    d.ghost.classList.toggle('show', d.moved);
    if (!d.moved) return;
    const at = this.game.deckAt(x, y), H = this.layout.hull, w = pw(d.p), hh = ph(d.p);
    if (!at) { d.drop = null; this.game.showFootprint(0, 0, 0, 0, null); return; }
    const on = at.c > -0.6 && at.r > -0.6 && at.c < H.w + 0.6 && at.r < H.h + 0.6;
    const c = Math.round(at.c - w / 2), r = Math.round(at.r - hh / 2);
    d.drop = { c, r, on };
    if (!on) { this.game.showFootprint(0, 0, 0, 0, null); d.ghost.classList.toggle('off', !d.isNew); return; }
    d.ghost.classList.remove('off');
    const ok = this.layout.grid.fits(c, r, w, hh, d.p.uid);
    const cc = Math.max(0, Math.min(H.w - w, c)), rr = Math.max(0, Math.min(H.h - hh, r));
    this.game.showFootprint(ok ? c : cc, ok ? r : rr, w, hh, ok);
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const L = this.layout;
    d.ghost.remove();
    this.drag = null;
    this.game.showFootprint(0, 0, 0, 0, null);
    if (!d.moved && performance.now() - d.t0 < 400) {
      if (!d.isNew && !L.move(d.p, d.p.c, d.p.r, !d.p.rot)) this.toast(t('noFit'));
    } else if (d.drop?.on) {
      const ok = d.isNew ? L.place({ ...d.p, c: d.drop.c, r: d.drop.r }) : L.move(d.p, d.drop.c, d.drop.r, d.p.rot);
      if (!ok) this.toast(t('noFit'));
    } else if (!d.isNew) L.remove(d.p);
    this.changed();
  }
}
