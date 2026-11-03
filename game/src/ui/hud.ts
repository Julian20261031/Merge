// Heads-up display: fuel, cargo, salvage progress, extraction countdown, off-screen markers and toasts.
import * as THREE from 'three';
import { t } from '../i18n/zh';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
};

export interface Marker { pos: THREE.Vector3; kind: 'spot' | 'dock' | 'enemy'; label?: string }

export class Hud {
  root: HTMLElement;
  private fuelFill: HTMLElement;
  private hullFill: HTMLElement;
  private hullBox: HTMLElement;
  private flashEl: HTMLElement;
  private bars: HTMLElement;
  private barPool: HTMLElement[] = [];
  private fuelBox: HTMLElement;
  private valueEl: HTMLElement;
  private loadEl: HTMLElement;
  private spotsEl: HTMLElement;
  private ring: HTMLElement;
  private ringLabel: HTMLElement;
  private countdown: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private markers: HTMLElement;
  private markerPool: HTMLElement[] = [];
  btnOrganize: HTMLButtonElement;
  private badge: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.flashEl = el('div', 'hit-flash', this.root);
    this.bars = el('div', 'enemy-bars', this.root);
    const panel = el('div', 'hud-panel', this.root);
    this.hullBox = el('div', 'hud-row', panel, `<span>${t('hull')}</span>`);
    this.hullFill = el('i', '', el('div', 'hud-bar hull', this.hullBox));
    this.fuelBox = el('div', 'hud-row', panel, `<span>${t('fuel')}</span>`);
    const bar = el('div', 'hud-bar', this.fuelBox);
    this.fuelFill = el('i', '', bar);
    const r2 = el('div', 'hud-row', panel, `<span>${t('cargoValue')}</span>`);
    this.valueEl = el('b', 'hud-num', r2, '0');
    el('span', 'hud-sep', r2, `${t('load')}`);
    this.loadEl = el('b', 'hud-num', r2, '0');
    this.spotsEl = el('div', 'hud-spots', this.root);
    this.markers = el('div', 'hud-markers', this.root);
    this.ring = el('div', 'salvage-ring', this.root);
    this.ringLabel = el('span', '', this.ring, t('salvaging'));
    this.countdown = el('div', 'countdown', this.root);
    this.toastEl = el('div', 'toast', this.root);
    this.btnOrganize = el('button', 'btn-round btn-organize', this.root, t('organize')) as HTMLButtonElement;
    this.btnOrganize.type = 'button';
    this.badge = el('i', 'badge', this.btnOrganize);
  }

  setStats(fuel01: number, value: number, weight: number, spotsLeft: number, pending: number) {
    this.fuelFill.style.width = `${Math.max(0, fuel01) * 100}%`;
    this.fuelBox.classList.toggle('low', fuel01 < 0.25);
    this.valueEl.textContent = value.toLocaleString('en-US');
    this.loadEl.textContent = String(weight);
    this.spotsEl.textContent = `${t('salvageLeft')} ${spotsLeft}`;
    this.badge.textContent = pending > 0 ? String(pending) : '';
    this.badge.style.display = pending > 0 ? '' : 'none';
  }

  setHull(k: number) {
    this.hullFill.style.width = `${Math.max(0, k) * 100}%`;
    this.hullBox.classList.toggle('low', k < 0.3);
  }

  /** Red edge flash on the side of the screen the hit came from. */
  flash(dx: number, dy: number) {
    const a = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    this.flashEl.style.background = `linear-gradient(${a + 180}deg, rgba(181,48,42,.55), rgba(181,48,42,0) 40%)`;
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  /** Health bars over enemies that have been hit or are close. */
  setEnemyBars(list: { x: number; y: number; k: number; hot: boolean }[]) {
    list.forEach((b, i) => {
      let e = this.barPool[i];
      if (!e) { e = el('div', 'ebar', this.bars, '<i></i>'); this.barPool.push(e); }
      e.style.display = '';
      e.style.left = `${b.x}px`;
      e.style.top = `${b.y}px`;
      (e.firstChild as HTMLElement).style.width = `${b.k * 100}%`;
      e.classList.toggle('hot', b.hot);
    });
    for (let i = list.length; i < this.barPool.length; i++) this.barPool[i].style.display = 'none';
  }

  /** p in screen px; progress 0..1, or null to hide. */
  setSalvage(p: { x: number; y: number } | null, progress: number, label: string) {
    if (!p) { this.ring.style.display = 'none'; return; }
    this.ring.style.display = '';
    this.ring.style.left = `${p.x}px`;
    this.ring.style.top = `${p.y}px`;
    this.ring.style.setProperty('--p', String(progress));
    this.ringLabel.textContent = label;
  }

  setCountdown(text: string) {
    this.countdown.textContent = text;
    this.countdown.style.display = text ? '' : 'none';
  }

  toast(msg: string, secs = 2.4) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = secs;
  }

  tick(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  /** Edge arrows for things that are off-screen. */
  setMarkers(list: Marker[], camera: THREE.Camera, w: number, h: number) {
    const v = new THREE.Vector3();
    let n = 0;
    for (const m of list) {
      v.copy(m.pos).project(camera);
      const behind = v.z > 1;
      let sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      if (behind) { sx = w - sx; sy = h - sy; }
      const pad = 34;
      const on = !behind && sx > pad && sx < w - pad && sy > pad && sy < h - pad;
      if (on) continue;
      const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((w / 2 - pad) / Math.abs(dx || 1e-3), (h / 2 - pad) / Math.abs(dy || 1e-3));
      const ex = cx + dx * k, ey = cy + dy * k;
      let mk = this.markerPool[n];
      if (!mk) { mk = el('div', 'marker', this.markers, '<i></i><span></span>'); this.markerPool.push(mk); }
      mk.style.display = '';
      mk.className = `marker ${m.kind}`;
      mk.style.left = `${ex}px`;
      mk.style.top = `${ey}px`;
      (mk.firstChild as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      (mk.lastChild as HTMLElement).textContent = m.label ?? '';
      n++;
    }
    for (let i = n; i < this.markerPool.length; i++) this.markerPool[i].style.display = 'none';
  }

  show(on: boolean) { this.root.style.display = on ? '' : 'none'; }
}
