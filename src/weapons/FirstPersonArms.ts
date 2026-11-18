import * as THREE from "three";
import { rbox, latheY, MeshBatch } from "../graphics/GeometryKit";
import { pbrMaterial } from "../graphics/TextureFactory";
import type { GripDef } from "./WeaponModels";

/**
 * Sculpted 3D First-Person Tactical Hands & Forearms.
 *
 * Built with organic lofted palm/metacarpal geometry, 5 articulated fingers (3 phalanges each
 * with contoured finger pads, dorsal plates and smooth joint bridges), thumb thenar muscle,
 * tactical wrist cuff, and anatomically tapered forearm sleeve.
 *
 * Coordinate convention in `socket` space:
 *  - Origin (0,0,0): centre of the weapon grip cylinder.
 *  - +Y: thumb / index side of the hand (-Y = pinky side).
 *  - -Z: direction from knuckles towards fingers (wrapping around the grip).
 *  - +Z: direction from palm back through the wrist & forearm.
 *  - +X (right hand) / -X (left hand): dorsal (back of hand); opposite sign = palmar surface.
 */

interface FingerDef {
  name: string;
  y: number;
  r: number;
  len: [number, number, number];
  splay: number;
}

const FINGERS: FingerDef[] = [
  {
    name: "index",
    y: 0.025,
    r: 0.0084,
    len: [0.038, 0.024, 0.019],
    splay: -0.04,
  },
  { name: "middle", y: 0.008, r: 0.0088, len: [0.042, 0.026, 0.02], splay: 0 },
  {
    name: "ring",
    y: -0.009,
    r: 0.0083,
    len: [0.039, 0.024, 0.019],
    splay: 0.03,
  },
  {
    name: "pinky",
    y: -0.025,
    r: 0.0074,
    len: [0.032, 0.02, 0.017],
    splay: 0.06,
  },
];
const THUMB_LEN: [number, number, number] = [0.032, 0.026, 0.022];

