import * as THREE from "three";
import {
  MeshBatch,
  profile,
  roundedOutline,
  rbox,
  latheZ,
  cyl,
  capsule,
} from "../graphics/GeometryKit";
import { WeaponMaterialLibrary } from "./WeaponMaterialLibrary";
import { onKarambit, karambitPoint } from "./KnifeAsset";
import type { WeaponId } from "../shared/types";

/**
 * Original SPECTRA weapon models, built from extruded silhouettes, bevelled solids and lathed parts.
 * Model space: meters, +X right, +Y up, -Z = muzzle direction. Origin = top of the pistol grip.
 * Every model exposes sockets used by the first-person arms and the animation controller.
 */

export interface GripDef {
  /** Socket whose local +Y runs along the grip axis (index finger side = +Y). */
  socket: THREE.Object3D;
  /** Radius of the cylinder fingers wrap around. */
  radius: number;
  /** Trigger finger behaviour. */
  index: "trigger" | "wrap" | "straight";
  /** Thumb placement. */
  thumb: "wrap" | "side" | "forward";
  /** Total finger wrap multiplier (lower = more open hand). */
  wrap?: number;
}

export interface ViewConfig {
  hip: [number, number, number];
  hipRot: [number, number, number];
  ads: [number, number, number];
  scale: number;
  kickBack: number;
  kickUp: number;
  kickSide: number;
  reload: "rifle" | "pistol" | "bolt" | "none";
  /** Visual weight factor for sway inertia. */
  weight: number;
  /** Where the elbows sit, in camera space. */
  rightElbow: [number, number, number];
  leftElbow: [number, number, number];
}

export interface WeaponModel {
  id: WeaponId;
  root: THREE.Group;
  magazine?: THREE.Group;
  slide?: THREE.Group;
  bolt?: THREE.Group;
  trigger?: THREE.Group;
  boltHandle?: THREE.Group;
  muzzle: THREE.Object3D;
  right: GripDef;
  left?: GripDef;
  /** Point the support hand travels to during reload (magazine bottom). */
  magGrab?: THREE.Object3D;
  /** Blade tip (knife trail). */
  tip?: THREE.Object3D;
  view: ViewConfig;
  rest?: {
    magazinePosition: THREE.Vector3;
    magazineRotation: THREE.Quaternion;
  };
}

const M = () => WeaponMaterialLibrary.get();
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

/** Swap (forward,up) profile helper to model position [x,y,z]. */
const P = (f: number, y: number, x = 0): [number, number, number] => [x, y, -f];

function socket(
  parent: THREE.Object3D,
  pos: [number, number, number],
  rot: [number, number, number],
  name: string,
) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...pos);
  o.rotation.set(...rot);
  parent.add(o);
  return o;
}

/**
 * Creates a grip socket from two intuitive anatomical directions in weapon space:
 * - `thumbDir` (+Y_sock): direction along the grip cylinder towards the thumb/index side.
 * - `wristDir` (+Z_sock): direction from the knuckles back along the wrist/forearm.
 */
function gripSocket(
  parent: THREE.Object3D,
  pos: [number, number, number],
  thumbDir: [number, number, number],
  wristDir: [number, number, number],
  name: string,
) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...pos);
  const y = new THREE.Vector3(...thumbDir).normalize();
  const z = new THREE.Vector3(...wristDir);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  parent.add(o);
  return o;
}

// ------------------------------------------------------------------ shared sub-assemblies

function picatinny(
  b: MeshBatch,
  from: number,
  to: number,
  y: number,
  width = 0.022,
) {
  const m = M();
  const len = to - from;
  b.add(rbox(width, 0.006, len, 0.0015), m.darkSteel, {
    pos: P(from + len / 2, y + 0.003),
  });
  const n = Math.floor(len / 0.01);
  const tooth = cached("rail-tooth", () =>
    rbox(width + 0.004, 0.0045, 0.0052, 0.0012, 1),
  );
  for (let i = 0; i < n; i++)
    b.add(tooth, m.darkSteel, { pos: P(from + 0.005 + i * 0.01, y + 0.0075) });
}

function screw(
  b: MeshBatch,
  f: number,
  y: number,
  side: number,
  r = 0.0032,
  mat = M().bareMetal,
) {
  const head = cached("screw" + r, () => cyl(r, 0.003, "x", 10));
  b.add(head, mat, { pos: P(f, y, side), uv: "keep" });
  b.add(
    cached("slot" + r, () => rbox(0.0012, r * 1.6, 0.0008, 0.0003, 1)),
    M().darkSteel,
    { pos: P(f, y, side + Math.sign(side) * 0.0016), rot: [0.6, 0, 0] },
  );
}

function triggerGuard(
  b: MeshBatch,
  f0: number,
  f1: number,
  yTop: number,
  depth: number,
  width: number,
  mat: THREE.Material,
) {
  const outer = roundedOutline([
    [f0, yTop],
    [f1, yTop],
    [f1 - 0.004, yTop - depth, 0.012],
    [f0 - 0.006, yTop - depth, 0.012],
  ]);
  const inner = roundedOutline([
    [f0 + 0.006, yTop - 0.004],
    [f1 - 0.007, yTop - 0.004],
    [f1 - 0.009, yTop - depth + 0.006, 0.008],
    [f0 + 0.002, yTop - depth + 0.006, 0.008],
  ]).reverse();
  b.add(profile(outer, width, 0.0015, 1, [inner]), mat);
}

function triggerBlade(): THREE.BufferGeometry {
  return cached("trigger", () =>
    profile(
      roundedOutline([
        [-0.003, 0],
        [0.004, 0],
        [0.006, -0.012, 0.006],
        [0.0, -0.022, 0.004],
        [-0.004, -0.02],
        [0.0, -0.01, 0.004],
      ]),
      0.006,
      0.001,
      1,
    ),
  );
}

/** Curved box magazine (banana) made of an arc outline. */
function curvedMag(
  b: MeshBatch,
  top: number,
  frontF: number,
  backF: number,
  length: number,
  curve: number,
  width: number,
  mat: THREE.Material,
  ribs = true,
) {
  const steps = 10,
    front: [number, number][] = [],
    back: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      y = top - t * length,
      push = curve * t * t;
    front.push([frontF + push + t * 0.004, y]);
    back.push([backF + push * 1.05, y]);
  }
  const outline: [number, number][] = [...front, ...back.reverse()];
  b.add(profile(outline, width, 0.0025, 2), mat);
  // floor plate
  const last = front[front.length - 1],
    lastB = back[0];
  b.add(
    rbox(width + 0.006, 0.012, Math.abs(last[0] - lastB[0]) + 0.01, 0.003),
    M().polymer,
    {
      pos: P((last[0] + lastB[0]) / 2, last[1] - 0.002),
      rot: [Math.atan2(curve * 2, length) * -0.6, 0, 0],
    },
  );
  if (ribs)
    for (let i = 1; i < 6; i++) {
      const t = i / 7,
        y = top - t * length,
        push = curve * t * t;
      b.add(
        rbox(0.002, 0.005, (frontF - backF) * 0.7, 0.001, 1),
        M().polymerLight,
        {
          pos: P(backF + push + (frontF - backF) * 0.5, y, -width / 2 - 0.0005),
        },
      );
      b.add(
        rbox(0.002, 0.005, (frontF - backF) * 0.7, 0.001, 1),
        M().polymerLight,
        {
          pos: P(backF + push + (frontF - backF) * 0.5, y, width / 2 + 0.0005),
        },
      );
    }
}

