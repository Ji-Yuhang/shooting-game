import * as THREE from "three";

export type CombatMode = "idle" | "aiming" | "charging" | "cooldown" | "dead";
export type PeekDirection = -1 | 0 | 1;
export type ActorKind = "player" | "enemy";
export type LifeState = "alive" | "downed" | "dead";
export type EnemyRole = "suppressor" | "flanker" | "harasser" | "rescuer";
export type EnemyState =
  | "Idle"
  | "Patrol"
  | "Investigate"
  | "MoveToCover"
  | "Flank"
  | "Retreat"
  | "Suppress"
  | "Revive"
  | "Downed"
  | "AimCharge"
  | "Shoot"
  | "Cooldown"
  | "Hit"
  | "Dead";

export type ActorState = {
  id: string;
  kind: ActorKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  forward: THREE.Vector3;
  desiredForward: THREE.Vector3;
  isCrouching: boolean;
  peekDirection: PeekDirection;
  health: number;
  maxHealth: number;
  lifeState: LifeState;
  downedHealth: number;
  stationaryTime: number;
  reviveProgress: number;
  bleedoutTimer: number;
  combatMode: CombatMode;
  hitFlash: number;
  isAlive: boolean;
};

export type CombatState = {
  mode: CombatMode;
  chargeSeconds: number;
  cooldownRemaining: number;
  blockedShotUntil: number;
};

export type SmokeCloudState = {
  id: number;
  position: THREE.Vector3;
  radius: number;
  age: number;
  buildSeconds: number;
  lifeSeconds: number;
};

export type ProjectileState = {
  id: number;
  ownerId: string;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  gravityScale: number;
  lifeRemaining: number;
  alive: boolean;
};

export type CoverSide = "left" | "right" | "either";

export type CoverNode = {
  id: string;
  position: THREE.Vector3;
  facing: THREE.Vector3;
  peekSide: CoverSide;
  crouchAllowed: boolean;
  occupiedBy: string | null;
};

export type PerceptionSnapshot = {
  canSeeTarget: boolean;
  exposure: number;
  distanceToTarget: number;
  lastKnownTarget: THREE.Vector3 | null;
};

export type ObstacleShape = "box" | "cylinder" | "sphere";

export type ObstacleSpec = {
  id: string;
  shape: ObstacleShape;
  position: THREE.Vector3;
  size: THREE.Vector3;
  color: string;
  heightClass: "full" | "mid" | "low";
};
