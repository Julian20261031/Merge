// Arcade boat handling: the stick points where you want to go, the boat turns toward it and throttles up.
// Shared by the player and by enemy boats (which pass their own top speed and hull size).
import { Roof } from '../world/map';
import { clamp } from '../core/noise';

export interface BoatState {
  x: number; z: number; yaw: number;   // yaw = rotation.y; forward = (-sin yaw, -cos yaw)
  yawRate: number;                     // rad/s, eased so turns build up and settle
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
  turnRate: 1.25,      // rad/s at cruising speed
  turnAccel: 1.9,      // rad/s² — how fast a turn builds up or unwinds
  turnSpeedRef: 7,     // below this speed the rudder bites less
  weightSlow: 0.022,   // max speed lost per unit of cargo weight
  minSpeedFactor: 0.5,
  fuelIdle: 0.08,      // per second
  fuelThrottle: 0.5,   // per second at full throttle, before weight
  fuelWeight: 0.015,
};

export interface StepOpts { maxSpeed?: number; turnRate?: number; hull?: number; burnsFuel?: boolean }

export const forward = (s: { yaw: number }) => ({ fx: -Math.sin(s.yaw), fz: -Math.cos(s.yaw) });
export const speedCap = (weight: number, max = TUNING.maxSpeed) => max * clamp(1 - weight * TUNING.weightSlow, TUNING.minSpeedFactor, 1);

export function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** input: desired direction on the water (x, z) with magnitude 0..1. */
export function stepBoat(s: BoatState, ix: number, iz: number, weight: number, dt: number, roofs: Roof[], o: StepOpts = {}) {
  const mag = Math.min(1, Math.hypot(ix, iz));
  let throttle = 0, targetRate = 0;
  const bite = 0.4 + 0.6 * Math.min(1, s.speed / TUNING.turnSpeedRef);
  const maxRate = (o.turnRate ?? TUNING.turnRate) * bite * (s.fuel > 0 ? 1 : 0.35);
  if (mag > 0.08) {
    const diff = angleDiff(s.yaw, Math.atan2(-ix, -iz));
    targetRate = clamp(diff * 2.0, -maxRate, maxRate);
    throttle = mag * Math.max(0.3, Math.cos(diff));
  }
  const acc = TUNING.turnAccel * dt;
  s.yawRate += clamp(targetRate - s.yawRate, -acc, acc);
  s.yaw += s.yawRate * dt;
  if (s.fuel <= 0) throttle = 0;
  s.throttle = throttle;
  const cap = speedCap(weight, o.maxSpeed);
  if (throttle > 0) s.speed += (cap * throttle - s.speed) * Math.min(1, TUNING.accel * dt / cap * 2);
  else s.speed = Math.max(0, s.speed - TUNING.brake * dt);
  s.speed -= s.speed * TUNING.drag * dt * (throttle > 0 ? 0.2 : 1);
  s.speed = Math.max(0, s.speed);

  if (o.burnsFuel !== false) s.fuel = Math.max(0, s.fuel - (TUNING.fuelIdle + throttle * TUNING.fuelThrottle * (1 + weight * TUNING.fuelWeight)) * dt);

  const { fx, fz } = forward(s);
  s.x += fx * s.speed * dt;
  s.z += fz * s.speed * dt;
  s.bump += dt;
  collideRoofs(s, roofs, o.hull ?? 1);
}

/** Three circles along the hull pushed out of every rooftop (rotated rectangles). Returns true on contact. */
export function collideRoofs(s: BoatState, roofs: Roof[], hull = 1): boolean {
  const { fx, fz } = forward(s);
  let hit = false;
  for (const k of [-13, 0, 12]) {
    const cx = s.x - fx * k * hull, cz = s.z - fz * k * hull, rad = (k === 0 ? 8.5 : 6.5) * hull;
    for (const R of roofs) {
      const dx = cx - R.x, dz = cz - R.z;
      if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
      const c = Math.cos(R.rot), sn = Math.sin(R.rot);
      const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
      const qx = clamp(lx, -R.w / 2, R.w / 2), qz = clamp(lz, -R.d / 2, R.d / 2);
      let nx = lx - qx, nz = lz - qz;
      const dist = Math.hypot(nx, nz);
      if (dist >= rad) continue;
      let pen: number;
      if (dist > 1e-4) { nx /= dist; nz /= dist; pen = rad - dist; }
      else {
        const ox = R.w / 2 - Math.abs(lx), oz = R.d / 2 - Math.abs(lz);
        if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; pen = ox + rad; } else { nx = 0; nz = Math.sign(lz) || 1; pen = oz + rad; }
      }
      const wx = c * nx + sn * nz, wz = -sn * nx + c * nz;
      s.x += wx * pen; s.z += wz * pen;
      if (s.bump > 0.4 && s.speed > 3) s.bump = 0;
      s.speed *= 0.6;
      hit = true;
    }
  }
  return hit;
}

/** Is a world point inside (or near) any rooftop? Used by enemy steering to look ahead. */
export function roofNear(x: number, z: number, roofs: Roof[], pad: number): Roof | null {
  for (const R of roofs) {
    const dx = x - R.x, dz = z - R.z;
    if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
    const c = Math.cos(R.rot), sn = Math.sin(R.rot);
    const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
    if (Math.abs(lx) < R.w / 2 + pad && Math.abs(lz) < R.d / 2 + pad) return R;
  }
  return null;
}
