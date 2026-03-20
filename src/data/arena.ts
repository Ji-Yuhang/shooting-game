import * as THREE from "three";
import type { CoverNode, ObstacleSpec } from "../game/types";

export const PLAYER_SPAWNS = [
  new THREE.Vector3(-21, 0, 17),
  new THREE.Vector3(-18, 0, -6),
  new THREE.Vector3(-4, 0, 21),
  new THREE.Vector3(8, 0, -22)
];

export const ENEMY_SPAWNS = [
  new THREE.Vector3(20, 0, -16),
  new THREE.Vector3(17, 0, 18),
  new THREE.Vector3(-4, 0, -21),
  new THREE.Vector3(-20, 0, 4)
];

export const PATROL_POINTS = [
  new THREE.Vector3(-16, 0, -10),
  new THREE.Vector3(-2, 0, -20),
  new THREE.Vector3(8, 0, 15),
  new THREE.Vector3(19, 0, 2)
];

export const OBSTACLES: ObstacleSpec[] = [
  {
    id: "wall-a",
    shape: "box",
    position: new THREE.Vector3(-8, 1.5, -7),
    size: new THREE.Vector3(9, 3, 1),
    color: "#6b7e6f",
    heightClass: "full"
  },
  {
    id: "wall-b",
    shape: "box",
    position: new THREE.Vector3(11.5, 1.55, 6),
    size: new THREE.Vector3(1, 3.1, 10),
    color: "#56665c",
    heightClass: "full"
  },
  {
    id: "wall-c",
    shape: "box",
    position: new THREE.Vector3(2.5, 1.35, -19),
    size: new THREE.Vector3(6.4, 2.7, 1),
    color: "#687762",
    heightClass: "full"
  },
  {
    id: "wall-d",
    shape: "box",
    position: new THREE.Vector3(-11, 1.5, 10.5),
    size: new THREE.Vector3(1, 3, 8.4),
    color: "#5e7165",
    heightClass: "full"
  },
  {
    id: "wall-e",
    shape: "box",
    position: new THREE.Vector3(1.5, 1.4, -2),
    size: new THREE.Vector3(6.4, 2.8, 1),
    color: "#70806d",
    heightClass: "full"
  },
  {
    id: "wall-f",
    shape: "box",
    position: new THREE.Vector3(17, 1.45, -13.5),
    size: new THREE.Vector3(7.2, 2.9, 1),
    color: "#617365",
    heightClass: "full"
  },
  {
    id: "rock-a",
    shape: "sphere",
    position: new THREE.Vector3(-18, 1.45, -2.5),
    size: new THREE.Vector3(2.4, 2.4, 2.4),
    color: "#77736b",
    heightClass: "full"
  },
  {
    id: "rock-b",
    shape: "sphere",
    position: new THREE.Vector3(5, 1.35, 16.5),
    size: new THREE.Vector3(2.2, 2.2, 2.2),
    color: "#72695b",
    heightClass: "full"
  },
  {
    id: "rock-c",
    shape: "sphere",
    position: new THREE.Vector3(20, 1.6, -4),
    size: new THREE.Vector3(2.8, 2.8, 2.8),
    color: "#7c7160",
    heightClass: "full"
  },
  {
    id: "rock-d",
    shape: "sphere",
    position: new THREE.Vector3(8.5, 1.35, -10.2),
    size: new THREE.Vector3(2.2, 2.2, 2.2),
    color: "#766d60",
    heightClass: "full"
  },
  {
    id: "rock-e",
    shape: "sphere",
    position: new THREE.Vector3(-11.5, 1.5, 18.5),
    size: new THREE.Vector3(2.5, 2.5, 2.5),
    color: "#746b5d",
    heightClass: "full"
  },
  {
    id: "tree-a",
    shape: "cylinder",
    position: new THREE.Vector3(-2, 2.4, 9),
    size: new THREE.Vector3(1.2, 4.8, 1.2),
    color: "#4f3d2a",
    heightClass: "full"
  },
  {
    id: "tree-b",
    shape: "cylinder",
    position: new THREE.Vector3(16, 2.6, 18),
    size: new THREE.Vector3(1.25, 5.2, 1.25),
    color: "#523d2f",
    heightClass: "full"
  },
  {
    id: "tree-c",
    shape: "cylinder",
    position: new THREE.Vector3(-22, 2.5, 18),
    size: new THREE.Vector3(1.2, 5, 1.2),
    color: "#523d2f",
    heightClass: "full"
  },
  {
    id: "tree-d",
    shape: "cylinder",
    position: new THREE.Vector3(8, 2.45, 13),
    size: new THREE.Vector3(1.15, 4.9, 1.15),
    color: "#4f3c2b",
    heightClass: "full"
  },
  {
    id: "tree-e",
    shape: "cylinder",
    position: new THREE.Vector3(-15, 2.35, 11.5),
    size: new THREE.Vector3(1.1, 4.7, 1.1),
    color: "#513e2c",
    heightClass: "full"
  }
];

