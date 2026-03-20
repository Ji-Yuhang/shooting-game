import * as THREE from "three";
import type { CoverNode, ObstacleSpec } from "../game/types";

export const PLAYER_SPAWN = new THREE.Vector3(-16, 0, 12);

export const ENEMY_SPAWNS = [
  new THREE.Vector3(15, 0, -10),
  new THREE.Vector3(11, 0, 13),
  new THREE.Vector3(-2, 0, -15),
  new THREE.Vector3(-15, 0, 4)
];

export const PATROL_POINTS = [
  new THREE.Vector3(-12, 0, -8),
  new THREE.Vector3(-2, 0, -14),
  new THREE.Vector3(6, 0, 12),
  new THREE.Vector3(16, 0, 2)
];

export const OBSTACLES: ObstacleSpec[] = [
  {
    id: "wall-a",
    shape: "box",
    position: new THREE.Vector3(-6, 1.2, -6),
    size: new THREE.Vector3(7, 2.4, 0.8),
    color: "#6b7e6f",
    heightClass: "full"
  },
  {
    id: "wall-b",
    shape: "box",
    position: new THREE.Vector3(9, 1.3, 5),
    size: new THREE.Vector3(0.8, 2.6, 8),
    color: "#56665c",
    heightClass: "full"
  },
  {
    id: "wall-c",
    shape: "box",
    position: new THREE.Vector3(2, 0.85, -16),
    size: new THREE.Vector3(5, 1.7, 0.8),
    color: "#687762",
    heightClass: "mid"
  },
  {
    id: "rock-a",
    shape: "sphere",
    position: new THREE.Vector3(-14, 1.1, -2),
    size: new THREE.Vector3(1.8, 1.8, 1.8),
    color: "#77736b",
    heightClass: "mid"
  },
  {
    id: "rock-b",
    shape: "sphere",
    position: new THREE.Vector3(3.5, 1, 13),
    size: new THREE.Vector3(1.6, 1.6, 1.6),
    color: "#72695b",
    heightClass: "mid"
  },
  {
    id: "rock-c",
    shape: "sphere",
    position: new THREE.Vector3(15.5, 1.2, -3),
    size: new THREE.Vector3(2, 2, 2),
    color: "#7c7160",
    heightClass: "full"
  },
  {
    id: "tree-a",
    shape: "cylinder",
    position: new THREE.Vector3(-1, 1.8, 8),
    size: new THREE.Vector3(0.8, 3.6, 0.8),
    color: "#4f3d2a",
    heightClass: "full"
  },
  {
    id: "tree-b",
    shape: "cylinder",
    position: new THREE.Vector3(13, 2.1, 15),
    size: new THREE.Vector3(0.9, 4.2, 0.9),
    color: "#523d2f",
    heightClass: "full"
  },
  {
    id: "tree-c",
    shape: "cylinder",
    position: new THREE.Vector3(-18, 2, 15),
    size: new THREE.Vector3(0.9, 4, 0.9),
    color: "#523d2f",
    heightClass: "full"
  }
];

export const COVER_NODES: CoverNode[] = [
  {
    id: "cover-wall-a-left",
    position: new THREE.Vector3(-9, 0, -6),
    facing: new THREE.Vector3(1, 0, 0),
    peekSide: "right",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-wall-a-right",
    position: new THREE.Vector3(-3, 0, -6),
    facing: new THREE.Vector3(-1, 0, 0),
    peekSide: "left",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-wall-b-north",
    position: new THREE.Vector3(9, 0, 1.8),
    facing: new THREE.Vector3(0, 0, 1),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-b-south",
    position: new THREE.Vector3(9, 0, 8.5),
    facing: new THREE.Vector3(0, 0, -1),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-rock-b",
    position: new THREE.Vector3(1.2, 0, 13.6),
    facing: new THREE.Vector3(1, 0, -0.1).normalize(),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-rock-c",
    position: new THREE.Vector3(13.4, 0, -1.6),
    facing: new THREE.Vector3(-1, 0, 0.4).normalize(),
    peekSide: "either",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-wall-c-west",
    position: new THREE.Vector3(-0.8, 0, -16),
    facing: new THREE.Vector3(1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-c-east",
    position: new THREE.Vector3(4.8, 0, -16),
    facing: new THREE.Vector3(-1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-tree-a",
    position: new THREE.Vector3(-2.2, 0, 9.1),
    facing: new THREE.Vector3(1, 0, -0.3).normalize(),
    peekSide: "either",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-rock-a",
    position: new THREE.Vector3(-15.7, 0, -0.4),
    facing: new THREE.Vector3(1, 0, -0.2).normalize(),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  }
];