// ------------------------------------------------------------------ VX-47 assault rifle

function buildRifle(id: "vx47" | "s1" | "viper"): WeaponModel {
  const m = M(),
    root = new THREE.Group();
  root.name = id;
  const b = new MeshBatch();
  const sniper = id === "s1",
    smg = id === "viper";
  const recFront = smg ? 0.15 : 0.24,
    recBack = smg ? -0.13 : -0.2;

  // Upper receiver: chamfered silhouette with a raised forward assist hump.
  b.add(
    profile(
      roundedOutline([
        [recBack, -0.004],
        [recFront, -0.004],
        [recFront, 0.036, 0.006],
        [recFront - 0.03, 0.044, 0.008],
        [recBack + 0.05, 0.044, 0.01],
        [recBack, 0.034, 0.008],
      ]),
      0.05,
      0.004,
      2,
    ),
    m.paintedMetal,
  );
  // Lower receiver with integrated magwell and flared lip.
  b.add(
    profile(
      roundedOutline([
        [recBack + 0.01, -0.004],
        [recFront - 0.08, -0.004],
        [recFront - 0.08, -0.026, 0.005],
        [recFront - 0.1, -0.032],
        [recFront - 0.1, -0.076, 0.004],
        [recFront - 0.19, -0.076, 0.004],
        [recFront - 0.19, -0.04, 0.006],
        [recBack + 0.14, -0.036],
        [recBack + 0.01, -0.028, 0.01],
      ]),
      0.046,
      0.004,
      2,
    ),
    m.paintedMetal,
  );
  // Magwell flare (bare metal lip).
  b.add(
    profile(
      roundedOutline([
        [recFront - 0.085, -0.068],
        [recFront - 0.205, -0.068],
        [recFront - 0.207, -0.08, 0.002],
        [recFront - 0.083, -0.08, 0.002],
      ]),
      0.052,
      0.0018,
      1,
    ),
    m.darkSteel,
  );
  // Ejection port + dust cover (right side) and visible bolt carrier.
  b.add(rbox(0.003, 0.022, 0.075, 0.002), m.darkSteel, {
    pos: P(recFront - 0.1, 0.02, 0.0255),
  });
  // Forward assist cylinder + shell deflector on the right.
  b.add(cyl(0.009, 0.03, "z", 12), m.darkSteel, {
    pos: P(recFront - 0.17, 0.03, 0.022),
    uv: "keep",
  });
  // Left side: bolt catch, selector, serial plate, takedown pins.
  b.add(
    profile(
      roundedOutline([
        [0, 0],
        [0.018, 0],
        [0.016, 0.007, 0.002],
        [0, 0.006],
      ]),
      0.003,
      0.0008,
      1,
    ),
    m.darkSteel,
    { pos: P(recFront - 0.205, -0.03, -0.025) },
  );
  b.add(cyl(0.0055, 0.004, "x", 12), m.accent, {
    pos: P(-0.018, -0.012, -0.0245),
    uv: "keep",
  });
  b.add(rbox(0.003, 0.005, 0.02, 0.0015), m.accent, {
    pos: P(-0.012, -0.006, -0.026),
    rot: [0.5, 0, 0],
  });
  const plate = new THREE.Mesh(
    cached("plate", () => new THREE.PlaneGeometry(0.07, 0.0175)),
    m.engraving,
  );
  plate.position.set(-0.0266, -0.05, -(recFront - 0.145));
  plate.rotation.y = -Math.PI / 2;
  root.add(plate);
  for (const s of [-1, 1]) {
    screw(b, recBack + 0.03, -0.012, s * 0.0245);
    screw(b, recFront - 0.09, -0.016, s * 0.0245);
    screw(b, recFront - 0.04, 0.02, s * 0.0262, 0.0026);
  }

  // Pistol grip: ergonomic raked polymer with finger swells and rubber panel.
  b.add(
    profile(
      roundedOutline([
        [-0.006, -0.03],
        [0.03, -0.03],
        [0.024, -0.05, 0.01],
        [0.016, -0.06, 0.008],
        [0.012, -0.075, 0.01],
        [0.004, -0.09, 0.01],
        [-0.008, -0.12, 0.012],
        [-0.05, -0.128, 0.01],
        [-0.052, -0.115, 0.008],
        [-0.034, -0.06, 0.02],
        [-0.03, -0.036, 0.01],
      ]),
      0.032,
      0.005,
      2,
    ),
    m.polymer,
    { pos: [0, 0, 0] },
  );
  b.add(
    profile(
      roundedOutline([
        [-0.006, -0.055],
        [0.012, -0.055, 0.004],
        [-0.002, -0.11, 0.006],
        [-0.03, -0.112, 0.006],
        [-0.026, -0.06, 0.006],
      ]),
      0.034,
      0.0015,
      1,
    ),
    m.rubber,
  );
  // Trigger guard (integrated, bare edge).
  triggerGuard(b, 0.002, 0.07, -0.026, 0.03, 0.012, m.darkSteel);

  // Barrel, gas block and muzzle device.
  const barrelEnd = sniper ? 0.86 : smg ? 0.36 : 0.62;
  b.add(
    latheZ(
      [
        [0.0, recFront - 0.01],
        [0.011, recFront - 0.01],
        [0.011, recFront + 0.06],
        [0.0095, recFront + 0.07],
        [0.0088, barrelEnd],
        [0.0, barrelEnd],
      ],
      16,
    ),
    m.darkSteel,
    { uv: { cyl: "z", u: 1, v: 8 } },
  );
  if (!smg) {
    const gas = sniper ? 0.62 : 0.5;
    b.add(rbox(0.024, 0.03, 0.028, 0.004), m.darkSteel, { pos: P(gas, 0.002) });
    b.add(cyl(0.0055, gas - recFront - 0.02, "z", 8), m.darkSteel, {
      pos: P((gas + recFront) / 2 + 0.01, 0.022),
      uv: "keep",
    });
  }
  if (smg) {
    // integrated suppressor
    b.add(
      latheZ(
        [
          [0.0, barrelEnd - 0.12],
          [0.018, barrelEnd - 0.12],
          [0.021, barrelEnd - 0.11],
          [0.021, barrelEnd + 0.03],
          [0.017, barrelEnd + 0.045],
          [0.006, barrelEnd + 0.045],
          [0, barrelEnd + 0.045],
        ],
        20,
      ),
      m.polymer,
      { uv: { cyl: "z", u: 2, v: 10 } },
    );
    for (let i = 0; i < 4; i++)
      b.add(
        latheZ(
          [
            [0.0215, barrelEnd - 0.09 + i * 0.03],
            [0.0222, barrelEnd - 0.088 + i * 0.03],
            [0.0222, barrelEnd - 0.082 + i * 0.03],
            [0.0215, barrelEnd - 0.08 + i * 0.03],
          ],
          20,
        ),
        m.accent,
        { uv: "keep" },
      );
  } else {
    // Stylised tri-port muzzle brake.
    const z0 = barrelEnd - 0.01;
    b.add(
      latheZ(
        [
          [0, z0],
          [0.0125, z0],
          [0.0135, z0 + 0.006],
          [0.0135, z0 + 0.058],
          [0.012, z0 + 0.066],
          [0.006, z0 + 0.066],
          [0, z0 + 0.066],
        ],
        18,
      ),
      m.darkSteel,
      { uv: { cyl: "z", u: 2, v: 6 } },
    );
    for (let i = 0; i < 3; i++)
      for (const s of [-1, 1])
        b.add(rbox(0.004, 0.012, 0.009, 0.0015), m.polymer, {
          pos: P(z0 + 0.016 + i * 0.016, 0.002, s * 0.012),
        });
    b.add(cyl(0.0062, 0.002, "z", 12), m.polymer, {
      pos: P(z0 + 0.067, 0),
      uv: "keep",
    });
  }

  // Handguard: octagonal free-float with M-LOK slots, sand accent panels and SPECTRA glow strip.
  const hgEnd = sniper ? 0.58 : smg ? 0.25 : 0.48;
  if (smg) {
    b.add(
      profile(
        roundedOutline([
          [recFront - 0.005, -0.024],
          [hgEnd, -0.024],
          [hgEnd + 0.004, -0.01, 0.006],
          [hgEnd, 0.03, 0.006],
          [recFront - 0.005, 0.032],
        ]),
        0.05,
        0.006,
        2,
      ),
      m.polymer,
    );
  } else {
    b.add(
      profile(
        roundedOutline([
          [recFront - 0.004, -0.028, 0.004],
          [hgEnd, -0.028, 0.008],
          [hgEnd + 0.006, 0.002, 0.006],
          [hgEnd, 0.034, 0.006],
          [recFront - 0.004, 0.036],
        ]),
        0.054,
        0.009,
        2,
      ),
      m.polymerLight,
    );
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++)
        b.add(rbox(0.004, 0.009, 0.028, 0.0035), m.polymer, {
          pos: P(recFront + 0.04 + i * 0.052, -0.004, s * 0.0275),
        });
      b.add(
        profile(
          roundedOutline([
            [recFront + 0.02, 0.006],
            [hgEnd - 0.02, 0.006],
            [hgEnd - 0.03, 0.022, 0.006],
            [recFront + 0.03, 0.022, 0.006],
          ]),
          0.0035,
          0.001,
          1,
        ),
        m.sandPaint,
        { pos: [s * 0.028, 0, 0] },
      );
      b.add(rbox(0.002, 0.0025, hgEnd - recFront - 0.07, 0.001, 1), m.glow, {
        pos: P((recFront + hgEnd) / 2, 0.014, s * 0.0303),
      });
    }
    for (let i = 0; i < 5; i++)
      b.add(rbox(0.03, 0.003, 0.016, 0.0015), m.polymer, {
        pos: P(recFront + 0.04 + i * 0.045, -0.0295),
      });
  }
  // Top rail: receiver to handguard.
  picatinny(b, recBack + 0.045, hgEnd - 0.01, 0.044, 0.022);

  // Iron sights or optic.
  if (sniper) {
    // A hollow optic with a real inner bore. The ADS aperture is rendered by ScopeOverlay.
    b.add(
      latheZ(
        [
          [0.018, -0.13],
          [0.021, -0.13],
          [0.023, -0.12],
          [0.023, -0.09],
          [0.015, -0.07],
          [0.0135, -0.065],
          [0.0135, 0.11],
          [0.017, 0.13],
          [0.026, 0.17],
          [0.026, 0.23],
          [0.024, 0.24],
          [0.021, 0.24],
          [0.021, 0.175],
          [0.0105, 0.105],
          [0.0105, -0.06],
          [0.018, -0.1],
          [0.018, -0.13],
        ],
        32,
      ),
      m.darkSteel,
      { pos: [0, 0.092, 0], uv: { cyl: "z", u: 3, v: 10 } },
    );
    b.add(cyl(0.0105, 0.016, "y", 16), m.darkSteel, {
      pos: P(0.02, 0.11),
      uv: "keep",
    });
    b.add(cyl(0.0105, 0.016, "x", 16), m.darkSteel, {
      pos: P(0.02, 0.092, 0.02),
      uv: "keep",
    });
    for (const f of [-0.02, 0.12])
      b.add(rbox(0.028, 0.022, 0.018, 0.004), m.paintedMetal, {
        pos: P(f, 0.062),
      });
    for (const f of [-0.12, 0.22])
      b.add(
        latheZ(
          [
            [0.0235, f],
            [0.0245, f],
            [0.0245, f + 0.01],
            [0.0235, f + 0.01],
          ],
          28,
        ),
        m.accent,
        { pos: [0, 0.092, 0], uv: "keep" },
      );
    const lensF = new THREE.Mesh(
      cached("lensF", () => new THREE.CircleGeometry(0.021, 32)),
      m.lens,
    );
    lensF.position.set(0, 0.092, -0.238);
    root.add(lensF);
    const lensR = new THREE.Mesh(
      cached("lensR", () => new THREE.CircleGeometry(0.018, 32)),
      m.lens,
    );
    lensR.position.set(0, 0.092, 0.128);
    lensR.rotation.y = Math.PI;
    root.add(lensR);
    // Illuminated 3D optical ring & center dot inside the rear eyepiece
    const retRing = new THREE.Mesh(
      cached("retRing", () => new THREE.RingGeometry(0.0115, 0.0124, 24)),
      m.glow,
    );
    retRing.position.set(0, 0.092, 0.126);
    root.add(retRing);
    const retDot = new THREE.Mesh(
      cached("retDot", () => new THREE.CircleGeometry(0.0014, 12)),
      m.reticle,
    );
    retDot.position.set(0, 0.092, 0.1265);
    root.add(retDot);
  } else {
    // Rear aperture
    const rs = smg ? recBack + 0.06 : recBack + 0.07;
    b.add(
      profile(
        roundedOutline([
          [0, 0],
          [0.02, 0],
          [0.018, 0.018, 0.004],
          [0.012, 0.026, 0.004],
          [0.004, 0.026, 0.004],
          [0, 0.016, 0.003],
        ]),
        0.02,
        0.0015,
        1,
        [
          roundedOutline([
            [0.006, 0.012, 0.002],
            [0.012, 0.012, 0.002],
            [0.012, 0.02, 0.002],
            [0.006, 0.02, 0.002],
          ]).reverse(),
        ],
      ),
      m.darkSteel,
      { pos: P(rs, 0.05) },
    );
    // Front post with protective hood
    const fs = hgEnd - 0.03;
    b.add(
      profile(
        roundedOutline([
          [0, 0],
          [0.022, 0],
          [0.02, 0.016, 0.004],
          [0.016, 0.03, 0.006],
          [0.004, 0.03, 0.006],
          [0, 0.012, 0.004],
        ]),
        0.02,
        0.0015,
        1,
        [
          roundedOutline([
            [0.006, 0.012, 0.003],
            [0.015, 0.012, 0.003],
            [0.014, 0.025, 0.003],
            [0.007, 0.025, 0.003],
          ]).reverse(),
        ],
      ),
      m.darkSteel,
      { pos: P(fs, 0.05) },
    );
    b.add(rbox(0.0025, 0.012, 0.003, 0.0008, 1), m.bareMetal, {
      pos: P(fs + 0.011, 0.066),
    });
    b.add(cyl(0.0012, 0.001, "z", 6), m.glow, {
      pos: P(fs + 0.0095, 0.072),
      uv: "keep",
    });
  }

  // Stock.
  const sb = recBack;
  b.add(
    latheZ(
      [
        [0, sb - 0.2],
        [0.013, sb - 0.2],
        [0.0135, sb - 0.19],
        [0.0135, sb + 0.01],
        [0.016, sb + 0.02],
        [0, sb + 0.02],
      ],
      14,
    ),
    m.darkSteel,
    { pos: [0, 0.012, 0], uv: { cyl: "z", u: 1, v: 6 } },
  );
  if (smg) {
    // folding skeleton wire stock
    const wire = cached("wire", () => capsule(0.0045, 0.2, "z", 3, 8));
    for (const s of [-1, 1])
      b.add(wire, m.darkSteel, {
        pos: P(sb - 0.1, -0.005, s * 0.016),
        uv: "keep",
      });
    b.add(rbox(0.04, 0.07, 0.014, 0.006), m.rubber, {
      pos: P(sb - 0.21, -0.01),
    });
  } else {
    const len = sniper ? 0.3 : 0.26;
    const outer = roundedOutline([
      [sb + 0.01, 0.04, 0.01],
      [sb - len + 0.03, 0.036, 0.012],
      [sb - len, 0.044, 0.006],
      [sb - len - 0.008, -0.08, 0.008],
      [sb - len + 0.03, -0.092, 0.01],
      [sb - len + 0.08, -0.05, 0.02],
      [sb + 0.01, -0.028, 0.006],
    ]);
    const hole = roundedOutline([
      [sb - 0.07, 0.022, 0.01],
      [sb - len + 0.07, 0.02, 0.012],
      [sb - len + 0.07, -0.025, 0.016],
      [sb - 0.07, -0.01, 0.012],
    ]).reverse();
    b.add(
      profile(outer, 0.038, 0.006, 2, [hole]),
      sniper ? m.polymerLight : m.polymer,
    );
    b.add(
      profile(
        roundedOutline([
          [sb - len + 0.002, 0.046, 0.006],
          [sb - len - 0.016, 0.046, 0.006],
          [sb - len - 0.024, -0.082, 0.008],
          [sb - len - 0.006, -0.082, 0.008],
        ]),
        0.042,
        0.004,
        2,
      ),
      m.rubber,
    );
    if (sniper)
      b.add(
        profile(
          roundedOutline([
            [sb - 0.05, 0.04],
            [sb - 0.18, 0.04],
            [sb - 0.18, 0.065, 0.008],
            [sb - 0.05, 0.06, 0.008],
          ]),
          0.03,
          0.004,
          2,
        ),
        m.sandPaint,
      );
    for (const s of [-1, 1]) screw(b, sb - len + 0.04, -0.06, s * 0.0195);
  }

  // Charging handle (non-sniper) and moving bolt / bolt handle.
  const bolt = new THREE.Group();
  bolt.name = "bolt";
  const boltB = new MeshBatch();
  if (sniper) {
    boltB.add(cyl(0.008, 0.07, "z", 12), m.bareMetal, {
      pos: P(recBack + 0.08, 0.028, 0.0),
      uv: "keep",
    });
  } else {
    boltB.add(rbox(0.008, 0.016, 0.06, 0.002), m.bareMetal, {
      pos: P(recFront - 0.1, 0.02, 0.021),
    });
    b.add(
      profile(
        roundedOutline([
          [0, 0],
          [0.012, 0],
          [0.012, 0.01, 0.003],
          [-0.022, 0.01, 0.003],
          [-0.024, 0.004, 0.002],
        ]),
        0.03,
        0.002,
        1,
      ),
      m.darkSteel,
      { pos: P(recBack + 0.03, 0.041) },
    );
  }
  bolt.add(boltB.build(false, true, "boltParts"));
  root.add(bolt);

  let boltHandle: THREE.Group | undefined;
  if (sniper) {
    boltHandle = new THREE.Group();
    boltHandle.name = "boltHandle";
    boltHandle.position.set(0.012, 0.024, -(recBack + 0.06));
    const bh = new MeshBatch();
    bh.add(cyl(0.004, 0.04, "x", 10), m.bareMetal, {
      pos: [0.02, 0, 0],
      uv: "keep",
    });
    bh.add(new THREE.SphereGeometry(0.009, 14, 10), m.polymer, {
      pos: [0.042, -0.004, 0],
    });
    boltHandle.add(bh.build(false, true));
    root.add(boltHandle);
  }

  // Trigger
  const trigger = new THREE.Group();
  trigger.name = "trigger";
  trigger.position.set(0, -0.03, -0.03);
  const tb = new MeshBatch();
  tb.add(triggerBlade(), m.bareMetal);
  trigger.add(tb.build(false, true));
  root.add(trigger);

  // Magazine (separate group so it can be animated during reload).
  const magazine = new THREE.Group();
  magazine.name = "magazine";
  const magTop = -0.06,
    mf = recFront - 0.105,
    mb = recFront - 0.19;
  magazine.position.set(0, magTop, -(mf + mb) / 2);
  const mbatch = new MeshBatch();
  const half = (mf - mb) / 2;
  if (sniper)
    curvedMag(mbatch, 0, half, -half, 0.07, 0.0, 0.03, m.polymer, false);
  else if (smg)
    curvedMag(
      mbatch,
      0,
      half - 0.01,
      -half + 0.01,
      0.17,
      0.01,
      0.026,
      m.polymer,
      true,
    );
  else curvedMag(mbatch, 0, half, -half, 0.19, 0.055, 0.028, m.polymer, true);
  magazine.add(mbatch.build(true, true, "magParts"));
  root.add(magazine);
  const magGrab = socket(
    magazine,
    P(sniper ? 0 : smg ? 0.005 : 0.03, sniper ? -0.07 : smg ? -0.17 : -0.18),
    [0, 0, 0],
    "magGrab",
  );

  root.add(b.build(true, true, "static"));
  const muzzle = socket(
    root,
    P(barrelEnd + (smg ? 0.05 : 0.07), 0),
    [0, 0, 0],
    "muzzle",
  );

  // Hand sockets.
  // Right hand wraps around pistol grip (thumbDir up along grip, wristDir back-down-right).
  const right: GripDef = {
    socket: gripSocket(
      root,
      P(-0.022, -0.072, 0),
      [0, 0.95, -0.31],
      [0.22, -0.34, 0.91],
      "rightGrip",
    ),
    radius: 0.019,
    index: "trigger",
    thumb: "wrap",
  };
  // Left support hand cradles the bottom-left of the handguard (back of glove on left, fingers wrapping underneath).
  const leftF = smg ? recFront + 0.04 : sniper ? 0.36 : 0.32;
  const left: GripDef = {
    socket: gripSocket(
      root,
      P(leftF, -0.004, 0),
      [0.08, 0.28, 0.95],
      [-0.32, -0.8, 0.5],
      "leftGrip",
    ),
    radius: 0.026,
    index: "wrap",
    thumb: "side",
    wrap: 0.9,
  };

  const view: ViewConfig = sniper
    ? {
        hip: [0.175, -0.12, -0.39],
        hipRot: [0.03, 0.12, -0.02],
        ads: [0, -0.092, -0.22],
        scale: 1,
        kickBack: 0.085,
        kickUp: 0.12,
        kickSide: 0.015,
        reload: "bolt",
        weight: 1.35,
        rightElbow: [0.24, -0.42, -0.02],
        leftElbow: [-0.05, -0.44, -0.22],
      }
    : smg
      ? {
          hip: [0.165, -0.12, -0.36],
          hipRot: [0.03, 0.12, -0.02],
          ads: [0, -0.072, -0.22],
          scale: 1,
          kickBack: 0.03,
          kickUp: 0.028,
          kickSide: 0.012,
          reload: "rifle",
          weight: 0.8,
          rightElbow: [0.24, -0.4, -0.02],
          leftElbow: [-0.06, -0.42, -0.18],
        }
      : {
          hip: [0.17, -0.12, -0.38],
          hipRot: [0.03, 0.12, -0.02],
          ads: [0, -0.072, -0.22],
          scale: 1,
          kickBack: 0.04,
          kickUp: 0.04,
          kickSide: 0.014,
          reload: "rifle",
          weight: 1.1,
          rightElbow: [0.24, -0.42, -0.02],
          leftElbow: [-0.06, -0.44, -0.2],
        };

  return {
    id,
    root,
    magazine,
    bolt,
    trigger,
    boltHandle,
    muzzle,
    right,
    left,
    magGrab,
    view,
  };
}

