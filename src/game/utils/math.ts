import * as THREE from "three";
import type { ObstacleSpec } from "../types";

const VERTICAL_AXIS = new THREE.Vector3(0, 1, 0);

export function dampVector(
  current: THREE.Vector3,
  target: THREE.Vector3,
  lambda: number,
  deltaSeconds: number
): THREE.Vector3 {
  const t = 1 - Math.exp(-lambda * deltaSeconds);
  current.lerp(target, t);
  return current;
}

export function flatten(vector: THREE.Vector3): THREE.Vector3 {
  return vector.set(vector.x, 0, vector.z);
}

export function getYawFromForward(forward: THREE.Vector3): number {
  return Math.atan2(forward.x, forward.z);
}

export function getForwardFromYaw(yaw: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

export function getRightFromYaw(yaw: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
}

export function moveToward(
  current: number,
  target: number,
  maxDelta: number
): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

export function resolveCircleObstacleCollisions(
  position: THREE.Vector3,
  radius: number,
  obstacles: ObstacleSpec[],
  arenaHalfSize: number
): THREE.Vector3 {
  position.x = THREE.MathUtils.clamp(
    position.x,
    -arenaHalfSize + radius,
    arenaHalfSize - radius
  );
  position.z = THREE.MathUtils.clamp(
    position.z,
    -arenaHalfSize + radius,
    arenaHalfSize - radius
  );

  const flat = new THREE.Vector2(position.x, position.z);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    let pushed = false;
    for (const obstacle of obstacles) {
      if (obstacle.shape === "box") {
        const halfX = obstacle.size.x * 0.5;
        const halfZ = obstacle.size.z * 0.5;
        const closest = new THREE.Vector2(
          THREE.MathUtils.clamp(flat.x, obstacle.position.x - halfX, obstacle.position.x + halfX),
          THREE.MathUtils.clamp(flat.y, obstacle.position.z - halfZ, obstacle.position.z + halfZ)
        );
        const delta = flat.clone().sub(closest);
        const distance = delta.length();

        if (distance < radius) {
          pushed = true;
          if (distance <= 0.0001) {
            delta.set(1, 0);
          } else {
            delta.divideScalar(distance);
          }
          flat.addScaledVector(delta, radius - distance + 0.001);
        }
      } else {
        const obstacleRadius =
          obstacle.shape === "cylinder" ? obstacle.size.x * 1.1 : obstacle.size.x;
        const center = new THREE.Vector2(obstacle.position.x, obstacle.position.z);
        const delta = flat.clone().sub(center);
        const distance = delta.length();
        const minimumDistance = obstacleRadius + radius;

        if (distance < minimumDistance) {
          pushed = true;
          if (distance <= 0.0001) {
            delta.set(1, 0);
          } else {
            delta.divideScalar(distance);
          }
          flat.addScaledVector(delta, minimumDistance - distance + 0.001);
        }
      }
    }

    position.x = THREE.MathUtils.clamp(
      flat.x,
      -arenaHalfSize + radius,
      arenaHalfSize - radius
    );
    position.z = THREE.MathUtils.clamp(
      flat.y,
      -arenaHalfSize + radius,
      arenaHalfSize - radius
    );
    flat.set(position.x, position.z);

    if (!pushed) {
      break;
    }
  }

  return position;
}

export function smoothLookAtDirection(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  turnSpeed: number,
  deltaSeconds: number
): THREE.Vector3 {
  if (desired.lengthSq() <= 0.0001) {
    return current;
  }

  const currentYaw = getYawFromForward(current);
  const desiredYaw = getYawFromForward(desired);
  let deltaYaw = desiredYaw - currentYaw;
  while (deltaYaw > Math.PI) {
    deltaYaw -= Math.PI * 2;
  }
  while (deltaYaw < -Math.PI) {
    deltaYaw += Math.PI * 2;
  }

  const nextYaw = currentYaw + THREE.MathUtils.clamp(deltaYaw, -turnSpeed * deltaSeconds, turnSpeed * deltaSeconds);
  current.copy(getForwardFromYaw(nextYaw));
  return current;
}

export function createYawQuaternion(yaw: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(VERTICAL_AXIS, yaw);
}
