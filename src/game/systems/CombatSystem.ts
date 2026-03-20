import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GAME_CONFIG } from "../config";
import {
  computeArrowSpeed,
  computeChargeRatio
} from "../logic";
import type { ActorState, CombatState } from "../types";
import type { InputSnapshot } from "./InputController";
import { CameraRig } from "./CameraRig";
import { ProjectileSystem } from "./ProjectileSystem";

type PlayerCombatContext = {
  player: ActorState;
  state: CombatState;
  input: InputSnapshot;
  world: RAPIER.World;
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
    const { state, player, cameraRig, world, projectileSystem, timeSeconds, showMessage } =
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
    const direction = aimTarget.clone().sub(shotOrigin).normalize();
    const blockedRay = new RAPIER.Ray(
      { x: shotOrigin.x, y: shotOrigin.y, z: shotOrigin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const blockedHit = world.castRay(blockedRay, 1.15, true);

    if (blockedHit && blockedHit.timeOfImpact < 0.9) {
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
    world: RAPIER.World
  ): boolean {
    const origin = enemy.position
      .clone()
      .add(new THREE.Vector3(0.28, enemy.isCrouching ? 0.95 : 1.45, 0));
    const direction = target.clone().sub(origin).normalize();

    if (this.isShotBlocked(world, origin, direction, 1.15)) {
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
    const blockedHit = world.castRay(blockedRay, distance, true);
    return Boolean(blockedHit && blockedHit.timeOfImpact < 0.9);
  }
}
