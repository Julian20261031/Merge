// Layered Gerstner swell with cel lighting, whitecaps, oil slicks, foam around drowned roofs, and an analytic wake.
import * as THREE from 'three';
import { FOG_COLOR, FOG_NEAR, FOG_FAR } from './toon';

export interface Calm { x: number; z: number; hx: number; hz: number; rot: number }

const GW = ([[0.35, 1, 34, 0.75], [-0.55, 1, 21, 0.4], [1, 0.3, 12, 0.2], [-0.2, -1, 7, 0.1]] as const).map(([dx, dz, L, A]) => {
  const l = Math.hypot(dx, dz), k = (2 * Math.PI) / L;
  return { dx: dx / l, dz: dz / l, k, A, w: Math.sqrt(9.8 * k) * 0.55 };
});
const MAX_AMP = GW.reduce((s, g) => s + g.A, 0);

let CALM: Calm[] = [];
/** Overall sea state: 1 = open water, lower for the sheltered camp anchorage. */
let SEA = 1;
export function setSeaState(k: number) { SEA = k; }
export function setCalmZones(z: Calm[]) { CALM = z; }

function calmFactor(x: number, z: number): number {
  let m = 1e3;
  for (const c of CALM) {
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const px = Math.abs(cs * dx - sn * dz) - c.hx, pz = Math.abs(sn * dx + cs * dz) - c.hz;
    m = Math.min(m, Math.hypot(Math.max(px, 0), Math.max(pz, 0)) + Math.min(Math.max(px, pz), 0));
  }
  const t = Math.min(1, Math.max(0, (m - 1) / 13));
  return 0.22 + 0.78 * t * t * (3 - 2 * t);
}
/** Surface height at a world point (ignores the small horizontal Gerstner shift). */
export const waveH = (x: number, z: number, t: number) => SEA * calmFactor(x, z) * GW.reduce((s, g) => s + g.A * Math.sin(g.k * (g.dx * x + g.dz * z) - g.w * t), 0);

const N_CALM = 8;
export const N_TRAIL = 28;
export const TRAIL_LIFE = 5.6;
const GLSL_COMMON = `
  uniform float uTime, uSea; uniform vec4 uR[${N_CALM}]; uniform float uA[${N_CALM}];
  float sdb(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  float roofDist(vec2 p){ float m = 1e3; for (int i = 0; i < ${N_CALM}; i++) { vec2 d = p - uR[i].xy; float c = cos(uA[i]), s = sin(uA[i]); m = min(m, sdb(vec2(c * d.x - s * d.y, s * d.x + c * d.y), uR[i].zw)); } return m; }`;
const GW_GLSL = GW.map((g) => `gw(vec2(${g.dx.toFixed(4)}, ${g.dz.toFixed(4)}), ${g.k.toFixed(4)}, ${g.A.toFixed(3)}, ${g.w.toFixed(4)}, p, off, nrm);`).join('\n');

