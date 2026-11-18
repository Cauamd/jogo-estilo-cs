import * as THREE from 'three';
import {pbr, canvasTexture, TextureSettings, type SurfaceKind} from './TextureFactory';
import {rbox, boxUV} from './GeometryKit';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const bevelCache = new Map<string, THREE.BufferGeometry>();

export function surface(
  base: string,
  kind: 'concrete' | 'metal' | 'wood' | 'asphalt' | SurfaceKind,
  repeatX = 1,
  repeatY = repeatX
) {
  const key = `${base}:${kind}:${repeatX}:${repeatY}`;
  let cached = matCache.get(key);
  if (cached) return cached;

  const surfaceKind: SurfaceKind =
    kind === 'concrete'
      ? 'concretePanel'
      : kind === 'metal'
        ? 'paintedMetal'
        : kind === 'wood'
          ? 'woodPlanks'
          : kind;

  const set = pbr(surfaceKind, surfaceKind === 'asphalt' ? 512 : 256);
  const cloneTex = (t: THREE.Texture, srgb: boolean) => {
    if (repeatX === 1 && repeatY === 1) return t;
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeatX, repeatY);
    c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    c.anisotropy = TextureSettings.anisotropy;
    c.needsUpdate = true;
    c.userData.shared = true;
    return c;
  };

  const isMetal = kind === 'metal' || kind === 'corrugated' || kind === 'treadPlate' || kind === 'paintedMetal' || kind === 'roofMetal';
  const mat = new THREE.MeshStandardMaterial({
    color: base,
    map: cloneTex(set.map, true),
    normalMap: cloneTex(set.normalMap, false),
    normalScale: new THREE.Vector2(kind === 'asphalt' ? .85 : 1.0, kind === 'asphalt' ? .85 : 1.0),
    roughnessMap: cloneTex(set.roughnessMap, false),
    aoMap: cloneTex(set.aoMap, false),
    aoMapIntensity: .75,
    roughness: isMetal ? .54 : kind === 'asphalt' ? .88 : .86,
    metalness: isMetal ? .62 : .04,
  });
  mat.userData.shared = true;
  matCache.set(key, mat);
  return mat;
}

export function sign(text: string, color = '#d6e2dd', background = '#18383c', w = 1024, h = 256) {
  const map = canvasTexture(w, h, c => {
    // Rich industrial painted sign with subtle gradient, border rivets and stencil typography
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, background);
    grad.addColorStop(1, '#102124');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);

    c.strokeStyle = color;
    c.lineWidth = Math.max(3, h * .022);
    c.strokeRect(12, 12, w - 24, h - 24);

    // Corner diagonal accents
    c.fillStyle = color;
    const cs = Math.min(w, h) * .07;
    for (const [cx, cy] of [[18, 18], [w - 18 - cs, 18], [18, h - 18 - cs], [w - 18 - cs, h - 18 - cs]]) {
      c.fillRect(cx, cy, cs, Math.max(2, cs * .25));
    }

    c.fillStyle = color;
    c.font = `800 ${Math.round(h * .44)}px "Barlow Condensed", Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2, w * .88);
  });
  const m = new THREE.MeshStandardMaterial({map, roughness: .68, metalness: .15, side: THREE.DoubleSide});
  m.userData.shared = true;
  return m;
}

export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
boxGeo.userData.shared = true;

export function box(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  shadow = true
) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Bevelled architectural/industrial block with metric world-space UVs so textures never stretch. */
export function bevelBox(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  bevel = .035,
  uvScale = .5,
  shadow = true
) {
  const key = `${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}_${bevel.toFixed(3)}_${uvScale.toFixed(2)}`;
  let geo = bevelCache.get(key);
  if (!geo) {
    geo = boxUV(rbox(w, h, d, bevel, 2), uvScale);
    geo.setAttribute('uv2', geo.getAttribute('uv'));
    geo.userData.shared = true;
    bevelCache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const cylCache = new Map<string, THREE.CylinderGeometry>();
export function cylinder(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  mat: THREE.Material,
  axis: 'x' | 'y' | 'z' = 'y',
  segments = 16
) {
  const key = `${r.toFixed(4)}_${h.toFixed(4)}_${segments}`;
  let geo = cylCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(r, r, h, segments);
    geo.userData.shared = true;
    cylCache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
