import { emptyInput, type Input } from "../shared/types";
export class InputManager {
  keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  fire = false;
  singleShot = false;
  aimHeld = false;
  lookScale = 1;
  locked = false;
  seq = 0;
  slot = 0;
  reload = false;
  inspectTime = 0;
  sensitivity = 1;
  onAction: (action: string) => void = () => {};
  private abort = new AbortController();
  constructor(public canvas: HTMLCanvasElement) {
    const o = { signal: this.abort.signal };
    window.addEventListener("keydown", this.down, o);
    window.addEventListener("keyup", this.up, o);
    window.addEventListener("mousemove", this.mouse, o);
    window.addEventListener("mousedown", this.press, o);
    window.addEventListener("mouseup", this.release, o);
    window.addEventListener("blur", this.clear, o);
    document.addEventListener(
      "pointerlockchange",
      () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) {
          this.clear();
          this.onAction("unlock");
        }
      },
      o,
    );
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), o);
  }
  down = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.matches("input,select,textarea")) return;
    if (["Space", "Tab", "ControlLeft", "ShiftLeft"].includes(e.code))
      e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Escape" && !this.locked) this.onAction("pause");
    if (e.code === "KeyB") this.onAction("shop");
    if (e.code === "Tab") this.onAction("scoreDown");
    if (e.code === "KeyR") this.reload = true;
    if (/^Digit[123]$/.test(e.code)) this.slot = Number(e.code.at(-1));
    if (e.code === "KeyF") this.inspectTime = 2.2;
    if (e.code === "KeyG") this.onAction("drop");
  };
  up = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === "Tab") this.onAction("scoreUp");
  };
  mouse = (e: MouseEvent) => {
    if (!this.locked) return;
    this.yaw -= e.movementX * 0.0018 * this.sensitivity * this.lookScale;
    this.pitch = Math.max(
      -1.48,
      Math.min(
        1.48,
        this.pitch - e.movementY * 0.0018 * this.sensitivity * this.lookScale,
      ),
    );
  };
  press = (e: MouseEvent) => {
    if (this.locked && e.button === 0) {
      this.fire = true;
      this.singleShot = true;
    }
    if (this.locked && e.button === 2) {
      this.aimHeld = true;
      this.inspectTime = 0;
    }
  };
  release = (e: MouseEvent) => {
    if (e.button === 0) this.fire = false;
    if (e.button === 2) this.aimHeld = false;
  };
  clear = () => {
    this.keys.clear();
    this.fire = false;
    this.singleShot = false;
    this.aimHeld = false;
    this.lookScale = 1;
    this.reload = false;
    this.slot = 0;
    this.inspectTime = 0;
  };
  async lock() {
    try {
      await this.canvas.requestPointerLock();
    } catch (error) {
      console.warn(
        "Pointer Lock:",
        error instanceof Error ? error.message : String(error),
      );
      this.onAction("lockFailed");
    }
  }
  unlock() {
    document.exitPointerLock();
    this.clear();
  }
  read(automatic: boolean): Input {
    const i = emptyInput();
    i.seq = ++this.seq;
    i.yaw = this.yaw;
    i.pitch = this.pitch;
    if (this.locked) {
      i.x = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
      i.z = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
      i.jump = this.keys.has("Space");
      i.crouch =
        this.keys.has("ControlLeft") ||
        this.keys.has("ControlRight") ||
        this.keys.has("KeyC");
      i.walk = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      i.fire = automatic ? this.fire : this.singleShot;
      i.interact = this.keys.has("KeyE");
      i.reload = this.reload;
      i.slot = this.slot;
    }
    this.singleShot = false;
    this.reload = false;
    this.slot = 0;
    return i;
  }
  dispose() {
    this.abort.abort();
  }
}
