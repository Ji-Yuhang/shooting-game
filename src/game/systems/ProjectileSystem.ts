import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GAME_CONFIG } from "../config";
import {
  getActorHitSpheres,
  integrateProjectile,
  segmentSphereHitFraction
} from "../logic";
import type { ActorState, ProjectileState } from "../types";

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

type ProjectileUpdateContext = {
  world: RAPIER.World;
  player: ActorState;
  enemies: ActorState[];
  onActorDamaged: (actorId: string, damage: number) => void;
};

export class ProjectileSystem {
  private readonly projectiles: ProjectileVisual[] = [];
  private nextId = 1;

  constructor(private readonly scene: THREE.Scene) {}

  reset(): void {
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
    }
    this.projectiles.length = 0;
    this.nextId = 1;
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
    for (const projectile of this.projectiles) {
      if (!projectile.state.alive) {
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

      const worldHit = context.world.castRay(
        new RAPIER.Ray(
          { x: start.x, y: start.y, z: start.z },
          { x: direction.x, y: direction.y, z: direction.z }
        ),
        distance,
        true
      );

      const actorHit = this.findActorHit(
        start,
        end,
        projectile.state.ownerId,
        context.player,
        context.enemies
      );

      const actorHitDistance = actorHit ? distance * actorHit.fraction : Number.POSITIVE_INFINITY;
      const worldHitDistance = worldHit
        ? worldHit.timeOfImpact
        : Number.POSITIVE_INFINITY;

      if (actorHit && actorHitDistance <= worldHitDistance) {
        projectile.state.alive = false;
        projectile.state.position.copy(start).lerp(end, actorHit.fraction);
        context.onActorDamaged(actorHit.actor.id, GAME_CONFIG.combat.damage);
        this.scene.remove(projectile.mesh);
        continue;
      }

      if (worldHit) {
        projectile.state.alive = false;
        projectile.state.position
          .copy(start)
          .add(direction.multiplyScalar(worldHit.timeOfImpact));
        this.scene.remove(projectile.mesh);
        continue;
      }

      projectile.state.position.copy(next.position);
      projectile.state.velocity.copy(next.velocity);

      projectile.mesh.position.copy(projectile.state.position);
      projectile.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        projectile.state.velocity.clone().normalize()
      );
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
}