// ------------------------------------------------------------------ P9 pistol

function buildPistol(): WeaponModel {
  const m = M(),
    root = new THREE.Group();
  root.name = "p9";
  const b = new MeshBatch();

  // Frame with accessory rail and contoured trigger guard.
  b.add(
    profile(
      roundedOutline([
        [-0.06, 0.0],
        [0.12, 0.0],
        [0.122, -0.016, 0.004],
        [0.075, -0.018],
        [0.07, -0.03, 0.006],
        [0.005, -0.03, 0.004],
        [-0.02, -0.018, 0.006],
        [-0.062, -0.012, 0.006],
      ]),
      0.028,
      0.003,
      2,
    ),
    m.polymer,
  );
  for (let i = 0; i < 3; i++)
    b.add(rbox(0.03, 0.003, 0.005, 0.001, 1), m.polymer, {
      pos: P(0.085 + i * 0.012, -0.0185),
    });
  triggerGuard(b, 0.002, 0.072, -0.016, 0.03, 0.011, m.polymer);
  // Grip: anatomical, beaver-tail, finger groove, stippled rubber panels.
  b.add(
    profile(
      roundedOutline([
        [-0.012, -0.012],
        [0.024, -0.012],
        [0.022, -0.03, 0.008],
        [0.016, -0.046, 0.012],
        [0.012, -0.07, 0.012],
        [0.004, -0.105, 0.008],
        [-0.034, -0.112, 0.008],
        [-0.044, -0.1, 0.006],
        [-0.04, -0.04, 0.02],
        [-0.058, -0.014, 0.012],
        [-0.064, -0.008, 0.006],
      ]),
      0.03,
      0.005,
      2,
    ),
    m.polymer,
  );
  b.add(
    profile(
      roundedOutline([
        [-0.004, -0.04],
        [0.012, -0.04, 0.004],
        [0.002, -0.1, 0.006],
        [-0.03, -0.104, 0.006],
        [-0.034, -0.045, 0.008],
      ]),
      0.0315,
      0.0012,
      1,
    ),
    m.rubber,
  );
  // Magazine base visible at the bottom is part of the magazine group. Slide release, takedown lever.
  b.add(rbox(0.003, 0.006, 0.022, 0.002), m.darkSteel, {
    pos: P(0.03, -0.004, -0.0155),
  });
  b.add(rbox(0.003, 0.005, 0.012, 0.002), m.darkSteel, {
    pos: P(0.065, -0.006, -0.0152),
  });
  b.add(rbox(0.004, 0.008, 0.006, 0.002), m.darkSteel, {
    pos: P(0.014, -0.022, -0.0155),
  }); // mag release
  for (const s of [-1, 1])
    screw(b, -0.006, -0.008, s * 0.0152, 0.0022, m.darkSteel);
  b.add(cyl(0.006, 0.02, "z", 14), m.darkSteel, {
    pos: P(0.13, 0.016),
    uv: "keep",
  }); // barrel tip visible past slide

  // Trigger
  const trigger = new THREE.Group();
  trigger.name = "trigger";
  trigger.position.set(0, -0.016, -0.03);
  const tb = new MeshBatch();
  tb.add(triggerBlade(), m.bareMetal);
  trigger.add(tb.build(false, true));
  root.add(trigger);

  // Slide: separate group (cycles on fire). Contoured top, front/rear serrations, sights with glow dots.
  const slide = new THREE.Group();
  slide.name = "slide";
  const sb = new MeshBatch();
  const slidePorts = [0.076, 0.096].map((f) =>
    roundedOutline([
      [f, 0.015, 0.002],
      [f + 0.01, 0.015, 0.002],
      [f + 0.012, 0.026, 0.002],
      [f + 0.002, 0.026, 0.002],
    ]).reverse(),
  );
  sb.add(
    profile(
      roundedOutline([
        [-0.066, 0.0],
        [0.128, 0.0],
        [0.13, 0.022, 0.004],
        [0.12, 0.033, 0.008],
        [-0.05, 0.034, 0.008],
        [-0.066, 0.026, 0.006],
      ]),
      0.026,
      0.004,
      3,
      slidePorts,
    ),
    m.paintedMetal,
  );
  // Top bevel cut (lighter flats)
  sb.add(
    profile(
      roundedOutline([
        [0.0, 0.03],
        [0.118, 0.03],
        [0.11, 0.036, 0.003],
        [0.004, 0.036, 0.003],
      ]),
      0.016,
      0.001,
      1,
    ),
    m.darkSteel,
  );
  // Ejection port
  sb.add(rbox(0.002, 0.01, 0.034, 0.0015), m.darkSteel, {
    pos: P(0.04, 0.026, 0.0127),
  });
  sb.add(cyl(0.0062, 0.03, "z", 12), m.bareMetal, {
    pos: P(0.04, 0.024, 0.004),
    uv: "keep",
  });
  // Serrations
  const serr = cached("serr", () => rbox(0.0275, 0.02, 0.0025, 0.0009, 1));
  for (let i = 0; i < 7; i++)
    sb.add(serr, m.darkSteel, {
      pos: P(-0.058 + i * 0.0055, 0.015),
      rot: [0.2, 0, 0],
    });
  for (let i = 0; i < 4; i++)
    sb.add(serr, m.darkSteel, {
      pos: P(0.1 + i * 0.0055, 0.015),
      rot: [-0.2, 0, 0],
    });
  // Accent line
  for (const s of [-1, 1])
    sb.add(rbox(0.0012, 0.0025, 0.09, 0.0006, 1), m.accent, {
      pos: P(0.03, 0.006, s * 0.0131),
    });
  // Rear sight with two dots, front sight with one.
  sb.add(
    profile(
      roundedOutline([
        [0, 0],
        [0.012, 0],
        [0.01, 0.008, 0.002],
        [0, 0.009, 0.002],
      ]),
      0.022,
      0.0012,
      1,
      [],
    ),
    m.darkSteel,
    { pos: P(-0.056, 0.033) },
  );
  sb.add(rbox(0.006, 0.004, 0.004, 0.001, 1), m.darkSteel, {
    pos: P(-0.05, 0.044),
  }); // notch shadow
  for (const s of [-1, 1])
    sb.add(cyl(0.0011, 0.001, "z", 6), m.glow, {
      pos: P(-0.0435, 0.039, s * 0.0055),
      uv: "keep",
    });
  sb.add(
    profile(
      roundedOutline([
        [0, 0],
        [0.009, 0],
        [0.007, 0.008, 0.002],
        [0.002, 0.008, 0.002],
      ]),
      0.004,
      0.0008,
      1,
    ),
    m.darkSteel,
    { pos: P(0.112, 0.033) },
  );
  sb.add(cyl(0.0011, 0.001, "z", 6), m.glow, {
    pos: P(0.1155, 0.0385),
    uv: "keep",
  });
  slide.add(sb.build(true, true, "slideParts"));
  root.add(slide);
  // Logo on slide (left side faces the camera).
  const plate = new THREE.Mesh(
    cached("pplate", () => new THREE.PlaneGeometry(0.05, 0.0125)),
    m.engraving,
  );
  plate.position.set(-0.0136, 0.016, -0.055);
  plate.rotation.y = -Math.PI / 2;
  slide.add(plate);

  // Magazine inside grip (base plate visible). Axis follows the grip rake (~17deg).
  const magazine = new THREE.Group();
  magazine.name = "magazine";
  magazine.position.set(0, -0.02, 0.015);
  magazine.rotation.x = -0.29;
  const mb = new MeshBatch();
  mb.add(rbox(0.022, 0.09, 0.03, 0.004), m.darkSteel, { pos: [0, -0.045, 0] });
  mb.add(
    profile(
      roundedOutline([
        [-0.02, -0.092],
        [0.018, -0.092],
        [0.02, -0.1, 0.004],
        [-0.022, -0.1, 0.004],
      ]),
      0.032,
      0.003,
      2,
    ),
    m.polymer,
  );
  magazine.add(mb.build(true, true, "magParts"));
  root.add(magazine);
  const magGrab = socket(magazine, [0, -0.1, 0], [0, 0, 0], "magGrab");

  root.add(b.build(true, true, "static"));
  const muzzle = socket(root, P(0.15, 0.016), [0, 0, 0], "muzzle");
  const right: GripDef = {
    socket: gripSocket(
      root,
      P(-0.014, -0.062, 0),
      [0, 0.95, -0.3],
      [0.18, -0.28, 0.94],
      "rightGrip",
    ),
    radius: 0.0175,
    index: "trigger",
    thumb: "forward",
  };
  // Support hand cups the strong hand (thumbs forward, wrist down-left-back).
  const left: GripDef = {
    socket: gripSocket(
      root,
      P(-0.002, -0.07, -0.014),
      [0.06, 0.93, -0.36],
      [-0.28, -0.32, 0.9],
      "leftGrip",
    ),
    radius: 0.025,
    index: "wrap",
    thumb: "forward",
    wrap: 0.88,
  };
  const view: ViewConfig = {
    hip: [0.14, -0.13, -0.35],
    hipRot: [0.02, 0.1, -0.02],
    ads: [0, -0.058, -0.24],
    scale: 1,
    kickBack: 0.035,
    kickUp: 0.09,
    kickSide: 0.01,
    reload: "pistol",
    weight: 0.65,
    rightElbow: [0.22, -0.4, 0.02],
    leftElbow: [-0.1, -0.42, 0.02],
  };
  return {
    id: "p9",
    root,
    slide,
    trigger,
    magazine,
    muzzle,
    right,
    left,
    magGrab,
    view,
  };
}

