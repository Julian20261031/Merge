// One run at sea: sail, salvage into the cargo boxes, extract at the dock — or run dry and keep only the safe box.
import * as THREE from 'three';
import { t } from './i18n/zh';
import { FOG_COLOR, FOG_NEAR, FOG_FAR } from './render/toon';
import { createWater, setCalmZones, waveH, N_TRAIL } from './render/water';
import { buildWorld, World } from './world/map';
import { MapDef, MAPS } from './world/maps';
import { buildBoat, BoatModel } from './boat/model';
import { BoatState, stepBoat, forward, speedCap } from './boat/physics';
import { Hold, Item } from './inventory/hold';
import { Layout } from './inventory/modules';
import { rollItem, itemName } from './inventory/items';
import { Input } from './ui/input';
import { Hud, Marker } from './ui/hud';
import { Panel } from './ui/panel';
import { mulberry32 } from './core/noise';
import { Combat, PLAYER_HULL } from './combat/combat';
import { Enemy } from './combat/enemies';
import { sideOf, Placed } from './inventory/modules';
import { StrKey } from './i18n/zh';
import { view } from './core/view';

const SALVAGE_TIME = 2.5, SALVAGE_RADIUS = 9.5, SALVAGE_MAX_SPEED = 3.5;
const EXTRACT_TIME = 3, EXTRACT_MAX_SPEED = 6, DRIFT_LOSE_TIME = 4;
const TRAIL_EVERY = 0.2;

