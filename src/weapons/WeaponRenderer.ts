import * as THREE from "three";
import { buildWeaponModel, type WeaponModel } from "./WeaponModels";
import { FirstPersonArms } from "./FirstPersonArms";
import { WeaponAnimationController } from "./WeaponAnimationController";
import { canvasTexture } from "../graphics/TextureFactory";
import type { Actor, WeaponId } from "../shared/types";

const _muzzlePos = new THREE.Vector3();
const _tipPos = new THREE.Vector3();
const _basePos = new THREE.Vector3();

/**
 * Dedicated First-Person Viewmodel Renderer & Manager.
 * Uses an isolated viewmodel scene & perspective camera (60 deg FOV, rendered after depth clear)
 * so weapons never clip into world geometry and maintain consistent tactical proportions.
 */
export class WeaponRenderer {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  root = new THREE.Group();
  gun = new THREE.Group();
  arms: FirstPersonArms;
  anim = new WeaponAnimationController();

  private cache = new Map<WeaponId, WeaponModel>();
  model!: WeaponModel;
  id: WeaponId = "vx47";
  private pending: WeaponId | null = null;
  private switchTime = 0;
  get isSwitching() {
    return this.pending !== null || this.anim.equipProgress < 0.75;
  }

  // Muzzle flash assembly
  flashGroup = new THREE.Group();
  flashLight = new THREE.PointLight("#ffcf78", 0, 1.8, 2);
  flashTime = 0;

  // Subtle knife slash ribbon trail
  private trailGeo: THREE.BufferGeometry;
  private trailMesh: THREE.Mesh;
  private trailHistory = Array.from({ length: 8 }, () => ({
    tip: new THREE.Vector3(),
    base: new THREE.Vector3(),
    age: 1,
  }));
  private trailCursor = 0;
  private trailClock = 0;