export interface HandPose {
  radius: number;
  /** [finger 0..3][joint 0..2] curl angle in radians. */
  curl: number[][];
  thumbAngles: [number, number, number];
  thumbPitch: number;
  thumbYaw: number;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const G = (k: string, f: () => THREE.BufferGeometry) => {
  let g = geoCache.get(k);
  if (!g) {
    g = f();
    g.userData.shared = true;
    geoCache.set(k, g);
  }
  return g;
};

// Dedicated fine-grain PBR materials for the tactical hands & sleeves (no coarse basketweave)
let handMats: {
  gloveFabric: THREE.MeshStandardMaterial;
  gloveLeather: THREE.MeshStandardMaterial;
  knuckleGuard: THREE.MeshStandardMaterial;
  skinTone: THREE.MeshStandardMaterial;
  cuff: THREE.MeshStandardMaterial;
  sleeve: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
} | null = null;

function getHandMaterials() {
  if (handMats) return handMats;
  handMats = {
    gloveFabric: pbrMaterial("gloveWeave", {
      color: "#415955",
      roughness: 0.92,
      metalness: 0,
      normalScale: 0.28,
      size: 512,
    }),
    gloveLeather: pbrMaterial("polymer", {
      color: "#263733",
      roughness: 0.72,
      metalness: 0,
      normalScale: 0.24,
      size: 512,
    }),
    knuckleGuard: pbrMaterial("cerakote", {
      color: "#283335",
      roughness: 0.42,
      metalness: 0.45,
      normalScale: 0.4,
      size: 256,
    }),
    skinTone: pbrMaterial("polymer", {
      color: "#dca382",
      roughness: 0.62,
      metalness: 0.02,
      normalScale: 0.22,
      size: 256,
    }),
    cuff: pbrMaterial("polymer", {
      color: "#253032",
      roughness: 0.82,
      metalness: 0.12,
      normalScale: 0.4,
      size: 256,
    }),
    sleeve: pbrMaterial("fabric", {
      color: "#384a4c",
      roughness: 0.95,
      metalness: 0,
      normalScale: 0.12,
      size: 512,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: "#d4a359",
      metalness: 0.8,
      roughness: 0.3,
    }),
  };
  handMats.accent.userData.shared = true;
  return handMats;
}

/** Builds a sculpted anatomical phalanx segment along -Z (with flattened oval cross-section). */
function phalanxGeometry(r: number, len: number, distal: boolean) {
  return G(`phal_${r.toFixed(4)}_${len.toFixed(4)}_${distal ? 1 : 0}`, () => {
    const profile: [number, number][] = [
      [0, 0],
      [r * 0.92, 0.002],
      [r * 1.0, len * 0.22],
      [r * 0.96, len * 0.68],
      [distal ? r * 0.72 : r * 0.88, len * 0.92],
      [0, len],
    ];
    const g = latheY(profile, 16);
    g.scale(0.88, 1, 1.04); // slightly flatter dorsally, wider along the finger arch
    g.rotateX(-Math.PI / 2); // +Y -> -Z
    g.computeVertexNormals();
    return g;
  });
}

/** Sculpted anatomical palm (lofted from carpal wrist at z=+0.055 to MCP knuckle arch at z=-0.025). */
function palmGeometry() {
  return G("sculpted_palm", () => {
    const g = rbox(0.028, 0.078, 0.082, 0.011, 4);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      // Taper width towards the wrist (z > 0) and flare slightly at the knuckles (z < 0)
      const tz = (z + 0.041) / 0.082; // 0 = knuckles (-z), 1 = wrist (+z)
      const yScale = 1.04 - tz * 0.24;
      y *= yScale;
      // Slight palmar concavity on the inside (-x) and dorsal arch on the outside (+x)
      const arch = (1 - Math.pow(y / 0.038, 2)) * 0.0035;
      x += arch;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  });
}

export function solvePose(g: GripDef): HandPose {
  const wrap = g.wrap ?? 1;
  const R = g.radius;
  const curl: number[][] = [];

  FINGERS.forEach((f, i) => {
    const radius = contactRadius(R, f.r, f.len[0]);
    const chord = f.len.map(
      (l) => 2 * Math.asin(Math.min(0.92, (l * 0.94) / (2 * radius))),
    );
    // Orient each bone along the chord joining two points on the grip envelope.
    // Adding a full chord angle at every joint previously curled the fingertips into the grip.
    let c = [
      chord[0] * 0.5 * wrap,
      (chord[0] + chord[1]) * 0.5 * wrap,
      (chord[1] + chord[2]) * 0.5 * wrap,
    ];
    if (i === 0 && g.index === "trigger") {
      c = [0.18, 0.68, 0.48];
    } else if (i === 0 && g.index === "straight") {
      c = [0.08, 0.15, 0.1];
    }
    curl.push(c);
  });

  let thumbAngles: [number, number, number] = [0.48, 0.52, 0.35];
  let thumbPitch = 0.22;
  let thumbYaw = 0.58;
  if (g.thumb === "forward") {
    thumbAngles = [0.22, 0.24, 0.14];
    thumbPitch = 0.08;
    thumbYaw = 0.32;
  } else if (g.thumb === "side") {
    thumbAngles = [0.28, 0.32, 0.18];
    thumbPitch = 0.15;
    thumbYaw = 0.38;
  }

  return { radius: R, curl, thumbAngles, thumbPitch, thumbYaw };
}

/** No-op stub kept so headless test scripts remain compatible. */
export function injectHandGeometryForTest(_rawGeo?: THREE.BufferGeometry) {}

class Hand {
  group = new THREE.Group();
  rig = new THREE.Group();
  palmGroup = new THREE.Group();
  wrist = new THREE.Object3D();
  forearm = new THREE.Group();
  joints: THREE.Object3D[][] = [];
  thumbBase = new THREE.Object3D();
  thumbJoints: THREE.Object3D[] = [];