export const COVER_NODES: CoverNode[] = [
  {
    id: "cover-wall-a-left",
    position: new THREE.Vector3(-12.6, 0, -7),
    facing: new THREE.Vector3(1, 0, 0),
    peekSide: "right",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-wall-a-right",
    position: new THREE.Vector3(-3.4, 0, -7),
    facing: new THREE.Vector3(-1, 0, 0),
    peekSide: "left",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-wall-b-north",
    position: new THREE.Vector3(11.5, 0, 1.2),
    facing: new THREE.Vector3(0, 0, 1),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-b-south",
    position: new THREE.Vector3(11.5, 0, 10.6),
    facing: new THREE.Vector3(0, 0, -1),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-rock-b",
    position: new THREE.Vector3(2.2, 0, 17.4),
    facing: new THREE.Vector3(1, 0, -0.1).normalize(),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-rock-c",
    position: new THREE.Vector3(17, 0, -1.6),
    facing: new THREE.Vector3(-1, 0, 0.4).normalize(),
    peekSide: "either",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-wall-c-west",
    position: new THREE.Vector3(-1.4, 0, -19),
    facing: new THREE.Vector3(1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-c-east",
    position: new THREE.Vector3(6.6, 0, -19),
    facing: new THREE.Vector3(-1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-d-north",
    position: new THREE.Vector3(-11, 0, 5.8),
    facing: new THREE.Vector3(0, 0, 1),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-d-south",
    position: new THREE.Vector3(-11, 0, 15.2),
    facing: new THREE.Vector3(0, 0, -1),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-e-west",
    position: new THREE.Vector3(-2.8, 0, -2),
    facing: new THREE.Vector3(1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-e-east",
    position: new THREE.Vector3(5.8, 0, -2),
    facing: new THREE.Vector3(-1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-tree-a",
    position: new THREE.Vector3(-3.8, 0, 10.3),
    facing: new THREE.Vector3(1, 0, -0.3).normalize(),
    peekSide: "either",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-rock-a",
    position: new THREE.Vector3(-20.7, 0, -0.8),
    facing: new THREE.Vector3(1, 0, -0.2).normalize(),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-rock-d",
    position: new THREE.Vector3(5.9, 0, -8.2),
    facing: new THREE.Vector3(1, 0, -0.4).normalize(),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-rock-e",
    position: new THREE.Vector3(-14.1, 0, 19.2),
    facing: new THREE.Vector3(1, 0, -0.1).normalize(),
    peekSide: "either",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-tree-d",
    position: new THREE.Vector3(5.8, 0, 13.8),
    facing: new THREE.Vector3(1, 0, -0.25).normalize(),
    peekSide: "either",
    crouchAllowed: false,
    occupiedBy: null
  },
  {
    id: "cover-wall-f-west",
    position: new THREE.Vector3(12.6, 0, -13.5),
    facing: new THREE.Vector3(1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-wall-f-east",
    position: new THREE.Vector3(21.4, 0, -13.5),
    facing: new THREE.Vector3(-1, 0, 0),
    peekSide: "either",
    crouchAllowed: true,
    occupiedBy: null
  },
  {
    id: "cover-tree-e",
    position: new THREE.Vector3(-16.8, 0, 12.6),
    facing: new THREE.Vector3(1, 0, -0.15).normalize(),
    peekSide: "either",
    crouchAllowed: false,
    occupiedBy: null
  }
];
