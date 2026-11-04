// The camp main screen over the calm anchorage: captain card, activities, dock / stash, and the big "set sail" button.
// Dock, stash and the sea chart open as sheets over the same backdrop.
import { t, StrKey } from '../i18n/zh';
import { Layout } from '../inventory/modules';
import { ITEMS, ItemKind, itemName } from '../inventory/items';
import { MAPS, MapDef } from '../world/maps';
import { levelOf } from '../core/progress';
import { AVATAR, ICONS } from './icons';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};
const btn = (cls: string, parent: HTMLElement, html: string, on: () => void) => {
  const b = h('button', cls, parent, html) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', on);
  return b;
};
const enemyList = (m: MapDef) => (Object.keys(m.enemies) as (keyof MapDef['enemies'])[]).filter((k) => m.enemies[k] > 0).map((k) => `${t(`enemy_${k}` as StrKey)}×${m.enemies[k]}`).join(' ') || t('noEnemies');
const level = (n: number) => t((['low', 'mid', 'high'] as StrKey[])[Math.max(0, Math.min(2, n))]);
const pips = (n: number) => `<i class="pips">${[1, 2, 3].map((k) => `<b class="${k <= n ? 'on' : ''}"></b>`).join('')}</i>`;

type Sheet = 'maps' | 'stash' | null;
export interface Profile { xp: number; lifetime: number; mapId: string }

export class Hub {
  root: HTMLElement;
  onDepart: ((m: MapDef) => void) | null = null;
  onPickMap: ((m: MapDef) => void) | null = null;
  onRefit: (() => void) | null = null;
  private sheet: Sheet = null;
  private home: HTMLElement;
  private sheetEl: HTMLElement;
  private sheetTitle: HTMLElement;
  private main: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;

  constructor(parent: HTMLElement, private layout: Layout, private stash: Record<string, number>, private profile: () => Profile) {
    this.root = h('div', 'hub', parent);
    this.home = h('div', 'home', this.root);
    const sh = h('div', 'sheet', this.root);
    this.sheetEl = sh;
    const bar = h('header', 'sheet-head', sh);
    btn('btn-back', bar, `${ICONS.back}<span>${t('back')}</span>`, () => this.open(null));
    this.sheetTitle = h('b', '', bar);
    this.main = h('main', 'sheet-main', sh);
    this.toastEl = h('div', 'toast hub-toast', this.root);

  }

  show() { this.sheet = null; this.root.style.display = ''; this.render(); }
  hide() { this.root.style.display = 'none'; }
  open(s: Sheet) { this.sheet = s; this.render(); }

  private toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  private get map() { return MAPS.find((m) => m.id === this.profile().mapId) ?? MAPS[0]; }

  render() {
    this.renderHome();
    this.sheetEl.classList.toggle('open', !!this.sheet);
    this.home.classList.toggle('dim', !!this.sheet);
    this.main.innerHTML = '';
    if (!this.sheet) return;
    this.sheetTitle.textContent = t(this.sheet === 'maps' ? 'chartTitle' : 'tabStash');
    if (this.sheet === 'maps') this.renderMaps();
    else this.renderStash();
  }

  private renderHome() {
    const H = this.home, P = this.profile(), L = levelOf(P.xp), m = this.map;
    H.innerHTML = '';
    // top left: captain
    const me = h('section', 'me', H);
    h('div', 'me-face', me, `${AVATAR}<b>${L.lv}</b>`);
    const info = h('div', 'me-info', me);
    h('div', 'me-name', info, `${t('captainName')}<small>${t('lv')} ${L.lv}</small>`);
    h('div', 'me-xp', info, `<i style="width:${(L.into / L.need) * 100}%"></i><span>${L.into} / ${L.need}</span>`);
    h('div', 'me-total', info, `${ICONS.coin}<span>${t('totalValue')}</span><b>${P.lifetime.toLocaleString('en-US')}</b>`);
    // top right: activities (not built yet)
    const ev = h('nav', 'events', H);
    for (const [icon, key] of [['task', 'evDaily'], ['flag', 'evExpedition'], ['tent', 'evCamp'], ['bell', 'evNews']] as [keyof typeof ICONS, StrKey][]) {
      btn('ev', ev, `<i>${ICONS[icon]}</i><span>${t(key)}</span><em>${ICONS.lock}</em>`, () => this.toast(`${t(key)} · ${t('comingSoon')}`));
    }
    // bottom left: dock and stash
    const left = h('nav', 'home-left', H);
    btn('sq', left, `<i>${ICONS.ship}</i><span>${t('tabDock')}</span>`, () => this.onRefit?.());
    const n = Object.values(this.stash).reduce((a, b) => a + b, 0);
    btn('sq', left, `<i>${ICONS.crate}</i><span>${t('tabStash')}</span>${n ? `<em>${n}</em>` : ''}`, () => this.open('stash'));
    // bottom right: where to, and go
    const go = h('div', 'home-go', H);
    btn('sea-chip', go, `<small>${t('area')}</small><b>${t(m.name)}</b>${pips(m.danger)}${ICONS.swap}`, () => this.open('maps'));
    if (!this.layout.count('cargo')) h('p', 'warn', go, t('noCargoWarn'));
    btn('btn-go', go, `<b>${t('setSail')}</b><small>${t('setSailSub')}</small>${ICONS.helm}`, () => this.onDepart?.(m));
  }

  private renderMaps() {
    const wrap = h('div', 'maps', this.main);
    const cur = this.map;
    MAPS.forEach((m, i) => {
      const c = h('section', `map-card d${m.danger}${m === cur ? ' on' : ''}`, wrap);
      h('h2', '', c, `${t(m.name)}${pips(m.danger)}`);
      h('p', '', c, t(m.desc));
      h('dl', '', c, `<dt>${t('richness')}</dt><dd>${level(i)}</dd><dt>${t('danger')}</dt><dd>${level(m.danger - 1)}<small>${enemyList(m)}</small></dd><dt>${t('area')}</dt><dd>${[t('small'), t('mid'), t('big')][i]}</dd>`);
      btn('btn-primary', c, m === cur ? t('picked') : t('pick'), () => { this.onPickMap?.(m); this.open(null); });
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
}
