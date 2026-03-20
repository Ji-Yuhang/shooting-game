import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GAME_CONFIG } from "../config";
import {
  computeArrowSpeed,
  computeChargeRatio,
  pointInsideAnyObstacle,
  segmentObstacleHit
} from "../logic";
import type { ActorState, CombatState, ObstacleSpec } from "../types";
import type { InputSnapshot } from "./InputController";
import { CameraRig } from "./CameraRig";
import { ProjectileSystem } from "./ProjectileSystem";

type PlayerCombatContext = {
  player: ActorState;
  state: CombatState;
  input: InputSnapshot;
  world: RAPIER.World;
  obstacles: ObstacleSpec[];
  cameraRig: CameraRig;
  projectileSystem: ProjectileSystem;
  timeSeconds: number;
  showMessage: (text: string) => void;
};

export class CombatSystem {
  updatePlayer(deltaSeconds: number, context: PlayerCombatContext): void {
    const { state, input, player } = context;

    if (!player.isAlive) {
      state.mode = "dead";
      state.chargeSeconds = 0;
      return;
    }

    state.cooldownRemaining = Math.max(0, state.cooldownRemaining - deltaSeconds);

    if (!input.aimingHeld) {
      if (state.mode !== "cooldown") {
        state.mode = "idle";
      }
      state.chargeSeconds = 0;
    } else if (state.mode !== "cooldown") {
      state.mode = input.chargeHeld ? "charging" : "aiming";
    }

    if (state.mode === "cooldown" && state.cooldownRemaining <= 0) {
      state.mode = input.aimingHeld ? "aiming" : "idle";
    }

    if (input.aimingHeld && input.chargeHeld && state.mode !== "cooldown") {
      state.chargeSeconds = Math.min(
        GAME_CONFIG.combat.maxChargeSeconds,
        state.chargeSeconds + deltaSeconds
      );
      state.mode = "charging";
    }

    if (
      !input.chargeHeld &&
      state.chargeSeconds > 0 &&
      input.aimingHeld &&
      state.cooldownRemaining <= 0
    ) {
      this.tryFirePlayerShot(context);
      state.chargeSeconds = 0;
      state.mode = input.aimingHeld ? "aiming" : "idle";
    }

    if (!input.chargeHeld && state.mode === "charging") {
      state.mode = "aiming";
    }
  }

