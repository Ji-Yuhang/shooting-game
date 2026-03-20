import * as THREE from "three";
import type { CoverNode, LifeState } from "./types";

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

export function getActorHitSpheres(
  basePosition: THREE.Vector3,
  isCrouching: boolean,
  lifeState: LifeState
): { center: THREE.Vector3; radius: number }[] {
  if (lifeState === "downed") {
    return [
      { center: basePosition.clone().add(new THREE.Vector3(0, 0.24, 0)), radius: 0.42 },
      { center: basePosition.clone().add(new THREE.Vector3(0.26, 0.22, 0)), radius: 0.3 }
    ];
  }

  if (isCrouching) {
    return [
      { center: basePosition.clone().add(new THREE.Vector3(0, 0.45, 0)), radius: 0.38 },
      { center: basePosition.clone().add(new THREE.Vector3(0, 0.85, 0)), radius: 0.34 }
    ];
  }

  return [
    { center: basePosition.clone().add(new THREE.Vector3(0, 0.55, 0)), radius: 0.38 },
    { center: basePosition.clone().add(new THREE.Vector3(0, 1.05, 0)), radius: 0.34 },
    { center: basePosition.clone().add(new THREE.Vector3(0, 1.55, 0)), radius: 0.3 }
  ];
}