  cur: HandPose | null = null;
  target: HandPose | null = null;
  extraCurl = [0, 0, 0, 0];
  open = 0;

  constructor(public left: boolean) {
    const m = getHandMaterials();
    this.group.matrixAutoUpdate = false;
    this.group.add(this.rig);
    // Mirror on X for the left hand so all anatomical offsets/rotations are symmetric
    if (left) this.rig.scale.x = -1;

    this.rig.add(this.palmGroup);

    // 1. Sculpted Palm & Metacarpus
    const palmMesh = new THREE.Mesh(palmGeometry(), m.gloveFabric);
    palmMesh.castShadow = palmMesh.receiveShadow = true;
    this.palmGroup.add(palmMesh);

    // Leather palmar grip patch (inside of palm, -X)
    const palmPatch = new THREE.Mesh(
      G("palmPatch", () => rbox(0.006, 0.064, 0.062, 0.0025, 2)),
      m.gloveLeather,
    );
    palmPatch.position.set(-0.012, -0.002, -0.004);
    this.palmGroup.add(palmPatch);

    // Sculpted Thenar Eminence (thumb muscle pad on the palm)
    const thenar = new THREE.Mesh(
      G("thenar", () => new THREE.SphereGeometry(0.019, 14, 12)),
      m.gloveLeather,
    );
    thenar.scale.set(0.72, 1.15, 1.35);
    thenar.position.set(-0.006, 0.022, 0.012);
    this.palmGroup.add(thenar);

    // Dorsal armor plate + individual sculpted knuckle guards
    const dorsalPlate = new THREE.Mesh(
      G("dorsalPlate", () => rbox(0.007, 0.066, 0.052, 0.003, 2)),
      m.gloveLeather,
    );
    dorsalPlate.position.set(0.013, -0.001, 0.002);
    this.palmGroup.add(dorsalPlate);

    const knuckleGuardBar = new THREE.Mesh(
      G("knuckleBar", () => rbox(0.009, 0.072, 0.018, 0.004, 2)),
      m.knuckleGuard,
    );
    knuckleGuardBar.position.set(0.014, -0.001, -0.032);
    this.palmGroup.add(knuckleGuardBar);

    FINGERS.forEach((f) => {
      const kPod = new THREE.Mesh(
        G("kPod", () => rbox(0.008, 0.015, 0.014, 0.0035, 2)),
        m.knuckleGuard,
      );
      kPod.position.set(0.0165, f.y, -0.033);
      this.palmGroup.add(kPod);
    });

    // 2. Articulated 4 Fingers (MCP -> PIP -> DIP -> Fingertip)
    const jointSphere = (r: number) =>
      G(`js_${r.toFixed(4)}`, () => new THREE.SphereGeometry(r * 0.94, 12, 10));
    const dorsalPad = (r: number, l: number) =>
      G(`dp_${r.toFixed(4)}_${l.toFixed(4)}`, () =>
        rbox(r * 0.55, r * 1.35, l * 0.56, r * 0.2, 1),
      );

    FINGERS.forEach((f, fi) => {
      const chain: THREE.Object3D[] = [];
      let parent: THREE.Object3D = this.palmGroup;
      f.len.forEach((l, j) => {
        const pivot = new THREE.Bone();
        pivot.name = `${left ? "L" : "R"}_${f.name}_${j}`;
        pivot.rotation.order = "YXZ";
        if (j === 0) {
          pivot.position.set(0.004, f.y, -0.039);
        } else {
          pivot.position.set(0, 0, -f.len[j - 1] * 0.94);
        }
        parent.add(pivot);

        const r = f.r * (1 - j * 0.09);
        const segMat = j === 0 ? m.gloveFabric : m.gloveLeather;
        const seg = new THREE.Mesh(phalanxGeometry(r, l, j === 2), segMat);
        seg.castShadow = seg.receiveShadow = true;
        pivot.add(seg);

        const jMesh = new THREE.Mesh(jointSphere(r), m.gloveFabric);
        pivot.add(jMesh);

        if (j < 2) {
          const pad = new THREE.Mesh(dorsalPad(r, l), m.knuckleGuard);
          pad.position.set(r * 0.72, 0, -l * 0.48);
          pivot.add(pad);
        }

        chain.push(pivot);
        parent = pivot;
      });
      this.joints.push(chain);
    });

    // 3. Articulated Thumb (CMC -> MCP -> IP -> Tip)
    this.thumbBase.position.set(-0.002, 0.031, 0.012);
    this.thumbBase.rotation.order = "YXZ";
    this.palmGroup.add(this.thumbBase);

    let tParent: THREE.Object3D = this.thumbBase;
    THUMB_LEN.forEach((l, j) => {
      const pivot = new THREE.Bone();
      pivot.name = `${left ? "L" : "R"}_thumb_${j}`;
      pivot.rotation.order = "YXZ";
      if (j > 0) pivot.position.set(0, 0, -THUMB_LEN[j - 1] * 0.92);
      tParent.add(pivot);

      const r = 0.0098 * (1 - j * 0.09);
      const tMat = j === 0 ? m.gloveFabric : m.gloveLeather;
      const seg = new THREE.Mesh(phalanxGeometry(r, l, j === 2), tMat);
      seg.castShadow = seg.receiveShadow = true;
      pivot.add(seg);
      pivot.add(new THREE.Mesh(jointSphere(r), tMat));

      this.thumbJoints.push(pivot);
      tParent = pivot;
    });

    // 4. Anatomical Wrist Cuff & Tapered Tactical Forearm Sleeve (extends along +Z)
    const forearmGroup = new THREE.Group();
    forearmGroup.position.set(0.002, -0.003, 0.042);
    this.palmGroup.add(forearmGroup);

    // Tactical Velcro wrist strap & metallic buckle accent
    const wristStrap = new THREE.Mesh(
      G("wristStrap", () => rbox(0.032, 0.062, 0.026, 0.009, 3)),
      m.cuff,
    );
    wristStrap.position.set(0, 0, 0.012);
    forearmGroup.add(wristStrap);

    const buckle = new THREE.Mesh(
      G("wristBuckle", () => rbox(0.004, 0.028, 0.014, 0.0015, 1)),
      m.accent,
    );
    buckle.position.set(0.0165, 0.005, 0.012);
    forearmGroup.add(buckle);

    // Tapered anatomical forearm sleeve (oval cross-section, extending smoothly to the edge of the screen)
    const sleeveGeo = G("anatomicalSleeve", () => {
      const g = latheY(
        [
          [0, 0],
          [0.028, 0],
          [0.031, 0.025],
          [0.035, 0.08],
          [0.041, 0.16],
          [0.045, 0.26],
          [0.046, 0.36],
          [0, 0.36],
        ],
        20,
      );
      g.scale(0.84, 1, 1.08); // anatomical oval forearm cross-section
      g.rotateX(Math.PI / 2); // extend along +Z (wrist -> elbow)
      g.computeVertexNormals();
      return g;
    });
    const sleeveMesh = new THREE.Mesh(sleeveGeo, m.sleeve);
    sleeveMesh.castShadow = sleeveMesh.receiveShadow = true;
    this.forearm.add(sleeveMesh);
    // A flexible wrist gusset closes the cuff when the forearm bends away from the palm.
    const gusset = new THREE.Mesh(
      G("wristGusset", () => new THREE.SphereGeometry(0.03, 16, 12)),
      m.cuff,
    );
    gusset.scale.set(0.84, 1.08, 0.7);
    this.forearm.add(gusset);

    // Forearm seam & cuff fold ring
    const cuffFold = new THREE.Mesh(
      G("cuffFold", () => {
        const g = latheY(
          [
            [0.029, 0],
            [0.033, 0.008],
            [0.033, 0.024],
            [0.03, 0.032],
          ],
          20,
        );
        g.scale(0.85, 1, 1.08);
        g.rotateX(Math.PI / 2);
        return g;
      }),
      m.cuff,
    );
    cuffFold.position.set(-0.002, -0.002, 0.018);
    forearmGroup.add(cuffFold);

    this.wrist.position.set(0, 0, 0.085);
    this.palmGroup.add(this.wrist);

    // Raised piping follows both glove edges; stitch pairs are merged with the fabric.
    for (const side of [-1, 1])
      for (let i = 0; i < 9; i++) {
        const stitch = new THREE.Mesh(
          G("gloveStitch", () => rbox(0.0015, 0.0028, 0.004, 0.0005, 1)),
          m.gloveFabric,
        );
        stitch.position.set(0.017, side * 0.03, -0.023 + i * 0.007);
        this.palmGroup.add(stitch);
      }
    // Batch static surfaces under each bone; bones and contact sockets remain independent.
    const nodes: THREE.Object3D[] = [];
    this.rig.traverse((node) => nodes.push(node));
    for (const node of nodes) {
      const meshes = node.children.filter(
        (o) => o instanceof THREE.Mesh,
      ) as THREE.Mesh[];
      if (meshes.length < 2) continue;
      const batch = new MeshBatch();
      for (const mesh of meshes) {
        batch.add(mesh.geometry, mesh.material as THREE.Material, {
          pos: mesh.position.toArray() as [number, number, number],
          rot: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
          scale: mesh.scale.toArray() as [number, number, number],
          uv: "keep",
        });
        node.remove(mesh);
      }
      node.add(batch.build(false, true, "glove-surfaces"));
    }
  }

