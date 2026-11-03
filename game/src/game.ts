// One run at sea: sail, salvage, arrange the hold, extract at the dock — or run dry and keep only the safe box.
import * as THREE from 'three';
import { t } from './i18n/zh';
import { FOG_COLOR, FOG_NEAR, FOG_FAR } from './render/toon';
import { createWater, setCalmZones, waveH } from './render/water';
import { buildWorld, World, MAP_RADIUS } from './world/map';
import { buildBoat, BoatModel, cellCenter } from './boat/model';
import { itemModel } from './boat/cargo';
import { BoatState, stepBoat, forward, speedCap } from './boat/physics';
import { Inventory, iw, ih } from './inventory/grid';
import { rollItem, itemName } from './inventory/items';
import { Input } from './ui/input';
import { Hud, Marker } from './ui/hud';
import { Panel } from './ui/panel';
import { showResult } from './ui/screens';
import { mulberry32 } from './core/noise';

const SALVAGE_TIME = 2.5, SALVAGE_RADIUS = 9.5, SALVAGE_MAX_SPEED = 3.5;
const EXTRACT_TIME = 3, EXTRACT_MAX_SPEED = 6, DRIFT_LOSE_TIME = 4;
const LIFETIME_KEY = 'rustsea.lifetime';

function loadLifetime() { try { return Number(localStorage.getItem(LIFETIME_KEY)) || 0; } catch { return 0; } }
function saveLifetime(v: number) { try { localStorage.setItem(LIFETIME_KEY, String(v)); } catch { /* private mode: keep it in memory only */ } }

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 1, 600);
  water = createWater();
  level = new THREE.Group();
  inv = new Inventory();
  input: Input;
  hud: Hud;
  panel: Panel;
  world!: World;
  boat!: BoatModel;
  s!: BoatState;
  smoke: THREE.Mesh[] = [];
  state: 'idle' | 'play' | 'over' = 'idle';
  T = 0;
  rand = mulberry32(1);
  hasLeftDock = false;
  extractT = 0;
  driftT = 0;
  fogToastT = 0;
  lifetime = loadLifetime();
  camPos = new THREE.Vector3();
  camLook = new THREE.Vector3();
  private last = 0;

  constructor(canvas: HTMLCanvasElement, private ui: HTMLElement) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    this.scene.add(new THREE.HemisphereLight(0xf3e3c0, 0x1f3433, 0.6 * Math.PI));
    const sun = new THREE.DirectionalLight(0xffe6c2, 0.78 * Math.PI);
    sun.position.set(-40, 70, -30);
    this.scene.add(sun, sun.target, this.water.mesh, this.level);

    const touch = document.createElement('div');
    touch.className = 'touch-layer';
    ui.appendChild(touch);
    this.input = new Input(touch);
    this.hud = new Hud(ui);
    this.panel = new Panel(ui, this.inv);
    this.panel.onToast = (m) => this.hud.toast(m);
    this.panel.onClose = () => this.input.reset();
    this.hud.btnOrganize.addEventListener('click', () => this.togglePanel());
    this.input.onAction = () => this.togglePanel();
    this.inv.onChange(() => this.syncCargo());
    this.hud.show(false);

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); });
    this.resize();
    requestAnimationFrame((n) => this.frame(n));
  }

  private togglePanel() {
    if (this.state !== 'play') return;
    if (this.panel.isOpen) this.panel.close(); else { this.input.reset(); this.panel.open(); }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 2600 / Math.max(w, h));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  startRun(seed = Math.floor(Math.random() * 1e9)) {
    this.level.clear();
    this.rand = mulberry32(seed ^ 0x9e3779b9);
    this.world = buildWorld(this.level, seed);
    setCalmZones(this.world.calm);
    this.boat = buildBoat();
    this.level.add(this.boat.group);
    const puff = new THREE.IcosahedronGeometry(1, 0);
    this.smoke = Array.from({ length: 9 }, () => {
      const m = new THREE.Mesh(puff, new THREE.MeshBasicMaterial({ color: 0x77736a, transparent: true, depthWrite: false }));
      this.level.add(m);
      return m;
    });
    this.s = { x: 0, z: -22, yaw: 0, speed: 0, throttle: 0, fuel: 100, fuelMax: 100, bump: 9 };
    this.inv.reset();
    this.hasLeftDock = false;
    this.extractT = 0;
    this.driftT = 0;
    this.T = 0;
    this.state = 'play';
    this.hud.show(true);
    this.input.reset();
    this.camPos.set(0, 60, 40);
    this.camLook.set(0, 0, -22);
  }

  /** Every item on deck is modelled on its own cells. */
  private syncCargo() {
    if (!this.boat) return;
    this.boat.cargo.clear();
    for (const it of this.inv.items) {
      if (it.where !== 'deck') continue;
      const m = itemModel(it.def, it.def.w, it.def.h);
      m.position.copy(cellCenter(it.x, it.y, iw(it), ih(it)));
      if (it.rot) m.rotation.y = Math.PI / 2;
      this.boat.cargo.add(m);
    }
  }

  private finish(win: boolean) {
    this.state = 'over';
    if (this.panel.isOpen) { this.inv.items.filter((i) => i.where === null).forEach((i) => this.inv.discard(i)); this.panel.close(); }
    const before = this.inv.items.length;
    if (!win) this.inv.keepOnlySafe();
    const kept = this.inv.items.filter((i) => i.where !== null);
    const lost = before - kept.length;
    this.lifetime += kept.reduce((s, i) => s + i.def.value, 0);
    saveLifetime(this.lifetime);
    this.hud.setCountdown('');
    this.hud.setSalvage(null, 0, '');
    setTimeout(() => {
      this.hud.show(false);
      showResult(this.ui, { win, kept, lostCount: lost, lifetime: this.lifetime }, () => this.startRun());
    }, win ? 600 : 1400);
  }

  private salvage(i: number) {
    const sp = this.world.spots[i];
    sp.looted = true;
    const n = 1 + (this.rand() < 0.3 + sp.richness * 0.35 ? 1 : 0);
    const got: string[] = [];
    for (let k = 0; k < n; k++) {
      const def = rollItem(this.rand, sp.richness);
      this.inv.add(def);
      got.push(itemName(def.kind));
    }
    if (this.inv.pending().length) {
      this.hud.toast(t('pileFull'), 3);
      this.input.reset();
      this.panel.open();
    } else if (this.inv.pile().length && this.inv.items.slice(-n).some((it) => it.where === 'pile')) {
      this.hud.toast(`${t('got')}：${got.join('、')} · ${t('noRoom')}`, 3);
    } else this.hud.toast(`${t('got')}：${got.join('、')}`);
  }

  private update(dt: number) {
    const s = this.s;
    const slow = this.panel.isOpen ? 0.3 : 1;
    const sdt = dt * slow;
    this.T += sdt;
    this.input.enabled = !this.panel.isOpen && this.state === 'play';
    this.input.update();
    const weight = this.inv.weight();
    if (this.state === 'play') stepBoat(s, this.input.x, this.input.z, weight, sdt, this.world.roofs);
    else { s.speed *= 0.97; s.throttle = 0; }
    const { fx, fz } = forward(s);

    // soft boundary: the fog thickens
    const r = Math.hypot(s.x, s.z);
    this.fogToastT -= dt;
    if (r > MAP_RADIUS) {
      const push = (r - MAP_RADIUS) * 0.08;
      s.x -= (s.x / r) * push; s.z -= (s.z / r) * push;
      if (this.fogToastT <= 0) { this.hud.toast(t('fog')); this.fogToastT = 4; }
    }

    if (this.state === 'play') {
      // salvage
      let active = -1;
      for (let i = 0; i < this.world.spots.length; i++) {
        const sp = this.world.spots[i];
        if (sp.looted) continue;
        const d = Math.hypot(sp.x - s.x, sp.z - s.z);
        if (d < SALVAGE_RADIUS) { active = i; break; }
      }
      for (let i = 0; i < this.world.spots.length; i++) {
        const sp = this.world.spots[i];
        if (i !== active) sp.progress = Math.max(0, sp.progress - sdt * 0.5);
      }
      if (active >= 0) {
        const sp = this.world.spots[active];
        const still = s.speed < SALVAGE_MAX_SPEED;
        if (still) sp.progress += sdt / SALVAGE_TIME;
        const p = new THREE.Vector3(sp.x, 4, sp.z).project(this.camera);
        this.hud.setSalvage({ x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight }, Math.min(1, sp.progress), still ? t('salvaging') : t('holdStill'));
        if (sp.progress >= 1) { this.hud.setSalvage(null, 0, ''); this.salvage(active); }
      } else this.hud.setSalvage(null, 0, '');

      // extraction at the dock
      const dd = Math.hypot(this.world.dock.x - s.x, this.world.dock.z - s.z);
      if (dd > this.world.dock.r + 25) this.hasLeftDock = true;
      if (this.hasLeftDock && dd < this.world.dock.r && s.speed < EXTRACT_MAX_SPEED) {
        this.extractT += sdt;
        this.hud.setCountdown(`${t('extracting')} ${Math.max(1, Math.ceil(EXTRACT_TIME - this.extractT))}`);
        if (this.extractT >= EXTRACT_TIME) this.finish(true);
      } else if (this.extractT > 0) { this.extractT = 0; this.hud.setCountdown(''); }

      // out of fuel: drift, then lose everything but the safe box
      if (s.fuel <= 0 && this.extractT === 0) {
        if (this.driftT === 0) this.hud.toast(t('drifting'), 3);
        this.driftT += sdt;
        if (this.driftT > DRIFT_LOSE_TIME && s.speed < 0.5) this.finish(false);
      }
    }

    // boat rides the swell
    const g = this.boat.group, yaw = s.yaw;
    const hb = waveH(s.x + fx * 14, s.z + fz * 14, this.T), ha = waveH(s.x - fx * 12, s.z - fz * 12, this.T);
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    const hs1 = waveH(s.x + sx * 6.5, s.z + sz * 6.5, this.T), hp = waveH(s.x - sx * 6.5, s.z - sz * 6.5, this.T);
    g.position.set(s.x, (hb + ha + hs1 + hp + 2 * waveH(s.x, s.z, this.T)) / 6 - 0.2, s.z);
    g.rotation.set(Math.atan2(hb - ha, 26) + s.speed * 0.004, yaw, Math.atan2(hs1 - hp, 13));
    for (let i = 0; i < this.boat.props.length; i++) this.boat.props[i].rotation.z += (i ? -1 : 1) * (2 + s.throttle * 14) * sdt;
    const fl = this.boat.flag, fp = fl.m.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) { const x = fl.base[i * 3]; fp.setZ(i, Math.sin(x * 2.2 - this.T * 7) * 0.22 * (x / fl.w)); }
    fp.needsUpdate = true;
    g.updateMatrixWorld();
    const ex = g.localToWorld(this.boat.exhaust.clone());
    this.smoke.forEach((m, i) => {
      const k = ((this.T / 2.6) + i / this.smoke.length) % 1;
      m.position.set(ex.x - fx * k * 4 + Math.sin(i * 2.3 + this.T) * 0.3 * k, ex.y + k * 7, ex.z - fz * k * 4);
      m.scale.setScalar(0.35 + k * 1.5);
      m.rotation.set(i, i * 2 + this.T * 0.4, 0);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (0.15 + 0.45 * s.throttle) * (s.fuel > 0 ? 1 : 0);
    });

    this.world.update(this.T, sdt);
    const cap = speedCap(weight);
    this.water.update(this.T, this.camLook, { x: s.x, z: s.z, fx, fz, speed01: Math.min(1, s.speed / cap) });

    // camera: north-up, slightly ahead of the boat
    const portrait = window.innerHeight > window.innerWidth;
    const dist = portrait ? 88 : 66, phi = 0.72;
    const look = new THREE.Vector3(s.x + fx * s.speed * 0.9, 0, s.z + fz * s.speed * 0.9 - (portrait ? 0 : 4));
    this.camLook.lerp(look, Math.min(1, dt * 3));
    this.camPos.set(this.camLook.x, Math.cos(phi) * dist, this.camLook.z + Math.sin(phi) * dist);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // HUD
    const markers: Marker[] = [{ pos: new THREE.Vector3(this.world.dock.x, 2, this.world.dock.z), kind: 'dock', label: t('dock') }];
    this.world.spots.filter((p) => !p.looted)
      .map((p) => ({ p, d: Math.hypot(p.x - s.x, p.z - s.z) }))
      .sort((a, b) => a.d - b.d).slice(0, 3)
      .forEach(({ p, d }) => markers.push({ pos: new THREE.Vector3(p.x, 2, p.z), kind: 'spot', label: `${Math.round(d)}m` }));
    this.hud.setMarkers(this.state === 'play' ? markers : [], this.camera, window.innerWidth, window.innerHeight);
    this.hud.setStats(s.fuel / s.fuelMax, this.inv.value(), weight, this.world.spots.filter((p) => !p.looted).length, this.inv.pending().length);
    this.hud.tick(dt);
  }

  private frame(now: number) {
    requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (document.hidden) return;
    if (this.state !== 'idle') this.update(dt);
    else {
      this.T += dt;
      this.water.update(this.T, new THREE.Vector3(), { x: 1e4, z: 1e4, fx: 0, fz: -1, speed01: 0 });
      this.camera.position.set(Math.sin(this.T * 0.05) * 30, 46, 60);
      this.camera.lookAt(0, 0, -10);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
