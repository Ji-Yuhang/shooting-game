import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  computeArrowSpeed,
  computeChargeRatio,
  integrateProjectile,
  pickBestCoverNode,
  updateExposureValue
} from "../game/logic";
import type { CoverNode } from "../game/types";

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