export function createWater() {
  const SIZE = 720, SEGS = 280, CELL = SIZE / SEGS;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 }, uSea: { value: 1 },
    uR: { value: Array.from({ length: N_CALM }, () => new THREE.Vector4(1e4, 1e4, 0.1, 0.1)) },
    uA: { value: new Array(N_CALM).fill(0) },
    uFlow: { value: new THREE.Vector2(0, 0) },
    uBoat: { value: new THREE.Vector2() }, uFwd: { value: new THREE.Vector2(0, -1) }, uWake: { value: 0 }, uBow: { value: 20.5 },
    uTrail: { value: Array.from({ length: N_TRAIL }, () => new THREE.Vector4(1e4, 1e4, 99, 0)) },
    uTrailF: { value: Array.from({ length: N_TRAIL }, () => new THREE.Vector2(0, -1)) },
    uDeep: { value: new THREE.Color(0x14292a) }, uMid: { value: new THREE.Color(0x2f625b) },
    uShal: { value: new THREE.Color(0x6a9a80) }, uFoam: { value: new THREE.Color(0xe2e4d4) },
    uFogC: { value: new THREE.Color(FOG_COLOR) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLSL_COMMON + `
      varying vec3 vW, vN; varying float vH;
      const float Q = 0.6;
      void gw(vec2 D, float k, float A, float w, vec2 p, inout vec3 off, inout vec3 nrm){
        float f = k * dot(D, p) - w * uTime, c = cos(f), s = sin(f);
        off += vec3(Q * A * D.x * c, A * s, Q * A * D.y * c);
        nrm -= vec3(D.x * k * A * c, Q * k * A * s, D.y * k * A * c);
      }
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec2 p = w.xz;
        float at = uSea * (0.22 + 0.78 * smoothstep(1.0, 14.0, roofDist(p)));
        vec3 off = vec3(0.0), nrm = vec3(0.0, 1.0, 0.0);
        ${GW_GLSL}
        w.xyz += off * at;
        vN = normalize(vec3(nrm.x * at, 1.0 - (1.0 - nrm.y) * at, nrm.z * at));
        vH = off.y * at; vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: GLSL_COMMON + `
      uniform vec2 uFlow, uBoat, uFwd; uniform float uWake, uBow; uniform vec4 uTrail[${N_TRAIL}]; uniform vec2 uTrailF[${N_TRAIL}]; uniform vec3 uDeep, uMid, uShal, uFoam, uFogC;
      varying vec3 vW, vN; varying float vH;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        vec3 n = normalize(vN);
        vec3 L = normalize(vec3(-0.45, 0.75, -0.35)), V = normalize(cameraPosition - vW);
        float g = clamp(vn2(p * 0.006 + 11.0) * 1.2 - 0.1, 0.0, 1.0);
        float hn = clamp(vH / (${MAX_AMP.toFixed(2)} * max(uSea, 0.2)) * 0.5 + 0.5, 0.0, 1.0);
        vec3 trough = mix(uDeep * 1.15, uDeep * 0.85, g);
        vec3 crest = mix(uMid * 1.15 + vec3(0.01, 0.03, 0.02), uMid, g * 0.6);
        vec3 col = mix(trough, crest, smoothstep(0.2, 0.9, hn));
        col *= 0.95 + 0.1 * vn2(p * 0.05 + 3.0);
        vec2 q = (p + vec2(3000.0)) / vec2(17.0, 15.0);
        col += vec3(0.018, 0.035, 0.028) * step(0.16, fract(q.x)) * step(0.16, fract(q.y)) * step(0.3, h21(floor(q)));
        float d = dot(n, L);
        col *= 0.8 + 0.13 * smoothstep(0.55, 0.62, d) + 0.12 * smoothstep(0.78, 0.84, d);
        float fr = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        col = mix(col, uFogC * 1.2, fr * 0.25);
        float sp = smoothstep(0.972, 0.982, dot(n, normalize(L + V)));
        float rd = roofDist(p), sh = 1.0 - smoothstep(0.0, 3.6, rd), fo = 0.0;
        for (int i = 0; i < ${N_CALM}; i++) {
          vec2 dd = p - uR[i].xy; float c = cos(uA[i]), s = sin(uA[i]);
          dd = vec2(c * dd.x - s * dd.y, s * dd.x + c * dd.y);
          float dist = sdb(dd, uR[i].zw), ang = atan(dd.y, dd.x);
          fo = max(fo, (1.0 - smoothstep(0.18, 0.32, abs(dist - 0.45))) * smoothstep(0.36, 0.45, vn2(vec2(ang * 5.0 + float(i) * 5.0, uTime * 0.9))));
          fo = max(fo, 0.45 * (1.0 - smoothstep(0.1, 0.2, abs(dist - 1.9))) * smoothstep(0.5, 0.58, vn2(vec2(ang * 7.0 + float(i) * 3.0, -uTime * 0.7))));
        }
        col = mix(col, uShal * (0.85 + 0.25 * hn), sh * 0.7);
        float oil = smoothstep(0.77, 0.81, vn2(p * 0.06 + vec2(13.0, 7.0)) * 0.65 + vn2(p * 0.15 + uTime * 0.05) * 0.35) * (1.0 - sh);
        float ph = p.x * 0.7 + p.y * 0.35 + vn2(p * 0.3) * 4.0;
        col = mix(col, col * 0.75 + 0.03 * vec3(sin(ph), sin(ph + 2.1), sin(ph + 4.2)) + 0.01, oil * 0.7);
        col = mix(col, vec3(1.0, 0.94, 0.8), sp * 0.1 * (1.0 - oil));
        vec2 fp = p - uFlow * uTime * 0.4;
        float cap = uSea * uSea * smoothstep(0.86, 0.94, hn) * smoothstep(0.66, 0.8, 0.6 * vn2(fp * 0.45) + 0.4 * vn2(fp * 1.1 + 4.0));
        float streak = smoothstep(0.7, 0.76, vn2(vec2(dot(fp, vec2(0.94, -0.33)) * 0.1, dot(fp, vec2(0.33, 0.94)) * 0.7))) * 0.2;
        col = mix(col, uFoam, max(cap * 0.4, streak * 0.5) * (1.0 - oil) * (1.0 - sh * 0.7));
        // wake: every trail point is a ring of foam that keeps spreading where it was laid down,
        // so the wake stays on the water and curves when the boat turns
        float wake = 0.0;
        if (distance(p, uTrail[0].xy) < 80.0) {
          for (int i = 0; i < ${N_TRAIL}; i++) {
            vec4 tr = uTrail[i];
            if (tr.w <= 0.0 || tr.z > ${TRAIL_LIFE.toFixed(1)}) continue;
            float d = distance(p, tr.xy), age = tr.z;
            float r = 2.8 + age * 3.2;
            if (d > r + 3.0) continue;
            float w = 0.32 + age * 0.07;
            float ring = (1.0 - smoothstep(w, w + 0.3, abs(d - r))) * smoothstep(0.55, 0.05, dot((p - tr.xy) / max(d, 0.001), uTrailF[i]));
            float churn = (1.0 - smoothstep(1.3 + age * 0.45, 2.2 + age * 0.7, d)) * (1.0 - smoothstep(0.4, 2.6, age));
            wake = max(wake, max(ring * 0.85, churn) * (1.0 - age / ${TRAIL_LIFE.toFixed(1)}) * tr.w);
          }
          wake *= mix(0.45, 1.0, smoothstep(0.3, 0.6, vn2(p * 0.42 + uTime * 0.25)));
        }
        // bow wave, attached to the hull
        vec2 bd = p - uBoat; float al = dot(bd, uFwd); float la = dot(bd, vec2(-uFwd.y, uFwd.x));
        float b = uBow - al;
        if (b > 0.0 && b < 14.0) {
          float bow = 1.0 - smoothstep(0.25, 0.5, abs(abs(la) - (0.4 + b * 0.62)));
          wake = max(wake, bow * uWake * (1.0 - smoothstep(4.0, 14.0, b)) * smoothstep(0.3, 0.45, vn2(vec2(b * 0.6 - uTime * 1.5, la))));
        }
        col = mix(col, uFoam, max(fo * 0.85, wake * 0.85));
        col = mix(col, uFogC, smoothstep(${FOG_NEAR.toFixed(1)}, ${FOG_FAR.toFixed(1)}, length(vW - cameraPosition)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  return {
    mesh,
    /** trail: newest first, each { x, z, born (sim time), strength 0..1 } */
    update(t: number, center: THREE.Vector3, boat: { x: number; z: number; fx: number; fz: number; speed01: number; bow?: number }, trail: { x: number; z: number; born: number; k: number; fx: number; fz: number }[] = []) {
      for (let i = 0; i < N_TRAIL; i++) {
        const tr = trail[i];
        if (tr) { uniforms.uTrail.value[i].set(tr.x, tr.z, t - tr.born, tr.k); uniforms.uTrailF.value[i].set(tr.fx, tr.fz); } else uniforms.uTrail.value[i].set(1e4, 1e4, 99, 0);
      }
      uniforms.uTime.value = t;
      uniforms.uSea.value = SEA;
      mesh.position.set(Math.round(center.x / CELL) * CELL, 0, Math.round(center.z / CELL) * CELL);
      uniforms.uBoat.value.set(boat.x, boat.z);
      uniforms.uFwd.value.set(boat.fx, boat.fz);
      uniforms.uFlow.value.set(-boat.fx * 1.3 * boat.speed01, -boat.fz * 1.3 * boat.speed01);
      uniforms.uWake.value = boat.speed01;
      uniforms.uBow.value = boat.bow ?? 20.5;
      // the nearest drowned roofs get calm water, shallows and foam rings
      const near = CALM.map((c) => ({ c, d: Math.hypot(c.x - center.x, c.z - center.z) })).sort((a, b) => a.d - b.d).slice(0, N_CALM);
      for (let i = 0; i < N_CALM; i++) {
        const c = near[i]?.c;
        if (c) { uniforms.uR.value[i].set(c.x, c.z, c.hx, c.hz); uniforms.uA.value[i] = c.rot; }
        else uniforms.uR.value[i].set(1e4, 1e4, 0.1, 0.1);
      }
    },
  };
}
