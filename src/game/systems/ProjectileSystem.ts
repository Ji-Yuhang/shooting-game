import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GAME_CONFIG } from "../config";
import {
  getActorHitSpheres,
  integrateProjectile,
  pointInsideAnyObstacle,
  segmentGroundHitFraction,
  segmentObstacleHit,
  segmentSphereHitFraction
} from "../logic";
import type { ActorState, ObstacleSpec, ProjectileState } from "../types";

type ProjectileSpawn = {
  ownerId: string;
  origin: THREE.Vector3;
  velocity: THREE.Vector3;
  color: string;
  gravityScale: number;
};

type ProjectileVisual = {
  state: ProjectileState;
  mesh: THREE.Group;
  material: THREE.MeshStandardMaterial;
  trail: THREE.Line;
  trailPositions: Float32Array;
};

type StuckProjectile = {
  mesh: THREE.Group;
  lifeRemaining: number;
};

type DebugTraceVisual = {
  object: THREE.Object3D;
  lifeRemaining: number;
};

type ProjectileUpdateContext = {
  world: RAPIER.World;
  obstacles: ObstacleSpec[];
  arenaHalfSize: number;
  player: ActorState;
  enemies: ActorState[];
  onActorDamaged: (actorId: string, damage: number) => void;
};

export class ProjectileSystem {
  private readonly projectiles: ProjectileVisual[] = [];
  private readonly stuckProjectiles: StuckProjectile[] = [];
  private readonly debugTraces: DebugTraceVisual[] = [];
  private nextId = 1;
  private static readonly STUCK_LIFE_SECONDS = 2.4;
  private debugCollisionVisualsEnabled = true;

  constructor(private readonly scene: THREE.Scene) {}

