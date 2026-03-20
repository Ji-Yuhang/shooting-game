import * as THREE from "three";
import type { PeekDirection } from "../types";

export type InputSnapshot = {
  movement: THREE.Vector2;
  lookDelta: THREE.Vector2;
  freeLookHeld: boolean;
  aimingHeld: boolean;
  chargeHeld: boolean;
  smokePressed: boolean;
  collisionDebugPressed: boolean;
  crouchPressed: boolean;
  restartPressed: boolean;
  pausePressed: boolean;
  peekDirection: PeekDirection;
  pointerLocked: boolean;
};

export class InputController {
  private readonly pressed = new Set<string>();
  private readonly justPressed = new Set<string>();
  private readonly lookDelta = new THREE.Vector2();
  private pointerLocked = false;

  constructor(private readonly root: HTMLElement) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("contextmenu", this.handleContextMenu);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousedown", this.handleMouseDown);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("contextmenu", this.handleContextMenu);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
  }

  requestPointerLock(): void {
    void this.root.requestPointerLock();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.root) {
      document.exitPointerLock();
    }
  }

  captureFrame(): InputSnapshot {
    const movement = new THREE.Vector2(
      (this.pressed.has("KeyD") ? 1 : 0) - (this.pressed.has("KeyA") ? 1 : 0),
      (this.pressed.has("KeyW") ? 1 : 0) - (this.pressed.has("KeyS") ? 1 : 0)
    );

    if (movement.lengthSq() > 1) {
      movement.normalize();
    }

    const peekDirection = this.pressed.has("KeyQ")
      ? -1
      : this.pressed.has("KeyE")
        ? 1
        : 0;

    const snapshot: InputSnapshot = {
      movement,
      lookDelta: this.lookDelta.clone(),
      freeLookHeld: this.pressed.has("AltLeft") || this.pressed.has("AltRight"),
      aimingHeld: this.pressed.has("MouseRight"),
      chargeHeld: this.pressed.has("MouseLeft"),
      smokePressed: this.consumeJustPressed("KeyG"),
      collisionDebugPressed: this.consumeJustPressed("F4"),
      crouchPressed: this.consumeJustPressed("KeyC") || this.consumeJustPressed("ControlLeft"),
      restartPressed: this.consumeJustPressed("KeyR"),
      pausePressed: this.consumeJustPressed("Escape"),
      peekDirection,
      pointerLocked: this.pointerLocked
    };

    this.lookDelta.set(0, 0);
    return snapshot;
  }

  private consumeJustPressed(code: string): boolean {
    const hadCode = this.justPressed.has(code);
    this.justPressed.delete(code);
    return hadCode;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.pressed.has(event.code)) {
      this.justPressed.add(event.code);
    }
    this.pressed.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private handleMouseDown = (event: MouseEvent): void => {
    const code = event.button === 0 ? "MouseLeft" : event.button === 2 ? "MouseRight" : `Mouse${event.button}`;
    if (!this.pressed.has(code)) {
      this.justPressed.add(code);
    }
    this.pressed.add(code);
  };

  private handleMouseUp = (event: MouseEvent): void => {
    const code = event.button === 0 ? "MouseLeft" : event.button === 2 ? "MouseRight" : `Mouse${event.button}`;
    this.pressed.delete(code);
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      return;
    }

    this.lookDelta.x += event.movementX;
    this.lookDelta.y += event.movementY;
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.root;
  };
}
