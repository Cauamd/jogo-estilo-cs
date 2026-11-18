import * as THREE from 'three';
import {rbox, capsule, cyl} from '../graphics/GeometryKit';
import {pbrMaterial} from '../graphics/TextureFactory';
import type {Actor} from '../shared/types';

const geoCache = new Map<string, THREE.BufferGeometry>();
function G(key: string, fn: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = fn();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const matBank = new Map<string, {
  cloth: THREE.Material;
  clothDark: THREE.Material;
  armor: THREE.Material;
  accent: THREE.Material;
  visor: THREE.Material;
  boots: THREE.Material;
  gunMetal: THREE.Material;
}>();

function getTeamMaterials(team: string) {
  let m = matBank.get(team);
  if (m) return m;
  const vanguard = team === 'VANGUARD';
  m = {
    cloth: pbrMaterial('fabric', {color: vanguard ? '#486866' : '#85735c', roughness: .9}),
    clothDark: pbrMaterial('gloveWeave', {color: vanguard ? '#2b3d3c' : '#4a4035', roughness: .88}),
    armor: pbrMaterial('cerakote', {color: '#253437', metalness: .28, roughness: .72}),
    accent: pbrMaterial('paintedMetal', {color: vanguard ? '#66cfc4' : '#e09d62', metalness: .35, roughness: .48}),
    visor: new THREE.MeshStandardMaterial({
      color: vanguard ? '#1d4d4b' : '#4f331c',
      emissive: vanguard ? '#58e3d2' : '#f29d52',
      emissiveIntensity: .85,
      metalness: .8,
      roughness: .2,
    }),
    boots: pbrMaterial('polymer', {color: '#1d2424', roughness: .78}),
    gunMetal: pbrMaterial('brushed', {color: '#344144', metalness: .82, roughness: .38}),
  };
  m.visor.userData.shared = true;
  matBank.set(team, m);
  return m;
}

export class OperatorModel {
  root = new THREE.Group();
  body = new THREE.Group();
  headGroup = new THREE.Group();
  legs: {hip: THREE.Group; knee: THREE.Group}[] = [];
  arms: {shoulder: THREE.Group; elbow: THREE.Group}[] = [];

  constructor(team: string) {
    const m = getTeamMaterials(team);
    this.root.add(this.body);

    // Torso & Pelvis
    addMesh(this.body, G('torso', () => rbox(.42, .52, .25, .06, 2)), m.cloth, 0, 1.15, 0);
    addMesh(this.body, G('pelvis', () => rbox(.40, .16, .25, .05, 2)), m.clothDark, 0, .85, 0);
    addMesh(this.body, G('collar', () => cyl(.12, .1, 'y', 14)), m.clothDark, 0, 1.44, 0);

    // Tactical Plate Carrier, Pouches, Belt & Backpack
    addMesh(this.body, G('vestF', () => rbox(.38, .42, .08, .025, 2)), m.armor, 0, 1.17, -.13);
    addMesh(this.body, G('vestB', () => rbox(.36, .42, .07, .025, 2)), m.armor, 0, 1.17, .12);
    addMesh(this.body, G('pack', () => rbox(.28, .34, .12, .035, 2)), m.clothDark, 0, 1.19, .19);
    addMesh(this.body, G('chestPatch', () => rbox(.18, .05, .02, .006, 1)), m.accent, 0, 1.29, -.17);
    for (const x of [-.11, 0, .11]) {
      addMesh(this.body, G('pouch', () => rbox(.085, .15, .055, .015, 2)), m.clothDark, x, 1.06, -.18);
    }
    addMesh(this.body, G('belt', () => rbox(.45, .08, .28, .02, 2)), m.armor, 0, .89, 0);
    for (const s of [-1, 1]) {
      addMesh(this.body, G('strap', () => rbox(.08, .14, .28, .02, 2)), m.armor, s * .13, 1.39, 0);
      addMesh(this.body, G('holster', () => rbox(.06, .18, .12, .015, 2)), m.armor, s * .23, .72, 0);
    }

    // Head, Balaclava, Sculpted Tactical Helmet, Headset & Visor
    this.headGroup.position.set(0, 1.59, 0);
    this.body.add(this.headGroup);
    addMesh(this.headGroup, G('head', () => new THREE.SphereGeometry(.155, 16, 14)), m.clothDark, 0, 0, 0);
    addMesh(this.headGroup, G('mask', () => rbox(.22, .12, .18, .04, 2)), m.cloth, 0, -.04, -.04);
    addMesh(this.headGroup, G('helmet', () => new THREE.SphereGeometry(.188, 18, 12, 0, Math.PI * 2, 0, Math.PI * .58)), m.armor, 0, .03, .01);
    addMesh(this.headGroup, G('brim', () => rbox(.29, .055, .14, .018, 2)), m.armor, 0, .06, -.12);
    addMesh(this.headGroup, G('nvg', () => rbox(.09, .065, .04, .01, 1)), m.gunMetal, 0, .08, -.185);
    addMesh(this.headGroup, G('visor', () => rbox(.25, .075, .06, .02, 2)), m.visor, 0, -.005, -.145);
    for (const s of [-1, 1]) {
      addMesh(this.headGroup, G('ear', () => cyl(.055, .04, 'x', 12)), m.armor, s * .175, -.01, .01);
      addMesh(this.headGroup, G('rail', () => rbox(.02, .035, .14, .008, 1)), m.accent, s * .182, .04, 0);
    }

    // Articulated Legs (Hip -> Thigh -> Knee/Shin -> Boot)
    for (const x of [-.125, .125]) {
      const hip = new THREE.Group();
      hip.position.set(x, .82, 0);
      addMesh(hip, G('thigh', () => capsule(.088, .26, 'y', 4, 12)), m.cloth, 0, -.19, 0);
      addMesh(hip, G('thighBand', () => rbox(.185, .05, .195, .015, 1)), m.armor, 0, -.18, 0);

      const knee = new THREE.Group();
      knee.position.set(0, -.38, 0);
      addMesh(knee, G('kneepad', () => rbox(.13, .13, .06, .025, 2)), m.armor, 0, .01, -.085);
      addMesh(knee, G('shin', () => capsule(.074, .26, 'y', 4, 12)), m.cloth, 0, -.18, 0);
      addMesh(knee, G('bootAnkle', () => rbox(.15, .12, .18, .03, 2)), m.boots, 0, -.34, -.01);
      addMesh(knee, G('bootFoot', () => rbox(.16, .10, .28, .035, 2)), m.boots, 0, -.39, -.05);
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({hip, knee});
    }

    // Articulated Arms (Shoulder -> Upper Arm -> Elbow/Forearm -> Gloved Hand)
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * .28, 1.34, 0);
      addMesh(shoulder, G('pauldron', () => rbox(.15, .16, .18, .04, 2)), m.armor, s * .02, -.04, 0);
      addMesh(shoulder, G('patch', () => rbox(.02, .08, .09, .006, 1)), m.accent, s * .095, -.04, 0);
      addMesh(shoulder, G('uarm', () => capsule(.068, .2, 'y', 4, 10)), m.cloth, 0, -.15, -.03, .22, 0, 0);

      const elbow = new THREE.Group();
      elbow.position.set(0, -.26, -.08);
      addMesh(elbow, G('farm', () => capsule(.058, .22, 'z', 4, 10)), m.cloth, 0, -.02, -.14);
      addMesh(elbow, G('glove', () => rbox(.09, .09, .12, .025, 2)), m.boots, 0, -.02, -.28);
      shoulder.add(elbow);
      this.body.add(shoulder);
      this.arms.push({shoulder, elbow});
    }

    // Third-person Weapon Assembly (Bevelled Receiver, Barrel, Handguard, Stock & Curved Mag)
    const gun = new THREE.Group();
    gun.position.set(.12, 1.12, -.38);
    addMesh(gun, G('wRec', () => rbox(.065, .11, .42, .015, 2)), m.gunMetal, 0, 0, 0);
    addMesh(gun, G('wHg', () => rbox(.058, .085, .28, .015, 2)), m.armor, 0, .005, -.32);
    addMesh(gun, G('wBrl', () => cyl(.016, .34, 'z', 10)), m.gunMetal, 0, .015, -.52);
    addMesh(gun, G('wStk', () => rbox(.052, .13, .24, .018, 2)), m.armor, 0, -.02, .28);
    addMesh(gun, G('wMag', () => rbox(.045, .20, .09, .012, 2)), m.armor, 0, -.14, -.08, .22, 0, 0);
    addMesh(gun, G('wAccent', () => rbox(.07, .022, .18, .005, 1)), m.accent, 0, .02, -.05);
    this.body.add(gun);
  }

  update(a: Actor, dt: number, time: number, immediate = false) {
    this.root.visible = a.alive;
    if (!a.alive) return;

    const p = new THREE.Vector3(a.position.x, a.position.y, a.position.z);
    if (immediate || this.root.position.distanceTo(p) > 5) this.root.position.copy(p);
    else this.root.position.lerp(p, 1 - Math.exp(-dt * 18));

    this.root.rotation.y = a.yaw;
    const speed = Math.hypot(a.velocity.x, a.velocity.z);
    const moving = Math.min(1, speed / 5);
    const phase = time * 10.5;

    // Natural two-joint stride with knee bend on back-swing
    this.legs.forEach((leg, i) => {
      const s = Math.sin(phase + i * Math.PI);
      const c = Math.max(0, Math.cos(phase + i * Math.PI));
      leg.hip.rotation.x = s * moving * .55 + (a.crouch ? -.55 : 0);
      leg.knee.rotation.x = -c * moving * .65 + (a.crouch ? .95 : .08);
    });

    const bob = Math.abs(Math.sin(phase)) * .035 * moving;
    this.body.position.y = (a.crouch ? -.38 : 0) + bob;
    this.body.rotation.x = (a.crouch ? .14 : .04 * moving);
    this.body.rotation.z = Math.cos(phase) * .025 * moving;

    this.headGroup.rotation.x = -a.pitch * .45;
    this.arms.forEach((arm, i) => {
      arm.shoulder.rotation.x = -a.pitch * .55 + Math.sin(phase + i * Math.PI) * .06 * moving;
      arm.elbow.rotation.y = i === 0 ? .28 : -.12;
    });
  }
}
