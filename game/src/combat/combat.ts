// Combat: the player's weapons fire on their own along the direction they are mounted;
// you aim by steering. Enemies telegraph every attack. Hits land on a side of the boat.
import * as THREE from 'three';
import { Effects } from './fx';
import { Enemy, EnemyKind, EnemyApi } from './enemies';
import { BoatState, forward } from '../boat/physics';
import { cellCenter, DECK } from '../boat/model';
import { Layout, Placed, pw, ph, sideOf } from '../inventory/modules';
import { Roof } from '../world/map';
import { waveH } from '../render/water';
import { t } from '../i18n/zh';

export const WEAPONS = {
  cannon: { range: 56, arc: 0.44, cool: 4.0, dmg: 40, speed: 70, splash: 3.5, burst: 1, gap: 0 },
  gun: { range: 36, arc: 0.95, cool: 1.6, dmg: 4, speed: 115, splash: 0, burst: 5, gap: 0.12 },
};
export const PLAYER_HULL = 120;
const HARPOON_STEAL_TIME = 3.5, TETHER_SNAP = 60;

interface Mount { p: Placed; kind: 'cannon' | 'gun'; local: THREE.Vector3; dir: THREE.Vector3; cool: number; shots: number }
interface Proj { kind: 'bullet' | 'shell' | 'harpoon' | 'mortar'; mesh: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; life: number; dmg: number; from?: Enemy; start?: THREE.Vector3; target?: THREE.Vector3; k?: number; dur?: number; ring?: THREE.Mesh }

export interface CombatHooks {
  hitPlayer(dmg: number, x: number, z: number, cause: 'ram' | 'shell' | 'harpoon'): void;
  steal(side: number): string | null;
  onKill(e: Enemy): void;
  toast(msg: string, secs?: number): void;
}

const BULLET_GEO = new THREE.BoxGeometry(0.22, 0.22, 2.0);
const BULLET_MAT = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const SHELL_GEO = new THREE.IcosahedronGeometry(0.55, 0);
const SHELL_MAT = new THREE.MeshBasicMaterial({ color: 0x2a2622 });
const HARPOON_GEO = (() => { const g = new THREE.CylinderGeometry(0.12, 0.12, 4, 6); g.rotateX(Math.PI / 2); return g; })();
const HARPOON_MAT = new THREE.MeshBasicMaterial({ color: 0xe0d4b8 });

