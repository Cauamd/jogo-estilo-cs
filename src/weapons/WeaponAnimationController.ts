import * as THREE from "three";
import { WEAPONS } from "../shared/weapons";
import type { Actor, WeaponId } from "../shared/types";
import type { WeaponModel } from "./WeaponModels";
import type { FirstPersonArms } from "./FirstPersonArms";

export type FPSAnimState =
  | "Idle"
  | "Walk"
  | "Run"
  | "Crouch"
  | "Slide"
  | "Equip"
  | "Unequip"
  | "Fire"
  | "Reload"
  | "Inspect"
  | "KnifeAttack"
  | "Jump"
  | "Land"
  | "ADS";

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function easeOutCubic(t: number) {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}
function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * Math.max(0, Math.min(1, t))) - 1) / 2;
}
function damp(cur: number, target: number, lambda: number, dt: number) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

const _pos = new THREE.Vector3();
const _rot = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _leftMat = new THREE.Matrix4();
const _leftPos = new THREE.Vector3();
const _leftQuat = new THREE.Quaternion();
const _leftEuler = new THREE.Euler();
const _leftScale = new THREE.Vector3(1, 1, 1);
const _rElbow = new THREE.Vector3();
const _lElbow = new THREE.Vector3();

/**
 * Centralized First-Person Animation Controller.
 * Combines layered procedural states (Idle, Walk, Run, Equip, Unequip, Fire,
 * Reload, Inspect, KnifeAttack, Jump, Land, AimDownSights) with damped springs,
 * camera-driven weapon sway, figure-8 locomotion bob, and support-hand IK targets.
 */
export class WeaponAnimationController {
  state: FPSAnimState = "Idle";

  // Smoothed state parameters
  equipProgress = 0; // 0 = lowered, 1 = ready
  adsBlend = 0;
  moveBlend = 0;
  sprintBlend = 0;
  crouchBlend = 0;
  slideBlend = 0;
  bobPhase = 0;

  // Recoil & action timers
  recoilPos = new THREE.Vector3();
  recoilVel = new THREE.Vector3();
  recoilRot = new THREE.Vector3();
  recoilRotVel = new THREE.Vector3();
  shotImpulse = 0;
  knifeSwing = 0;
  knifeCombo = 0;

  // Camera sway state
  private lastYaw = 0;
  private lastPitch = 0;
  private swayInitialized = false;
  swayX = 0;
  swayY = 0;
  swayRoll = 0;

  // Jump / Land spring
  private wasGrounded = true;
  private airTime = 0;
  jumpOffset = 0;
  landDip = 0;
  landVel = 0;

  // Final smoothed root transform
  private curPos = new THREE.Vector3();
  private curQuat = new THREE.Quaternion();
  private initializedPose = false;

  resetForWeapon() {
    this.equipProgress = 0;
    this.recoilPos.set(0, 0, 0);
    this.recoilVel.set(0, 0, 0);
    this.recoilRot.set(0, 0, 0);
    this.recoilRotVel.set(0, 0, 0);
    this.shotImpulse = 0;
    this.knifeSwing = 0;
    this.adsBlend = 0;
    this.swayInitialized = false;
    // The incoming model begins below frame. Its published grip pose remains coherent.
    this.initializedPose = false;
  }

  onFire(id: WeaponId, aim: boolean) {
    if (id === "edge") {
      this.knifeSwing = 0.48;
      this.knifeCombo = (this.knifeCombo + 1) % 2;
      this.shotImpulse = 1;
      return;
    }
    const aimMul = aim ? 0.45 : 1;
    this.shotImpulse = 1;
    const side = (Math.random() - 0.45) * 1.4;
    this.recoilVel.z += 0.55 * aimMul;
    this.recoilVel.y += 0.12 * aimMul;
    this.recoilVel.x += side * 0.06 * aimMul;
    this.recoilRotVel.x += 2.2 * aimMul;
    this.recoilRotVel.y += side * 0.55 * aimMul;
    this.recoilRotVel.z += -side * 0.85 * aimMul;
  }