  setPose(p: HandPose, snap = false) {
    this.target = p;
    if (snap || !this.cur) {
      this.cur = {
        radius: p.radius,
        curl: p.curl.map((c) => [...c]),
        thumbAngles: [...p.thumbAngles] as [number, number, number],
        thumbPitch: p.thumbPitch,
        thumbYaw: p.thumbYaw,
      };
    }
  }

  update(dt: number) {
    if (!this.cur || !this.target) return;
    const k = 1 - Math.exp(-dt * 20);
    const c = this.cur,
      t = this.target;
    c.radius += (t.radius - c.radius) * k;
    c.thumbPitch += (t.thumbPitch - c.thumbPitch) * k;
    c.thumbYaw += (t.thumbYaw - c.thumbYaw) * k;
    for (let j = 0; j < 3; j++)
      c.thumbAngles[j] += (t.thumbAngles[j] - c.thumbAngles[j]) * k;

    // Position palm so its inner leather pad rests directly against the grip surface of radius R
    this.palmGroup.position.set(c.radius + 0.011, -0.004, 0.039);
    this.palmGroup.rotation.set(0, 0, 0);

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++)
        c.curl[i][j] += (t.curl[i][j] - c.curl[i][j]) * k;
      const chain = this.joints[i];
      chain[0].position.x =
        contactRadius(c.radius, FINGERS[i].r, FINGERS[i].len[0]) -
        (c.radius + 0.011);
      const openF = this.open;
      const extra = this.extraCurl[i];
      // Positive rotation around +Y curls the finger inward (-Z -> -X -> +Z) around the grip
      chain[0].rotation.set(
        FINGERS[i].splay * (1 - openF * 0.5),
        c.curl[i][0] * (1 - openF * 0.75) + extra * 0.55,
        0,
      );
      chain[1].rotation.set(
        0,
        c.curl[i][1] * (1 - openF * 0.85) + extra * 0.9,
        0,
      );
      chain[2].rotation.set(
        0,
        c.curl[i][2] * (1 - openF * 0.85) + extra * 0.6,
        0,
      );
    }

