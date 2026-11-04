// Raider boats. Each kind has one clear attack with a readable warning, and one clear counter.
import * as THREE from 'three';
import { TX } from '../render/textures';
import { toon, part, box, cyl, dent } from '../render/toon';
import { hullGeo } from '../boat/model';
import { BoatState, stepBoat, forward, angleDiff, roofNear } from '../boat/physics';
import { Roof } from '../world/map';
import { waveH } from '../render/water';

export type EnemyKind = 'rammer' | 'harpoon' | 'gunboat';
export const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; scale: number; aggro: number }> = {
  rammer: { hp: 75, speed: 13, scale: 0.065, aggro: 80 },
  harpoon: { hp: 60, speed: 12, scale: 0.06, aggro: 85 },
  gunboat: { hp: 110, speed: 8.5, scale: 0.075, aggro: 95 },
};
const EHULL2D = [[0, -190], [40, -140], [62, -60], [64, 40], [56, 120], [-56, 120], [-64, 40], [-62, -60], [-40, -140]];
const TYRE = 0x2b2a27, ROPE = 0x8a7550, RED = 0xb5302a;

function buildModel(kind: EnemyKind): THREE.Group {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const S = ENEMY_STATS[kind].scale, k = S / 0.065;
  part(g, hullGeo(EHULL2D, S, 1.2), [toon(0, TX.tarDeck), toon(0, TX.tarSide)], 0, 0, 0, { outline: 'thick' });
  const tm = toon(0, TX.teeth), tr = toon(0, TX.dark);
  part(g, box(0.25, 1.4, 9.4 * k), [tr, tm, tr, tr, tr, tr], -2.15 * k, 0.95, -8.1 * k, { ry: -0.442 });
  part(g, box(0.25, 1.4, 9.4 * k), [tm, tr, tr, tr, tr, tr], 2.15 * k, 0.95, -8.1 * k, { ry: 0.442 });
  for (let i = 0; i < 4; i++) {
    const z = (-100 + i * 50) * S;
    for (const s of [-1, 1]) part(g, new THREE.ConeGeometry(0.28, 1.7, 6), toon(0, TX.corrRust), s * 4.5 * k, 0.85, z, { rz: -s * Math.PI / 2 });
  }
  for (const [s, z] of [[-1, 3], [1, 5]]) part(g, new THREE.TorusGeometry(0.75, 0.32, 8, 14), toon(TYRE), s * 4.1 * k, 0.8, z * k, { ry: Math.PI / 2 });
  part(g, cyl(0.35, 3.0, 8), toon(0, TX.dark), 1.6 * k, 3.6, 6.0 * k);
  part(g, cyl(0.08, 3.4, 6), toon(0, TX.dark), -3.0 * k, 2.9, -2.5 * k, { outline: false });
  const fg = new THREE.PlaneGeometry(2.4, 1.4, 4, 2);
  fg.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(fg, toon(0, TX.flagEnemy, { side: THREE.DoubleSide, alphaTest: 0.5 }));
  flag.position.set(-3.0 * k, 4.2, -2.5 * k);
  g.add(flag);
  if (kind === 'rammer') {
    part(g, dent(new THREE.ConeGeometry(1.1, 6, 8), 0.1), toon(0, TX.corrRust), 0, 0.9, -15.2, { rx: -Math.PI / 2, outline: 'mid' });
    part(g, dent(box(3.6, 1.4, 2.4), 0.1), toon(0, TX.dark), 0, 1.9, 4.5);
    part(g, dent(box(2.2, 1.2, 2), 0.1), toon(0, TX.wood), 0, 1.8, 0);
  } else if (kind === 'harpoon') {
    part(g, cyl(1.0, 0.8), toon(0, TX.dark), 0, 1.6, -6.5);
    part(g, dent(cyl(0.22, 6.5, 8), 0.04), toon(0, TX.corrRust), 0, 2.0, -9.8, { rx: Math.PI / 2 });
    part(g, new THREE.ConeGeometry(0.55, 1.4, 6), toon(0xe0d4b8), 0, 2.0, -13.6, { rx: -Math.PI / 2 });
    for (let i = 0; i < 5; i++) { const a = Math.PI * 0.15 + i * Math.PI * 0.17; part(g, cyl(0.07, 2.4, 5), toon(0, TX.corrRust), Math.cos(a) * 1.7 * (i % 2 ? 1 : -1), 2.4, -6.5 + Math.sin(a) * 1.2, { outline: false }); }
    part(g, new THREE.TorusGeometry(0.85, 0.28, 6, 14), toon(ROPE), 0, 1.5, -3.2, { rx: Math.PI / 2 });
    part(g, dent(box(2.2, 1.3, 2), 0.1), toon(0, TX.wood), -1.4, 1.85, 1.2);
  } else {
    part(g, dent(box(5.5, 0.5, 5), 0.1), toon(0, TX.primer), 0, 1.45, -4.0);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const sb = part(g, new THREE.IcosahedronGeometry(0.6, 1), toon(0, TX.sand), Math.cos(a) * 2.3, 2.0, -4 + Math.sin(a) * 2.1); sb.scale.set(1, 0.6, 1.2); }
    part(g, cyl(1.2, 1.0, 12), toon(0, TX.steel), 0, 2.3, -4.0);
    part(g, dent(cyl(0.75, 2.6, 10), 0.05), toon(0, TX.dark), 0, 3.4, -5.0, { rx: -0.9 });
    part(g, dent(box(4.2, 1.6, 2.4), 0.1), toon(0, TX.dark), 0, 2.0, 6.0);
  }
  return g;
}

