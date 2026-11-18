import * as THREE from 'three';

/**
 * Procedural PBR texture factory.
 * Every surface is generated from a tileable height field, from which we derive:
 *  - albedo (sRGB) with baked cavity,
 *  - tangent-space normal map (OpenGL convention, +Y up),
 *  - roughness map (stored in G channel, as three.js expects),
 *  - ambient occlusion map (R channel).
 * Results are cached, so each surface is generated once per session.
 */

export type SurfaceKind =
  | 'asphalt' | 'concretePanel' | 'concreteSmooth' | 'corrugated' | 'treadPlate' | 'paintedMetal' | 'woodPlanks'
  | 'polymer' | 'knurl' | 'brushed' | 'cerakote' | 'fabric' | 'gloveWeave' | 'rubberGrip' | 'glassGrime' | 'roofMetal';

export interface PBRSet {map:THREE.Texture;normalMap:THREE.Texture;roughnessMap:THREE.Texture;aoMap:THREE.Texture}

const cache = new Map<string, PBRSet>();
export const TextureSettings = {anisotropy: 8, size: 512};

// ---------- Tileable noise ----------
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hash(x: number, y: number, seed: number) { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16); return (h >>> 0) / 4294967296; }
function smooth(t: number) { return t * t * (3 - 2 * t); }
/** Value noise tiled with integer period. */
function vnoise(u: number, v: number, period: number, seed: number) {
  const x = u * period, y = v * period, xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period, x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
function fbm(u: number, v: number, base: number, oct: number, seed: number) {
  let sum = 0, amp = .5, norm = 0, p = base;
  for (let i = 0; i < oct; i++) { sum += vnoise(u, v, p, seed + i * 17) * amp; norm += amp; amp *= .5; p *= 2; }
  return sum / norm;
}

interface Field {n:number;H:Float32Array;A:Float32Array;R:Float32Array}
function field(n: number): Field { return {n, H: new Float32Array(n * n), A: new Float32Array(n * n * 3), R: new Float32Array(n * n)}; }
function setA(f: Field, i: number, r: number, g: number, b: number) { f.A[i * 3] = r; f.A[i * 3 + 1] = g; f.A[i * 3 + 2] = b; }
function hex(c: string): [number, number, number] { const col = new THREE.Color(c); return [col.r, col.g, col.b]; }
// Works in sRGB-ish space for painting, which keeps art direction intuitive.
function hexS(c: string): [number, number, number] { const v = parseInt(c.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }

function each(f: Field, fn: (i: number, u: number, v: number, x: number, y: number) => void) {
  const n = f.n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) fn(y * n + x, x / n, y / n, x, y);
}

// ---------- Surface generators (albedo written in sRGB 0..1) ----------
const generators: Record<SurfaceKind, (f: Field) => {normal: number; cavity: number}> = {
  asphalt(f) {
    const base = hexS('#4f5654'), r = rng(11);
    each(f, (i, u, v) => {
      const macro = fbm(u, v, 3, 3, 4), grain = fbm(u, v, 64, 3, 9), fine = hash(i, 7, 3);
      let h = grain * .6 + fine * .25 + macro * .15;
      const tone = .86 + macro * .22 + (fine - .5) * .1;
      f.H[i] = h; f.R[i] = .88 + (fine - .5) * .1;
      setA(f, i, base[0] * tone, base[1] * tone, base[2] * tone * 1.01);
    });
    // aggregate stones
    const n = f.n;
    for (let s = 0; s < n * 1.4; s++) {
      const cx = r() * n, cy = r() * n, rad = 1 + r() * 2.4, light = r() > .5 ? 1.25 : .78;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy) / rad; if (d > 1) continue;
        const x = ((Math.floor(cx + dx) % n) + n) % n, y = ((Math.floor(cy + dy) % n) + n) % n, i = y * n + x;
        f.H[i] += (1 - d * d) * .35; f.R[i] = .7; f.A[i * 3] *= light; f.A[i * 3 + 1] *= light; f.A[i * 3 + 2] *= light;
      }
    }
    // hairline cracks via random walks
    for (let c = 0; c < 5; c++) {
      let x = r() * n, y = r() * n, a = r() * Math.PI * 2;
      for (let k = 0; k < n * .5; k++) {
        a += (r() - .5) * .5; x += Math.cos(a); y += Math.sin(a);
        const xi = ((Math.floor(x) % n) + n) % n, yi = ((Math.floor(y) % n) + n) % n, i = yi * n + xi;
        f.H[i] -= .45; f.A[i * 3] *= .62; f.A[i * 3 + 1] *= .62; f.A[i * 3 + 2] *= .62; f.R[i] = .95;
      }
    }
    return {normal: 2.2, cavity: .35};
  },
  concretePanel(f) {
    const base = hexS('#a3a196'), n = f.n;
    each(f, (i, u, v, x, y) => {
      const macro = fbm(u, v, 4, 4, 21), pores = hash(x, y, 5), mid = fbm(u, v, 24, 3, 31);
      const pu = (u * 2) % 1, pv = (v * 2) % 1; // 2x2 panels
      const jx = Math.min(pu, 1 - pu) * n * .5, jy = Math.min(pv, 1 - pv) * n * .5;
      const joint = Math.min(jx, jy);
      let h = .55 + mid * .25 + (pores < .02 ? -.4 : 0);
      if (joint < 2.2) h -= (1 - joint / 2.2) * .9;
      // form-tie holes
      for (const [tx, ty] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) {
        const d = Math.hypot((((pu * 2) % 1) - tx) * n * .5, (((pv * 2) % 1) - ty) * n * .5); if (d < 3.2) h -= (1 - d / 3.2) * .7;
      }
      // vertical rain streaks for weathering
      const streak = fbm(u, 0, 48, 2, 41) * (1 - Math.abs(pv - .1)) * .18;
      const tone = .84 + macro * .26 - streak + (pores - .5) * .05 - (joint < 2.2 ? .12 : 0);
      f.H[i] = h; f.R[i] = .86 + mid * .1;
      setA(f, i, base[0] * tone, base[1] * tone, base[2] * tone);
    });
    return {normal: 2.4, cavity: .55};
  },
  concreteSmooth(f) {
    const base = hexS('#9a998f');
    each(f, (i, u, v, x, y) => {
      const macro = fbm(u, v, 3, 4, 51), mid = fbm(u, v, 32, 3, 52), p = hash(x, y, 53);
      f.H[i] = mid * .6 + (p < .015 ? -.5 : 0); f.R[i] = .85 + mid * .1;
      const t = .86 + macro * .22 + (p - .5) * .05; setA(f, i, base[0] * t, base[1] * t, base[2] * t);
    });
    return {normal: 1.6, cavity: .4};
  },
  corrugated(f) {
    each(f, (i, u, v) => {
      const wave = .5 + .5 * Math.sin(u * Math.PI * 2 * 8), trap = Math.max(0, Math.min(1, (wave - .5) * 2.4 + .5));
      const dirt = fbm(u, v, 6, 4, 61), rust = fbm(u, v, 18, 3, 62);
      const drip = Math.pow(fbm(u * 8, v * .5, 8, 2, 63), 3) * (1 - v) * .5;
      f.H[i] = trap * .9 + dirt * .05;
      const t = .9 + dirt * .15 - drip - (rust > .72 ? (rust - .72) * 1.5 : 0);
      f.R[i] = .5 + dirt * .25 + (rust > .72 ? .3 : 0);
      setA(f, i, .82 * t, .82 * t, .82 * t);
      if (rust > .74) { f.A[i * 3] *= 1.15; f.A[i * 3 + 2] *= .75; }
    });
    return {normal: 3.2, cavity: .3};
  },
  roofMetal(f) {
    each(f, (i, u, v) => {
      const p = (u * 4) % 1, rib = p < .08 ? Math.sin(p / .08 * Math.PI) : 0, dirt = fbm(u, v, 5, 4, 71);
      f.H[i] = rib * .9 + dirt * .04; f.R[i] = .55 + dirt * .3; const t = .85 + dirt * .2; setA(f, i, .8 * t, .82 * t, .82 * t);
    });
    return {normal: 3, cavity: .35};
  },
  treadPlate(f) {
    const n = f.n;
    each(f, (i, u, v, x, y) => {
      const cu = (u * 8) % 1 - .5, cv = (v * 8) % 1 - .5, odd = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0;
      const a = odd ? .7 : -.7, ru = cu * Math.cos(a) - cv * Math.sin(a), rv = cu * Math.sin(a) + cv * Math.cos(a);
      const lozenge = Math.max(0, 1 - (Math.pow(ru / .38, 2) + Math.pow(rv / .1, 2)));
      const wear = fbm(u, v, 6, 3, 81);
      f.H[i] = Math.min(1, lozenge * 2.5) * .8 + hash(x, y, 82) * .04;
      f.R[i] = .45 + wear * .25 - lozenge * .15;
      const t = .62 + wear * .18 + lozenge * .22; setA(f, i, .78 * t, .8 * t, .8 * t);
      void n;
    });
    return {normal: 2.6, cavity: .35};
  },
  paintedMetal(f) {
    const r = rng(91);
    each(f, (i, u, v, x, y) => {
      const peel = fbm(u, v, 40, 2, 92), dirt = fbm(u, v, 5, 4, 93);
      f.H[i] = peel * .25; f.R[i] = .48 + dirt * .22; const t = .92 + dirt * .1 - Math.pow(fbm(u, v, 3, 3, 94), 4) * .3;
      setA(f, i, .86 * t, .86 * t, .86 * t); void x; void y;
    });
    // scratches
    const n = f.n;
    for (let s = 0; s < 70; s++) {
      let x = r() * n, y = r() * n; const a = r() * Math.PI, len = 6 + r() * 30;
      for (let k = 0; k < len; k++) { x += Math.cos(a); y += Math.sin(a); const xi = ((Math.floor(x) % n) + n) % n, yi = ((Math.floor(y) % n) + n) % n, i = yi * n + xi; f.A[i * 3] = Math.min(1, f.A[i * 3] * 1.3); f.A[i * 3 + 1] = Math.min(1, f.A[i * 3 + 1] * 1.3); f.A[i * 3 + 2] = Math.min(1, f.A[i * 3 + 2] * 1.3); f.R[i] = .32; f.H[i] -= .25; }
    }
    return {normal: 1.4, cavity: .25};
  },
  woodPlanks(f) {
    const n = f.n;
    each(f, (i, u, v, x, y) => {
      const plank = Math.floor(v * 4), pv = (v * 4) % 1, gap = Math.min(pv, 1 - pv) * n / 4;
      const grain = Math.sin((u * 18 + fbm(u, v, 6, 3, 100 + plank) * 6 + plank * 3.7) * Math.PI * 2) * .5 + .5;
      const ring = Math.pow(grain, 6), knot = fbm(u, v, 10, 2, 110 + plank);
      let h = .6 + grain * .12 - (gap < 1.6 ? .8 * (1 - gap / 1.6) : 0);
      const tone = (.84 + (hash(plank, 3, 7) - .5) * .2) * (1 - ring * .18) * (knot > .78 ? .75 : 1) * (gap < 1.6 ? .55 : 1);
      f.H[i] = h; f.R[i] = .78 + grain * .12;
      setA(f, i, .86 * tone, .74 * tone, .58 * tone); void x; void y;
    });
    return {normal: 2.2, cavity: .45};
  },
  polymer(f) {
    each(f, (i, u, v, x, y) => {
      const st = hash(x, y, 120), m = fbm(u, v, 96, 2, 121);
      f.H[i] = m * .6 + st * .25; f.R[i] = .6 + st * .12; const t = .9 + (st - .5) * .06; setA(f, i, .78 * t, .78 * t, .78 * t); void u; void v;
    });
    return {normal: 1.2, cavity: .15};
  },
  knurl(f) {
    each(f, (i, u, v) => {
      const a = Math.abs(((u + v) * 24) % 1 - .5), b = Math.abs(((u - v + 4) * 24) % 1 - .5);
      const h = Math.min(a, b) * 2; f.H[i] = h; f.R[i] = .8 - h * .15; const t = .7 + h * .3; setA(f, i, .8 * t, .8 * t, .8 * t);
    });
    return {normal: 3, cavity: .45};
  },
  rubberGrip(f) {
    // hexagonal stipple pads
    each(f, (i, u, v, x, y) => {
      const sx = u * 20, sy = v * 20 * 1.1547, row = Math.floor(sy), off = row % 2 ? .5 : 0;
      const cx = (sx + off) % 1 - .5, cy = sy % 1 - .5, d = Math.hypot(cx, cy * .9);
      const bump = Math.max(0, 1 - d / .42); f.H[i] = Math.min(1, bump * 1.8) * .8 + hash(x, y, 130) * .05;
      f.R[i] = .82 - bump * .1; const t = .62 + bump * .25; setA(f, i, .8 * t, .8 * t, .8 * t);
    });
    return {normal: 2.6, cavity: .5};
  },
  brushed(f) {
    each(f, (i, u, v, x, y) => {
      const line = fbm(u * 1, v * 0 + hash(0, y, 140) * .001, 2, 1, 141) * .2 + hash(7, y, 142) * .5 + fbm(u, v, 128, 1, 143) * .3;
      f.H[i] = line * .3; f.R[i] = .32 + line * .14; const t = .9 + line * .12; setA(f, i, .82 * t, .83 * t, .84 * t); void x;
    });
    return {normal: .9, cavity: .1};
  },
  cerakote(f) {
    const r = rng(151), n = f.n;
    each(f, (i, u, v, x, y) => {
      const sp = hash(x, y, 150), m = fbm(u, v, 48, 2, 152), wear = fbm(u, v, 4, 4, 153);
      f.H[i] = m * .3 + sp * .1; f.R[i] = .5 + m * .12 + wear * .08; const t = .9 + (sp - .5) * .05 + wear * .07; setA(f, i, .82 * t, .82 * t, .82 * t);
    });
    for (let s = 0; s < 40; s++) {
      let x = r() * n, y = r() * n; const a = r() * Math.PI, len = 4 + r() * 18;
      for (let k = 0; k < len; k++) { x += Math.cos(a); y += Math.sin(a); const xi = ((Math.floor(x) % n) + n) % n, yi = ((Math.floor(y) % n) + n) % n, i = yi * n + xi; f.A[i * 3] *= 1.18; f.A[i * 3 + 1] *= 1.18; f.A[i * 3 + 2] *= 1.18; f.R[i] = .36; }
    }
    return {normal: 1.1, cavity: .2};
  },
  fabric(f) {
    each(f, (i, u, v, x, y) => {
      const wx = Math.sin(u * Math.PI * 2 * 64), wy = Math.sin(v * Math.PI * 2 * 64), over = ((Math.floor(u * 64) + Math.floor(v * 64)) % 2) ? wx : wy;
      const m = fbm(u, v, 6, 3, 160);
      f.H[i] = .5 + over * .3 + m * .1; f.R[i] = .92; const t = .88 + over * .06 + (m - .5) * .14 + (hash(x, y, 161) - .5) * .04; setA(f, i, .8 * t, .8 * t, .8 * t);
    });
    return {normal: 1.6, cavity: .25};
  },
  gloveWeave(f) {
    each(f, (i, u, v, x, y) => {
      const d1 = Math.sin((u + v) * Math.PI * 2 * 40), d2 = Math.sin((u - v) * Math.PI * 2 * 40), m = fbm(u, v, 8, 3, 170);
      const seam = Math.abs((u * 4) % 1 - .5) < .012 ? -.6 : 0;
      f.H[i] = .5 + d1 * d2 * .25 + seam + m * .1; f.R[i] = .86 + m * .08; const t = .86 + d1 * d2 * .06 + (m - .5) * .12 + (seam ? .12 : 0) + (hash(x, y, 171) - .5) * .03;
      setA(f, i, .8 * t, .8 * t, .8 * t);
    });
    return {normal: 1.8, cavity: .3};
  },
  glassGrime(f) {
    each(f, (i, u, v) => {
      const g = fbm(u, v, 6, 4, 180), streak = fbm(u * 6, v * .4, 6, 2, 181) * v;
      f.H[i] = 0; f.R[i] = .08 + g * .25 + streak * .3; const t = .55 + g * .2 + streak * .3; setA(f, i, .5 * t, .58 * t, .6 * t);
    });
    return {normal: 0, cavity: 0};
  },
};