export interface RunEnd { win: boolean; reason: 'win' | 'fuel' | 'sunk'; kept: Item[]; lost: number }

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 1, 600);
  water = createWater();
  level = new THREE.Group();
  hold = new Hold();
  input: Input;
  hud: Hud;
  panel: Panel;
  world!: World;
  boat!: BoatModel;
  s!: BoatState;
  smoke: THREE.Mesh[] = [];
  state: 'idle' | 'play' | 'over' = 'idle';
  onRunEnd: ((r: RunEnd) => void) | null = null;
  T = 0;
  rand = mulberry32(1);
  hasLeftDock = false;
  extractT = 0;
  driftT = 0;
  fogToastT = 0;
  trail: { x: number; z: number; born: number; k: number }[] = [];
  trailT = 0;
  camLook = new THREE.Vector3();
  combat: Combat;
  layout!: Layout;
  hull = PLAYER_HULL;
  hullMax = PLAYER_HULL;
  shake = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
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
    this.panel = new Panel(ui, this.hold);
    this.panel.onToast = (m) => this.hud.toast(m);
    this.panel.onClose = () => this.input.reset();
    this.hud.btnOrganize.addEventListener('click', () => this.togglePanel());
    this.hold.onChange(() => this.syncCargo());
    this.combat = new Combat({
      hitPlayer: (d, x, z, c) => this.hitPlayer(d, x, z, c),
      steal: (side) => this.stealFrom(side),
      onKill: (e) => this.onKill(e),
      toast: (m, secs) => this.hud.toast(m, secs),
    });
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
    const w = view.w, h = view.h;
    // keep the pixel count phone-friendly: the water shader runs on every pixel
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (w * h)));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Builds a fresh patch of sea; `play` starts sailing, otherwise it is the backdrop behind the camp screens. */
  load(map: MapDef, layout: Layout, play: boolean, seed = Math.floor(Math.random() * 1e9)) {
    this.level.clear();
    this.rand = mulberry32(seed ^ 0x9e3779b9);
    this.world = buildWorld(this.level, seed, map);
    setCalmZones(this.world.calm);
    this.boat = buildBoat(layout);
    this.level.add(this.boat.group);
    const puff = new THREE.IcosahedronGeometry(1, 0);
    this.smoke = Array.from({ length: 9 }, () => {
      const m = new THREE.Mesh(puff, new THREE.MeshBasicMaterial({ color: 0x77736a, transparent: true, depthWrite: false }));
      this.level.add(m);
      return m;
    });
    const fuel = layout.fuelMax();
    this.s = { x: 0, z: -22, yaw: 0, yawRate: 0, speed: 0, throttle: 0, fuel, fuelMax: fuel, bump: 9 };
    this.hold.setup(layout.cargoBoxes());
    this.layout = layout;
    this.hull = this.hullMax = PLAYER_HULL;
    this.shake = 0;
    this.combat.reset(this.level, layout, play ? map.enemies : { rammer: 0, harpoon: 0, gunboat: 0 }, this.world.radius, this.world.dock, this.world.roofs, this.rand);
    this.hasLeftDock = false;
    this.extractT = 0;
    this.driftT = 0;
    this.trail = [];
    this.T = 0;
    this.camLook.set(0, 0, -22);
    this.input.reset();
    this.hud.setCountdown('');
    this.hud.setSalvage(null, 0, '');
    this.state = play ? 'play' : 'idle';
    this.hud.show(play);
  }

  /** After a refit at the dock: swap the boat model without regenerating the sea. */
  rebuildBoat(layout: Layout) {
    this.level.remove(this.boat.group);
    this.boat = buildBoat(layout);
    this.level.add(this.boat.group);
    this.hold.setup(layout.cargoBoxes());
    this.s.fuelMax = this.s.fuel = layout.fuelMax();
    this.layout = layout;
    this.combat.reset(this.level, layout, { rammer: 0, harpoon: 0, gunboat: 0 }, this.world.radius, this.world.dock, this.world.roofs, this.rand);
  }

  // ---------------------------------------------------------------- taking hits
  /** Which part of the boat a world point is on: -1 port, 1 starboard, 0 bow, 2 stern. */
  private sideAt(x: number, z: number) {
    const dx = x - this.s.x, dz = z - this.s.z, c = Math.cos(this.s.yaw), sn = Math.sin(this.s.yaw);
    const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
    if (lz < -12) return 0;
    if (lz > 11) return 2;
    return lx < 0 ? -1 : 1;
  }
  private modulesOn(part: number): Placed[] {
    return this.layout.placed.filter((p) => p.type !== 'safe' && (part === 0 ? p.r <= 1 && sideOf(p) === 0 : part === 2 ? p.r >= 4 : sideOf(p) === part));
  }
  private hitPlayer(dmg: number, x: number, z: number, cause: string) {
    if (this.state !== 'play') return;
    const part = this.sideAt(x, z);
    const armour = this.layout.placed.some((p) => p.type === 'armor' && (part === 0 || part === 2 ? false : sideOf(p) === part) && !this.combat.isDisabled(p.uid));
    if (armour) dmg *= 0.5;
    this.hull = Math.max(0, this.hull - dmg);
    this.shake = Math.min(1, this.shake + dmg / 25);
    const scr = new THREE.Vector3(x, 1, z).project(this.camera);
    this.hud.flash(scr.x, -scr.y);
    const msgs: string[] = [];
    if (armour && cause !== 'harpoon') msgs.push(t('armorBlock'));
    // a hit can knock out a module on that side ...
    const mods = this.modulesOn(part);
    if (mods.length && this.rand() < (cause === 'harpoon' ? 0.15 : 0.4)) {
      const m = mods[Math.floor(this.rand() * mods.length)];
      if (m.type === 'fuel') { this.s.fuel = Math.max(0, this.s.fuel - 12); msgs.push(t('fuelLeak')); }
      else if (m.type !== 'cargo') { this.combat.disable(m, 8); msgs.push(`${t(`mod_${m.type}` as StrKey)}${t('moduleHit')}`); }
    }
    // ... or throw cargo from a box on that side overboard, where it floats and can be fished back out
    const boxes = this.hold.containers.filter((c) => !c.safe && (part === 0 || part === 2 || c.side === part || c.side === 0));
    if (boxes.length && this.rand() < (cause === 'ram' ? 0.6 : 0.3)) {
      const pool = this.hold.items.filter((it) => boxes.some((b) => b.id === it.where));
      if (pool.length) {
        const it = pool[Math.floor(this.rand() * pool.length)];
        this.hold.discard(it);
        const ox = x - this.s.x, oz = z - this.s.z, ol = Math.hypot(ox, oz) || 1;
        this.world.addSpot(x + ox / ol * 8, z + oz / ol * 8, 0, [it.def]);
        msgs.push(`${itemName(it.def.kind)}${t('cargoLost')}`);
      }
    }
    if (msgs.length) this.hud.toast(msgs.join(' · '), 2.6);
    if (this.hull <= 0) this.finish(false, 'sunk');
  }
  private stealFrom(side: number): string | null {
    const boxes = this.hold.containers.filter((c) => !c.safe);
    const pref = this.hold.items.filter((it) => boxes.some((b) => b.id === it.where && (b.side === side || b.side === 0)));
    const pool = pref.length ? pref : [...this.hold.items.filter((it) => boxes.some((b) => b.id === it.where)), ...this.hold.pile()];
    if (!pool.length) return null;
    const it = pool[Math.floor(this.rand() * pool.length)];
    this.hold.discard(it);
    return itemName(it.def.kind);
  }
  private onKill(e: Enemy) {
    this.hud.toast(`${t('killed')}${t(`enemy_${e.kind}` as StrKey)}`);
    this.world.addSpot(e.s.x, e.s.z, 0.75 + this.rand() * 0.25);
  }

  /** Cargo boxes look fuller as they fill. */
  private syncCargo() {
    if (!this.boat) return;
    this.boat.cargoFill.forEach((f, i) => {
      if (!f) return;
      const k = this.hold.fill(`cargo${i}`);
      f.visible = k > 0;
      f.scale.y = Math.max(0.001, 0.4 + k * 1.3);
    });
  }

  private finish(win: boolean, reason: RunEnd['reason'] = win ? 'win' : 'fuel') {
    this.state = 'over';
    if (this.panel.isOpen) { this.hold.pending().forEach((i) => this.hold.discard(i)); this.panel.close(); }
    const before = this.hold.items.length;
    if (!win) this.hold.keepOnlySafe();
    const kept = this.hold.items.filter((i) => i.where !== null);
    this.hud.setCountdown('');
    this.hud.setSalvage(null, 0, '');
    setTimeout(() => {
      this.hud.show(false);
      this.onRunEnd?.({ win, reason, kept, lost: before - kept.length });
    }, win ? 600 : 1400);
  }

  private salvage(i: number) {
    const sp = this.world.spots[i];
    sp.looted = true;
    const n = 1 + (this.rand() < 0.3 + sp.richness * 0.35 ? 1 : 0);
    const got: string[] = [];
    let toPile = false;
    const defs = sp.fixed ?? Array.from({ length: n }, () => rollItem(this.rand, sp.richness));
    for (const def of defs) {
      const it = this.hold.add(def);
      if (it.where === 'pile') toPile = true;
      got.push(itemName(def.kind));
    }
    if (this.hold.pending().length) {
      this.hud.toast(t('pileFull'), 3);
      this.input.reset();
      this.panel.open();
    } else this.hud.toast(`${t('got')}：${got.join('、')}${toPile ? ` · ${t('noRoom')}` : ''}`, toPile ? 3 : 2.4);
  }

  private update(dt: number) {
    const s = this.s;
    const sdt = dt * (this.panel.isOpen ? 0.3 : 1);
    this.T += sdt;
    const playing = this.state === 'play';
    this.input.enabled = playing && !this.panel.isOpen;
    this.input.update();
    const weight = this.hold.weight();
    const engine = this.layout.placed.find((p) => p.type === 'engine');
    const engineDown = !!engine && this.combat.isDisabled(engine.uid);
    if (playing) stepBoat(s, this.input.x, this.input.z, weight, sdt, this.world.roofs, { maxSpeed: engineDown ? 8 : undefined });
    else { s.speed *= 0.97; s.throttle = 0; s.yawRate *= 0.95; }
    const { fx, fz } = forward(s);
    const cap = speedCap(weight);
    const speed01 = Math.min(1, s.speed / cap);

    const r = Math.hypot(s.x, s.z);
    this.fogToastT -= dt;
    if (r > this.world.radius) {
      const push = (r - this.world.radius) * 0.08;
      s.x -= (s.x / r) * push; s.z -= (s.z / r) * push;
      if (this.fogToastT <= 0 && playing) { this.hud.toast(t('fog')); this.fogToastT = 4; }
    }

    if (playing) {
      let active = -1;
      for (let i = 0; i < this.world.spots.length; i++) {
        const sp = this.world.spots[i];
        if (!sp.looted && Math.hypot(sp.x - s.x, sp.z - s.z) < SALVAGE_RADIUS) { active = i; break; }
      }
      this.world.spots.forEach((sp, i) => { if (i !== active) sp.progress = Math.max(0, sp.progress - sdt * 0.5); });
      if (active >= 0) {
        const sp = this.world.spots[active];
        const still = s.speed < SALVAGE_MAX_SPEED;
        if (still) sp.progress += sdt / SALVAGE_TIME;
        const p = new THREE.Vector3(sp.x, 4, sp.z).project(this.camera);
        this.hud.setSalvage({ x: (p.x * 0.5 + 0.5) * view.w, y: (-p.y * 0.5 + 0.5) * view.h }, Math.min(1, sp.progress), still ? t('salvaging') : t('holdStill'));
        if (sp.progress >= 1) { this.hud.setSalvage(null, 0, ''); this.salvage(active); }
      } else this.hud.setSalvage(null, 0, '');

      const dd = Math.hypot(this.world.dock.x - s.x, this.world.dock.z - s.z);
      if (dd > this.world.dock.r + 25) this.hasLeftDock = true;
      if (this.hasLeftDock && dd < this.world.dock.r && s.speed < EXTRACT_MAX_SPEED) {
        this.extractT += sdt;
        this.hud.setCountdown(`${t('extracting')} ${Math.max(1, Math.ceil(EXTRACT_TIME - this.extractT))}`);
        if (this.extractT >= EXTRACT_TIME) this.finish(true);
      } else if (this.extractT > 0) { this.extractT = 0; this.hud.setCountdown(''); }

      if (s.fuel <= 0 && this.extractT === 0) {
        if (this.driftT === 0) this.hud.toast(t('drifting'), 3);
        this.driftT += sdt;
        if (this.driftT > DRIFT_LOSE_TIME && s.speed < 0.5) this.finish(false, 'fuel');
      }
    }

    // the boat rides the swell and leans into turns
    const g = this.boat.group, yaw = s.yaw;
    const hb = waveH(s.x + fx * 14, s.z + fz * 14, this.T), ha = waveH(s.x - fx * 12, s.z - fz * 12, this.T);
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    const hs1 = waveH(s.x + sx * 6.5, s.z + sz * 6.5, this.T), hp = waveH(s.x - sx * 6.5, s.z - sz * 6.5, this.T);
    g.position.set(s.x, (hb + ha + hs1 + hp + 2 * waveH(s.x, s.z, this.T)) / 6 - 0.2, s.z);
    g.rotation.set(Math.atan2(hb - ha, 26) + s.speed * 0.004, yaw, Math.atan2(hs1 - hp, 13) - s.yawRate * s.speed * 0.012);
    this.boat.props.forEach((pr, i) => { pr.rotation.z += (i ? -1 : 1) * (2 + s.throttle * 14) * sdt; });
    const fl = this.boat.flag, fp = fl.m.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) { const x = fl.base[i * 3]; fp.setZ(i, Math.sin(x * 2.2 - this.T * 7) * 0.22 * (x / fl.w)); }
    fp.needsUpdate = true;
    g.updateMatrixWorld();
    this.combat.update(sdt, this.T, s, g, this.world.roofs, !playing);
    const ex = g.localToWorld(this.boat.exhaust.clone());
    this.smoke.forEach((m, i) => {
      const k = ((this.T / 2.6) + i / this.smoke.length) % 1;
      m.position.set(ex.x - fx * k * 4 + Math.sin(i * 2.3 + this.T) * 0.3 * k, ex.y + k * 7, ex.z - fz * k * 4);
      m.scale.setScalar(0.35 + k * 1.5);
      m.rotation.set(i, i * 2 + this.T * 0.4, 0);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (0.15 + 0.45 * s.throttle) * (s.fuel > 0 ? 1 : 0);
    });

    // lay the wake down on the water behind the stern; it stays where it was laid
    this.trailT += sdt;
    if (this.trailT >= TRAIL_EVERY) {
      this.trailT = 0;
      this.trail.unshift({ x: s.x - fx * 15, z: s.z - fz * 15, born: this.T, k: speed01 });
      if (this.trail.length > N_TRAIL) this.trail.length = N_TRAIL;
    }

    this.world.update(this.T, sdt);
    this.water.update(this.T, this.camLook, { x: s.x, z: s.z, fx, fz, speed01 }, this.trail);

    // camera: north-up, a little ahead of the boat
    const dist = 96, phi = 0.8;
    const look = new THREE.Vector3(s.x + fx * s.speed * 0.9, 0, s.z + fz * s.speed * 0.9 - 3);
    this.camLook.lerp(look, Math.min(1, dt * 3));
    this.camera.position.set(this.camLook.x, Math.cos(phi) * dist, this.camLook.z + Math.sin(phi) * dist);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shake * 2.2));
    this.camera.lookAt(this.camLook);

    if (playing) {
      const markers: Marker[] = [{ pos: new THREE.Vector3(this.world.dock.x, 2, this.world.dock.z), kind: 'dock', label: t('dock') }];
      this.world.spots.filter((p) => !p.looted)
        .map((p) => ({ p, d: Math.hypot(p.x - s.x, p.z - s.z) }))
        .sort((a, b) => a.d - b.d).slice(0, 3)
        .forEach(({ p, d }) => markers.push({ pos: new THREE.Vector3(p.x, 2, p.z), kind: 'spot', label: `${Math.round(d)}m` }));
      for (const e of this.combat.enemies) if (e.state !== 'patrol' && e.state !== 'sinking') markers.push({ pos: new THREE.Vector3(e.s.x, 2, e.s.z), kind: 'enemy' });
      this.hud.setMarkers(markers, this.camera, view.w, view.h);
      this.hud.setHull(this.hull / this.hullMax);
      const bars: { x: number; y: number; k: number; hot: boolean }[] = [];
      for (const e of this.combat.enemies) {
        if (e.state === 'sinking' || (e.hp >= e.maxHp && e.state === 'patrol')) continue;
        const q = new THREE.Vector3(e.s.x, 7, e.s.z).project(this.camera);
        if (q.z > 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
        bars.push({ x: (q.x * 0.5 + 0.5) * view.w, y: (-q.y * 0.5 + 0.5) * view.h, k: e.hp / e.maxHp, hot: e.hitFlash > 0 });
      }
      this.hud.setEnemyBars(bars);
      this.hud.setStats(s.fuel / s.fuelMax, this.hold.value(), weight, this.world.spots.filter((p) => !p.looted).length, this.hold.pending().length);
    }
    this.hud.tick(dt);
  }

  private frame(now: number) {
    requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (document.hidden || !this.world) return;
    if (this.state === 'idle') {
      // camp backdrop: the boat idles at the dock while the camera drifts
      this.update(dt);
      this.camera.position.set(this.s.x + Math.sin(this.T * 0.05) * 24 - 30, 30, this.s.z + 46);
      this.camera.lookAt(this.s.x - 22, 0, this.s.z + 2);
    } else this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

export const DEFAULT_MAP = MAPS[0];
