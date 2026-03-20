import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GAME_CONFIG } from "../config";
import type { ActorState, PeekDirection } from "../types";
import { createYawQuaternion, getForwardFromYaw, getRightFromYaw } from "../utils/math";

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  yaw = Math.PI;
  pitch = -0.08;

  private readonly pivot = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly temp = new THREE.Vector3();
  private readonly lookDirection = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(64, aspect, 0.1, 200);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  applyLookDelta(lookDelta: THREE.Vector2): void {
    this.yaw -= lookDelta.x * GAME_CONFIG.camera.yawSensitivity;
    this.pitch -= lookDelta.y * GAME_CONFIG.camera.pitchSensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      GAME_CONFIG.camera.minPitch,
      GAME_CONFIG.camera.maxPitch
    );
  }

  update(
    actor: ActorState,
    aiming: boolean,
    peekDirection: PeekDirection,
    world: RAPIER.World
  ): void {
    const eyeHeight = actor.isCrouching
      ? GAME_CONFIG.player.eyeCrouchHeight
      : GAME_CONFIG.player.eyeStandHeight;

    this.pivot.copy(actor.position).add(new THREE.Vector3(0, eyeHeight, 0));

    const baseOffset = aiming
      ? GAME_CONFIG.camera.aimOffset.clone()
      : GAME_CONFIG.camera.normalOffset.clone();

    if (peekDirection !== 0) {
      baseOffset.lerp(
        new THREE.Vector3(
          GAME_CONFIG.camera.peekOffset.x * peekDirection,
          GAME_CONFIG.camera.peekOffset.y,
          GAME_CONFIG.camera.peekOffset.z
        ),
        0.85
      );
    }

    const yawRotation = createYawQuaternion(this.yaw);
    const desiredPosition = baseOffset.clone().applyQuaternion(yawRotation).add(this.pivot);
    const rayDirection = desiredPosition.clone().sub(this.pivot);
    const maxDistance = rayDirection.length();
    rayDirection.normalize();

    const ray = new RAPIER.Ray(
      { x: this.pivot.x, y: this.pivot.y, z: this.pivot.z },
      { x: rayDirection.x, y: rayDirection.y, z: rayDirection.z }
    );
    const hit = world.castRay(ray, maxDistance, true);

    if (hit && hit.timeOfImpact < maxDistance) {
      desiredPosition.copy(this.pivot).addScaledVector(
        rayDirection,
        Math.max(0.35, hit.timeOfImpact - GAME_CONFIG.camera.collisionRadius)
      );
    }

    this.camera.position.copy(desiredPosition);
    const pitchCos = Math.cos(this.pitch);
    this.lookDirection
      .set(
        Math.sin(this.yaw) * pitchCos,
        Math.sin(this.pitch),
        Math.cos(this.yaw) * pitchCos
      )
      .normalize();
    this.lookTarget.copy(this.pivot).add(this.lookDirection.clone().multiplyScalar(12));
    this.camera.lookAt(this.lookTarget);
  }

  getFlatForward(): THREE.Vector3 {
    return getForwardFromYaw(this.yaw);
  }

  getFlatRight(): THREE.Vector3 {
    return getRightFromYaw(this.yaw);
  }

  getAimDirection(): THREE.Vector3 {
    return this.camera.getWorldDirection(this.temp).clone().normalize();
  }

  getAimTarget(world: RAPIER.World, maxDistance = 60): THREE.Vector3 {
    const origin = this.camera.position.clone();
    const direction = this.getAimDirection();
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const hit = world.castRay(ray, maxDistance, true);

    if (hit) {
      return origin.add(direction.multiplyScalar(hit.timeOfImpact));
    }

    return origin.add(direction.multiplyScalar(maxDistance));
  }

  getShotOrigin(actor: ActorState): THREE.Vector3 {
    const eyeHeight = actor.isCrouching
      ? GAME_CONFIG.player.eyeCrouchHeight
      : GAME_CONFIG.player.eyeStandHeight;
    const origin = actor.position.clone().add(new THREE.Vector3(0, eyeHeight - 0.08, 0));
    origin.add(this.getFlatRight().multiplyScalar(0.34 + actor.peekDirection * 0.24));
    origin.add(this.getFlatForward().multiplyScalar(0.34));
    return origin;
  }
}
