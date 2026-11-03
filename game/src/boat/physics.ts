// Arcade boat handling: the stick points where you want to go, the boat turns toward it and throttles up.
import { Roof } from '../world/map';
import { clamp } from '../core/noise';

export interface BoatState {
  x: number; z: number; yaw: number;   // yaw = rotation.y; forward = (-sin yaw, -cos yaw)
  speed: number;                       // along forward, units/s
  throttle: number;                    // 0..1, what the engine is doing this frame
  fuel: number; fuelMax: number;
  bump: number;                        // seconds since the last collision (for feedback)
}

export const TUNING = {
  maxSpeed: 15,
  accel: 7,
  drag: 0.55,          // proportional slow-down per second
  brake: 4.0,          // flat slow-down per second when not throttling
  turnRate: 1.35,      // rad/s
  weightSlow: 0.022,   // max speed lost per unit of cargo weight
  minSpeedFactor: 0.5,
  fuelIdle: 0.08,      // per second
  fuelThrottle: 0.5,   // per second at full throttle, before weight
  fuelWeight: 0.015,
};

export const forward = (s: BoatState) => ({ fx: -Math.sin(s.yaw), fz: -Math.cos(s.yaw) });
export const speedCap = (weight: number) => TUNING.maxSpeed * clamp(1 - weight * TUNING.weightSlow, TUNING.minSpeedFactor, 1);

function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** input: desired direction on the water (x, z) with magnitude 0..1. */
export function stepBoat(s: BoatState, ix: number, iz: number, weight: number, dt: number, roofs: Roof[]) {
  const mag = Math.min(1, Math.hypot(ix, iz));
  let throttle = 0;
  if (mag > 0.08) {
    const target = Math.atan2(-ix, -iz);
    const diff = angleDiff(s.yaw, target);
    const turn = TUNING.turnRate * (s.fuel > 0 ? 1 : 0.35) * dt;
    s.yaw += clamp(diff, -turn, turn);
    throttle = mag * Math.max(0.25, Math.cos(diff));
  }
  if (s.fuel <= 0) throttle = 0;
  s.throttle = throttle;
  const cap = speedCap(weight);
  if (throttle > 0) s.speed += (cap * throttle - s.speed) * Math.min(1, TUNING.accel * dt / cap * 2);
  else s.speed = Math.max(0, s.speed - TUNING.brake * dt);
  s.speed -= s.speed * TUNING.drag * dt * (throttle > 0 ? 0.2 : 1);
  s.speed = Math.max(0, s.speed);

  s.fuel = Math.max(0, s.fuel - (TUNING.fuelIdle + throttle * TUNING.fuelThrottle * (1 + weight * TUNING.fuelWeight)) * dt);

  const { fx, fz } = forward(s);
  s.x += fx * s.speed * dt;
  s.z += fz * s.speed * dt;
  s.bump += dt;

  // three circles along the hull against every rooftop (rotated rectangles)
  for (const k of [-13, 0, 12]) {
    const cx = s.x - fx * k, cz = s.z - fz * k, rad = k === 0 ? 8.5 : 6.5;
    for (const R of roofs) {
      const dx = cx - R.x, dz = cz - R.z;
      if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
      const c = Math.cos(R.rot), sn = Math.sin(R.rot);
      // world -> roof local (roof group uses rotation.y = rot)
      const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
      const qx = clamp(lx, -R.w / 2, R.w / 2), qz = clamp(lz, -R.d / 2, R.d / 2);
      let nx = lx - qx, nz = lz - qz;
      const dist = Math.hypot(nx, nz);
      if (dist >= rad) continue;
      let pen: number;
      if (dist > 1e-4) { nx /= dist; nz /= dist; pen = rad - dist; }
      else { // centre inside the roof: push out along the shallow axis
        const ox = R.w / 2 - Math.abs(lx), oz = R.d / 2 - Math.abs(lz);
        if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; pen = ox + rad; } else { nx = 0; nz = Math.sign(lz) || 1; pen = oz + rad; }
      }
      // local normal -> world
      const wx = c * nx + sn * nz, wz = -sn * nx + c * nz;
      s.x += wx * pen; s.z += wz * pen;
      if (s.bump > 0.4 && s.speed > 3) s.bump = 0;
      s.speed *= 0.6;
    }
  }
}
