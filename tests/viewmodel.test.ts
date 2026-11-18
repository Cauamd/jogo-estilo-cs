import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ADSController } from "../src/weapons/ADSController";
import { WeaponRenderer } from "../src/weapons/WeaponRenderer";
import { advanceSpring } from "../src/weapons/WeaponAnimationController";
import { WEAPONS } from "../src/shared/weapons";
import { InputManager } from "../src/core/InputManager";
import type { Actor, WeaponId } from "../src/shared/types";

const ids: WeaponId[] = ["vx47", "viper", "p9", "s1", "edge"];
function actor(): Actor {
  return {
    id: "qa",
    name: "QA",
    team: "VANGUARD",
    bot: false,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    armor: 0,
    alive: true,
    crouch: false,
    grounded: true,
    weapon: "vx47",
    inventory: ids.map((id) => ({
      id,
      ammo: WEAPONS[id].capacity,
      reserve: WEAPONS[id].reserve,
    })),
    reload: 0,
    cooldown: 0,
    credits: 9999,
    kills: 0,
    deaths: 0,
    state: "IDLE",
    ack: 0,
    objectiveProgress: 0,
  };
}
const renderer = new WeaponRenderer(null);
let elapsed = 0;
function step(a: Actor, frames = 60, inspect = 0, aim = 0) {
  for (let i = 0; i < frames; i++) {
    elapsed += 1 / 60;
    renderer.update(1 / 60, a, elapsed, inspect, aim);
  }
}

test("Mouse: ADS dura somente enquanto o direito é segurado e limpa ao perder foco", () => {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  Object.assign(globalThis, {
    window: new EventTarget(),
    document: new EventTarget(),
  });
  const input = new InputManager(new EventTarget() as HTMLCanvasElement);
  try {
    input.locked = true;
    input.press({ button: 2 } as MouseEvent);
    assert.equal(input.aimHeld, true);
    input.press({ button: 0 } as MouseEvent);
    input.release({ button: 0 } as MouseEvent);
    assert.equal(input.aimHeld, true);
    assert.equal(input.fire, false);
    input.release({ button: 2 } as MouseEvent);
    assert.equal(input.aimHeld, false);
    input.press({ button: 2 } as MouseEvent);
    input.clear();
    assert.equal(input.aimHeld, false);
    assert.equal(input.lookScale, 1);
  } finally {
    input.dispose();
    Object.assign(globalThis, { window: oldWindow, document: oldDocument });
  }
});

test("ADS: segurar amplia, soltar restaura; troca, morte e recarga cancelam", () => {
  const ads = new ADSController();
  let previous = 85;
  for (let n = 0; n < 60; n++) {
    ads.update(1 / 60, true, "s1", true, 0);
    assert.ok(ads.fov(85) <= previous);
    previous = ads.fov(85);
  }
  assert.equal(ads.fov(85), 30);
  assert.equal(ads.overlay, 1);
  assert.equal(ads.hideViewmodel, true);
  assert.ok(Math.abs(ads.sensitivity(85) - 0.29242) < 0.001);
  for (let n = 0; n < 60; n++) {
    ads.update(1 / 60, false, "s1", true, 0);
    assert.ok(ads.fov(85) >= previous);
    previous = ads.fov(85);
  }
  assert.equal(ads.fov(85), 85);
  assert.equal(ads.sensitivity(85), 1);
  assert.equal(ads.overlay, 0);
  ads.update(1, true, "s1", true, 0);
  ads.update(1 / 60, true, "p9", true, 0);
  assert.equal(ads.blend, 0);
  ads.update(1, true, "s1", true, 0);
  ads.update(1 / 60, true, "s1", false, 0);
  assert.equal(ads.blend, 0);
  ads.update(1, true, "s1", true, 0);
  ads.update(1, true, "s1", true, 2);
  assert.equal(ads.active, false);
  assert.equal(ads.overlay, 0);
  ads.update(1, true, "s1", true, 0, true);
  assert.equal(ads.active, false);
});

test("Molas de recoil: mesmo resultado a 30, 60 e 144 Hz", () => {
  const outcomes = [30, 60, 144].map((hz) => {
    const p = new THREE.Vector3(0.1, -0.2, 0.3),
      v = new THREE.Vector3(2, 1, -3);
    for (let i = 0; i < hz; i++) advanceSpring(p, v, 13, 1 / hz);
    return { p, v };
  });
  for (const result of outcomes) {
    assert.ok(result.p.distanceTo(outcomes[0].p) < 1e-10);
    assert.ok(result.v.distanceTo(outcomes[0].v) < 1e-10);
  }
});