  reset(): void {
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
    }
    for (const stuck of this.stuckProjectiles) {
      this.scene.remove(stuck.mesh);
    }
    for (const trace of this.debugTraces) {
      this.scene.remove(trace.object);
    }
    this.projectiles.length = 0;
    this.stuckProjectiles.length = 0;
    this.debugTraces.length = 0;
    this.nextId = 1;
  }

  setDebugVisualEnabled(enabled: boolean): void {
    this.debugCollisionVisualsEnabled = enabled;
    if (!enabled) {
      for (const trace of this.debugTraces) {
        this.scene.remove(trace.object);
      }
      this.debugTraces.length = 0;
    }
  }

  spawnProjectile(spawn: ProjectileSpawn): void {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6),
      new THREE.MeshStandardMaterial({
        color: spawn.color,
        roughness: 0.55,
        metalness: 0.1,
        emissive: spawn.color,
        emissiveIntensity: 0.15
      })
    );
    shaft.rotation.z = Math.PI / 2;

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.18, 6),
      new THREE.MeshStandardMaterial({
        color: "#f7efe0",
        roughness: 0.35,
        metalness: 0.15
      })
    );
    tip.position.x = 0.42;
    tip.rotation.z = -Math.PI / 2;

    const mesh = new THREE.Group();
    mesh.add(shaft, tip);
    mesh.position.copy(spawn.origin);

    const trailPositions = new Float32Array(6);
    trailPositions[0] = spawn.origin.x;
    trailPositions[1] = spawn.origin.y;
    trailPositions[2] = spawn.origin.z;
    trailPositions[3] = spawn.origin.x;
    trailPositions[4] = spawn.origin.y;
    trailPositions[5] = spawn.origin.z;
    const trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: spawn.color,
        transparent: true,
        opacity: 0.7
      })
    );
    trail.geometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    trail.geometry.setDrawRange(0, 2);
    mesh.add(trail);

    this.scene.add(mesh);

    this.projectiles.push({
      state: {
        id: this.nextId,
        ownerId: spawn.ownerId,
        position: spawn.origin.clone(),
        previousPosition: spawn.origin.clone(),
        velocity: spawn.velocity.clone(),
        gravityScale: spawn.gravityScale,
        lifeRemaining: GAME_CONFIG.combat.arrowLifeSeconds,
        alive: true
      },
      mesh,
      material: shaft.material as THREE.MeshStandardMaterial,
      trail,
      trailPositions
    });
    this.nextId += 1;
  }

  update(deltaSeconds: number, context: ProjectileUpdateContext): void {
    this.updateStuckProjectiles(deltaSeconds);
    this.updateDebugTraces(deltaSeconds);

    for (const projectile of this.projectiles) {
      if (!projectile.state.alive) {
        continue;
      }

      if (this.isOutOfBounds(projectile.state.position, context.arenaHalfSize)) {
        projectile.state.alive = false;
        this.scene.remove(projectile.mesh);
        continue;
      }

      projectile.state.lifeRemaining -= deltaSeconds;
      projectile.state.previousPosition.copy(projectile.state.position);

      const next = integrateProjectile(
        projectile.state.position,
        projectile.state.velocity,
        GAME_CONFIG.combat.gravity * projectile.state.gravityScale,
        deltaSeconds
      );

      const start = projectile.state.position.clone();
      const end = next.position.clone();
      const direction = end.clone().sub(start);
      const distance = direction.length();
      if (distance <= 0.0001) {
        continue;
      }
      direction.normalize();
      const probeStart = start
        .clone()
        .addScaledVector(direction, GAME_CONFIG.combat.projectileTipOffset);
      const probeEnd = end
        .clone()
        .addScaledVector(direction, GAME_CONFIG.combat.projectileTipOffset);
      this.addDebugTrace(probeStart, probeEnd, "#2d9cff", 0.12, 0.35);

      if (
        this.isPointInsideCollider(probeStart, context.world) ||
        pointInsideAnyObstacle(
          probeStart,
          context.obstacles,
          GAME_CONFIG.combat.projectileRadius
        )
      ) {
        this.stopOnWorldHit(projectile, probeStart, direction, 0);
        this.addDebugTrace(
          probeStart,
          probeStart.clone().add(direction.clone().multiplyScalar(0.2)),
          "#ff5a5a"
        );
        this.addDebugPoint(probeStart, "#ff6f6f", 0.12, 1.35);
        continue;
      }

      const worldHit = this.castWorldRay(context.world, probeStart, direction, distance);
      const obstacleHit = segmentObstacleHit(
        probeStart,
        probeEnd,
        context.obstacles,
        GAME_CONFIG.combat.projectileRadius
      );
      const groundHit = segmentGroundHitFraction(
        probeStart,
        probeEnd,
        GAME_CONFIG.combat.projectileRadius
      );

      const actorHit = this.findActorHit(
        probeStart,
        probeEnd,
        projectile.state.ownerId,
        context.player,
        context.enemies
      );

      const actorHitDistance = actorHit ? distance * actorHit.fraction : Number.POSITIVE_INFINITY;
      const worldHitDistance = worldHit
        ? worldHit.timeOfImpact
        : Number.POSITIVE_INFINITY;
      const obstacleHitDistance = obstacleHit
        ? distance * obstacleHit.fraction
        : Number.POSITIVE_INFINITY;
      const groundHitDistance = groundHit !== null
        ? distance * groundHit
        : Number.POSITIVE_INFINITY;
      const blockingDistance = Math.min(
        worldHitDistance,
        obstacleHitDistance,
        groundHitDistance
      );

      const worldBlocksActor =
        blockingDistance <= actorHitDistance + GAME_CONFIG.combat.coverBlockEpsilon;

      if (actorHit && !worldBlocksActor) {
        projectile.state.alive = false;
        projectile.state.position
          .copy(probeStart)
          .lerp(probeEnd, actorHit.fraction)
          .addScaledVector(direction, -GAME_CONFIG.combat.projectileTipOffset);
        context.onActorDamaged(actorHit.actor.id, GAME_CONFIG.combat.damage);
        this.addDebugTrace(probeStart, probeStart.clone().lerp(probeEnd, actorHit.fraction), "#4fe18f");
        this.addDebugPoint(projectile.state.position, "#58f09a", 0.1, 1.15);
        this.scene.remove(projectile.mesh);
        continue;
      }

      if (Number.isFinite(blockingDistance)) {
        this.stopOnWorldHit(projectile, probeStart, direction, blockingDistance);
        this.addDebugTrace(
          probeStart,
          probeStart.clone().add(direction.clone().multiplyScalar(blockingDistance)),
          "#ff4d4d"
        );
        this.addDebugPoint(projectile.state.position, "#ff7171", 0.12, 1.25);
        continue;
      }

      projectile.state.position.copy(next.position);
      projectile.state.velocity.copy(next.velocity);

      projectile.mesh.position.copy(projectile.state.position);
      if (projectile.state.velocity.lengthSq() > 0.000001) {
        projectile.mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(1, 0, 0),
          projectile.state.velocity.clone().normalize()
        );
      }
      projectile.trailPositions[0] = projectile.state.previousPosition.x;
      projectile.trailPositions[1] = projectile.state.previousPosition.y;
      projectile.trailPositions[2] = projectile.state.previousPosition.z;
      projectile.trailPositions[3] = projectile.state.position.x;
      projectile.trailPositions[4] = projectile.state.position.y;
      projectile.trailPositions[5] = projectile.state.position.z;
      (
        projectile.trail.geometry.getAttribute("position") as THREE.BufferAttribute
      ).needsUpdate = true;

      if (projectile.state.lifeRemaining <= 0) {
        projectile.state.alive = false;
        this.scene.remove(projectile.mesh);
      }
    }

    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      if (!this.projectiles[index].state.alive) {
        this.projectiles.splice(index, 1);
      }
    }
  }

  private findActorHit(
    start: THREE.Vector3,
    end: THREE.Vector3,
    ownerId: string,
    player: ActorState,
    enemies: ActorState[]
  ): { actor: ActorState; fraction: number } | null {
    let best: { actor: ActorState; fraction: number } | null = null;
    const actors = [player, ...enemies];

    for (const actor of actors) {
      if (!actor.isAlive || actor.id === ownerId) {
        continue;
      }

      const spheres = getActorHitSpheres(
        actor.position,
        actor.isCrouching,
        actor.lifeState
      );
      for (const sphere of spheres) {
        const fraction = segmentSphereHitFraction(start, end, sphere.center, sphere.radius);
        if (fraction === null) {
          continue;
        }

        if (!best || fraction < best.fraction) {
          best = { actor, fraction };
        }
      }
    }

    return best;
  }

  private castWorldRay(
    world: RAPIER.World,
    start: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number
  ): RAPIER.RayColliderHit | null {
    return world.castRay(
      new RAPIER.Ray(
        { x: start.x, y: start.y, z: start.z },
        { x: direction.x, y: direction.y, z: direction.z }
      ),
      distance,
      false
    );
  }

  private isPointInsideCollider(point: THREE.Vector3, world: RAPIER.World): boolean {
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

  private stopOnWorldHit(
    projectile: ProjectileVisual,
    probeStart: THREE.Vector3,
    direction: THREE.Vector3,
    timeOfImpact: number
  ): void {
    projectile.state.alive = false;
    projectile.state.position
      .copy(probeStart)
      .add(direction.clone().multiplyScalar(Math.max(0, timeOfImpact)))
      .addScaledVector(direction, -GAME_CONFIG.combat.projectileTipOffset);
    projectile.mesh.position.copy(projectile.state.position);
    if (direction.lengthSq() > 0.000001) {
      projectile.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        direction.clone().normalize()
      );
    }
    projectile.trail.visible = false;
    this.stuckProjectiles.push({
      mesh: projectile.mesh,
      lifeRemaining: ProjectileSystem.STUCK_LIFE_SECONDS
    });
  }

  private updateStuckProjectiles(deltaSeconds: number): void {
    for (let index = this.stuckProjectiles.length - 1; index >= 0; index -= 1) {
      const stuck = this.stuckProjectiles[index];
      stuck.lifeRemaining -= deltaSeconds;
      if (stuck.lifeRemaining <= 0) {
        this.scene.remove(stuck.mesh);
        this.stuckProjectiles.splice(index, 1);
      }
    }
  }

  private addDebugTrace(
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: string,
    lifeSeconds = 1.5,
    opacity = 0.95
  ): void {
    if (!this.debugCollisionVisualsEnabled) {
      return;
    }
    const points = new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]);
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false
      })
    );
    line.geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    line.geometry.setDrawRange(0, 2);
    line.renderOrder = 10000;
    this.scene.add(line);
    this.debugTraces.push({ object: line, lifeRemaining: lifeSeconds });
  }

  private addDebugPoint(
    point: THREE.Vector3,
    color: string,
    size: number,
    lifeSeconds: number
  ): void {
    if (!this.debugCollisionVisualsEnabled) {
      return;
    }
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(size, 8, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false
      })
    );
    marker.position.copy(point);
    marker.renderOrder = 10001;
    this.scene.add(marker);
    this.debugTraces.push({ object: marker, lifeRemaining: lifeSeconds });
  }

  private updateDebugTraces(deltaSeconds: number): void {
    for (let index = this.debugTraces.length - 1; index >= 0; index -= 1) {
      const trace = this.debugTraces[index];
      trace.lifeRemaining -= deltaSeconds;
      if (trace.lifeRemaining <= 0) {
        this.scene.remove(trace.object);
        this.debugTraces.splice(index, 1);
      }
    }
  }

  private isOutOfBounds(position: THREE.Vector3, arenaHalfSize: number): boolean {
    const horizontalLimit = arenaHalfSize + 6;
    return (
      Math.abs(position.x) > horizontalLimit ||
      Math.abs(position.z) > horizontalLimit ||
      position.y < -4 ||
      position.y > 26
    );
  }
}
