// Short-lived combat effects: splashes, explosions, muzzle flashes, smoke. Chunky low-poly shapes to match the art.
import * as THREE from 'three';

const ICO = new THREE.IcosahedronGeometry(1, 0);
const RING = new THREE.TorusGeometry(1, 0.12, 4, 24);
RING.rotateX(Math.PI / 2);
const CONE = new THREE.ConeGeometry(0.35, 1.6, 5);

interface Fx { obj: THREE.Mesh; age: number; life: number; tick: (f: Fx, k: number, dt: number) => void; vel?: THREE.Vector3 }

export class Effects {
  group = new THREE.Group();
  private list: Fx[] = [];

  private add(geo: THREE.BufferGeometry, color: number, life: number, tick: Fx['tick'], opacity = 1): Fx {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    this.group.add(m);
    const f: Fx = { obj: m, age: 0, life, tick };
    this.list.push(f);
    return f;
  }

  splash(x: number, y: number, z: number, size = 1) {
    const ring = this.add(RING, 0xe9efe2, 0.9, (f, k) => {
      f.obj.scale.setScalar(size * (1 + k * 4));
      (f.obj.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    });
    ring.obj.position.set(x, y + 0.2, z);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random();
      const c = this.add(CONE, 0xe9efe2, 0.7, (f, k, dt) => {
        f.vel!.y -= 30 * dt;
        f.obj.position.addScaledVector(f.vel!, dt);
        f.obj.scale.setScalar(size * (1 - k * 0.6));
        (f.obj.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
      c.obj.position.set(x, y, z);
      c.vel = new THREE.Vector3(Math.cos(a) * 3 * size, (8 + Math.random() * 5) * Math.sqrt(size), Math.sin(a) * 3 * size);
    }
  }

  explosion(x: number, y: number, z: number, size = 1) {
    for (let i = 0; i < 7; i++) {
      const hot = i < 4;
      const e = this.add(ICO, hot ? (i % 2 ? 0xf2c230 : 0xe0702a) : 0x3a3530, hot ? 0.5 : 1.6, (f, k, dt) => {
        f.obj.position.addScaledVector(f.vel!, dt);
        f.vel!.multiplyScalar(0.92);
        f.obj.scale.setScalar(size * (hot ? 1.2 + k * 2.2 : 0.8 + k * 3));
        f.obj.rotation.y += dt;
        (f.obj.material as THREE.MeshBasicMaterial).opacity = hot ? 1 - k : 0.7 * (1 - k);
      });
      e.obj.position.set(x, y, z);
      e.vel = new THREE.Vector3((Math.random() - 0.5) * 8 * size, (hot ? 4 : 6) * size + Math.random() * 3, (Math.random() - 0.5) * 8 * size);
    }
  }

  muzzle(x: number, y: number, z: number, size = 1) {
    const m = this.add(ICO, 0xffe08a, 0.09, (f, k) => {
      f.obj.scale.setScalar(size * (1 - k * 0.5) * 0.9);
      (f.obj.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
    m.obj.position.set(x, y, z);
  }

  smoke(x: number, y: number, z: number, dark = true) {
    const s = this.add(ICO, dark ? 0x2e2a26 : 0x77736a, 1.6, (f, k, dt) => {
      f.obj.position.y += 4 * dt;
      f.obj.scale.setScalar(0.5 + k * 1.8);
      f.obj.rotation.x += dt;
      (f.obj.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    });
    s.obj.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.age += dt;
      const k = Math.min(1, f.age / f.life);
      f.tick(f, k, dt);
      if (k >= 1) {
        this.group.remove(f.obj);
        (f.obj.material as THREE.Material).dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const f of this.list) (f.obj.material as THREE.Material).dispose();
    this.list = [];
    this.group.clear();
  }
}
