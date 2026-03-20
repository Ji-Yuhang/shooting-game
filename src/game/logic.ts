import * as THREE from "three";
import { GAME_CONFIG } from "./config";
import type { CoverNode, LifeState, ObstacleSpec } from "./types";

const TREE_TRUNK_COLLISION_MULTIPLIER = 1.1;
const TREE_CROWN_COLLISION_MULTIPLIER = 1.8;

export function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function computeChargeRatio(
  chargeSeconds: number,
  minChargeSeconds: number,
  maxChargeSeconds: number
): number {
  if (chargeSeconds <= minChargeSeconds) {
    return 0;
  }

  return clamp01(
    (chargeSeconds - minChargeSeconds) /
      Math.max(0.0001, maxChargeSeconds - minChargeSeconds)
  );
}

export function computeArrowSpeed(
  ratio: number,
  minArrowSpeed: number,
  maxArrowSpeed: number
): number {
  return THREE.MathUtils.lerp(
    minArrowSpeed,
    maxArrowSpeed,
    clamp01(ratio)
  );
}

export function integrateProjectile(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  gravity: number,
  deltaSeconds: number
): { position: THREE.Vector3; velocity: THREE.Vector3 } {
  const nextVelocity = velocity.clone();
  nextVelocity.y -= gravity * deltaSeconds;

  const nextPosition = position
    .clone()
    .addScaledVector(velocity, deltaSeconds)
    .addScaledVector(new THREE.Vector3(0, -gravity, 0), 0.5 * deltaSeconds * deltaSeconds);

  return {
    position: nextPosition,
    velocity: nextVelocity
  };
}

export function updateExposureValue(
  currentExposure: number,
  canSeeTarget: boolean,
  buildRate: number,
  decayRate: number,
  deltaSeconds: number
): number {
  const next = canSeeTarget
    ? currentExposure + buildRate * deltaSeconds
    : currentExposure - decayRate * deltaSeconds;

  return clamp01(next);
}

export function pickBestCoverNode(
  nodes: CoverNode[],
  actorId: string,
  actorPosition: THREE.Vector3,
  targetPosition: THREE.Vector3,
  maxDistance: number
): CoverNode | null {
  let bestNode: CoverNode | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (node.occupiedBy && node.occupiedBy !== actorId) {
      continue;
    }

    const actorDistance = node.position.distanceTo(actorPosition);
    if (actorDistance > maxDistance) {
      continue;
    }

    const targetDistance = node.position.distanceTo(targetPosition);
    const facingBonus =
      1 -
      THREE.MathUtils.clamp(
        node.facing.clone().normalize().dot(
          targetPosition.clone().sub(node.position).normalize()
        ),
        -1,
        1
      );

    const score = actorDistance * 0.65 + targetDistance * 0.2 + facingBonus * 2;
    if (score < bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  return bestNode;
}

export function segmentSphereHitFraction(
  start: THREE.Vector3,
  end: THREE.Vector3,
  sphereCenter: THREE.Vector3,
  sphereRadius: number
): number | null {
  const direction = end.clone().sub(start);
  const originToCenter = start.clone().sub(sphereCenter);
  const a = direction.dot(direction);
  const b = 2 * originToCenter.dot(direction);
  const c = originToCenter.dot(originToCenter) - sphereRadius * sphereRadius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0 || a <= 0.000001) {
    return null;
  }

  const sqrt = Math.sqrt(discriminant);
  const t1 = (-b - sqrt) / (2 * a);
  const t2 = (-b + sqrt) / (2 * a);
  const hit = [t1, t2].find((value) => value >= 0 && value <= 1);

  return hit ?? null;
}

function segmentAabbHitFraction(
  start: THREE.Vector3,
  end: THREE.Vector3,
  center: THREE.Vector3,
  halfExtents: THREE.Vector3
): number | null {
  const direction = end.clone().sub(start);
  let tMin = 0;
  let tMax = 1;

  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  for (const axis of axes) {
    const origin = start[axis];
    const delta = direction[axis];
    const min = center[axis] - halfExtents[axis];
    const max = center[axis] + halfExtents[axis];

    if (Math.abs(delta) <= 0.000001) {
      if (origin < min || origin > max) {
        return null;
      }
      continue;
    }

    let invT1 = (min - origin) / delta;
    let invT2 = (max - origin) / delta;
    if (invT1 > invT2) {
      const swap = invT1;
      invT1 = invT2;
      invT2 = swap;
    }

    tMin = Math.max(tMin, invT1);
    tMax = Math.min(tMax, invT2);
    if (tMin > tMax) {
      return null;
    }
  }

  if (tMax < 0 || tMin > 1) {
    return null;
  }
  return Math.max(0, tMin);
}

function segmentVerticalCylinderHitFraction(
  start: THREE.Vector3,
  end: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
  halfHeight: number
): number | null {
  const direction = end.clone().sub(start);
  const relStart = start.clone().sub(center);
  const yMin = -halfHeight;
  const yMax = halfHeight;
  let best: number | null = null;

  const a = direction.x * direction.x + direction.z * direction.z;
  const b = 2 * (relStart.x * direction.x + relStart.z * direction.z);
  const c = relStart.x * relStart.x + relStart.z * relStart.z - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (a > 0.000001 && discriminant >= 0) {
    const sqrt = Math.sqrt(discriminant);
    const roots = [(-b - sqrt) / (2 * a), (-b + sqrt) / (2 * a)];
    for (const t of roots) {
      if (t < 0 || t > 1) {
        continue;
      }
      const y = relStart.y + direction.y * t;
      if (y >= yMin && y <= yMax) {
        if (best === null || t < best) {
          best = t;
        }
      }
    }
  }

  if (Math.abs(direction.y) > 0.000001) {
    const capCandidates = [yMin, yMax];
    for (const capY of capCandidates) {
      const t = (capY - relStart.y) / direction.y;
      if (t < 0 || t > 1) {
        continue;
      }
      const x = relStart.x + direction.x * t;
      const z = relStart.z + direction.z * t;
      if (x * x + z * z <= radius * radius) {
        if (best === null || t < best) {
          best = t;
        }
      }
    }
  }

  return best;
}