// ------------------------------------------------------------------ EDGE tactical knife

/** Builds a flat-ground drop point blade with real spine, grind line and cutting bevel. */
function bladeGeometry(length: number, part: "flat" | "bevel") {
  return cached("blade-" + part, () => {
    const N = 28,
      verts: number[] = [];
    const sec: { s: [number, number, number][] }[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N,
        f = u * length;
      const swedge = u > 0.55 ? Math.pow((u - 0.55) / 0.45, 1.6) : 0;
      const ys = 0.031 - 0.004 * u - swedge * 0.02;
      const belly = u > 0.58 ? Math.pow((u - 0.58) / 0.42, 2.2) * 0.011 : 0;
      const ye = 0.0 + belly;
      const tip = u === 1;
      const top = tip ? ye : ys,
        edge = ye;
      const grind = edge + (top - edge) * 0.5;
      const t = 0.0058 * (1 - u * 0.55) * (tip ? 0 : 1);
      // swedge: top bevel near the tip narrows the spine
      const spineT = t * (1 - swedge * 0.85);
      sec.push({
        s: [
          [-spineT / 2, top, -f],
          [-t / 2, top - (top - grind) * 0.15, -f],
          [-t / 2, grind, -f],
          [0, edge, -f],
          [t / 2, grind, -f],
          [t / 2, top - (top - grind) * 0.15, -f],
          [spineT / 2, top, -f],
        ],
      });
    }
    const quad = (a: number[], b: number[], c: number[], d: number[]) =>
      verts.push(...a, ...b, ...c, ...a, ...c, ...d);
    // section indices: 0 spineL,1 shoulderL,2 grindL,3 edge,4 grindR,5 shoulderR,6 spineR
    const strips =
      part === "flat"
        ? [
            [0, 1],
            [1, 2],
            [4, 5],
            [5, 6],
            [6, 0],
          ]
        : [
            [2, 3],
            [3, 4],
          ];
    for (let i = 0; i < N; i++) {
      const A = sec[i].s,
        B = sec[i + 1].s;
      for (const [p, q] of strips) quad(A[p], A[q], B[q], B[p]);
    }
    if (part === "flat") {
      // base cap
      const A = sec[0].s;
      for (let k = 1; k < 6; k++)
        verts.push(...A[0], ...A[k + 1 > 6 ? 6 : k + 1], ...A[k]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  });
}

function buildKnife(): WeaponModel {
  const m = M(),
    root = new THREE.Group();
  root.name = "edge";
  const b = new MeshBatch();
  const L = 0.205;
  // Blade sits forward of the guard (model origin = centre of handle top).
  const bladeOff: [number, number, number] = [0, -0.015, -0.012];
  b.add(bladeGeometry(L, "flat"), m.blade, { pos: bladeOff, uv: 14 });
  b.add(bladeGeometry(L, "bevel"), m.bladeEdge, { pos: bladeOff, uv: 14 });
  // Coated ricasso band, fuller line and spine jimping.
  b.add(
    profile(
      roundedOutline([
        [0.0, 0.0],
        [0.03, 0.0],
        [0.026, 0.03, 0.004],
        [0.0, 0.031],
      ]),
      0.0064,
      0.0006,
      1,
    ),
    m.bladeCoat,
    { pos: [0, -0.015, -0.012] },
  );
  b.add(rbox(0.0066, 0.0022, 0.07, 0.001, 1), m.bladeCoat, {
    pos: [0, 0.006, -0.012 - 0.075],
  });
  for (let i = 0; i < 6; i++)
    b.add(rbox(0.0062, 0.003, 0.0018, 0.0006, 1), m.darkSteel, {
      pos: [0, 0.0175, -0.016 - i * 0.004],
    });
  // Guard: swept quillons, dark steel with accent ring.
  b.add(
    profile(
      roundedOutline([
        [0.0, -0.03, 0.003],
        [0.012, -0.026, 0.004],
        [0.012, 0.026, 0.004],
        [0.006, 0.03, 0.004],
        [0.0, 0.022, 0.003],
        [-0.004, 0.0, 0.002],
      ]),
      0.022,
      0.003,
      2,
    ),
    m.darkSteel,
    { pos: [0, -0.0, -0.004] },
  );
  b.add(
    latheZ(
      [
        [0, -0.001],
        [0.0155, -0.001],
        [0.0165, 0.002],
        [0.0155, 0.005],
        [0, 0.005],
      ],
      18,
    ),
    m.accent,
    { pos: [0, -0.0, 0], scale: [1, 0.8, 1], uv: "keep" },
  );
  // Handle core: ergonomic oval with finger swell, built as an extruded side silhouette.
  const handle = roundedOutline([
    [0, 0.016, 0.004],
    [0.0, -0.018, 0.004],
    [-0.02, -0.02, 0.01],
    [-0.036, -0.014, 0.012],
    [-0.06, -0.019, 0.014],
    [-0.098, -0.017, 0.01],
    [-0.11, -0.012, 0.006],
    [-0.11, 0.014, 0.006],
    [-0.07, 0.017, 0.012],
    [-0.03, 0.015, 0.012],
  ]);
  b.add(
    profile(
      handle.map(([f, y]) => [f, y] as [number, number]),
      0.024,
      0.008,
      3,
    ),
    m.polymer,
    { pos: [0, 0, 0] },
  );
  // Textured rubber side panels with exposed screws.
  for (const s of [-1, 1]) {
    b.add(
      profile(
        roundedOutline([
          [-0.012, 0.01, 0.004],
          [-0.012, -0.012, 0.004],
          [-0.04, -0.009, 0.008],
          [-0.06, -0.013, 0.008],
          [-0.092, -0.011, 0.006],
          [-0.092, 0.009, 0.006],
          [-0.06, 0.011, 0.008],
          [-0.03, 0.01, 0.008],
        ]),
        0.003,
        0.001,
        1,
      ),
      m.rubber,
      { pos: [s * 0.0115, 0, 0] },
    );
    for (const f of [-0.02, -0.08])
      screw(b, f, -0.0005, s * 0.0132, 0.0026, m.bareMetal);
  }
  // Pommel with lanyard hole + glow insert.
  b.add(
    profile(
      roundedOutline([
        [-0.106, 0.016, 0.004],
        [-0.106, -0.017, 0.004],
        [-0.122, -0.014, 0.008],
        [-0.128, 0.0, 0.006],
        [-0.122, 0.014, 0.008],
      ]),
      0.026,
      0.004,
      2,
      [
        roundedOutline([
          [-0.113, 0.004, 0.002],
          [-0.113, -0.004, 0.002],
          [-0.12, -0.004, 0.002],
          [-0.12, 0.004, 0.002],
        ]).reverse(),
      ],
    ),
    m.darkSteel,
  );
  b.add(rbox(0.0262, 0.002, 0.006, 0.0008, 1), m.glow, {
    pos: [0, 0.012, 0.1],
  });
  const proc = b.build(true, true, "procedural");
  root.add(proc);

  const tip = socket(
    root,
    [0, bladeOff[1] + 0.014, bladeOff[2] - L],
    [0, 0, 0],
    "tip",
  );
  const muzzle = socket(root, [0, 0, -0.2], [0, 0, 0], "muzzle");

  onKarambit((t) => {
    const mesh = new THREE.Mesh(t.geometry, t.material);
    mesh.name = "karambit";
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    proc.visible = false;
    const extra = root.getObjectByName("v5-machined-surfaces");
    if (extra) extra.visible = false;
    tip.position.copy(karambitPoint(0, 0.03, 0.37));
    muzzle.position.copy(karambitPoint(0, 0.5, 0.26));
  });

  const right: GripDef = {
    socket: gripSocket(
      root,
      [0, -0.002, 0.054],
      [0, 0, -1],
      [0.22, 0.95, 0],
      "rightGrip",
    ),
    radius: 0.0165,
    index: "wrap",
    thumb: "wrap",
    wrap: 1.0,
  };
  const view: ViewConfig = {
    hip: [0.15, -0.12, -0.32],
    hipRot: [1.12, 0.34, -0.22],
    ads: [0.15, -0.12, -0.32],
    scale: 1,
    kickBack: 0,
    kickUp: 0,
    kickSide: 0,
    reload: "none",
    weight: 0.5,
    rightElbow: [0.24, -0.4, 0.02],
    leftElbow: [-0.1, -0.42, 0.02],
  };
  return { id: "edge", root, muzzle, right, tip, view };
}

export function buildWeaponModel(id: WeaponId): WeaponModel {
  const model =
    id === "p9" ? buildPistol() : id === "edge" ? buildKnife() : buildRifle(id);
  refineModel(model);
  model.rest = {
    magazinePosition: model.magazine?.position.clone() ?? new THREE.Vector3(),
    magazineRotation:
      model.magazine?.quaternion.clone() ?? new THREE.Quaternion(),
  };
  return model;
}

/** V5 mechanical surfaces. Static details are merged by material, not separate draw calls. */
function refineModel(model: WeaponModel) {
  const m = M(),
    b = new MeshBatch(),
    id = model.id;
  if (id === "edge") {
    // Full tang, open lanyard loop and scalloped grip scales, all actual geometry.
    b.add(
      profile(
        roundedOutline([
          [-0.008, 0.017],
          [-0.1, 0.017],
          [-0.118, 0.01, 0.004],
          [-0.118, -0.014, 0.004],
          [-0.1, -0.019],
          [-0.008, -0.019],
        ]),
        0.008,
        0.0015,
        2,
      ),
      m.bareMetal,
    );
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++)
        b.add(
          profile(
            roundedOutline([
              [-0.028 - i * 0.009, -0.008],
              [-0.025 - i * 0.009, -0.008],
              [-0.021 - i * 0.009, 0.009],
              [-0.024 - i * 0.009, 0.009],
            ]),
            0.0018,
            0.0005,
            1,
          ),
          m.bladeCoat,
          { pos: [side * 0.014, 0, 0] },
        );
      b.add(
        profile(
          roundedOutline([
            [0.04, 0.017],
            [0.125, 0.017],
            [0.14, 0.023],
            [0.055, 0.023],
          ]),
          0.0007,
          0.0001,
          1,
        ),
        m.accent,
        { pos: [side * 0.0033, -0.015, -0.012] },
      );
    }
    b.add(new THREE.TorusGeometry(0.01, 0.0025, 8, 24), m.darkSteel, {
      pos: [0, 0, 0.12],
      rot: [0, Math.PI / 2, 0],
      uv: "keep",
    });
    model.view.hip = [0.145, -0.1, -0.4];
    model.view.hipRot = [1.03, -0.12, -0.28];
    model.view.rightElbow = [0.29, -0.42, -0.03];
  } else if (id === "p9") {
    // Raised slide ribs, a sculpted beavertail and separate stippled backstrap.
    const sb = new MeshBatch();
    for (const side of [-1, 1]) {
      sb.add(
        profile(
          roundedOutline([
            [-0.043, 0.027],
            [-0.011, 0.027],
            [-0.005, 0.03],
            [-0.043, 0.032],
          ]),
          0.0018,
          0.0007,
          2,
        ),
        m.bareMetal,
        { pos: [side * 0.014, 0, 0] },
      );
      b.add(
        profile(
          roundedOutline([
            [-0.04, -0.035],
            [-0.047, -0.039],
            [-0.047, -0.09],
            [-0.035, -0.106],
            [-0.03, -0.1],
          ]),
          0.004,
          0.0015,
          2,
        ),
        m.polymerLight,
        { pos: [side * 0.014, 0, 0] },
      );
    }
    b.add(
      profile(
        roundedOutline([
          [-0.038, -0.02],
          [-0.071, -0.014],
          [-0.075, -0.004, 0.003],
          [-0.055, -0.009],
          [-0.035, -0.012],
        ]),
        0.026,
        0.002,
        3,
      ),
      m.polymerLight,
    );
    model.slide?.add(sb.build(false, true, "slide-machining"));
    model.view.hip = [0.13, -0.1, -0.4];
    model.view.hipRot = [0.02, 0.08, -0.06];
  } else {
    const sniper = id === "s1",
      smg = id === "viper",
      front = smg ? 0.15 : 0.24,
      back = smg ? -0.13 : -0.2;
    for (const side of [-1, 1]) {
      // Stepped angular receiver cheek plates break up the flat rectangular housing.
      const cheek = roundedOutline([
        [back + 0.04, 0.004],
        [front - 0.13, 0.004],
        [front - 0.1, 0.014, 0.003],
        [front - 0.12, 0.032],
        [back + 0.065, 0.032],
        [back + 0.035, 0.021, 0.004],
      ]);
      b.add(
        profile(cheek, 0.003, 0.0012, 2),
        sniper ? m.polymerLight : m.darkSteel,
        { pos: [side * 0.026, 0, 0] },
      );
      b.add(
        profile(
          roundedOutline([
            [back + 0.065, 0.029],
            [front - 0.14, 0.029],
            [front - 0.125, 0.033],
            [back + 0.07, 0.035],
          ]),
          0.0016,
          0.0005,
          1,
        ),
        m.bareMetal,
        { pos: [side * 0.0275, 0, 0] },
      );
      screw(b, back + 0.07, 0.013, side * 0.029, 0.0025);
      const tab = profile(
        roundedOutline([
          [0, 0],
          [0.014, 0],
          [0.012, 0.008, 0.003],
          [0.002, 0.009, 0.003],
        ]),
        0.003,
        0.0008,
        2,
      );
      b.add(tab, m.accent, { pos: P(front - 0.22, -0.026, side * 0.027) });
    }
    // Sling swivel and split receiver pin heads.
    b.add(new THREE.TorusGeometry(0.009, 0.0022, 6, 16), m.darkSteel, {
      pos: P(back - 0.025, -0.012, -0.027),
      rot: [0, Math.PI / 2, 0],
      uv: "keep",
    });
    if (sniper) {
      for (let i = 0; i < 24; i++) {
        const t = (i * Math.PI) / 12;
        b.add(rbox(0.0018, 0.009, 0.002, 0.0005, 1), m.polymerLight, {
          pos: [Math.sin(t) * 0.0118, 0.115, -0.02 + Math.cos(t) * 0.0118],
          rot: [0, t, 0],
        });
      }
      for (const side of [-1, 1]) {
        b.add(cyl(0.005, 0.19, "z", 10), m.darkSteel, {
          pos: P(0.56, -0.045, side * 0.027),
          rot: [0, side * 0.05, 0],
          uv: "keep",
        });
        b.add(cyl(0.009, 0.012, "x", 12), m.bareMetal, {
          pos: P(0.465, -0.04, side * 0.027),
          uv: "keep",
        });
        b.add(
          profile(
            roundedOutline([
              [back - 0.06, 0.061],
              [back - 0.2, 0.061],
              [back - 0.19, 0.074, 0.006],
              [back - 0.07, 0.074, 0.006],
            ]),
            0.003,
            0.001,
            2,
          ),
          m.rubber,
          { pos: [side * 0.014, 0, 0] },
        );
      }
      model.view.hip = [0.17, -0.13, -0.53];
      model.view.ads = [0, -0.092, -0.28];
      model.view.hipRot = [0.025, 0.105, -0.045];
    } else if (smg) {
      b.add(
        profile(
          roundedOutline([
            [0.17, -0.025],
            [0.24, -0.025],
            [0.24, -0.058, 0.009],
            [0.21, -0.066, 0.009],
            [0.19, -0.049, 0.008],
          ]),
          0.032,
          0.004,
          3,
        ),
        m.polymerLight,
      );
      model.view.hip = [0.15, -0.12, -0.46];
      model.view.hipRot = [0.03, 0.11, -0.035];
    } else {
      b.add(
        profile(
          roundedOutline([
            [0.29, -0.034],
            [0.39, -0.034],
            [0.39, -0.044, 0.004],
            [0.34, -0.049, 0.006],
            [0.29, -0.042, 0.004],
          ]),
          0.036,
          0.003,
          3,
        ),
        m.polymerLight,
      );
      model.view.hip = [0.17, -0.125, -0.53];
      model.view.hipRot = [0.03, 0.1, -0.035];
    }
  }
  model.root.add(b.build(false, true, "v5-machined-surfaces"));
}

/** World-space pickup / third-person version (shares the same geometry). */
export function buildWorldWeapon(id: WeaponId) {
  const w = buildWeaponModel(id);
  w.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return w;
}