    // Thumb articulation: wraps over the top (+Y) and inward (-X) around the grip
    const tOpen = this.open * 0.65;
    this.thumbBase.rotation.set(
      -c.thumbPitch * (1 - tOpen),
      c.thumbYaw * (1 - tOpen * 0.5),
      -0.35,
    );
    this.thumbJoints[0].rotation.set(0, c.thumbAngles[0] * (1 - tOpen), 0);
    this.thumbJoints[1].rotation.set(0, c.thumbAngles[1] * (1 - tOpen), 0);
    this.thumbJoints[2].rotation.set(0, c.thumbAngles[2] * (1 - tOpen), 0);
  }
}

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _p2 = new THREE.Vector3(),
  _sc = new THREE.Vector3();
const wristPos = new THREE.Vector3(),
  armDirection = new THREE.Vector3(),
  zAxis = new THREE.Vector3(0, 0, 1),
  parentInverse = new THREE.Matrix4();
export function contactRadius(grip: number, finger: number, proximal: number) {
  return Math.sqrt((grip + finger + 0.001) ** 2 + (proximal * 0.47) ** 2);
}

export class FirstPersonArms {
  right = new Hand(false);
  left = new Hand(true);
  leftVisible = true;

  constructor(public scene: THREE.Object3D) {
    scene.add(
      this.right.group,
      this.left.group,
      this.right.forearm,
      this.left.forearm,
    );
  }