/** Distance from point to a segment. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const k = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - (ax + vx * k), pz - (az + vz * k));
}
export function playerHullDist(s: BoatState, x: number, z: number) {
  const { fx, fz } = forward(s);
  return segDist(x, z, s.x + fx * 17, s.z + fz * 17, s.x - fx * 14, s.z - fz * 14);
}

export class Combat {
  group = new THREE.Group();
  fx = new Effects();
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  mounts: Mount[] = [];
  disabled = new Map<number, { t: number; local: THREE.Vector3 }>();
  tether: { e: Enemy; t: number; side: number; line: THREE.Line } | null = null;
  private smokeT = 0;
  private s!: BoatState;
  private boat!: THREE.Object3D;
  private T = 0;

  constructor(public hooks: CombatHooks) {}

  reset(scene: THREE.Object3D, layout: Layout, spawn: Record<EnemyKind, number>, radius: number, dock: { x: number; z: number }, roofs: Roof[], rand: () => number) {
    this.group.clear();
    this.fx.clear();
    this.group.add(this.fx.group);
    scene.add(this.group);
    this.enemies = [];
    this.projs = [];
    this.disabled.clear();
    this.tether = null;
    this.mounts = layout.placed.filter((p) => p.type === 'cannon' || p.type === 'gun').map((p) => {
      const side = p.type === 'cannon' ? 0 : sideOf(p);
      const c = cellCenter(p.c, p.r, pw(p), ph(p));
      return { p, kind: p.type as 'cannon' | 'gun', local: new THREE.Vector3(c.x, DECK + 1.1, c.z), dir: side === 0 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(side, 0, 0), cool: 0, shots: 0 };
    });
    for (const kind of Object.keys(spawn) as EnemyKind[]) {
      for (let n = 0; n < spawn[kind]; n++) {
        for (let tries = 0; tries < 200; tries++) {
          const a = rand() * Math.PI * 2, r = 70 + rand() * (radius - 85);
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (Math.hypot(x - dock.x, z - dock.z) < 80) continue;
          if (roofs.some((R) => Math.hypot(R.x - x, R.z - z) < Math.max(R.w, R.d) / 2 + 12)) continue;
          if (this.enemies.some((e) => Math.hypot(e.s.x - x, e.s.z - z) < 30)) continue;
          this.enemies.push(new Enemy(kind, x, z, this.group));
          break;
        }
      }
    }
  }

  isDisabled(uid: number) { return this.disabled.has(uid); }
  disable(p: Placed, secs: number) {
    const c = cellCenter(p.c, p.r, pw(p), ph(p));
    this.disabled.set(p.uid, { t: secs, local: new THREE.Vector3(c.x, DECK + 1.5, c.z) });
  }

  private api(): EnemyApi {
    const s = this.s;
    return {
      playerSafe: false,
      predict: (k) => { const { fx, fz } = forward(s); return { x: s.x + fx * s.speed * k, z: s.z + fz * s.speed * k }; },
      ramCheck: (e) => {
        const b = e.bow();
        if (playerHullDist(s, b.x, b.z) > 8.5) return false;
        const { fx, fz } = forward(e.s);
        s.x += fx * 3; s.z += fz * 3;
        s.speed *= 0.3;
        this.fx.explosion(b.x, 2, b.z, 0.8);
        this.fx.splash(b.x, 0, b.z, 1.4);
        this.hooks.hitPlayer(30, b.x, b.z, 'ram');
        e.damage(4);
        return true;
      },
      fireHarpoon: (e) => {
        const b = e.bow(), lead = this.api().predict(0.5);
        const dir = new THREE.Vector3(lead.x - b.x, 0, lead.z - b.z).normalize();
        const m = new THREE.Mesh(HARPOON_GEO, HARPOON_MAT);
        this.group.add(m);
        this.projs.push({ kind: 'harpoon', mesh: m, pos: new THREE.Vector3(b.x, 2, b.z), vel: dir.multiplyScalar(58), life: 1.2, dmg: 6, from: e });
        this.fx.muzzle(b.x, 2, b.z, 1.2);
      },
      fireMortar: (e) => {
        const lead = this.api().predict(1.6);
        const target = new THREE.Vector3(lead.x + (Math.random() - 0.5) * 6, 0, lead.z + (Math.random() - 0.5) * 6);
        const m = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
        m.scale.setScalar(1.3);
        this.group.add(m);
        const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.5, 32), new THREE.MeshBasicMaterial({ color: 0xb5302a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(target.x, 0.6, target.z);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(6.5, 32), new THREE.MeshBasicMaterial({ color: 0xb5302a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
        fill.position.z = 0.01;
        ring.add(fill);
        this.group.add(ring);
        const start = new THREE.Vector3(e.s.x, 4, e.s.z);
        this.projs.push({ kind: 'mortar', mesh: m, pos: start.clone(), vel: new THREE.Vector3(), life: 99, dmg: 22, from: e, start, target, k: 0, dur: 1.7, ring });
        this.fx.muzzle(e.s.x, 5, e.s.z, 1.6);
        this.fx.smoke(e.s.x, 5, e.s.z);
      },
      breakTether: (e) => { if (this.tether?.e === e) this.endTether(false); },
    };
  }

  private endTether(snapped: boolean) {
    if (!this.tether) return;
    this.group.remove(this.tether.line);
    this.tether.e.tether = null;
    if (snapped) this.hooks.toast(t('tetherSnap'));
    this.tether = null;
  }

  update(dt: number, T: number, s: BoatState, boat: THREE.Object3D, roofs: Roof[], frozen: boolean) {
    this.s = s; this.boat = boat; this.T = T;
    const api = this.api();
    api.playerSafe = frozen;
    for (const e of this.enemies) e.update(dt, T, s, roofs, api);
    for (const e of this.enemies) if (e.dead) { e.dispose(this.group); if (this.tether?.e === e) this.endTether(false); }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (!frozen) this.fireWeapons(dt);
    this.updateProjectiles(dt);
    this.updateTether(dt);
    // damaged modules smoke until repaired
    this.smokeT += dt;
    for (const [uid, d] of this.disabled) {
      d.t -= dt;
      if (d.t <= 0) { this.disabled.delete(uid); continue; }
      if (this.smokeT > 0.15) { const w = boat.localToWorld(d.local.clone()); this.fx.smoke(w.x, w.y, w.z); }
    }
    if (this.smokeT > 0.15) this.smokeT = 0;
    this.fx.update(dt);
  }

  private fireWeapons(dt: number) {
    const s = this.s;
    const yawM = new THREE.Matrix4().makeRotationY(s.yaw);
    for (const m of this.mounts) {
      m.cool -= dt;
      if (m.cool > 0 || this.disabled.has(m.p.uid)) continue;
      const W = WEAPONS[m.kind];
      const pos = this.boat.localToWorld(m.local.clone());
      const dir = m.dir.clone().applyMatrix4(yawM);
      let best: Enemy | null = null, bestD = W.range;
      for (const e of this.enemies) {
        if (e.state === 'sinking') continue;
        const dx = e.s.x - pos.x, dz = e.s.z - pos.z, d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / (d || 1))));
        if (ang > W.arc) continue;
        best = e; bestD = d;
      }
      if (!best) continue;
      // lead the target a little
      const tt = bestD / W.speed, { fx, fz } = forward(best.s);
      const aim = new THREE.Vector3(best.s.x + fx * best.s.speed * tt - pos.x, 0, best.s.z + fz * best.s.speed * tt - pos.z).normalize();
      if (m.kind === 'gun') { const j = (Math.random() - 0.5) * 0.08; aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), j); }
      const muzzle = pos.clone().addScaledVector(aim, m.kind === 'cannon' ? 3.5 : 2.6);
      const mesh = new THREE.Mesh(m.kind === 'cannon' ? SHELL_GEO : BULLET_GEO, m.kind === 'cannon' ? SHELL_MAT : BULLET_MAT);
      mesh.position.copy(muzzle);
      mesh.lookAt(muzzle.clone().add(aim));
      this.group.add(mesh);
      this.projs.push({ kind: m.kind === 'cannon' ? 'shell' : 'bullet', mesh, pos: muzzle, vel: aim.multiplyScalar(W.speed), life: W.range / W.speed + 0.15, dmg: W.dmg });
      this.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, m.kind === 'cannon' ? 1.6 : 0.7);
      if (m.kind === 'cannon') this.fx.smoke(muzzle.x, muzzle.y, muzzle.z, false);
      // guns fire in short bursts, then pause; the cannon reloads after every shot
      m.shots++;
      if (m.shots >= W.burst) { m.shots = 0; m.cool = W.cool; } else m.cool = W.gap;
    }
  }

  private updateProjectiles(dt: number) {
    const s = this.s;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      let done = false;
      if (p.kind === 'mortar') {
        p.k! += dt / p.dur!;
        const k = Math.min(1, p.k!);
        p.pos.lerpVectors(p.start!, p.target!, k);
        p.pos.y = 4 + 26 * 4 * k * (1 - k) * (1 - k * 0.15);
        p.mesh.position.copy(p.pos);
        (p.ring!.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * Math.abs(Math.sin(k * 18));
        if (k >= 1) {
          const tx = p.target!.x, tz = p.target!.z;
          this.fx.explosion(tx, 1, tz, 1.2);
          this.fx.splash(tx, waveH(tx, tz, this.T), tz, 1.8);
          if (playerHullDist(s, tx, tz) < 6.5) this.hooks.hitPlayer(p.dmg, tx, tz, 'shell');
          this.group.remove(p.ring!);
          done = true;
        }
      } else {
        p.pos.addScaledVector(p.vel, dt);
        p.mesh.position.copy(p.pos);
        p.life -= dt;
        if (p.kind === 'harpoon') {
          if (playerHullDist(s, p.pos.x, p.pos.z) < 7.5) {
            this.hooks.hitPlayer(p.dmg, p.pos.x, p.pos.z, 'harpoon');
            if (p.from && p.from.state !== 'sinking' && !this.tether) this.startTether(p.from, p.pos.x, p.pos.z);
            done = true;
          }
        } else {
          for (const e of this.enemies) {
            if (e.state === 'sinking') continue;
            const h = e.hull();
            if (segDist(p.pos.x, p.pos.z, h.ax, h.az, h.bx, h.bz) < h.r + 0.6) {
              const killed = e.damage(p.dmg);
              if (p.kind === 'shell') { this.fx.explosion(p.pos.x, 2, p.pos.z, 0.9); }
              else this.fx.muzzle(p.pos.x, 1.6, p.pos.z, 0.6);
              if (killed) { this.fx.explosion(e.s.x, 2, e.s.z, 1.6); this.hooks.onKill(e); }
              done = true;
              break;
            }
          }
        }
        if (!done && p.life <= 0) {
          this.fx.splash(p.pos.x, waveH(p.pos.x, p.pos.z, this.T), p.pos.z, p.kind === 'shell' ? 1.2 : p.kind === 'harpoon' ? 0.8 : 0.35);
          done = true;
        }
      }
      if (done) { this.group.remove(p.mesh); this.projs.splice(i, 1); }
    }
  }

  private startTether(e: Enemy, x: number, z: number) {
    const s = this.s;
    const dx = x - s.x, dz = z - s.z;
    const lx = Math.cos(s.yaw) * dx - Math.sin(s.yaw) * dz;
    const side = lx < 0 ? -1 : 1;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe0d4b8 }));
    line.frustumCulled = false;
    this.group.add(line);
    this.tether = { e, t: 0, side, line };
    e.tether = { t: 0 };
    this.hooks.toast(t('harpooned'), 3);
  }

  private updateTether(dt: number) {
    const tt = this.tether;
    if (!tt) return;
    const s = this.s, e = tt.e;
    if (e.state === 'sinking') { this.endTether(false); return; }
    tt.t += dt;
    const b = e.bow();
    const hook = this.boat.localToWorld(new THREE.Vector3(tt.side * 8, 2, 0));
    const pos = tt.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, b.x, 2, b.z);
    pos.setXYZ(1, hook.x, hook.y, hook.z);
    pos.needsUpdate = true;
    const d = Math.hypot(b.x - s.x, b.z - s.z);
    if (d > TETHER_SNAP) { this.endTether(true); return; }
    // the line drags the boat toward the raider
    s.x += (b.x - s.x) / (d || 1) * 2.2 * dt;
    s.z += (b.z - s.z) / (d || 1) * 2.2 * dt;
    s.speed *= 1 - 0.35 * dt;
    if (tt.t >= HARPOON_STEAL_TIME) {
      const name = this.hooks.steal(tt.side);
      this.hooks.toast(name ? `${t('stolen')}：${name}` : t('stealMiss'), 3);
      this.endTether(false);
      e.state = 'flee';
      e.t = 0;
    }
  }
}
