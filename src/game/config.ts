import * as THREE from "three";

export type GameConfig = {
  arenaSize: number;
  fixedTimeStep: number;
  maxSubSteps: number;
  player: {
    radius: number;
    standHeight: number;
    crouchHeight: number;
    eyeStandHeight: number;
    eyeCrouchHeight: number;
    moveSpeed: number;
    aimMoveSpeed: number;
    crouchMoveSpeed: number;
    acceleration: number;
    turnSpeed: number;
    health: number;
  };
  camera: {
    yawSensitivity: number;
    pitchSensitivity: number;
    minPitch: number;
    maxPitch: number;
    normalOffset: THREE.Vector3;
    aimOffset: THREE.Vector3;
    peekOffset: THREE.Vector3;
    collisionRadius: number;
  };
  combat: {
    minChargeSeconds: number;
    maxChargeSeconds: number;
    minArrowSpeed: number;
    maxArrowSpeed: number;
    gravity: number;
    cooldownSeconds: number;
    damage: number;
    arrowLifeSeconds: number;
    closeRangeDistance: number;
    mediumRangeDistance: number;
  };
  ai: {
    health: number;
    moveSpeed: number;
    aimMoveSpeed: number;
    downedMoveSpeed: number;
    detectionRange: number;
    fieldOfViewDot: number;
    exposureBuildRate: number;
    exposureDecayRate: number;
    exposureThreshold: number;
    attackCooldown: number;
    preferredRange: number;
    repositionDistance: number;
    selfHealDelay: number;
    selfHealRate: number;
    reviveSeconds: number;
    reviveHealth: number;
    downedHealth: number;
    downedBleedoutSeconds: number;
    retreatHealthThreshold: number;
    tacticHoldSeconds: number;
    teamAggroRange: number;
    pushDistance: number;
    smokeCooldown: number;
    rescueAbortDamageWindow: number;
  };
  smoke: {
    radius: number;
    buildSeconds: number;
    lifeSeconds: number;
  };
};

export const GAME_CONFIG: GameConfig = {
  arenaSize: 44,
  fixedTimeStep: 1 / 60,
  maxSubSteps: 4,
  player: {
    radius: 0.42,
    standHeight: 1.8,
    crouchHeight: 1.2,
    eyeStandHeight: 1.6,
    eyeCrouchHeight: 1.05,
    moveSpeed: 5.6,
    aimMoveSpeed: 3.4,
    crouchMoveSpeed: 2.8,
    acceleration: 18,
    turnSpeed: 12,
    health: 100
  },
  camera: {
    yawSensitivity: 0.0025,
    pitchSensitivity: 0.00115,
    minPitch: -0.32,
    maxPitch: 0.42,
    normalOffset: new THREE.Vector3(0, 1.48, -5.2),
    aimOffset: new THREE.Vector3(0, 1.56, -3.2),
    peekOffset: new THREE.Vector3(0.95, 1.56, -3),
    collisionRadius: 0.28
  },
  combat: {
    minChargeSeconds: 0.05,
    maxChargeSeconds: 0.72,
    minArrowSpeed: 30,
    maxArrowSpeed: 50,
    gravity: 15,
    cooldownSeconds: 0.5,
    damage: 35,
    arrowLifeSeconds: 5,
    closeRangeDistance: 9,
    mediumRangeDistance: 18
  },
  ai: {
    health: 70,
    moveSpeed: 4,
    aimMoveSpeed: 2.3,
    downedMoveSpeed: 0.75,
    detectionRange: 24,
    fieldOfViewDot: 0.3,
    exposureBuildRate: 0.9,
    exposureDecayRate: 0.7,
    exposureThreshold: 0.35,
    attackCooldown: 1.7,
    preferredRange: 11,
    repositionDistance: 6,
    selfHealDelay: 3,
    selfHealRate: 6,
    reviveSeconds: 8,
    reviveHealth: 18,
    downedHealth: 45,
    downedBleedoutSeconds: 18,
    retreatHealthThreshold: 10,
    tacticHoldSeconds: 1.6,
    teamAggroRange: 34,
    pushDistance: 7,
    smokeCooldown: 10,
    rescueAbortDamageWindow: 0.22
  },
  smoke: {
    radius: 5.5,
    buildSeconds: 2.2,
    lifeSeconds: 9
  }
};