  setGrips(right: GripDef, left: GripDef | undefined, snap: boolean) {
    this.right.setPose(solvePose(right), snap);
    if (left) {
      this.left.setPose(solvePose(left), snap);
      this.leftVisible = true;
    } else {
      this.leftVisible = false;
      this.left.group.visible = false;
    }
  }

  update(
    dt: number,
    rightSocket: THREE.Object3D,
    leftSocket: THREE.Object3D | undefined,
    leftOverride: THREE.Matrix4 | null,
    leftBlend: number,
    rElbow: THREE.Vector3,
    lElbow: THREE.Vector3,
  ) {
    this.right.update(dt);
    rightSocket.updateWorldMatrix(true, false);
    this.scene.updateWorldMatrix(true, false);
    parentInverse.copy(this.scene.matrixWorld).invert();
    this.right.group.matrix.multiplyMatrices(
      parentInverse,
      rightSocket.matrixWorld,
    );
    this.right.group.matrixWorldNeedsUpdate = true;
    this.right.group.updateMatrixWorld(true);
    this.fitForearm(this.right, rElbow);

    const showLeft = this.leftVisible && !!leftSocket;
    this.left.group.visible = showLeft;
    this.left.forearm.visible = showLeft;
    if (showLeft && leftSocket) {
      this.left.update(dt);
      leftSocket.updateWorldMatrix(true, false);
      _m.copy(leftSocket.matrixWorld);
      if (leftOverride && leftBlend > 0) {
        _m.decompose(_p, _q, _sc);
        leftOverride.decompose(_p2, _q2, _sc);
        _p.lerp(_p2, leftBlend);
        _q.slerp(_q2, leftBlend);
        _m.compose(_p, _q, _sc.set(1, 1, 1));
      }
      this.left.group.matrix.multiplyMatrices(parentInverse, _m);
      this.left.group.matrixWorldNeedsUpdate = true;
      this.left.group.updateMatrixWorld(true);
      this.fitForearm(this.left, lElbow);
    }
  }

  private fitForearm(hand: Hand, elbow: THREE.Vector3) {
    hand.wrist.getWorldPosition(wristPos);
    this.scene.worldToLocal(wristPos);
    armDirection.copy(elbow).sub(wristPos);
    const length = armDirection.length();
    hand.forearm.position.copy(wristPos);
    hand.forearm.quaternion.setFromUnitVectors(zAxis, armDirection.normalize());
    hand.forearm.scale.set(1, 1, Math.max(0.16, Math.min(0.48, length)) / 0.36);
  }
}