test("Trocas rápidas reutilizam modelos e terminam somente na última seleção", () => {
  const a = actor();
  renderer.build("vx47");
  step(a);
  const originalChildren = [...renderer.gun.children];
  for (const id of ["p9", "edge", "s1", "viper", "edge"] as WeaponId[]) {
    a.weapon = id;
    step(a, 2);
  }
  step(a, 60);
  assert.equal(renderer.id, "edge");
  assert.equal(renderer.isSwitching, false);
  assert.equal(renderer.gun.children.filter((c) => c.visible).length, 1);
  assert.deepEqual(renderer.gun.children, originalChildren);
  renderer.shot("vx47");
  assert.equal(
    renderer.anim.knifeSwing,
    0,
    "old network shot must not animate newly selected knife",
  );
});

test("Mãos ficam nos sockets em 4:3, 16:9 e 21:9 durante movimentos", () => {
  const a = actor(),
    p = new THREE.Vector3(),
    q = new THREE.Vector3();
  for (const aspect of [4 / 3, 16 / 9, 21 / 9])
    for (const id of ids) {
      a.weapon = id;
      a.velocity.z = 3;
      renderer.camera.aspect = aspect;
      step(a);
      for (let n = 0; n < 20; n++) {
        a.yaw += 0.025;
        step(a, 1);
        renderer.scene.updateMatrixWorld(true);
        renderer.arms.right.group.getWorldPosition(p);
        renderer.model.right.socket.getWorldPosition(q);
        assert.ok(p.distanceTo(q) < 1e-7, `${id} right ${aspect}`);
        if (renderer.model.left) {
          renderer.arms.left.group.getWorldPosition(p);
          renderer.model.left.socket.getWorldPosition(q);
          assert.ok(p.distanceTo(q) < 1e-7, `${id} left ${aspect}`);
        }
        for (const hand of [renderer.arms.right, renderer.arms.left])
          if (hand.group.visible) {
            hand.wrist.getWorldPosition(p);
            hand.forearm.getWorldPosition(q);
            assert.ok(p.distanceTo(q) < 1e-7, "forearm must begin at wrist");
          }
      }
    }
});

test("Todos os estados animam com matrizes finitas e restauram o carregador", () => {
  const a = actor(),
    states = new Set<string>(),
    original = JSON.stringify(WEAPONS);
  const run = (frames = 1, inspect = 0, aim = 0) => {
    for (let n = 0; n < frames; n++) {
      step(a, 1, inspect, aim);
      states.add(renderer.anim.state);
      renderer.scene.updateMatrixWorld(true);
      renderer.scene.traverseVisible((o) =>
        assert.ok(o.matrixWorld.elements.every(Number.isFinite), o.name),
      );
    }
  };
  for (const id of ids) {
    a.weapon = id;
    a.velocity.z = 0;
    run(60);
    a.velocity.z = 2;
    run(60);
    a.velocity.z = 5.2;
    run(60);
    a.velocity.z = 0;
    a.grounded = false;
    a.velocity.y = 4;
    run(30);
    a.grounded = true;
    a.velocity.y = 0;
    run(60);
    run(10, 1.4);
    renderer.shot(id);
    run(60);
    if (id !== "edge") {
      for (let t = 0; t < WEAPONS[id].reload; t += 1 / 60) {
        a.reload = WEAPONS[id].reload - t;
        run();
      }
      a.reload = 0;
      run(60);
      assert.ok(
        renderer.model.magazine!.position.distanceTo(
          renderer.model.rest!.magazinePosition,
        ) < 1e-8,
      );
      assert.ok(
        renderer.model.magazine!.quaternion.angleTo(
          renderer.model.rest!.magazineRotation,
        ) < 1e-7,
      );
    }
    if (id === "s1") run(60, 0, 1);
  }
  for (const state of [
    "Idle",
    "Walk",
    "Run",
    "Jump",
    "Land",
    "Equip",
    "Unequip",
    "Fire",
    "Reload",
    "Inspect",
    "ADS",
    "KnifeAttack",
  ])
    assert.ok(states.has(state), `missing ${state}`);
  assert.equal(
    JSON.stringify(WEAPONS),
    original,
    "presentation cannot modify authoritative weapon stats",
  );
});

test("Geometria e materiais: cinco modelos completos, limites e lentes transparentes", () => {
  const a = actor();
  let lenses = 0;
  for (const id of ids) {
    a.weapon = id;
    step(a);
    let triangles = 0,
      draws = 0;
    renderer.scene.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const geo = o.geometry,
        pos = geo.getAttribute("position");
      triangles += (geo.index?.count ?? pos.count) / 3;
      draws++;
      for (const value of pos.array) assert.ok(Number.isFinite(value));
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          assert.ok(mat.roughness >= 0 && mat.roughness <= 1);
          if (mat.transparent && mat.opacity < 0.3 && id === "s1") lenses++;
        }
      }
    });
    console.log(
      `${id}: ${Math.round(triangles)} triangles, ${draws} visible meshes (weapons + hands)`,
    );
    assert.ok(triangles < 100000, `${id} exceeds viewmodel geometry budget`);
    assert.ok(draws < 120);
  }
  assert.ok(lenses >= 2, "both scope lens surfaces must transmit the scene");
});