  constructor(env: THREE.Texture | null) {
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.95;

    // Dedicated 3-point viewmodel rig for crisp bevel & material read
    const hemi = new THREE.HemisphereLight("#dceef4", "#2e3836", 1.45);
    const key = new THREE.DirectionalLight("#fff0d6", 2.4);
    key.position.set(-1.8, 3.2, 1.6);
    const rim = new THREE.DirectionalLight("#8cd6e8", 1.1);
    rim.position.set(2.2, 1.4, -1.8);
    this.scene.add(hemi, key, rim, this.root);

    this.root.add(this.gun);
    this.arms = new FirstPersonArms(this.root);

    // Stylized multi-plane muzzle flash
    const flashTex = canvasTexture(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 2, 64, 64, 60);
      g.addColorStop(0, "rgba(255,252,230,1)");
      g.addColorStop(0.35, "rgba(255,205,110,0.92)");
      g.addColorStop(0.75, "rgba(255,120,40,0.35)");
      g.addColorStop(1, "rgba(255,90,20,0)");
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? 60 : 22;
        const x = 64 + Math.cos(a) * r,
          y = 64 + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
    });
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const planeGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const p1 = new THREE.Mesh(planeGeo, flashMat);
    const p2 = new THREE.Mesh(planeGeo, flashMat);
    p2.rotation.x = Math.PI / 2;
    const p3 = new THREE.Mesh(planeGeo, flashMat);
    p3.rotation.y = Math.PI / 2;
    p2.position.z = -0.04;
    p3.position.z = -0.04;
    this.flashGroup.add(p1, p2, p3, this.flashLight);
    this.flashGroup.visible = false;
    this.scene.add(this.flashGroup);

    // Knife trail ribbon
    this.trailGeo = new THREE.BufferGeometry();
    const maxPts = 10;
    this.trailGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(maxPts * 2 * 3), 3),
    );
    const indices: number[] = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.trailGeo.setIndex(indices);
    this.trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.MeshBasicMaterial({
      color: "#b8f2ea",
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.trailMesh = new THREE.Mesh(this.trailGeo, trailMat);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = false;
    this.scene.add(this.trailMesh);

    // Pre-build all weapon models once for zero-allocation weapon switching
    for (const wid of ["vx47", "s1", "p9", "viper", "edge"] as WeaponId[]) {
      const m = buildWeaponModel(wid);
      m.root.visible = false;
      this.gun.add(m.root);
      this.cache.set(wid, m);
    }
    this.build("vx47");
  }

  build(id: WeaponId) {
    if (this.model) this.model.root.visible = false;
    this.id = id;
    this.model = this.cache.get(id)!;
    this.model.root.visible = true;
    this.arms.setGrips(this.model.right, this.model.left, true);
    this.anim.resetForWeapon();
    for (const sample of this.trailHistory) sample.age = 1;
    this.trailMesh.visible = false;
  }

  shot(weapon: WeaponId = this.id) {
    if (weapon !== this.id) return;
    this.anim.onFire(this.id, this.anim.adsBlend > 0.5);
    if (this.id !== "edge") {
      this.flashTime = 0.048;
    }
  }

  update(dt: number, a: Actor, elapsed: number, inspect: number, aim: number) {
    if (a.weapon !== this.id) {
      if (!this.pending) this.switchTime = 0.14;
      this.pending = a.weapon;
    } else if (this.pending) {
      this.pending = null;
      this.switchTime = 0;
    }
    if (this.pending) {
      this.switchTime -= dt;
      if (this.switchTime <= 0) {
        this.build(this.pending);
        this.pending = null;
      }
    }
    const aspect = this.camera.aspect;
    // Keep wrists in frame at 4:3 without affecting world FOV or hit detection.
    this.root.position.x = aspect < 1.5 ? -(1.5 - aspect) * 0.055 : 0;
    this.root.position.y = 0;
    this.root.updateMatrixWorld(true);
    // Resolve hands after applying the aspect-ratio correction to their shared parent.
    this.anim.update(
      dt,
      a,
      this.model,
      this.arms,
      elapsed,
      inspect,
      aim,
      this.pending ? 1 : 0,
    );

    // Update muzzle flash transform & intensity
    this.flashTime = Math.max(0, this.flashTime - dt);
    const showFlash =
      this.flashTime > 0 && a.weapon !== "edge" && a.weapon !== "viper";
    this.flashGroup.visible = showFlash;
    if (showFlash) {
      this.model.muzzle.getWorldPosition(_muzzlePos);
      this.flashGroup.position.copy(_muzzlePos);
      this.flashGroup.rotation.z = elapsed * 42;
      const s = 0.75 + (this.flashTime / 0.048) * 0.45;
      this.flashGroup.scale.setScalar(s);
      this.flashLight.intensity = (this.flashTime / 0.048) * 3.5;
    } else {
      this.flashLight.intensity = 0;
    }

    // Update knife slash ribbon trail during attack
    this.trailClock += dt;
    if (
      this.id === "edge" &&
      this.model.tip &&
      this.anim.knifeSwing > 0.05 &&
      this.trailClock >= 1 / 90
    ) {
      this.trailClock = 0;
      this.model.tip.getWorldPosition(_tipPos);
      this.model.muzzle.getWorldPosition(_basePos);
      const h = this.trailHistory[this.trailCursor];
      h.tip.copy(_tipPos);
      h.base.copy(_basePos);
      h.age = 0;
      this.trailCursor = (this.trailCursor + 1) % 8;
    }
    for (let i = this.trailHistory.length - 1; i >= 0; i--) {
      this.trailHistory[i].age += dt;
    }
    let count = 0;
    for (let i = 0; i < 8; i++)
      if (this.trailHistory[(this.trailCursor + 7 - i) % 8].age < 0.11) count++;
    if (count >= 2) {
      this.trailMesh.visible = true;
      const pos = this.trailGeo.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        const h = this.trailHistory[(this.trailCursor + 7 - i) % 8];
        pos.setXYZ(i * 2, h.tip.x, h.tip.y, h.tip.z);
        pos.setXYZ(i * 2 + 1, h.base.x, h.base.y, h.base.z);
      }
      this.trailGeo.setDrawRange(0, (count - 1) * 6);
      pos.needsUpdate = true;
    } else {
      this.trailMesh.visible = false;
    }
  }
}