  update(
    dt: number,
    actor: Actor,
    model: WeaponModel,
    arms: FirstPersonArms,
    elapsed: number,
    inspectTime: number,
    aim: number,
    switchingOut = 0,
  ) {
    const v = model.view;
    const isKnife = model.id === "edge";
    const isSniper = model.id === "s1";

    // 1. Equip / Unequip progression
    if (switchingOut > 0) {
      this.equipProgress = damp(this.equipProgress, 0, 22, dt);
    } else {
      this.equipProgress = Math.min(
        1,
        this.equipProgress + dt * (isKnife ? 2.8 : 2.5),
      );
    }
    const equipEase = easeOutCubic(this.equipProgress);

    // 2. ADS blend (all firearms support right-click ADS)
    const wantAds =
      aim > 0.01 && !isKnife && actor.reload <= 0 && switchingOut === 0;
    this.adsBlend = wantAds ? aim : 0;

    // 3. Locomotion, Crouch, Slide & Bob
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    const isSliding = (actor.slide ?? 0) > 0.01;
    const moving = actor.grounded && !isSliding ? Math.min(1, speed / 5.2) : 0;
    const running =
      actor.grounded && !isSliding && speed > 4.1 && !actor.crouch && !wantAds
        ? 1
        : 0;
    this.moveBlend = damp(this.moveBlend, moving, 10, dt);
    this.sprintBlend = damp(this.sprintBlend, running, 9, dt);
    this.crouchBlend = damp(
      this.crouchBlend,
      actor.crouch && !isSliding ? 1 : 0,
      12,
      dt,
    );
    this.slideBlend = damp(this.slideBlend, isSliding ? 1 : 0, 14, dt);

    const freq = 7.5 + this.sprintBlend * 3.2;
    this.bobPhase += dt * freq * (0.18 + this.moveBlend * 0.82);

    const bobAmp = (1 - this.adsBlend * 0.78) * this.moveBlend;
    const bobX =
      Math.cos(this.bobPhase) * (0.006 + this.sprintBlend * 0.005) * bobAmp;
    const bobY =
      Math.abs(Math.sin(this.bobPhase)) *
      (-0.009 - this.sprintBlend * 0.006) *
      bobAmp;
    const bobRoll =
      Math.cos(this.bobPhase) * (0.016 + this.sprintBlend * 0.014) * bobAmp;
    const bobPitch =
      Math.sin(this.bobPhase * 2) * (0.008 + this.sprintBlend * 0.008) * bobAmp;

    // Subtle idle breathing & wrist micro-motion
    const breathAmp = (1 - this.adsBlend * 0.8) * (1 - this.moveBlend * 0.6);
    const breathY = Math.sin(elapsed * 1.9) * 0.0022 * breathAmp;
    const breathX = Math.cos(elapsed * 0.95) * 0.0012 * breathAmp;
    const breathRotZ =
      Math.sin(elapsed * 1.4) * (isKnife ? 0.012 : 0.004) * breathAmp;
    const breathRotX =
      Math.cos(elapsed * 1.9) * (isKnife ? 0.008 : 0.003) * breathAmp;

    // 4. Camera Sway (horizontal + vertical rotation inertia)
    if (!this.swayInitialized) {
      this.lastYaw = actor.yaw;
      this.lastPitch = actor.pitch;
      this.swayInitialized = true;
    }
    let dYaw = actor.yaw - this.lastYaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const dPitch = actor.pitch - this.lastPitch;
    this.lastYaw = actor.yaw;
    this.lastPitch = actor.pitch;

    const invDt = 1 / Math.max(dt, 0.001);
    const yawVel = Math.max(-14, Math.min(14, dYaw * invDt));
    const pitchVel = Math.max(-14, Math.min(14, dPitch * invDt));
    const swayScale = (1 - this.adsBlend * 0.65) / Math.sqrt(v.weight);
    this.swayX = damp(this.swayX, -yawVel * 0.0028 * swayScale, 12, dt);
    this.swayY = damp(this.swayY, pitchVel * 0.0024 * swayScale, 12, dt);
    this.swayRoll = damp(this.swayRoll, -yawVel * 0.012 * swayScale, 10, dt);

    // 5. Jump & Land spring
    if (!actor.grounded) {
      this.airTime = Math.min(1.2, this.airTime + dt);
      const vy = Math.max(-6, Math.min(6, actor.velocity.y));
      this.jumpOffset = damp(
        this.jumpOffset,
        Math.min(0.022, Math.max(-0.025, -vy * 0.0045)),
        10,
        dt,
      );
    } else {
      if (!this.wasGrounded && this.airTime > 0.08) {
        this.landVel = -Math.min(0.32, 0.12 + this.airTime * 0.28);
      }
      this.airTime = 0;
      this.jumpOffset = damp(this.jumpOffset, 0, 14, dt);
    }
    this.wasGrounded = actor.grounded;
    // Damped harmonic oscillator for landing dip
    const ld = this.landVel + 13 * this.landDip,
      le = Math.exp(-13 * dt);
    this.landDip = (this.landDip + ld * dt) * le;
    this.landVel = (this.landVel - 13 * ld * dt) * le;

    // 6. Fire Recoil spring (critically damped)
    advanceSpring(this.recoilPos, this.recoilVel, 13, dt);
    advanceSpring(this.recoilRot, this.recoilRotVel, 13, dt);

    this.shotImpulse = Math.max(0, this.shotImpulse - dt * 8.5);
    this.knifeSwing = Math.max(0, this.knifeSwing - dt);

    // 7. Base pose (Hip <-> ADS)
    _pos.set(
      v.hip[0] + (v.ads[0] - v.hip[0]) * this.adsBlend,
      v.hip[1] + (v.ads[1] - v.hip[1]) * this.adsBlend,
      v.hip[2] + (v.ads[2] - v.hip[2]) * this.adsBlend,
    );
    _rot.set(
      v.hipRot[0] * (1 - this.adsBlend),
      v.hipRot[1] * (1 - this.adsBlend),
      v.hipRot[2] * (1 - this.adsBlend),
      "YXZ",
    );

    // Add locomotion, breathing, sway, jump/land, and recoil
    _pos.x += bobX + breathX + this.swayX + this.recoilPos.x * v.kickSide * 8;
    _pos.y +=
      bobY +
      breathY +
      this.swayY +
      this.jumpOffset +
      this.landDip +
      this.recoilPos.y * v.kickUp * 4;
    _pos.z += this.recoilPos.z * v.kickBack * 4.5 + Math.abs(bobY) * 0.35;

    _rot.x +=
      bobPitch +
      breathRotX -
      this.swayY * 1.1 +
      this.recoilRot.x * v.kickUp * 2.1 +
      this.landDip * 1.8 -
      this.jumpOffset * 1.5;
    _rot.y += -this.swayX * 1.2 + this.recoilRot.y * v.kickSide * 4;
    _rot.z +=
      bobRoll + breathRotZ + this.swayRoll + this.recoilRot.z * v.kickSide * 6;

    // Sprint / Run tilt (tactical ready pose when sprinting without firing)
    const runTilt =
      this.sprintBlend *
      (1 - this.adsBlend) *
      Math.max(0, 1 - this.shotImpulse * 3) *
      (actor.reload > 0 ? 0 : 1);
    if (isKnife) {
      _pos.x -= runTilt * 0.022;
      _pos.y += runTilt * 0.016;
      _rot.x += runTilt * 0.16;
      _rot.z += runTilt * 0.14;
    } else {
      _pos.x -= runTilt * 0.032;
      _pos.y -= runTilt * 0.022;
      _rot.x -= runTilt * 0.11;
      _rot.y += runTilt * 0.22;
      _rot.z -= runTilt * 0.16;
    }

    // Crouch & Slide tactical cant
    const crouchTilt = this.crouchBlend * (1 - this.adsBlend);
    _pos.x -= crouchTilt * 0.012;
    _pos.y -= crouchTilt * 0.008;
    _rot.z += crouchTilt * 0.085;

    const slideTilt = this.slideBlend * (1 - this.adsBlend * 0.7);
    _pos.x -= slideTilt * 0.048;
    _pos.y -= slideTilt * 0.026;
    _pos.z += slideTilt * 0.018;
    _rot.x += slideTilt * 0.09;
    _rot.y += slideTilt * 0.18;
    _rot.z += slideTilt * 0.36;

    // Equip trajectory (arcs in from below/side with wrist roll)
    const eqInv = 1 - equipEase;
    if (eqInv > 0.0001) {
      if (isKnife) {
        // Stylized tactical spin-in draw
        _pos.y -= eqInv * 0.22;
        _pos.x += eqInv * 0.08;
        _rot.x -= eqInv * 1.35;
        _rot.z += Math.sin(equipEase * Math.PI) * 0.55 + eqInv * 0.5;
        _rot.y -= eqInv * 0.45;
      } else {
        _pos.y -= eqInv * 0.26;
        _pos.z += eqInv * 0.08;
        _rot.x -= eqInv * 0.65;
        _rot.z -= eqInv * 0.42;
      }
    }

    // Reset moving weapon sub-parts & hand overrides
    let leftOverride: THREE.Matrix4 | null = null;
    let leftBlend = 0;
    arms.right.open = 0;
    arms.left.open = 0;
    arms.right.extraCurl.fill(0);
    arms.left.extraCurl.fill(0);
    arms.right.extraCurl[0] = this.shotImpulse * 0.38;

    if (model.trigger) model.trigger.rotation.x = -this.shotImpulse * 0.36;
    if (model.slide) model.slide.position.z = this.shotImpulse * 0.038;
    if (model.bolt) model.bolt.position.z = this.shotImpulse * 0.055;
    if (model.boltHandle) model.boltHandle.rotation.z = 0;
    if (model.magazine) {
      model.magazine.position.copy(model.rest!.magazinePosition);
      model.magazine.quaternion.copy(model.rest!.magazineRotation);
    }

    // Sniper bolt-action cycle between shots
    if (
      isSniper &&
      actor.cooldown > 0 &&
      actor.cooldown < 0.95 &&
      actor.reload <= 0
    ) {
      const bp = 1 - actor.cooldown / 0.95;
      const lift = smoothstep(0, 0.22, bp) - smoothstep(0.72, 0.95, bp);
      const pull = smoothstep(0.18, 0.48, bp) - smoothstep(0.52, 0.82, bp);
      if (model.boltHandle) {
        model.boltHandle.rotation.z = -lift * 0.95;
        model.boltHandle.position.z = 0.14 + pull * 0.075;
      }
      if (model.bolt) model.bolt.position.z = pull * 0.075;
      _rot.z += lift * 0.12;
      _rot.x += pull * 0.06;
    } else if (model.boltHandle) {
      model.boltHandle.position.z = 0.14;
    }

    // 8. Knife Attack Choreography
    if (isKnife && this.knifeSwing > 0) {
      const p = 1 - this.knifeSwing / 0.48; // 0 -> 1
      const windup = smoothstep(0, 0.18, p) * (1 - smoothstep(0.18, 0.34, p));
      const slash = smoothstep(0.16, 0.48, p) * (1 - smoothstep(0.48, 0.88, p));
      const settle = smoothstep(0.48, 1, p);
      const dir = this.knifeCombo === 0 ? 1 : -1;

      _pos.x += windup * 0.07 * dir - slash * 0.19 * dir;
      _pos.y += windup * 0.045 - slash * 0.07 * (1 - settle * 0.5);
      _pos.z += windup * 0.05 - slash * 0.15;

      _rot.x += windup * 0.38 - slash * 0.62;
      _rot.y += -windup * 0.42 * dir + slash * 1.05 * dir;
      _rot.z += -windup * 0.35 * dir + slash * 0.78 * dir;
      arms.right.extraCurl[1] = slash * 0.18;
      arms.right.extraCurl[2] = slash * 0.22;
    }

    // 9. Reload Choreography (respects exact WEAPONS[id].reload duration)
    if (actor.reload > 0 && !isKnife && model.magazine) {
      const total = WEAPONS[model.id].reload;
      const p = Math.max(0, Math.min(1, 1 - actor.reload / total));
      const tiltIn = smoothstep(0, 0.14, p) * (1 - smoothstep(0.84, 1, p));
      const magOut = smoothstep(0.12, 0.36, p);
      const magIn = smoothstep(0.46, 0.72, p);
      const magDrop = magOut * (1 - magIn);
      const slap = smoothstep(0.74, 0.84, p) * (1 - smoothstep(0.84, 0.95, p));

      // Tilt rifle/pistol to show magwell
      _pos.x -= tiltIn * 0.045;
      _pos.y -= tiltIn * 0.035 - slap * 0.018;
      _pos.z += tiltIn * 0.03;
      _rot.x += tiltIn * 0.22 - slap * 0.12;
      _rot.y -= tiltIn * 0.28;
      _rot.z -= tiltIn * 0.48 + slap * 0.16;

      // Animate magazine down and back up along magwell axis
      const baseY = model.rest!.magazinePosition.y;
      const baseZ = model.rest!.magazinePosition.z;
      model.magazine.position.set(
        -magDrop * 0.04,
        baseY - magDrop * 0.26,
        baseZ + magDrop * (model.id === "p9" ? 0.07 : 0.04),
      );
      model.magazine.rotation.x =
        (model.id === "p9" ? -0.29 : 0) + magDrop * 0.35;
      model.magazine.rotation.z = magDrop * 0.25;

      // Bolt / slide rack at the end of reload
      if (model.slide) model.slide.position.z = slap * 0.036;
      if (model.bolt) model.bolt.position.z = slap * 0.055;

      // Support hand follows magazine during extract/insert, then racks bolt
      if (model.magGrab && model.left) {
        leftBlend = smoothstep(0.04, 0.16, p) * (1 - smoothstep(0.86, 0.98, p));
        arms.left.open = magDrop * 0.35;
      }
    }

    // 10. Inspect Choreography (triggered by F, cancelled immediately by combat)
    const canInspect =
      inspectTime > 0 &&
      actor.reload <= 0 &&
      this.shotImpulse <= 0.02 &&
      this.knifeSwing <= 0 &&
      !wantAds;
    let inspectGrabSlide = 0;
    if (canInspect) {
      const p = Math.max(0, Math.min(1, 1 - inspectTime / 2.2));
      const env =
        easeInOutSine(smoothstep(0, 0.18, p)) *
        (1 - easeInOutSine(smoothstep(0.82, 1, p)));
      const sideA = smoothstep(0.08, 0.36, p) * (1 - smoothstep(0.46, 0.66, p));
      const sideB = smoothstep(0.46, 0.68, p) * (1 - smoothstep(0.82, 0.96, p));

      if (isKnife) {
        // Showcase both faces of the blade + controlled wrist flourish
        const flourish = Math.sin(smoothstep(0.18, 0.82, p) * Math.PI * 2);
        _pos.x -= env * 0.09;
        _pos.y += env * 0.065;
        _pos.z -= env * 0.02;
        _rot.x += env * 0.35 + sideB * 0.35;
        _rot.y -= sideA * 1.15 - sideB * 0.85;
        _rot.z += sideA * 0.65 - sideB * 0.45 + flourish * 0.35;
        arms.right.open = 0; // Keep the blade anchored in the closed dominant hand.
      } else {
        _pos.x -= env * 0.095;
        _pos.y += env * 0.055 - sideB * 0.02;
        _pos.z += env * 0.025;
        _rot.x += sideA * 0.28 + sideB * 0.16;
        _rot.y += -sideA * 0.72 + sideB * 0.58;
        _rot.z += sideA * 0.52 - sideB * 0.38;
        inspectGrabSlide = sideB;
        arms.left.open = sideA * 0.35;
      }
    }

    // 11. Apply smoothed root transform using Quaternion slerp + position damping
    _targetQuat.setFromEuler(_rot);
    if (!this.initializedPose) {
      this.curPos.copy(_pos);
      this.curQuat.copy(_targetQuat);
      this.initializedPose = true;
    } else {
      const k = 1 - Math.exp(-dt * 28);
      this.curPos.lerp(_pos, k);
      this.curQuat.slerp(_targetQuat, k);
    }
    model.root.position.copy(this.curPos);
    model.root.quaternion.copy(this.curQuat);
    model.root.scale.setScalar(v.scale);
    model.root.updateMatrixWorld(true);

    // Compute support-hand world override matrix after weapon root matrix is updated
    if (leftBlend > 0 && model.magGrab) {
      model.magGrab.getWorldPosition(_leftPos);
      model.root.getWorldQuaternion(_leftQuat);
      _leftEuler.set(-0.25, 0.25, 0.2, "YXZ");
      _quat.setFromEuler(_leftEuler);
      _leftQuat.multiply(_quat);
      _leftMat.compose(_leftPos, _leftQuat, _leftScale);
      leftOverride = _leftMat;
    } else if (inspectGrabSlide > 0.01 && model.left) {
      model.left.socket.getWorldPosition(_leftPos);
      _leftPos.y -= inspectGrabSlide * 0.035;
      _leftPos.x -= inspectGrabSlide * 0.025;
      model.left.socket.getWorldQuaternion(_leftQuat);
      _leftMat.compose(_leftPos, _leftQuat, _leftScale);
      leftOverride = _leftMat;
      leftBlend = inspectGrabSlide;
    }

    // Update state label for debugging / telemetry
    if (switchingOut > 0) this.state = "Unequip";
    else if (this.equipProgress < 0.95) this.state = "Equip";
    else if (this.knifeSwing > 0) this.state = "KnifeAttack";
    else if (this.shotImpulse > 0.15) this.state = "Fire";
    else if (actor.reload > 0) this.state = "Reload";
    else if (canInspect) this.state = "Inspect";
    else if (this.adsBlend > 0.5) this.state = "ADS";
    else if (this.slideBlend > 0.35) this.state = "Slide";
    else if (!actor.grounded) this.state = "Jump";
    else if (Math.abs(this.landDip) > 0.006) this.state = "Land";
    else if (this.sprintBlend > 0.5) this.state = "Run";
    else if (this.moveBlend > 0.15) this.state = "Walk";
    else if (actor.crouch) this.state = "Crouch";
    else this.state = "Idle";

    // Update First-Person Arms & IK
    _rElbow.set(...v.rightElbow);
    _lElbow.set(...v.leftElbow);
    arms.update(
      dt,
      model.right.socket,
      model.left?.socket,
      leftOverride,
      leftBlend,
      _rElbow,
      _lElbow,
    );
  }
}

const axes = ["x", "y", "z"] as const;
/** Closed-form critically damped spring: stable at 30, 60 and 144 Hz. */
export function advanceSpring(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  omega: number,
  dt: number,
) {
  const decay = Math.exp(-omega * dt);
  for (const axis of axes) {
    const c = velocity[axis] + omega * position[axis];
    position[axis] = (position[axis] + c * dt) * decay;
    velocity[axis] = (velocity[axis] - omega * c * dt) * decay;
  }
}
