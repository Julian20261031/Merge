// Cel shading, ink outlines (inverted hull) and small modelling helpers shared by every model.
import * as THREE from 'three';
import { fbm } from '../core/noise';

export const INK = 0x22170f;
export const FOG_COLOR = 0x2c4744;
export const FOG_NEAR = 90;
export const FOG_FAR = 230;

const ramp = new THREE.DataTexture(new Uint8Array([80, 165, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false;
ramp.needsUpdate = true;

const cache = new Map<number, THREE.MeshToonMaterial>();
export function toon(color: number, map?: THREE.Texture | null, o: { side?: THREE.Side; alphaTest?: number } = {}): THREE.MeshToonMaterial {
  const key = !map && !o.side ? color : null;
  if (key !== null && cache.has(key)) return cache.get(key)!;
  const m = new THREE.MeshToonMaterial({
    color: map ? 0xffffff : color, gradientMap: ramp, map: map ?? null,
    side: o.side ?? THREE.FrontSide, transparent: !!o.alphaTest, alphaTest: o.alphaTest ?? 0,
  });
  if (key !== null) cache.set(key, m);
  return m;
}

function outlineMat(thick: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: thick }, uC: { value: new THREE.Color(INK) },
      uFogC: { value: new THREE.Color(FOG_COLOR) }, uFogN: { value: FOG_NEAR }, uFogF: { value: FOG_FAR },
    },
    side: THREE.BackSide,
    vertexShader: `
      uniform float uT; varying float vDepth;
      void main(){
        vec3 p = position + normalize(position + vec3(1e-4)) * uT;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uC, uFogC; uniform float uFogN, uFogF; varying float vDepth;
      void main(){ gl_FragColor = vec4(mix(uC, uFogC, smoothstep(uFogN, uFogF, vDepth)), 1.0); }`,
  });
}
export const OUT = { thin: outlineMat(0.12), mid: outlineMat(0.19), thick: outlineMat(0.3) };
export type OutlineKind = keyof typeof OUT | false;

export interface PartOpts { rx?: number; ry?: number; rz?: number; order?: THREE.EulerOrder; outline?: OutlineKind }
/** Add a mesh centred on its own geometry (so the radial ink outline wraps it evenly). */
export function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, o: PartOpts = {}): THREE.Mesh {
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x + c.x, y + c.y, z + c.z);
  if (o.order) m.rotation.order = o.order;
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  const ol = o.outline === undefined ? 'thin' : o.outline;
  if (ol) m.add(new THREE.Mesh(geo, OUT[ol]));
  parent.add(m);
  return m;
}

const seg = (d: number) => Math.max(1, Math.ceil(d / 1.2));
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
export const cyl = (r: number, h: number, n = 14) => new THREE.CylinderGeometry(r, r, h, n, seg(h));

let dentSeed = 1;
/** Nothing in this world is straight: push every vertex by a little noise. */
export function dent<T extends THREE.BufferGeometry>(geo: T, amt: number, sc = 0.7): T {
  const p = geo.attributes.position as THREE.BufferAttribute, S = (dentSeed++) * 3.17;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i,
      x + amt * (fbm(x * sc + S, y * sc + z * 0.37, 2) - 0.5) * 2,
      y + amt * (fbm(y * sc + S * 2, z * sc + x * 0.41, 2) - 0.5) * 2,
      z + amt * (fbm(z * sc + S * 3, x * sc + y * 0.29, 2) - 0.5) * 2);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Ring-shaped extrusion (gunwales, pier rims) from an outer and inner outline in world x/z. */
export function ringGeo(outer: number[][], inner: number[][], depth: number) {
  const sh = new THREE.Shape();
  outer.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  const ho = new THREE.Path();
  inner.forEach(([x, z], i) => (i ? ho.lineTo(x, -z) : ho.moveTo(x, -z)));
  ho.closePath();
  sh.holes.push(ho);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function offsetPoly(P: number[][], d: number): number[][] {
  const n = P.length, cx = P.reduce((s, p) => s + p[0], 0) / n, cz = P.reduce((s, p) => s + p[1], 0) / n;
  const raw = P.map((p, i) => {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(m[0], m[1]) || 1;
    m = [m[0] / ml, m[1] / ml];
    const k = Math.min(2, 1 / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]));
    return [m[0] * k, m[1] * k];
  });
  const s = Math.hypot(P[0][0] + raw[0][0] - cx, P[0][1] + raw[0][1] - cz) > Math.hypot(P[0][0] - cx, P[0][1] - cz) ? 1 : -1;
  return P.map((p, i) => [p[0] + raw[i][0] * d * s, p[1] + raw[i][1] * d * s]);
}