export interface Telegraph { mesh: THREE.Mesh; kind: 'line' | 'wedge' }

export class Enemy {
  s: BoatState;
  hp: number;
  maxHp: number;
  group: THREE.Group;
  state: 'patrol' | 'chase' | 'windup' | 'dash' | 'recover' | 'aim' | 'flee' | 'sinking' = 'patrol';
  t = 0;               // time in current state
  cool = 2 + Math.random() * 2;
  home: THREE.Vector2;
  wander = new THREE.Vector2();
  hitFlash = 0;
  sinkT = 0;
  dead = false;
  tether: { t: number } | null = null;
  tele: THREE.Mesh;
  aimYaw = 0;

  constructor(public kind: EnemyKind, x: number, z: number, scene: THREE.Object3D) {
    const st = ENEMY_STATS[kind];
    this.hp = this.maxHp = st.hp;
    this.s = { x, z, yaw: Math.random() * Math.PI * 2, yawRate: 0, speed: 0, throttle: 0, fuel: 1e9, fuelMax: 1e9, bump: 9 };
    this.home = new THREE.Vector2(x, z);
    this.pickWander();
    this.group = buildModel(kind);
    scene.add(this.group);
    // warnings painted on the water
    const geo = kind === 'harpoon'
      ? (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.16, 0, -1, 0.16, 0, -1], 3)); return g; })()
      : (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; })();
    this.tele = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.tele.visible = false;
    scene.add(this.tele);
  }

  /** Hull as a segment for hit tests: bow point, stern point, radius. */
  hull() {
    const { fx, fz } = forward(this.s), k = ENEMY_STATS[this.kind].scale / 0.065;
    return { ax: this.s.x + fx * 11 * k, az: this.s.z + fz * 11 * k, bx: this.s.x - fx * 7 * k, bz: this.s.z - fz * 7 * k, r: 4.2 * k };
  }
  bow() { const { fx, fz } = forward(this.s); return { x: this.s.x + fx * 12, z: this.s.z + fz * 12 }; }

  private pickWander() {
    const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 30;
    this.wander.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
  }
  private go(state: Enemy['state']) { this.state = state; this.t = 0; }

  /** Steering toward a point, with a simple look-ahead to slide around rooftops. */
  private steer(tx: number, tz: number, throttle: number, roofs: Roof[]): [number, number] {
    let dx = tx - this.s.x, dz = tz - this.s.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const { fx, fz } = forward(this.s);
    const R = roofNear(this.s.x + fx * 18, this.s.z + fz * 18, roofs, 6);
    if (R) {
      const ax = this.s.x - R.x, az = this.s.z - R.z, al = Math.hypot(ax, az) || 1;
      const px = -fz, pz = fx, sgn = px * ax + pz * az > 0 ? 1 : -1;
      dx = dx * 0.3 + px * sgn + ax / al * 0.3;
      dz = dz * 0.3 + pz * sgn + az / al * 0.3;
    }
    return [dx * throttle, dz * throttle];
  }

  update(dt: number, T: number, p: BoatState, roofs: Roof[], api: EnemyApi) {
    this.t += dt;
    this.cool -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const st = ENEMY_STATS[this.kind];
    const dx = p.x - this.s.x, dz = p.z - this.s.z, dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(-dx, -dz), facing = Math.abs(angleDiff(this.s.yaw, toPlayer));
    let ix = 0, iz = 0, maxSpeed = st.speed;
    this.tele.visible = false;

    if (this.state === 'sinking') {
      this.sinkT += dt;
      this.s.speed *= 0.96;
    } else {
      if (this.state === 'patrol') {
        if (Math.hypot(this.wander.x - this.s.x, this.wander.y - this.s.z) < 8 || this.t > 12) { this.pickWander(); this.t = 0; }
        [ix, iz] = this.steer(this.wander.x, this.wander.y, 0.45, roofs);
        if (dist < st.aggro && !api.playerSafe) this.go('chase');
      } else if (this.state === 'flee') {
        [ix, iz] = this.steer(this.s.x - dx, this.s.z - dz, 1, roofs);
        if (this.t > 6) this.go('patrol');
      } else if (dist > st.aggro * 1.8 || api.playerSafe || Math.hypot(this.s.x - this.home.x, this.s.z - this.home.y) > 150) {
        if (this.tether) api.breakTether(this);
        this.go('patrol');
      } else if (this.kind === 'rammer') {
        if (this.state === 'chase') {
          [ix, iz] = this.steer(p.x, p.z, 1, roofs);
          if (dist < 46 && facing < 0.35 && this.cool <= 0) { this.go('windup'); this.s.speed *= 0.5; }
        } else if (this.state === 'windup') {
          // hold still, line up on where the player will be, paint the charge lane
          const lead = api.predict(0.9);
          this.aimYaw = Math.atan2(-(lead.x - this.s.x), -(lead.z - this.s.z));
          this.s.yaw += Math.max(-dt * 1.4, Math.min(dt * 1.4, angleDiff(this.s.yaw, this.aimYaw)));
          this.s.speed *= 0.9;
          this.showLane(55, 5.5, 0.4 + 0.35 * Math.abs(Math.sin(this.t * 14)));
          if (this.t > 0.95) { this.go('dash'); this.s.speed = 32; this.s.yawRate = 0; }
        } else if (this.state === 'dash') {
          this.s.speed = 32;
          this.showLane(55 - this.t * 30, 5.5, 0.3);
          if (api.ramCheck(this)) { this.go('recover'); this.s.speed = 2; this.cool = 4; }
          else if (this.t > 1.5) { this.go('recover'); this.cool = 3; }
        } else if (this.state === 'recover') {
          if (this.t > 2.2) this.go('chase');
        }
      } else if (this.kind === 'harpoon') {
        const want = 32;
        if (this.state === 'chase') {
          // circle at harpoon range
          const side = Math.sign(Math.sin(T * 0.1 + this.home.x)) || 1;
          const ox = -dz / (dist || 1) * side, oz = dx / (dist || 1) * side;
          const tx = p.x - dx / (dist || 1) * want + ox * 14, tz = p.z - dz / (dist || 1) * want + oz * 14;
          [ix, iz] = this.steer(tx, tz, dist > want + 10 ? 1 : 0.6, roofs);
          if (!this.tether && dist > 20 && dist < 45 && this.cool <= 0) this.go('aim');
        } else if (this.state === 'aim') {
          this.s.yaw += Math.max(-dt * 1.6, Math.min(dt * 1.6, angleDiff(this.s.yaw, toPlayer)));
          this.s.speed *= 0.92;
          this.tele.visible = true;
          const b = this.bow();
          this.tele.position.set(b.x, 0.5, b.z);
          this.tele.rotation.y = this.s.yaw;
          this.tele.scale.setScalar(Math.min(45, dist + 6));
          (this.tele.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.25 * Math.abs(Math.sin(this.t * 10));
          if (this.t > 1.3) { api.fireHarpoon(this); this.cool = 8; this.go('chase'); }
        }
        if (this.tether) {
          // anchor against the pull while reeling in
          ix = 0; iz = 0; maxSpeed = 2;
          this.s.yaw += Math.max(-dt, Math.min(dt, angleDiff(this.s.yaw, toPlayer)));
        }
      } else {
        const want = 50;
        if (this.state === 'chase') {
          const tx = p.x - dx / (dist || 1) * want, tz = p.z - dz / (dist || 1) * want;
          [ix, iz] = this.steer(tx, tz, Math.abs(dist - want) > 8 ? 0.8 : 0.2, roofs);
          if (dist < 80 && this.cool <= 0) { api.fireMortar(this); this.cool = 4.2 + Math.random(); }
        }
      }
    }

    if (this.state !== 'dash' && this.state !== 'windup' && this.state !== 'aim') stepBoat(this.s, ix, iz, 0, dt, roofs, { maxSpeed, hull: ENEMY_STATS[this.kind].scale / 0.1, burnsFuel: false });
    else {
      const { fx, fz } = forward(this.s);
      this.s.x += fx * this.s.speed * dt;
      this.s.z += fz * this.s.speed * dt;
    }

    // ride the swell; sink when destroyed
    const g = this.group, h = waveH(this.s.x, this.s.z, T);
    g.position.set(this.s.x, h * 0.8 - 0.3 - this.sinkT * 1.6, this.s.z);
    g.rotation.set(0.03 * Math.sin(T * 1.7 + this.home.x) + this.sinkT * 0.25, this.s.yaw, 0.04 * Math.sin(T * 1.3 + this.home.y) - this.s.yawRate * this.s.speed * 0.01 + this.sinkT * 0.12);
    if (this.state === 'sinking' && this.sinkT > 3.2) this.dead = true;
  }

  private showLane(len: number, width: number, op: number) {
    const b = this.bow();
    this.tele.visible = len > 1;
    this.tele.position.set(b.x, 0.5, b.z);
    this.tele.rotation.y = this.s.yaw;
    this.tele.scale.set(width, 1, Math.max(1, len));
    (this.tele.material as THREE.MeshBasicMaterial).opacity = op;
  }

  damage(n: number) {
    if (this.state === 'sinking') return false;
    this.hp -= n;
    this.hitFlash = 0.12;
    if (this.state === 'patrol') this.go('chase');
    if (this.hp <= 0) { this.hp = 0; this.go('sinking'); this.tele.visible = false; return true; }
    return false;
  }

  dispose(scene: THREE.Object3D) { scene.remove(this.group); scene.remove(this.tele); }
}

export interface EnemyApi {
  playerSafe: boolean;
  predict(t: number): { x: number; z: number };
  ramCheck(e: Enemy): boolean;
  fireHarpoon(e: Enemy): void;
  fireMortar(e: Enemy): void;
  breakTether(e: Enemy): void;
}
