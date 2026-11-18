import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Geometry toolkit used by weapons, arms, characters and props.
 * The goal is to avoid raw cubes: everything is bevelled, extruded from silhouettes or lathed.
 */

const _n = new THREE.Vector3(), _p = new THREE.Vector3();
/** Box/tri-planar projected UVs in object space (meters * scale), so textures never stretch. */
export function boxUV(geo: THREE.BufferGeometry, scale = 1, offset = 0) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute, nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i);
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    let u: number, v: number;
    if (ax >= ay && ax >= az) { u = _p.z * Math.sign(_n.x || 1); v = _p.y; }
    else if (ay >= az) { u = _p.x; v = _p.z * -Math.sign(_n.y || 1); }
    else { u = -_p.x * Math.sign(_n.z || 1); v = _p.y; }
    uv[i * 2] = u * scale + offset; uv[i * 2 + 1] = v * scale + offset;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Cylindrical UVs around an axis (for barrels, grips, pipes). */
export function cylUV(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', scaleU = 1, scaleV = 1) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute; const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const [a, b, h] = axis === 'y' ? [_p.x, _p.z, _p.y] : axis === 'x' ? [_p.y, _p.z, _p.x] : [_p.x, _p.y, _p.z];
    uv[i * 2] = (Math.atan2(b, a) / (Math.PI * 2) + .5) * scaleU; uv[i * 2 + 1] = h * scaleV;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}

export function rbox(w: number, h: number, d: number, r = Math.min(w, h, d) * .18, seg = 2) {
  r = Math.min(r, Math.min(w, h, d) / 2 - 1e-4);
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, r));
}

/**
 * Extrudes a side silhouette into a bevelled solid.
 * Points are (forward, up) in meters, forward = towards the muzzle (-Z in model space).
 * Result is centred on X with total thickness = width.
 */
export function profile(points: [number, number][], width: number, bevel = .004, curveSeg = 2, holes: [number, number][][] = []) {
  const shape = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))));
  const depth = Math.max(.0005, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * .9, bevelSegments: curveSeg, curveSegments: 6});
  geo.rotateY(Math.PI / 2); geo.translate(-depth / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/** Rounded polygon helper: generates a smooth outline from corner points with per-corner radius. */
export function roundedOutline(corners: [number, number, number?][], seg = 4): [number, number][] {
  const out: [number, number][] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = corners[(i - 1 + n) % n], [cx, cy, r = 0] = corners[i], [nx, ny] = corners[(i + 1) % n];
    if (!r) { out.push([cx, cy]); continue; }
    const d1 = Math.hypot(px - cx, py - cy), d2 = Math.hypot(nx - cx, ny - cy), rr = Math.min(r, d1 * .5, d2 * .5);
    const ax = cx + (px - cx) / d1 * rr, ay = cy + (py - cy) / d1 * rr, bx = cx + (nx - cx) / d2 * rr, by = cy + (ny - cy) / d2 * rr;
    for (let s = 0; s <= seg; s++) {
      const t = s / seg, it = 1 - t; // quadratic bezier through the corner
      out.push([it * it * ax + 2 * it * t * cx + t * t * bx, it * it * ay + 2 * it * t * cy + t * t * by]);
    }
  }
  return out;
}

/** Lathe around the Z axis (forward). Points are (radius, z). */
export function latheZ(points: [number, number][], seg = 20) {
  const geo = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(Math.max(0.0001, r), z)), seg);
  geo.rotateX(-Math.PI / 2); // lathe Y -> -Z (forward)
  return geo;
}
export function latheY(points: [number, number][], seg = 20) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
}

export function cyl(r: number, h: number, axis: 'x' | 'y' | 'z' = 'z', seg = 16, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, h, seg); // r = bottom radius
  if (axis === 'z') g.rotateX(-Math.PI / 2); else if (axis === 'x') g.rotateZ(-Math.PI / 2);
  return g;
}

export function capsule(r: number, len: number, axis: 'x' | 'y' | 'z' = 'y', cap = 4, radial = 10) {
  const g = new THREE.CapsuleGeometry(r, len, cap, radial);
  if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
  return g;
}

/** Tube along a path of points (pipes, cables). */
export function tube(points: THREE.Vector3[], r: number, seg = 32, radial = 8) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, radial, false);
}

function clean(g: THREE.BufferGeometry) {
  let geo = g.index ? g.toNonIndexed() : g;
  if (geo === g) geo = g.clone();
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  if (!geo.getAttribute('uv')) boxUV(geo);
  geo.clearGroups();
  return geo;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3();

export interface PartOptions {pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] | number; uv?: number | 'keep' | {cyl: 'x' | 'y' | 'z'; u?: number; v?: number}}

/**
 * Collects many small parts and merges them into a single mesh per material.
 * This keeps detailed weapons/props at a handful of draw calls.
 */
export class MeshBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, o: PartOptions = {}) {
    const g = geo.clone();
    if (o.uv !== 'keep') {
      if (typeof o.uv === 'object') cylUV(g, o.uv.cyl, o.uv.u ?? 1, o.uv.v ?? 1);
      else boxUV(g, o.uv ?? 6);
    }
    const s = o.scale === undefined ? 1 : o.scale;
    _s.set(...(typeof s === 'number' ? [s, s, s] as [number, number, number] : s));
    _q.setFromEuler(_e.set(...(o.rot ?? [0, 0, 0])));
    _v.set(...(o.pos ?? [0, 0, 0]));
    _m.compose(_v, _q, _s); g.applyMatrix4(_m);
    let list = this.parts.get(mat); if (!list) { list = []; this.parts.set(mat, list); }
    list.push(clean(g)); g.dispose();
    return this;
  }
  build(castShadow = true, receiveShadow = true, name = 'batch') {
    const group = new THREE.Group(); group.name = name;
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false); list.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow; group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}
