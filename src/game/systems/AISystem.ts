import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { PATROL_POINTS } from "../../data/arena";
import { GAME_CONFIG } from "../config";
import type {
  ActorState,
  CombatState,
  CoverNode,
  EnemyRole,
  EnemyState,
  ObstacleSpec,
  PerceptionSnapshot,
  SmokeCloudState
} from "../types";
import {
  resolveCircleObstacleCollisions,
  smoothLookAtDirection
} from "../utils/math";
import { CombatSystem } from "./CombatSystem";
import { ProjectileSystem } from "./ProjectileSystem";

export type EnemyAgent = {
  actor: ActorState;
  combat: CombatState;
  state: EnemyState;
  role: EnemyRole;
  patrolIndex: number;
  stateTimer: number;
  attackCooldownRemaining: number;
  smokeCooldownRemaining: number;
  perception: PerceptionSnapshot;
  targetCoverId: string | null;
  assignedAllyId: string | null;
  tacticTarget: THREE.Vector3 | null;
  crawlTarget: THREE.Vector3 | null;
  mesh: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
};

type AIStepContext = {
  deltaSeconds: number;
  world: RAPIER.World;
  player: ActorState;
  enemies: EnemyAgent[];
  obstacles: ObstacleSpec[];
  arenaHalfSize: number;
  coverNodes: CoverNode[];
  projectileSystem: ProjectileSystem;
  combatSystem: CombatSystem;
  smokes: SmokeCloudState[];
  deploySmoke: (throwerId: string, target: THREE.Vector3, reason: "rescue" | "attack") => boolean;
};

type TeamDirectives = {
  rescues: Map<string, string>;
  suppressorId: string | null;
  teamAggro: boolean;
};

const UP_VECTOR = new THREE.Vector3(0, 1, 0);

export class AISystem {
  update(context: AIStepContext): void {
    for (const enemy of context.enemies) {
      enemy.stateTimer += context.deltaSeconds;
      enemy.attackCooldownRemaining = Math.max(
        0,
        enemy.attackCooldownRemaining - context.deltaSeconds
      );
      enemy.combat.cooldownRemaining = Math.max(
        0,
        enemy.combat.cooldownRemaining - context.deltaSeconds
      );
      enemy.perception = this.computePerception(enemy, context.player, context.world);
    }

    const directives = this.computeTeamDirectives(context);

    for (const enemy of context.enemies) {
      this.updateEnemy(enemy, context, directives);
    }
  }

  private updateEnemy(
    enemy: EnemyAgent,
    context: AIStepContext,
    directives: TeamDirectives
  ): void {
    if (enemy.actor.lifeState === "dead") {
      this.releaseCover(enemy, context.coverNodes);
      enemy.state = "Dead";
      enemy.actor.combatMode = "dead";
      enemy.actor.velocity.set(0, 0, 0);
      return;
    }

    if (enemy.actor.lifeState === "downed") {
      this.releaseCover(enemy, context.coverNodes);
      this.updateDownedEnemy(enemy, context, directives);
      return;
    }

    const assignedAllyId = directives.rescues.get(enemy.actor.id) ?? null;
    enemy.assignedAllyId = assignedAllyId;

    if (assignedAllyId) {
      const ally = context.enemies.find((entry) => entry.actor.id === assignedAllyId) ?? null;
      if (ally && ally.actor.lifeState === "downed") {
        this.tryDeployRescueSmoke(enemy, ally, context);
        this.updateRevive(enemy, ally, context);
        return;
      }
    }

    const hasLock =
      enemy.perception.canSeeTarget &&
      enemy.perception.exposure >= GAME_CONFIG.ai.exposureThreshold;
    const underDanger =
      enemy.actor.health <= GAME_CONFIG.ai.retreatHealthThreshold ||
      enemy.actor.hitFlash > 0.1 ||
      (hasLock && enemy.perception.distanceToTarget < 9);

    if (enemy.combat.cooldownRemaining > 0.01) {
      this.updateCooldown(enemy, context, underDanger);
      return;
    }

    if (enemy.state === "Retreat" && enemy.stateTimer < 1.2) {
      this.updateRetreat(enemy, context);
      return;
    }

    if (underDanger && enemy.role !== "suppressor") {
      this.updateRetreat(enemy, context);
      return;
    }

    if (directives.teamAggro || hasLock || enemy.perception.lastKnownTarget) {
      if (enemy.actor.id === directives.suppressorId || enemy.role === "suppressor") {
        this.updateSuppress(enemy, context);
        return;
      }

      if (enemy.role === "flanker") {
        this.updateFlank(enemy, context);
        return;
      }

      if (enemy.role === "harasser") {
        this.updateHarass(enemy, context);
        return;
      }

      this.updatePressure(enemy, context);
      return;
    }

    this.updatePatrol(enemy, context);
  }

