import * as THREE from "three";
import { pbrMaterial, canvasTexture } from "../graphics/TextureFactory";

/**
 * Shared PBR materials for all first-person weapons, knife and arms.
 * Materials are created once and reused by every weapon build (no per-switch allocations).
 */
export class WeaponMaterialLibrary {
  private static inst?: WeaponMaterialLibrary;
  static get() {
    return (this.inst ??= new WeaponMaterialLibrary());
  }

  /** Painted receiver (signature SPECTRA teal-grey cerakote). */
  paintedMetal = pbrMaterial("cerakote", {
    color: "#4c6464",
    metalness: 0.62,
    roughness: 0.62,
    normalScale: 0.28,
    size: 512,
  });
  /** Secondary painted parts (sand accents on handguard/stock). */
  sandPaint = pbrMaterial("cerakote", {
    color: "#b9a582",
    metalness: 0.2,
    roughness: 1,
    normalScale: 0.6,
    size: 256,
  });
  /** Blackened / parkerized steel (barrel, rail, bolt, pins). */
  darkSteel = pbrMaterial("brushed", {
    color: "#333d42",
    metalness: 0.92,
    roughness: 0.66,
    normalScale: 0.22,
    size: 512,
  });
  /** Bare machined metal edges and exposed parts. */
  bareMetal = pbrMaterial("brushed", {
    color: "#b4b8b9",
    metalness: 1,
    roughness: 0.42,
    normalScale: 0.18,
    size: 512,
  });
  /** Matte polymer (grips, furniture, magazines). */
  polymer = pbrMaterial("polymer", {
    color: "#30363a",
    metalness: 0,
    roughness: 0.96,
    normalScale: 0.12,
    size: 512,
  });
  polymerLight = pbrMaterial("polymer", {
    color: "#4c5357",
    metalness: 0,
    roughness: 0.92,
    normalScale: 0.12,
    size: 512,
  });
  /** Rubber with stippling (grip panels, butt pad). */
  rubber = pbrMaterial("rubberGrip", {
    color: "#2a2e30",
    metalness: 0,
    roughness: 0.98,
    normalScale: 0.22,
    size: 512,
  });
  /** Gold-bronze decorative inlays. */
  accent = pbrMaterial("brushed", {
    color: "#c8995a",
    metalness: 1,
    roughness: 0.7,
    normalScale: 0.3,
    size: 256,
  });
  /** Knife blade satin steel. */
  blade = pbrMaterial("brushed", {
    color: "#d3d8da",
    metalness: 1,
    roughness: 0.55,
    normalScale: 0.08,
    size: 512,
    envMapIntensity: 1.3,
    physical: true,
    clearcoat: 0.2,
  });
  /** Darker bevel/edge band on blade, bright cutting edge. */
  bladeEdge = pbrMaterial("brushed", {
    color: "#eef3f5",
    metalness: 1,
    roughness: 0.28,
    normalScale: 0.2,
    size: 256,
    envMapIntensity: 1.5,
  });
  bladeCoat = pbrMaterial("cerakote", {
    color: "#2c3334",
    metalness: 0.6,
    roughness: 0.85,
    normalScale: 0.5,
    size: 256,
  });
  knurl = pbrMaterial("knurl", {
    color: "#3a3f40",
    metalness: 0.4,
    roughness: 1,
    normalScale: 1,
    size: 256,
  });
  /** Emissive SPECTRA energy strip (very subtle). */
  glow = new THREE.MeshStandardMaterial({
    color: "#1d2b2b",
    emissive: "#58e0cf",
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  lens = new THREE.MeshPhysicalMaterial({
    color: "#8bbccb",
    metalness: 0,
    roughness: 0.06,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.7,
  });
  reticle = new THREE.MeshBasicMaterial({ color: "#ff4c3b" });

  // ---- Arms ----
  glove = pbrMaterial("gloveWeave", {
    color: "#3d4a44",
    roughness: 1,
    normalScale: 0.9,
    size: 256,
  });
  gloveLeather = pbrMaterial("polymer", {
    color: "#2a2f2c",
    roughness: 0.85,
    normalScale: 0.6,
    size: 256,
  });
  knuckle = pbrMaterial("rubberGrip", {
    color: "#262b2a",
    roughness: 0.9,
    normalScale: 0.6,
    size: 256,
  });
  sleeve = pbrMaterial("fabric", {
    color: "#5a6b62",
    roughness: 1,
    normalScale: 1,
    size: 256,
  });
  cuff = pbrMaterial("fabric", {
    color: "#2c3633",
    roughness: 1,
    normalScale: 1,
    size: 256,
  });
  armorPlate = pbrMaterial("cerakote", {
    color: "#384846",
    metalness: 0.3,
    roughness: 0.9,
    normalScale: 0.5,
    size: 256,
  });
  teamStrip = new THREE.MeshStandardMaterial({
    color: "#173533",
    emissive: "#4ad6c4",
    emissiveIntensity: 0.9,
    roughness: 0.5,
  });

  /** Small engraved decal for serial / brand plates. */
  engraving: THREE.MeshStandardMaterial;

  private constructor() {
    const map = canvasTexture(256, 64, (c) => {
      c.fillStyle = "#3d4f50";
      c.fillRect(0, 0, 256, 64);
      c.fillStyle = "#c9b48a";
      c.font = "700 30px Arial";
      c.textBaseline = "middle";
      c.fillText("SPECTRA", 12, 22);
      c.font = "600 16px Arial";
      c.fillStyle = "#9fb3b0";
      c.fillText("VX-47 · CAL 6.8 · 0471-SD", 12, 48);
      c.strokeStyle = "#9fb3b0";
      c.strokeRect(4, 4, 248, 56);
    });
    this.engraving = new THREE.MeshStandardMaterial({
      map,
      metalness: 0.55,
      roughness: 0.6,
    });
    for (const value of Object.values(this)) {
      if (value instanceof THREE.Material) {
        value.userData.shared = true;
        if (value instanceof THREE.MeshStandardMaterial)
          value.roughness = Math.min(1, value.roughness);
      }
    }
  }
}
