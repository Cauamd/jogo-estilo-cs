import type { WeaponId } from "../shared/types";

/** Presentation only: never changes authoritative spread, damage or firing cadence. */
export class ADSController {
  blend = 0;
  ironBlend = 0;
  active = false;
  aiming = false;
  private weapon: WeaponId = "vx47";

  update(
    dt: number,
    held: boolean,
    weapon: WeaponId,
    alive: boolean,
    reload: number,
    switching = false,
  ) {
    const changed = this.weapon !== weapon;
    this.weapon = weapon;
    // Do not carry a magnified camera into the newly equipped weapon.
    if (changed || !alive) {
      this.blend = 0;
      this.ironBlend = 0;
    }
    const canAim = held && alive && reload <= 0 && !switching;
    this.active = canAim && weapon === "s1";
    this.aiming = canAim && weapon !== "edge";

    const target = this.active ? 1 : 0;
    this.blend += (target - this.blend) * (1 - Math.exp(-Math.max(0, dt) * 18));
    if (Math.abs(this.blend - target) < 0.0001) this.blend = target;

    const ironTarget = this.aiming ? 1 : 0;
    this.ironBlend +=
      (ironTarget - this.ironBlend) * (1 - Math.exp(-Math.max(0, dt) * 18));
    if (Math.abs(this.ironBlend - ironTarget) < 0.0001)
      this.ironBlend = ironTarget;

    return this.blend;
  }

  /** Effective viewmodel ADS interpolation (0..1) across all firearms. */
  get viewBlend() {
    return this.weapon === "s1" ? this.blend : this.ironBlend;
  }

  fov(base: number) {
    if (this.weapon !== "s1" && this.ironBlend > 0) {
      const target =
        this.weapon === "vx47" ? 68 : this.weapon === "viper" ? 72 : 76;
      return base + (target - base) * this.ironBlend;
    }
    return base + (30 - base) * this.blend;
  }

  sensitivity(base: number) {
    // Preserve angular movement relative to the visible image throughout zoom.
    return (
      Math.tan((this.fov(base) * Math.PI) / 360) /
      Math.tan((base * Math.PI) / 360)
    );
  }

  get overlay() {
    const t = Math.max(0, Math.min(1, (this.blend - 0.38) / 0.36));
    return t * t * (3 - 2 * t);
  }

  get hideViewmodel() {
    return this.blend > 0.43;
  }

  reset() {
    this.blend = 0;
    this.ironBlend = 0;
    this.active = false;
    this.aiming = false;
  }
}