  private computeTeamDirectives(context: AIStepContext): TeamDirectives {
    const rescues = new Map<string, string>();
    const downed = context.enemies.filter((enemy) => enemy.actor.lifeState === "downed");
    const candidates = context.enemies.filter(
      (enemy) => enemy.actor.lifeState === "alive" && enemy.actor.health > GAME_CONFIG.ai.retreatHealthThreshold
    );

    for (const ally of downed) {
      let best: EnemyAgent | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        if (rescues.has(candidate.actor.id)) {
          continue;
        }
        const distance = candidate.actor.position.distanceTo(ally.actor.position);
        if (distance < bestDistance && distance <= 18) {
          bestDistance = distance;
          best = candidate;
        }
      }

      if (best) {
        rescues.set(best.actor.id, ally.actor.id);
      }
    }

    const visible = context.enemies.filter(
      (enemy) =>
        enemy.actor.lifeState === "alive" &&
        enemy.perception.canSeeTarget &&
        enemy.perception.exposure >= GAME_CONFIG.ai.exposureThreshold
    );
    const suppressor = visible.sort((left, right) => {
      const leftScore =
        (left.role === "suppressor" ? -4 : 0) + left.actor.position.distanceTo(context.player.position);
      const rightScore =
        (right.role === "suppressor" ? -4 : 0) + right.actor.position.distanceTo(context.player.position);
      return leftScore - rightScore;
    })[0] ?? null;