function bake(kind: SurfaceKind, n: number): PBRSet {
  const f = field(n), conf = generators[kind](f);
  const H = f.H;
  // Normalize height to 0..1 to keep normal strengths consistent.
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < H.length; i++) { lo = Math.min(lo, H[i]); hi = Math.max(hi, H[i]); }
  const range = Math.max(1e-5, hi - lo); for (let i = 0; i < H.length; i++) H[i] = (H[i] - lo) / range;
  const at = (x: number, y: number) => H[((y + n) % n) * n + ((x + n) % n)];
  const albedo = new Uint8ClampedArray(n * n * 4), normal = new Uint8ClampedArray(n * n * 4), rough = new Uint8ClampedArray(n * n * 4), ao = new Uint8ClampedArray(n * n * 4);
  const s = conf.normal * (n / 256);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, o = i * 4;
    const nx = (at(x - 1, y) - at(x + 1, y)) * s, ny = (at(x, y + 1) - at(x, y - 1)) * s, len = Math.hypot(nx, ny, 1);
    normal[o] = (nx / len * .5 + .5) * 255; normal[o + 1] = (ny / len * .5 + .5) * 255; normal[o + 2] = (1 / len * .5 + .5) * 255; normal[o + 3] = 255;
    // cavity = how much lower than neighbourhood the texel is
    const avg = (at(x - 2, y) + at(x + 2, y) + at(x, y - 2) + at(x, y + 2) + at(x - 1, y - 1) + at(x + 1, y + 1) + at(x - 1, y + 1) + at(x + 1, y - 1)) / 8;
    const cav = Math.max(0, Math.min(1, 1 - Math.max(0, avg - H[i]) * 4 * conf.cavity - (1 - H[i]) * conf.cavity * .25));
    albedo[o] = Math.min(255, f.A[i * 3] * cav * 255); albedo[o + 1] = Math.min(255, f.A[i * 3 + 1] * cav * 255); albedo[o + 2] = Math.min(255, f.A[i * 3 + 2] * cav * 255); albedo[o + 3] = 255;
    const r = Math.max(.02, Math.min(1, f.R[i])) * 255; rough[o] = r; rough[o + 1] = r; rough[o + 2] = r; rough[o + 3] = 255;
    const a = (.35 + cav * .65) * 255; ao[o] = a; ao[o + 1] = a; ao[o + 2] = a; ao[o + 3] = 255;
  }
  const tex = (arr: Uint8ClampedArray, srgb: boolean) => {
    let t: THREE.Texture;
    if (typeof document !== 'undefined' && typeof ImageData !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = cv.height = n; cv.getContext('2d')!.putImageData(new ImageData(arr as Uint8ClampedArray<ArrayBuffer>, n, n), 0, 0);
      t = new THREE.CanvasTexture(cv);
    } else {
      t = new THREE.DataTexture(new Uint8Array(arr.buffer), n, n, THREE.RGBAFormat);
      t.needsUpdate = true;
    }
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = TextureSettings.anisotropy; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.userData.shared = true; return t;
  };
  return {map: tex(albedo, true), normalMap: tex(normal, false), roughnessMap: tex(rough, false), aoMap: tex(ao, false)};
}

