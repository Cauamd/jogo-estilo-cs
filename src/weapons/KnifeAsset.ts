import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/**
 * Fantasy Dagger / Karambit asset (`/models/fantasy_dagger_3d_model.glb`).
 *
 * In raw GLB space:
 *  - Pommel ring is at (0, 0.84, -0.42)
 *  - Contoured grip is around (0, 0.76, -0.10)
 *  - Guard / ricasso is around (0, 0.65, +0.10)
 *  - Curved blade tip is at (0, 0.02, +0.36)
 *
 * We center the grip at the origin, rotate 180 deg around Y and +0.78 rad around X,
 * scale to metric size (0.31), and translate to the right-hand grip socket so the
 * handle sits inside the closed fingers, the pommel ring sits below the pinky, and
 * the ornate curved blade extends upward/forward above the thumb & index finger.
 */

const URL = '/models/fantasy_dagger_3d_model.glb';
const SCALE = .31;
const CENTER = new THREE.Vector3(0, .74, -.08);
const PITCH_X = .78;
export const KARAMBIT_GRIP = new THREE.Vector3(0, -.004, .052);

const _xform = new THREE.Matrix4()
  .makeTranslation(KARAMBIT_GRIP.x, KARAMBIT_GRIP.y, KARAMBIT_GRIP.z)
  .multiply(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE))
  .multiply(new THREE.Matrix4().makeRotationX(PITCH_X))
  .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
  .multiply(new THREE.Matrix4().makeTranslation(-CENTER.x, -CENTER.y, -CENTER.z));

/** Converts a GLB-space point to knife model space. */
export function karambitPoint(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).applyMatrix4(_xform);
}

interface KarambitTemplate {geometry: THREE.BufferGeometry; material: THREE.Material}
let template: KarambitTemplate | null = null;
let pending: Promise<KarambitTemplate | null> | null = null;
const listeners: ((t: KarambitTemplate) => void)[] = [];

function bake(geo: THREE.BufferGeometry, material: THREE.Material): KarambitTemplate {
  const g = geo.clone();
  g.applyMatrix4(_xform);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.shared = true;
  material.userData.shared = true;
  return {geometry: g, material};
}

function publish(t: KarambitTemplate) {
  template = t;
  for (const fn of listeners.splice(0)) fn(t);
}

/** Calls `cb` as soon as the dagger GLB is available (immediately if already loaded). */
export function onKarambit(cb: (t: KarambitTemplate) => void) {
  if (template) { cb(template); return; }
  listeners.push(cb);
  void loadKarambit();
}

export function loadKarambit(): Promise<KarambitTemplate | null> {
  if (template) return Promise.resolve(template);
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (pending) return pending;
  pending = new Promise(resolve => {
    new GLTFLoader().load(URL, gltf => {
      let mesh: THREE.Mesh | null = null;
      gltf.scene.traverse(o => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
      if (!mesh) { resolve(null); return; }
      const src = mesh as THREE.Mesh;
      const mat = (Array.isArray(src.material) ? src.material[0] : src.material) as THREE.MeshStandardMaterial;
      mat.envMapIntensity = 1.15;
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) { v.userData.shared = true; v.anisotropy = 8; }
      const t = bake(src.geometry, mat);
      publish(t);
      resolve(t);
    }, undefined, err => { console.warn('Dagger GLB failed to load, using procedural knife.', err); resolve(null); });
  });
  return pending;
}

/** Headless test hook: inject raw GLB geometry synchronously. */
export function injectKarambitForTest(geo: THREE.BufferGeometry) {
  publish(bake(geo, new THREE.MeshStandardMaterial({color: '#c4c7d0', metalness: .82, roughness: .32})));
}