    return {
      rescues,
      suppressorId: suppressor?.actor.id ?? null,
      teamAggro:
        visible.length > 0 ||
        context.enemies.some(
          (enemy) =>
            enemy.actor.lifeState === "alive" &&
            enemy.actor.position.distanceTo(context.player.position) <= GAME_CONFIG.ai.teamAggroRange
        )
    };
  }

  private updatePatrol(enemy: EnemyAgent, context: AIStepContext): void {
    this.setState(enemy, "Patrol");
    enemy.actor.isCrouching = false;
    if (enemy.stateTimer > 0.8) {
      enemy.perception.lastKnownTarget = context.player.position.clone();
      this.updatePressure(enemy, context);
      return;
    }
    const targetPoint = PATROL_POINTS[enemy.patrolIndex % PATROL_POINTS.length];
    const reached = this.moveToward(enemy, targetPoint, context, GAME_CONFIG.ai.moveSpeed);
    if (reached) {
      enemy.patrolIndex = (enemy.patrolIndex + 1) % PATROL_POINTS.length;
    }
  }

  private updateSuppress(enemy: EnemyAgent, context: AIStepContext): void {
    this.setState(enemy, "Suppress");
    const cover = this.ensureCombatCover(enemy, context, context.player.position);
    if (cover) {
      const reached = this.moveToward(enemy, cover.position, context, GAME_CONFIG.ai.aimMoveSpeed);
      if (reached) {
        enemy.actor.isCrouching = Boolean(cover.crouchAllowed);
        this.aimAndPossiblyShoot(enemy, context, 0.42, 0.72);
      } else if (enemy.perception.canSeeTarget) {
        this.aimAndPossiblyShoot(enemy, context, 0.5, 0.82);
      }
      return;
    }

    this.updateAssault(enemy, context, 0);
  }

  private updateHarass(enemy: EnemyAgent, context: AIStepContext): void {
    this.setState(enemy, "Flank");
    const idParts = enemy.actor.id.split("-");
    const sideSeed = Number.parseInt(idParts[idParts.length - 1] ?? "0", 10);
    if (!enemy.tacticTarget || enemy.stateTimer > 1.4) {
      enemy.tacticTarget = this.computeLateralTarget(
        enemy,
        context,
        sideSeed % 2 === 0 ? 1 : -1,
        8.5
      );
      enemy.stateTimer = 0;
    }
    const target = enemy.tacticTarget;
    enemy.tacticTarget = target;
    const reached = this.moveToward(enemy, target, context, GAME_CONFIG.ai.moveSpeed);
    if (reached || enemy.stateTimer > 1.6) {
      this.aimAndPossiblyShoot(enemy, context, 0.45, 0.85);
    } else if (enemy.perception.canSeeTarget) {
      this.aimAndPossiblyShoot(enemy, context, 0.36, 0.92);
    }
  }

  private updateFlank(enemy: EnemyAgent, context: AIStepContext): void {
    this.setState(enemy, "Flank");
    const lateralSign = enemy.role === "flanker" ? 1 : -1;
    if (!enemy.tacticTarget || enemy.stateTimer > 1.8) {
      enemy.tacticTarget = this.computeLateralTarget(enemy, context, lateralSign, 12);
      enemy.stateTimer = 0;
    }
    const flankTarget = enemy.tacticTarget;
    enemy.tacticTarget = flankTarget;
    const reached = this.moveToward(enemy, flankTarget, context, GAME_CONFIG.ai.moveSpeed);
    if (reached || enemy.stateTimer > 2) {
      const cover = this.ensureCombatCover(enemy, context, context.player.position);
      if (cover) {
        this.moveToward(enemy, cover.position, context, GAME_CONFIG.ai.aimMoveSpeed);
      }
      this.aimAndPossiblyShoot(enemy, context, 0.55, 0.95);
    } else if (enemy.perception.canSeeTarget) {
      this.aimAndPossiblyShoot(enemy, context, 0.4, 0.9);
    }
  }

  private updatePressure(enemy: EnemyAgent, context: AIStepContext): void {
    this.updateAssault(enemy, context, 0);
  }

  private updateRetreat(enemy: EnemyAgent, context: AIStepContext): void {
    this.setState(enemy, "Retreat");
    enemy.actor.isCrouching = true;
    const cover = this.ensureRetreatCover(enemy, context);
    if (cover) {
      const reached = this.moveToward(enemy, cover.position, context, GAME_CONFIG.ai.moveSpeed);
      if (reached) {
        enemy.actor.velocity.set(0, 0, 0);
        enemy.actor.combatMode = "idle";
      }
      return;
    }

    const fallback = enemy.actor.position
      .clone()
      .sub(context.player.position)
      .setY(0)
      .normalize()
      .multiplyScalar(5)
      .add(enemy.actor.position);
    this.moveToward(enemy, fallback, context, GAME_CONFIG.ai.moveSpeed);
  }

  private updateRevive(enemy: EnemyAgent, ally: EnemyAgent, context: AIStepContext): void {
    this.setState(enemy, "Revive");
    enemy.actor.isCrouching = true;
    this.setState(ally, "Downed");

    if (
      enemy.actor.hitFlash > GAME_CONFIG.ai.rescueAbortDamageWindow &&
      !this.hasCoveringFire(enemy, context)
    ) {
      ally.actor.reviveProgress = 0;
      this.setState(enemy, "Retreat");
      return;
    }

    const distance = enemy.actor.position.distanceTo(ally.actor.position);
    if (distance > 0.9) {
      ally.actor.reviveProgress = 0;
      const approach = ally.actor.position
        .clone()
        .add(
          ally.actor.position
            .clone()
            .sub(context.player.position)
            .setY(0)
            .normalize()
            .multiplyScalar(0.35)
        );
      this.moveToward(enemy, approach, context, GAME_CONFIG.ai.moveSpeed * 0.92);
      return;
    }

    enemy.actor.velocity.set(0, 0, 0);
    ally.actor.velocity.set(0, 0, 0);
    enemy.actor.stationaryTime += context.deltaSeconds;
    ally.actor.stationaryTime += context.deltaSeconds;
    ally.actor.reviveProgress += context.deltaSeconds;

    const toPlayer = context.player.position.clone().sub(enemy.actor.position).setY(0);
    if (toPlayer.lengthSq() > 0.001) {
      enemy.actor.desiredForward.copy(toPlayer.normalize());
      smoothLookAtDirection(
        enemy.actor.forward,
        enemy.actor.desiredForward,
        GAME_CONFIG.player.turnSpeed,
        context.deltaSeconds
      );
    }

    if (ally.actor.reviveProgress >= GAME_CONFIG.ai.reviveSeconds) {
      ally.actor.lifeState = "alive";
      ally.actor.isAlive = true;
      ally.actor.health = GAME_CONFIG.ai.reviveHealth;
      ally.actor.downedHealth = 0;
      ally.actor.reviveProgress = 0;
      ally.actor.bleedoutTimer = 0;
      ally.actor.isCrouching = true;
      ally.actor.stationaryTime = 0;
      this.setState(ally, "Retreat");
      ally.combat.mode = "idle";
      this.setState(enemy, "Retreat");
    }
  }

  private updateDownedEnemy(
    enemy: EnemyAgent,
    context: AIStepContext,
    directives: TeamDirectives
  ): void {
    this.setState(enemy, "Downed");
    enemy.actor.combatMode = "idle";
    enemy.actor.isCrouching = true;
    enemy.actor.reviveProgress = [...directives.rescues.values()].includes(enemy.actor.id)
      ? enemy.actor.reviveProgress
      : 0;
    enemy.actor.bleedoutTimer += context.deltaSeconds;

    if (enemy.actor.bleedoutTimer >= GAME_CONFIG.ai.downedBleedoutSeconds) {
      enemy.actor.lifeState = "dead";
      enemy.actor.isAlive = false;
      this.setState(enemy, "Dead");
      return;
    }

    const rescuerId =
      [...directives.rescues.entries()].find(([, allyId]) => allyId === enemy.actor.id)?.[0] ??
      null;
    const rescuer =
      context.enemies.find(
        (candidate) =>
          candidate.actor.id === rescuerId && candidate.actor.lifeState === "alive"
      ) ?? null;
    if (rescuer && rescuer.actor.position.distanceTo(enemy.actor.position) <= 1.2) {
      enemy.actor.velocity.set(0, 0, 0);
      return;
    }

    if (!enemy.crawlTarget || enemy.actor.position.distanceTo(enemy.crawlTarget) <= 0.5) {
      enemy.crawlTarget = this.computeDownedCrawlTarget(enemy, context);
    }

    if (enemy.crawlTarget) {
      this.moveToward(enemy, enemy.crawlTarget, context, GAME_CONFIG.ai.downedMoveSpeed);
    }
  }

  private aimAndPossiblyShoot(
    enemy: EnemyAgent,
    context: AIStepContext,
    chargeThreshold: number,
    cooldownMultiplier: number
  ): void {
    const desired = context.player.position.clone().sub(enemy.actor.position).setY(0);
    if (desired.lengthSq() > 0.001) {
      enemy.actor.desiredForward.copy(desired.normalize());
    }
    smoothLookAtDirection(
      enemy.actor.forward,
      enemy.actor.desiredForward,
      GAME_CONFIG.player.turnSpeed,
      context.deltaSeconds
    );

    enemy.actor.combatMode = "charging";
    enemy.combat.chargeSeconds = Math.min(
      GAME_CONFIG.combat.maxChargeSeconds,
      enemy.combat.chargeSeconds + context.deltaSeconds
    );

    if (
      enemy.combat.chargeSeconds >= chargeThreshold &&
      enemy.attackCooldownRemaining <= 0 &&
      enemy.combat.cooldownRemaining <= 0
    ) {
      const target = context.player.position
        .clone()
        .add(new THREE.Vector3(0, context.player.isCrouching ? 0.95 : 1.45, 0));
      const fired = context.combatSystem.fireEnemyShot(
        enemy.actor,
        target,
        context.projectileSystem,
        context.world
      );
      if (fired) {
        enemy.attackCooldownRemaining =
          GAME_CONFIG.ai.attackCooldown * cooldownMultiplier + Math.random() * 0.65;
        enemy.combat.cooldownRemaining = GAME_CONFIG.combat.cooldownSeconds;
        enemy.combat.chargeSeconds = 0;
        enemy.actor.combatMode = "cooldown";
        this.setState(enemy, "Cooldown");
      } else {
        enemy.combat.chargeSeconds = Math.max(0.1, enemy.combat.chargeSeconds * 0.5);
        this.releaseCover(enemy, context.coverNodes);
        enemy.targetCoverId = null;
        enemy.tacticTarget = null;
        this.setState(enemy, "MoveToCover");
      }
    }
  }

  private updateCooldown(enemy: EnemyAgent, context: AIStepContext, underDanger: boolean): void {
    this.setState(enemy, "Cooldown");
    enemy.actor.velocity.set(0, 0, 0);
    enemy.actor.isCrouching = underDanger;
    if (enemy.targetCoverId) {
      const node = context.coverNodes.find((cover) => cover.id === enemy.targetCoverId);
      if (node) {
        enemy.actor.desiredForward.copy(
          context.player.position.clone().sub(enemy.actor.position).setY(0).normalize()
        );
        smoothLookAtDirection(
          enemy.actor.forward,
          enemy.actor.desiredForward,
          GAME_CONFIG.player.turnSpeed,
          context.deltaSeconds
        );
      }
    }
  }

  private moveToward(
    enemy: EnemyAgent,
    target: THREE.Vector3 | null,
    context: AIStepContext,
    speed: number
  ): boolean {
    if (!target) {
      return false;
    }

    const toTarget = target.clone().sub(enemy.actor.position);
    toTarget.y = 0;
    const distance = toTarget.length();
    if (distance <= 0.35) {
      enemy.actor.velocity.set(0, 0, 0);
      return true;
    }

    const direction = toTarget.normalize();
    enemy.actor.desiredForward.copy(direction);
    smoothLookAtDirection(
      enemy.actor.forward,
      enemy.actor.desiredForward,
      GAME_CONFIG.player.turnSpeed,
      context.deltaSeconds
    );

    enemy.actor.velocity.copy(direction.multiplyScalar(speed));
    enemy.actor.position.addScaledVector(enemy.actor.velocity, context.deltaSeconds);
    resolveCircleObstacleCollisions(
      enemy.actor.position,
      GAME_CONFIG.player.radius,
      context.obstacles,
      context.arenaHalfSize
    );
    return false;
  }

  private ensureCombatCover(
    enemy: EnemyAgent,
    context: AIStepContext,
    targetPosition: THREE.Vector3
  ): CoverNode | null {
    const current =
      enemy.targetCoverId &&
      context.coverNodes.find((node) => node.id === enemy.targetCoverId && (!node.occupiedBy || node.occupiedBy === enemy.actor.id));
    if (current) {
      current.occupiedBy = enemy.actor.id;
      return current;
    }

    let best: CoverNode | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const node of context.coverNodes) {
      if (node.occupiedBy && node.occupiedBy !== enemy.actor.id) {
        continue;
      }
      const actorDistance = node.position.distanceTo(enemy.actor.position);
      const targetDistance = node.position.distanceTo(targetPosition);
      const losWeight = node.facing.clone().normalize().dot(
        targetPosition.clone().sub(node.position).normalize()
      );
      const score =
        actorDistance * 0.52 +
        Math.abs(targetDistance - GAME_CONFIG.ai.preferredRange) -
        losWeight * 3.4;
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    }

    if (best) {
      enemy.targetCoverId = best.id;
      best.occupiedBy = enemy.actor.id;
    }
    return best;
  }

  private ensureRetreatCover(enemy: EnemyAgent, context: AIStepContext): CoverNode | null {
    let best: CoverNode | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const node of context.coverNodes) {
      if (node.occupiedBy && node.occupiedBy !== enemy.actor.id) {
        continue;
      }
      const playerDistance = node.position.distanceTo(context.player.position);
      const actorDistance = node.position.distanceTo(enemy.actor.position);
      const score = playerDistance - actorDistance * 0.45;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }

    if (best) {
      enemy.targetCoverId = best.id;
      best.occupiedBy = enemy.actor.id;
    }
    return best;
  }

  private computeLateralTarget(
    enemy: EnemyAgent,
    context: AIStepContext,
    lateralSign: number,
    distance: number
  ): THREE.Vector3 {
    const toPlayer = context.player.position.clone().sub(enemy.actor.position).setY(0).normalize();
    const lateral = new THREE.Vector3().crossVectors(UP_VECTOR, toPlayer).normalize().multiplyScalar(distance * lateralSign);
    return context.player.position
      .clone()
      .add(lateral)
      .add(toPlayer.clone().multiplyScalar(-GAME_CONFIG.ai.pushDistance));
  }

  private computeDownedCrawlTarget(enemy: EnemyAgent, context: AIStepContext): THREE.Vector3 {
    let bestNode: CoverNode | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const node of context.coverNodes) {
      const score =
        node.position.distanceTo(context.player.position) -
        node.position.distanceTo(enemy.actor.position) * 0.6;
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    if (bestNode) {
      return bestNode.position.clone();
    }

    return enemy.actor.position
      .clone()
      .sub(context.player.position)
      .setY(0)
      .normalize()
      .multiplyScalar(3)
      .add(enemy.actor.position);
  }

  private computePerception(
    enemy: EnemyAgent,
    player: ActorState,
    world: RAPIER.World
  ): PerceptionSnapshot {
    if (enemy.actor.lifeState !== "alive") {
      return {
        canSeeTarget: false,
        exposure: Math.max(0, enemy.perception.exposure - GAME_CONFIG.ai.exposureDecayRate / 60),
        distanceToTarget: enemy.actor.position.distanceTo(player.position),
        lastKnownTarget: enemy.perception.lastKnownTarget
      };
    }

    const enemyEye = enemy.actor.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const playerEye = player.position
      .clone()
      .add(new THREE.Vector3(0, player.isCrouching ? 0.95 : 1.45, 0));
    const toPlayer = playerEye.clone().sub(enemyEye);
    const distanceToTarget = toPlayer.length();
    const direction = toPlayer.clone().normalize();
    const facing = enemy.actor.forward.clone().normalize();
    const withinVision =
      distanceToTarget <= GAME_CONFIG.ai.detectionRange &&
      facing.dot(direction) >= GAME_CONFIG.ai.fieldOfViewDot;

    let canSeeTarget = false;
    if (withinVision) {
      const ray = new RAPIER.Ray(
        { x: enemyEye.x, y: enemyEye.y, z: enemyEye.z },
        { x: direction.x, y: direction.y, z: direction.z }
      );
      const hit = world.castRay(ray, distanceToTarget, true);
      canSeeTarget = !hit || hit.timeOfImpact >= distanceToTarget - 0.2;
    }

    const exposure = Math.min(
      1,
      Math.max(
        0,
        enemy.perception.exposure +
          (canSeeTarget ? GAME_CONFIG.ai.exposureBuildRate : -GAME_CONFIG.ai.exposureDecayRate) /
            60
      )
    );

    return {
      canSeeTarget,
      exposure,
      distanceToTarget,
      lastKnownTarget: canSeeTarget ? player.position.clone() : enemy.perception.lastKnownTarget
    };
  }

  private releaseCover(enemy: EnemyAgent, nodes: CoverNode[]): void {
    if (!enemy.targetCoverId) {
      return;
    }
    const node = nodes.find((cover) => cover.id === enemy.targetCoverId);
    if (node && node.occupiedBy === enemy.actor.id) {
      node.occupiedBy = null;
    }
    enemy.targetCoverId = null;
  }

  private setState(enemy: EnemyAgent, state: EnemyState): void {
    if (enemy.state !== state) {
      enemy.state = state;
      enemy.stateTimer = 0;
    }
  }

  private updateAssault(
    enemy: EnemyAgent,
    context: AIStepContext,
    lateralSign: number
  ): void {
    this.setState(enemy, "Investigate");
    enemy.actor.isCrouching = false;
    this.tryDeployAttackSmoke(enemy, context);

    const anchor =
      lateralSign === 0
        ? context.player.position
            .clone()
            .sub(enemy.actor.position)
            .setY(0)
            .normalize()
            .multiplyScalar(-GAME_CONFIG.ai.pushDistance)
            .add(context.player.position)
        : this.computeLateralTarget(enemy, context, lateralSign, 7.5);

    if (!enemy.tacticTarget || enemy.stateTimer > GAME_CONFIG.ai.tacticHoldSeconds) {
      enemy.tacticTarget = anchor;
      enemy.stateTimer = 0;
    }

    const reached = this.moveToward(
      enemy,
      enemy.tacticTarget,
      context,
      GAME_CONFIG.ai.moveSpeed
    );
    if (enemy.perception.canSeeTarget || reached) {
      this.aimAndPossiblyShoot(enemy, context, 0.32, 0.95);
    }
  }

  private tryDeployRescueSmoke(
    rescuer: EnemyAgent,
    ally: EnemyAgent,
    context: AIStepContext
  ): void {
    if (rescuer.smokeCooldownRemaining > 0 || this.hasCoveringFire(rescuer, context)) {
      return;
    }

    const smokeTarget = ally.actor.position
      .clone()
      .lerp(context.player.position, 0.32)
      .setY(0.1);
    if (context.deploySmoke(rescuer.actor.id, smokeTarget, "rescue")) {
      rescuer.smokeCooldownRemaining = GAME_CONFIG.ai.smokeCooldown;
    }
  }

  private tryDeployAttackSmoke(enemy: EnemyAgent, context: AIStepContext): void {
    if (
      enemy.smokeCooldownRemaining > 0 ||
      !enemy.perception.canSeeTarget ||
      enemy.stateTimer < 0.8 ||
      enemy.perception.distanceToTarget > 16
    ) {
      return;
    }

    const hasNearbySmoke = context.smokes.some(
      (cloud) =>
        cloud.position.distanceTo(context.player.position) <= cloud.radius * 0.9 &&
        cloud.age <= cloud.lifeSeconds - 1
    );
    if (hasNearbySmoke) {
      return;
    }

    const forwardOffset = context.player.position
      .clone()
      .sub(enemy.actor.position)
      .setY(0)
      .normalize()
      .multiplyScalar(-2);
    const smokeTarget = context.player.position.clone().add(forwardOffset).setY(0.1);
    if (context.deploySmoke(enemy.actor.id, smokeTarget, "attack")) {
      enemy.smokeCooldownRemaining = GAME_CONFIG.ai.smokeCooldown;
    }
  }

  private hasCoveringFire(enemy: EnemyAgent, context: AIStepContext): boolean {
    return context.enemies.some(
      (ally) =>
        ally.actor.id !== enemy.actor.id &&
        ally.actor.lifeState === "alive" &&
        ally.perception.canSeeTarget &&
        ally.perception.distanceToTarget <= GAME_CONFIG.ai.preferredRange + 8 &&
        ally.state !== "Revive" &&
        ally.state !== "Downed"
    );
  }
}
