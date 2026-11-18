import * as THREE from "three";
import { Simulation } from "./Simulation";
import { GameLoop } from "./GameLoop";
import { InputManager } from "./InputManager";
import { initPhysics } from "../physics/PhysicsWorld";
import { IndustrialDistrict } from "../world/IndustrialDistrict";
import { WeaponRenderer } from "../weapons/WeaponRenderer";
import { ADSController } from "../weapons/ADSController";
import { buildWorldWeapon } from "../weapons/WeaponModels";
import { OperatorModel } from "../world/OperatorModel";
import { Effects } from "../graphics/Effects";
import { AudioSystem } from "../audio/AudioSystem";
import { NetworkClient } from "../multiplayer/NetworkClient";
import { WEAPONS } from "../shared/weapons";
import { TextureSettings } from "../graphics/TextureFactory";
import type {
  Actor,
  Input,
  Mode,
  Settings,
  Snapshot,
  Team,
  WeaponId,
} from "../shared/types";

export interface ViewState {
  snapshot?: Snapshot;
  localId: string;
  fps: number;
  ping: number;
  damage: number;
  hit: number;
  room: string;
  network: string;
}

const _targetVec = new THREE.Vector3();
const _actorVec = new THREE.Vector3();

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(85, 1, 0.06, 350);
  input: InputManager;
  world: IndustrialDistrict;
  weapon: WeaponRenderer;
  effects: Effects;
  audio = new AudioSystem();
  loop: GameLoop;
  sim?: Simulation;
  net?: NetworkClient;
  models = new Map<string, OperatorModel>();
  snapshot?: Snapshot;
  localId = "local";
  mode: Mode = "offline";
  playing = false;
  paused = false;
  shop = false;
  aim = false;
  ads = new ADSController();
  scopeElement: HTMLDivElement | null = null;
  /** Local development controls; never used by a production or network match. */
  debugInput?: Input;
  elapsed = 0;
  hudTimer = 0;
  fps = 60;
  eventId = 0;
  damage = 0;
  hit = 0;
  lastHealth = 100;
  lastStep = 0;
  lastRound = 0;
  eyeHeight = 1.62;
  cameraRoll = 0;
  onView: (s: ViewState) => void = () => {};
  onAction: (s: string) => void = () => {};
  pickups = new Map<number, THREE.Group>();
  botSteps = new Map<string, number>();

  constructor(
    public mount: HTMLElement,
    public settings: Settings,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor("#98b4bd");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "world-canvas";
    mount.appendChild(this.renderer.domElement);

    TextureSettings.anisotropy = Math.min(
      16,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.world = new IndustrialDistrict(this.scene, this.renderer);
    this.weapon = new WeaponRenderer(this.scene.environment);
    this.effects = new Effects(this.scene);
    this.input = new InputManager(this.renderer.domElement);
    this.input.onAction = (a) => this.onAction(a);
    this.applySettings(settings);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.loop = new GameLoop(this.fixed, this.render);
    this.loop.start();
  }

  resize = () => {
    const w = this.mount.clientWidth,
      h = this.mount.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapon.camera.aspect = w / h;
    this.weapon.camera.updateProjectionMatrix();
  };

  applySettings(s: Settings) {
    this.settings = s;
    this.input.sensitivity = s.sensitivity;
    this.audio.setVolume(s.volume);

    const maxDpr =
      s.quality === "ultra"
        ? 2.0
        : s.quality === "high"
          ? 1.5
          : s.quality === "medium"
            ? 1.25
            : 1.0;
    const scale = s.quality === "low" ? 0.75 : 1;
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, maxDpr) * s.resolution * scale,
    );

    this.renderer.shadowMap.enabled = s.quality !== "low";
    const shadowSize =
      s.quality === "ultra" ? 4096 : s.quality === "high" ? 3072 : 2048;
    if (this.world.sun.shadow.mapSize.x !== shadowSize) {
      this.world.sun.shadow.mapSize.setScalar(shadowSize);
      this.world.sun.shadow.map?.dispose();
      this.world.sun.shadow.map = null;
    }
    for (const pl of this.world.pointLights) {
      pl.visible = s.quality !== "low";
    }
    this.scene.environmentIntensity =
      s.quality === "ultra" ? 0.46 : s.quality === "low" ? 0.36 : 0.42;

    if (this.sim) this.sim.difficulty = s.difficulty;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
  }

  async start(
    mode: Mode,
    team: Team,
    options?: { url: string; code: string; name: string },
  ) {
    await initPhysics();
    this.stopMatch();
    this.mode = mode;
    this.localId = "local";
    this.eventId = 0;
    this.lastRound = 0;
    this.lastHealth = 100;
    this.aim = false;
    if (mode === "online" && options) {
      this.net = new NetworkClient(options.url);
      this.net.onPurchase = (ok) =>
        this.onAction(ok ? "purchased" : "purchaseFailed");
      try {
        const room = await this.net.connect(options.code, options.name, team);
        this.localId = room.sessionId;
      } catch (e) {
        this.net.dispose();
        this.net = undefined;
        throw e;
      }
    } else {
      this.sim = new Simulation(mode, team, "local", {
        targetScore: this.settings.tdmTarget ?? 75,
        duration: (this.settings.tdmMinutes ?? 10) * 60,
        teamSize: this.settings.tdmTeamSize ?? 7,
      });
      this.sim.difficulty = this.settings.difficulty;
      this.snapshot = this.sim.snapshot();
      this.input.yaw = this.sim.get(this.localId)!.yaw;
      this.input.pitch = 0;
    }
    this.playing = true;
    this.paused = mode !== "online";
    this.shop = false;
    await this.audio.unlock();
    this.audio.ui();
    this.emitView();
  }

  stopMatch() {
    this.ads.reset();
    this.aim = false;
    this.sim?.dispose();
    this.sim = undefined;
    this.net?.dispose();
    this.net = undefined;
    this.snapshot = undefined;
    this.playing = false;
    this.paused = false;
    this.shop = false;
    this.input.clear();
    for (const model of this.models.values()) {
      this.scene.remove(model.root);
      disposeObject(model.root);
    }
    this.models.clear();
    for (const p of this.pickups.values()) {
      this.scene.remove(p);
      disposeObject(p);
    }
    this.pickups.clear();
    this.botSteps.clear();
  }

  buy(item: WeaponId | "armor") {
    this.audio.ui();
    if (this.net) this.net.room?.send("buy", item);
    else
      this.onAction(
        this.sim?.buy(this.localId, item) ? "purchased" : "purchaseFailed",
      );
  }

  drop() {
    if (this.net) this.net.room?.send("drop");
    else this.sim?.drop(this.localId);
  }

  fixed = (dt: number) => {
    if (!this.playing) return;
    if (this.paused && this.mode !== "online") return;
    const a = this.getLocal();
    const input = this.input.read(a ? WEAPONS[a.weapon].automatic : true);
    if (import.meta.env.DEV && this.mode === "training" && this.debugInput) {
      Object.assign(input, this.debugInput, {
        seq: input.seq,
        yaw: this.input.yaw,
        pitch: this.input.pitch,
      });
      this.debugInput.fire = false;
      this.debugInput.reload = false;
      this.debugInput.slot = 0;
      this.debugInput.jump = false;
    }
    if (input.fire || input.reload || input.slot) this.input.inspectTime = 0;
    if (this.sim) {
      this.sim.inputs.set(this.localId, input);
      this.sim.update(dt);
      this.snapshot = this.sim.snapshot();
    } else if (this.net) {
      this.net.send(input);
      this.snapshot = this.net.snapshot;
    }
    if (this.snapshot) {
      if (this.snapshot.round !== this.lastRound) {
        this.lastRound = this.snapshot.round;
        const p = this.snapshot.actors.find((a) => a.id === this.localId);
        if (p) {
          this.input.yaw = p.yaw;
          this.input.pitch = p.pitch;
          this.lastHealth = p.health;
        }
      }
      for (const event of this.snapshot.events) {
        if (event.id <= this.eventId) continue;
        this.eventId = event.id;
        if (event.type === "shot") {
          this.effects.shot(event, event.actor === this.localId);
          this.audio.shot(
            event.weapon!,
            event.actor === this.localId ? undefined : event.position,
          );
          if (event.actor === this.localId) {
            this.weapon.shot(event.weapon!);
            this.input.pitch = Math.min(
              1.48,
              this.input.pitch +
                WEAPONS[event.weapon!].recoil * (this.aim ? 0.5 : 1),
            );
            if (event.target) {
              this.hit = 1;
              this.audio.tone(1400, 0.04, 0.045);
            }
          }
        }
        if (event.type === "reload" && event.actor === this.localId)
          this.audio.reload();
        if (event.type === "round" || event.type === "objective")
          this.audio.tone(650, 0.3, 0.15);
      }
      const p = this.snapshot.actors.find((a) => a.id === this.localId);
      if (p) {
        if (p.health < this.lastHealth) {
          this.damage = 1;
          this.audio.noiseBurst(0.12, 0.2, 500);
        }
        this.lastHealth = p.health;
      }
    }
  };

  getLocal() {
    return (
      this.net?.predicted ??
      this.snapshot?.actors.find((a) => a.id === this.localId)
    );
  }

  render = (dt: number) => {
    this.elapsed += dt;
    this.fps += (1 / Math.max(0.001, dt) - this.fps) * 0.04;
    this.hit = Math.max(0, this.hit - dt * 5);
    this.damage = Math.max(0, this.damage - dt * 2);
    this.input.inspectTime = Math.max(0, this.input.inspectTime - dt);
    this.effects.update(dt);

    const local = this.getLocal();
    if (this.playing && local && this.snapshot) {
      const observed = local.alive
        ? local
        : (this.snapshot.actors.find((a) => a.alive && a.team === local.team) ??
          local);
      const yaw = local.alive ? this.input.yaw : observed.yaw;
      const pitch = local.alive ? this.input.pitch : observed.pitch;
      if (local.alive) {
        local.yaw = yaw;
        local.pitch = pitch;
      }
      this.ads.update(
        dt,
        this.input.aimHeld && !this.paused && !this.shop,
        local.weapon,
        local.alive,
        local.reload,
        this.weapon.isSwitching,
      );
      this.aim = this.ads.aiming;
      this.input.lookScale = this.ads.sensitivity(this.settings.fov);

      const isSliding = (observed.slide ?? 0) > 0.01;
      const desiredEye = isSliding ? 0.88 : observed.crouch ? 1.08 : 1.62;
      this.eyeHeight +=
        (desiredEye - this.eyeHeight) * (1 - Math.exp(-dt * 18));

      const moving = local.alive
        ? Math.min(1, Math.hypot(local.velocity.x, local.velocity.z) / 5)
        : 0;
      const bobScale = isSliding ? 0.2 : 1 - this.ads.viewBlend * 0.7;
      const targetY =
        observed.position.y +
        this.eyeHeight +
        Math.sin(this.elapsed * 10) * 0.015 * moving * bobScale;
      _targetVec.set(observed.position.x, targetY, observed.position.z);
      if (this.camera.position.distanceTo(_targetVec) > 5)
        this.camera.position.copy(_targetVec);
      else this.camera.position.lerp(_targetVec, 1 - Math.exp(-dt * 24));

      // Subtle camera Dutch roll during slide and strafing
      const strafeVel =
        local.velocity.x * Math.cos(yaw) + local.velocity.z * Math.sin(yaw);
      const desiredRoll =
        (isSliding ? -0.042 : 0) -
        Math.max(-1, Math.min(1, strafeVel / 6)) * 0.012;
      this.cameraRoll +=
        (desiredRoll - this.cameraRoll) * (1 - Math.exp(-dt * 14));

      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(pitch, yaw, this.cameraRoll);
      const slideFovBoost = isSliding ? 3.5 : 0;
      this.camera.fov = this.ads.fov(this.settings.fov) + slideFovBoost;
      this.camera.updateProjectionMatrix();

      this.weapon.update(
        dt,
        local,
        this.elapsed,
        this.input.inspectTime,
        this.ads.viewBlend,
      );

      for (const a of this.snapshot.actors) {
        if (a.id === this.localId) continue;
        let m = this.models.get(a.id);
        if (!m) {
          m = new OperatorModel(a.team);
          this.models.set(a.id, m);
          this.scene.add(m.root);
          m.update(a, dt, this.elapsed, true);
        } else m.update(a, dt, this.elapsed);
        if (a.id === observed.id && !local.alive) m.root.visible = false;
      }
      for (const [id, model] of this.models) {
        if (!this.snapshot.actors.some((a) => a.id === id)) {
          this.scene.remove(model.root);
          disposeObject(model.root);
          this.models.delete(id);
        }
      }

      for (const p of this.snapshot.pickups ?? []) {
        let model = this.pickups.get(p.id);
        if (!model) {
          model = new THREE.Group();
          const built = buildWorldWeapon(p.gun.id);
          built.root.scale.setScalar(1.25);
          built.root.rotation.set(0, 0.6, Math.PI / 2);
          model.add(built.root);
          this.scene.add(model);
          this.pickups.set(p.id, model);
        }
        model.position.set(p.position.x, p.position.y + 0.04, p.position.z);
      }
      for (const [id, p] of this.pickups) {
        if (!this.snapshot.pickups?.some((v) => v.id === id)) {
          this.scene.remove(p);
          disposeObject(p);
          this.pickups.delete(id);
        }
      }

      if (!this.paused) {
        for (const actor of this.snapshot.actors) {
          if (
            actor.id === local.id ||
            !actor.alive ||
            Math.hypot(actor.velocity.x, actor.velocity.z) < 3 ||
            actor.crouch
          )
            continue;
          if (this.elapsed - (this.botSteps.get(actor.id) ?? 0) > 0.42) {
            this.botSteps.set(actor.id, this.elapsed);
            _actorVec.set(actor.position.x, actor.position.y, actor.position.z);
            if (this.camera.position.distanceTo(_actorVec) < 22)
              this.audio.step(actor.position);
          }
        }
      }
      this.audio.listener(this.camera.position, yaw, pitch);
      if (
        local.alive &&
        local.grounded &&
        moving > 0.1 &&
        this.elapsed - this.lastStep > (local.crouch ? 0.65 : 0.4)
      ) {
        this.lastStep = this.elapsed;
        if (!this.input.keys.has("ShiftLeft")) this.audio.step();
      }
    } else {
      this.camera.position.set(22 + Math.sin(this.elapsed * 0.035) * 3, 12, 28);
      this.camera.lookAt(-4, 3, -10);
    }

    if (this.scopeElement) {
      const amount =
        this.playing && !this.paused && !this.shop ? this.ads.overlay : 0;
      this.scopeElement.style.opacity = String(amount);
      this.scopeElement.style.visibility =
        amount > 0.001 ? "visible" : "hidden";
      this.scopeElement.setAttribute("aria-hidden", String(amount <= 0.001));
      this.mount.parentElement?.classList.toggle("is-scoped", amount > 0.15);
    }
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (this.playing && local?.alive && !this.ads.hideViewmodel) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.weapon.scene, this.weapon.camera);
    }
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.emitView();
    }
  };

  emitView() {
    this.onView({
      snapshot: this.snapshot,
      localId: this.localId,
      fps: Math.round(this.fps),
      ping: this.net?.ping ?? 0,
      damage: this.damage,
      hit: this.settings.hitmarker ? this.hit : 0,
      room: this.net?.room?.roomId ?? "",
      network: this.net?.status ?? "",
    });
  }

  dispose() {
    this.loop.stop();
    this.stopMatch();
    this.input.dispose();
    this.audio.dispose();
    window.removeEventListener("resize", this.resize);
    disposeObject(this.scene, true);
    disposeObject(this.weapon.scene, true);
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function disposeObject(root: THREE.Object3D, force = false) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      geometries.add(o.geometry);
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(mat);
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
  });
  geometries.forEach((g) => {
    if (force || (!g.userData?.shared && g.type !== "BoxGeometry")) g.dispose();
  });
  materials.forEach((m) => {
    if (force || !m.userData?.shared) m.dispose();
  });
  textures.forEach((t) => {
    if (force || !t.userData?.shared) t.dispose();
  });
}