  private tryFirePlayerShot(context: PlayerCombatContext): void {
    const { state, player, cameraRig, world, obstacles, projectileSystem, timeSeconds, showMessage } =
      context;
    const rawChargeRatio = computeChargeRatio(
      state.chargeSeconds,
      GAME_CONFIG.combat.minChargeSeconds,
      GAME_CONFIG.combat.maxChargeSeconds
    );
    const aimTarget = cameraRig.getAimTarget(world);
    const shotOrigin = cameraRig.getShotOrigin(player);
    const shotDistance = shotOrigin.distanceTo(aimTarget);
    const chargeRatio = Math.max(
      rawChargeRatio,
      this.getCloseRangeMinimumRatio(shotDistance)
    );

    if (chargeRatio <= 0.01) {
      showMessage("蓄力不足");
      return;
    }

    if (
      this.isPointInsideCollider(world, shotOrigin) ||
      pointInsideAnyObstacle(shotOrigin, obstacles, GAME_CONFIG.combat.projectileRadius)
    ) {
      state.blockedShotUntil = timeSeconds + 0.75;
      showMessage("箭矢起点被掩体阻挡");
      return;
    }

    const direction = aimTarget.clone().sub(shotOrigin).normalize();
    const probeOrigin = shotOrigin
      .clone()
      .addScaledVector(direction, GAME_CONFIG.combat.projectileTipOffset);
    if (
      this.isPointInsideCollider(world, probeOrigin) ||
      pointInsideAnyObstacle(probeOrigin, obstacles, GAME_CONFIG.combat.projectileRadius)
    ) {
      state.blockedShotUntil = timeSeconds + 0.75;
      showMessage("箭头被掩体卡住");
      return;
    }

    const blockedRay = new RAPIER.Ray(
      { x: probeOrigin.x, y: probeOrigin.y, z: probeOrigin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const blockedHit = world.castRay(blockedRay, 1.15, false);
    const closeObstacleHit = segmentObstacleHit(
      probeOrigin,
      probeOrigin.clone().add(direction.clone().multiplyScalar(1.15)),
      obstacles,
      GAME_CONFIG.combat.projectileRadius
    );

    if (
      (blockedHit && blockedHit.timeOfImpact < 0.9) ||
      (closeObstacleHit && closeObstacleHit.fraction < 0.9)
    ) {
      state.blockedShotUntil = timeSeconds + 0.75;
      showMessage("掩体挡住了箭路");
      return;
    }

    const speed = computeArrowSpeed(
      chargeRatio,
      GAME_CONFIG.combat.minArrowSpeed,
      GAME_CONFIG.combat.maxArrowSpeed
    );

    projectileSystem.spawnProjectile({
      ownerId: player.id,
      origin: shotOrigin,
      velocity: direction.multiplyScalar(speed),
      color: "#ead9ac",
      gravityScale: this.getGravityScale(shotDistance, chargeRatio)
    });

    state.cooldownRemaining = GAME_CONFIG.combat.cooldownSeconds;
    state.mode = "cooldown";
  }

  fireEnemyShot(
    enemy: ActorState,
    target: THREE.Vector3,
    projectileSystem: ProjectileSystem,
    world: RAPIER.World,
    obstacles: ObstacleSpec[]
  ): boolean {
    const origin = this.getEnemyShotOrigin(enemy);
    const toTarget = target.clone().sub(origin);
    const shotDistance = toTarget.length();
    if (shotDistance <= 0.0001) {
      return false;
    }
    const direction = toTarget.clone().normalize();

    if (
      this.isPointInsideCollider(world, origin) ||
      pointInsideAnyObstacle(origin, obstacles, GAME_CONFIG.combat.projectileRadius)
    ) {
      return false;
    }

    const probeOrigin = origin
      .clone()
      .addScaledVector(direction, GAME_CONFIG.combat.projectileTipOffset);

    if (
      this.isPointInsideCollider(world, probeOrigin) ||
      pointInsideAnyObstacle(probeOrigin, obstacles, GAME_CONFIG.combat.projectileRadius)
    ) {
      return false;
    }

    if (
      this.isShotBlocked(world, probeOrigin, direction, 1.15) ||
      this.hasObstacleOnPath(
        probeOrigin,
        probeOrigin.clone().add(direction.clone().multiplyScalar(1.15)),
        obstacles
      )
    ) {
      return false;
    }

    const obstructionDistance = this.getWorldHitDistance(world, probeOrigin, direction, shotDistance);
    if (
      (obstructionDistance !== null && obstructionDistance < shotDistance - 0.2) ||
      this.hasObstacleOnPath(probeOrigin, target, obstacles)
    ) {
      return false;
    }

    projectileSystem.spawnProjectile({
      ownerId: enemy.id,
      origin,
      velocity: direction.multiplyScalar(GAME_CONFIG.combat.minArrowSpeed + 10),
      color: "#d77f6d",
      gravityScale: this.getGravityScale(origin.distanceTo(target), 0.68)
    });

    return true;
  }

  getPreviewChargeRatio(chargeSeconds: number, shotDistance: number): number {
    const rawChargeRatio = computeChargeRatio(
      chargeSeconds,
      GAME_CONFIG.combat.minChargeSeconds,
      GAME_CONFIG.combat.maxChargeSeconds
    );
    return Math.max(rawChargeRatio, this.getCloseRangeMinimumRatio(shotDistance));
  }

  getGravityScale(shotDistance: number, chargeRatio: number): number {
    if (shotDistance <= GAME_CONFIG.combat.closeRangeDistance) {
      return 0.18;
    }
    if (shotDistance <= GAME_CONFIG.combat.mediumRangeDistance) {
      return THREE.MathUtils.lerp(0.4, 0.72, 1 - chargeRatio * 0.35);
    }
    return THREE.MathUtils.lerp(1.08, 0.78, chargeRatio);
  }

  private getCloseRangeMinimumRatio(shotDistance: number): number {
    if (shotDistance <= GAME_CONFIG.combat.closeRangeDistance) {
      return 0.46;
    }
    if (shotDistance <= GAME_CONFIG.combat.mediumRangeDistance) {
      return 0.18;
    }
    return 0;
  }

  private isShotBlocked(
    world: RAPIER.World,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number
  ): boolean {
    const blockedRay = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const blockedHit = world.castRay(blockedRay, distance, false);
    return Boolean(blockedHit && blockedHit.timeOfImpact < 0.9);
  }

  private getWorldHitDistance(
    world: RAPIER.World,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number
  ): number | null {
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const hit = world.castRay(ray, distance, false);
    return hit ? hit.timeOfImpact : null;
  }

  private hasObstacleOnPath(
    start: THREE.Vector3,
    end: THREE.Vector3,
    obstacles: ObstacleSpec[]
  ): boolean {
    const hit = segmentObstacleHit(
      start,
      end,
      obstacles,
      GAME_CONFIG.combat.projectileRadius
    );
    return Boolean(hit && hit.fraction < 0.99);
  }

  private isPointInsideCollider(world: RAPIER.World, point: THREE.Vector3): boolean {
    let inside = false;
    world.intersectionsWithPoint(
      { x: point.x, y: point.y, z: point.z },
      () => {
        inside = true;
        return false;
      }
    );
    return inside;
  }

  private getEnemyShotOrigin(enemy: ActorState): THREE.Vector3 {
    const chestHeight = enemy.isCrouching ? 0.95 : 1.45;
    return enemy.position.clone().add(new THREE.Vector3(0, chestHeight, 0));
  }
}
