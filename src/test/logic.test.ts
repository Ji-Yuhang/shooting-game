import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  computeArrowSpeed,
  computeChargeRatio,
  integrateProjectile,
  pointInsideAnyObstacle,
  pickBestCoverNode,
  segmentObstacleHit,
  updateExposureValue
} from "../game/logic";
import type { CoverNode, ObstacleSpec } from "../game/types";

describe("computeChargeRatio", () => {
  it("stays at zero below minimum charge", () => {
    expect(computeChargeRatio(0.1, 0.2, 1.2)).toBe(0);
  });

  it("reaches one at max charge", () => {
    expect(computeChargeRatio(1.2, 0.2, 1.2)).toBe(1);
  });
});

describe("computeArrowSpeed", () => {
  it("maps ratio linearly between min and max", () => {
    expect(computeArrowSpeed(0.5, 20, 40)).toBe(30);
  });
});

describe("integrateProjectile", () => {
  it("applies gravity to both position and velocity", () => {
    const result = integrateProjectile(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(10, 10, 0),
      20,
      0.5
    );

    expect(result.position.x).toBeCloseTo(5);
    expect(result.position.y).toBeCloseTo(7.5);
    expect(result.velocity.y).toBeCloseTo(0);
  });
});

describe("updateExposureValue", () => {
  it("builds exposure while target is visible", () => {
    expect(updateExposureValue(0.2, true, 1, 1, 0.5)).toBeCloseTo(0.7);
  });

  it("decays exposure when target is hidden", () => {
    expect(updateExposureValue(0.7, false, 1, 1, 0.5)).toBeCloseTo(0.2);
  });
});

describe("pickBestCoverNode", () => {
  it("skips occupied nodes and picks a reachable cover point", () => {
    const nodes: CoverNode[] = [
      {
        id: "busy",
        position: new THREE.Vector3(1, 0, 0),
        facing: new THREE.Vector3(1, 0, 0),
        peekSide: "either",
        crouchAllowed: true,
        occupiedBy: "enemy-b"
      },
      {
        id: "free",
        position: new THREE.Vector3(2, 0, 0),
        facing: new THREE.Vector3(1, 0, 0),
        peekSide: "either",
        crouchAllowed: true,
        occupiedBy: null
      }
    ];

    const result = pickBestCoverNode(
      nodes,
      "enemy-a",
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0),
      10
    );

    expect(result?.id).toBe("free");
  });
});

describe("segmentObstacleHit", () => {
  it("hits the nearest blocking obstacle on the segment", () => {
    const obstacles: ObstacleSpec[] = [
      {
        id: "box-near",
        shape: "box",
        position: new THREE.Vector3(0, 1, 0),
        size: new THREE.Vector3(1, 2, 1),
        color: "#888",
        heightClass: "full"
      },
      {
        id: "box-far",
        shape: "box",
        position: new THREE.Vector3(3, 1, 0),
        size: new THREE.Vector3(1, 2, 1),
        color: "#888",
        heightClass: "full"
      }
    ];

    const hit = segmentObstacleHit(
      new THREE.Vector3(-2, 1, 0),
      new THREE.Vector3(4, 1, 0),
      obstacles
    );

    expect(hit?.obstacleId).toBe("box-near");
    expect(hit?.fraction).toBeCloseTo(0.25);
  });

  it("supports collision padding for near-miss edge cases", () => {
    const obstacles: ObstacleSpec[] = [
      {
        id: "thin-wall",
        shape: "box",
        position: new THREE.Vector3(0, 1, 0),
        size: new THREE.Vector3(2, 2, 0.8),
        color: "#666",
        heightClass: "full"
      }
    ];

    const start = new THREE.Vector3(-2, 2.12, 0);
    const end = new THREE.Vector3(2, 2.12, 0);
    expect(segmentObstacleHit(start, end, obstacles, 0)).toBeNull();
    expect(segmentObstacleHit(start, end, obstacles, 0.15)?.obstacleId).toBe("thin-wall");
  });
});

describe("pointInsideAnyObstacle", () => {
  it("uses optional padding when checking inside state", () => {
    const obstacles: ObstacleSpec[] = [
      {
        id: "rock",
        shape: "sphere",
        position: new THREE.Vector3(0, 1, 0),
        size: new THREE.Vector3(1, 1, 1),
        color: "#999",
        heightClass: "full"
      }
    ];

    const point = new THREE.Vector3(1.08, 1, 0);
    expect(pointInsideAnyObstacle(point, obstacles)).toBe(false);
    expect(pointInsideAnyObstacle(point, obstacles, 0.1)).toBe(true);
  });
});