export function pbr(kind: SurfaceKind, size = TextureSettings.size): PBRSet {
  const key = kind + size; let set = cache.get(key);
  if (!set) { set = bake(kind, size); cache.set(key, set); }
  return set;
}

export interface PBRMaterialOptions {color?: THREE.ColorRepresentation;metalness?:number;roughness?:number;normalScale?:number;size?:number;emissive?:THREE.ColorRepresentation;emissiveIntensity?:number;envMapIntensity?:number;side?:THREE.Side;aoIntensity?:number;physical?:boolean;clearcoat?:number}
/** Creates a shared, physically based material driven by a procedural texture set. */
export function pbrMaterial(kind: SurfaceKind, o: PBRMaterialOptions = {}) {
  const set = pbr(kind, o.size);
  const params = {
    color: o.color ?? '#ffffff', map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    roughnessMap: set.roughnessMap, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0, aoMap: set.aoMap, aoMapIntensity: o.aoIntensity ?? .8,
    emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissiveIntensity ?? 0, envMapIntensity: o.envMapIntensity ?? 1, side: o.side ?? THREE.FrontSide,
  };
  const m = o.physical ? new THREE.MeshPhysicalMaterial({...params, clearcoat: o.clearcoat ?? 0, clearcoatRoughness: .4}) : new THREE.MeshStandardMaterial(params);
  m.userData.shared = true; return m;
}

/** Canvas helper for decals and signs (alpha textures). */
export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  if (typeof document === 'undefined') {
    const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true; t.userData.shared = true; return t;
  }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = TextureSettings.anisotropy; t.userData.shared = true; return t;
}
export {hex};