export function pointInsideObstacle(point: THREE.Vector3, obstacle: ObstacleSpec): boolean {
  return pointInsideObstacleWithPadding(point, obstacle, 0);
}

export function pointInsideObstacleWithPadding(
  point: THREE.Vector3,
  obstacle: ObstacleSpec,
  padding: number
): boolean {
  const safePadding = Math.max(0, padding);
  if (obstacle.shape === "box") {
    const halfX = obstacle.size.x * 0.5 + safePadding;
    const halfY = obstacle.size.y * 0.5 + safePadding;
    const halfZ = obstacle.size.z * 0.5 + safePadding;
    return (
      Math.abs(point.x - obstacle.position.x) <= halfX &&
      Math.abs(point.y - obstacle.position.y) <= halfY &&
      Math.abs(point.z - obstacle.position.z) <= halfZ
    );
  }

  if (obstacle.shape === "sphere") {
    const radius = obstacle.size.x + safePadding;
    return point.distanceToSquared(obstacle.position) <= radius * radius;
  }

  const toTrunk = point.clone().sub(obstacle.position);
  const trunkRadius = obstacle.size.x * TREE_TRUNK_COLLISION_MULTIPLIER + safePadding;
  const inTrunk =
    toTrunk.x * toTrunk.x + toTrunk.z * toTrunk.z <= trunkRadius * trunkRadius &&
    Math.abs(toTrunk.y) <= obstacle.size.y * 0.5 + safePadding;
  if (inTrunk) {
    return true;
  }

  const crownCenter = obstacle.position
    .clone()
    .add(new THREE.Vector3(0, obstacle.size.y * 0.65, 0));
  const crownRadius = obstacle.size.x * TREE_CROWN_COLLISION_MULTIPLIER + safePadding;
  return point.distanceToSquared(crownCenter) <= crownRadius * crownRadius;
}

export function pointInsideAnyObstacle(
  point: THREE.Vector3,
  obstacles: ObstacleSpec[],
  padding = 0
): boolean {
  for (const obstacle of obstacles) {
    if (pointInsideObstacleWithPadding(point, obstacle, padding)) {
      return true;
    }
  }
  return false;
}

export function segmentObstacleHit(
  start: THREE.Vector3,
  end: THREE.Vector3,
  obstacles: ObstacleSpec[],
  padding = 0
): { fraction: number; obstacleId: string } | null {
  let best: { fraction: number; obstacleId: string } | null = null;
  const safePadding = Math.max(0, padding);

  for (const obstacle of obstacles) {
    let fraction: number | null = null;

    if (obstacle.shape === "box") {
      fraction = segmentAabbHitFraction(
        start,
        end,
        obstacle.position,
        new THREE.Vector3(
          obstacle.size.x * 0.5 + safePadding,
          obstacle.size.y * 0.5 + safePadding,
          obstacle.size.z * 0.5 + safePadding
        )
      );
    } else if (obstacle.shape === "sphere") {
      fraction = segmentSphereHitFraction(
        start,
        end,
        obstacle.position,
        obstacle.size.x + safePadding
      );
    } else {
      const trunkHit = segmentVerticalCylinderHitFraction(
        start,
        end,
        obstacle.position,
        obstacle.size.x * TREE_TRUNK_COLLISION_MULTIPLIER + safePadding,
        obstacle.size.y * 0.5 + safePadding
      );
      const crownHit = segmentSphereHitFraction(
        start,
        end,
        obstacle.position.clone().add(new THREE.Vector3(0, obstacle.size.y * 0.65, 0)),
        obstacle.size.x * TREE_CROWN_COLLISION_MULTIPLIER + safePadding
      );
      if (trunkHit !== null && crownHit !== null) {
        fraction = Math.min(trunkHit, crownHit);
      } else {
        fraction = trunkHit ?? crownHit;
      }
    }

    if (fraction === null) {
      continue;
    }
    if (!best || fraction < best.fraction) {
      best = { fraction, obstacleId: obstacle.id };
    }
  }

  return best;
}

export function segmentGroundHitFraction(
  start: THREE.Vector3,
  end: THREE.Vector3,
  groundY = 0
): number | null {
  if (start.y <= groundY) {
    return 0;
  }
  if (end.y > groundY) {
    return null;
  }
  const denominator = start.y - end.y;
  if (Math.abs(denominator) <= 0.000001) {
    return null;
  }
  const t = (start.y - groundY) / denominator;
  if (t < 0 || t > 1) {
    return null;
  }
  return t;
}

export function getActorHitSpheres(
  basePosition: THREE.Vector3,
  isCrouching: boolean,
  lifeState: LifeState
): { center: THREE.Vector3; radius: number }[] {
  const profile =
    lifeState === "downed"
      ? GAME_CONFIG.hitboxes.downed
      : isCrouching
        ? GAME_CONFIG.hitboxes.crouching
        : GAME_CONFIG.hitboxes.standing;

  return profile.map((sphere) => ({
    center: basePosition.clone().add(sphere.offset),
    radius: sphere.radius
  }));
}
