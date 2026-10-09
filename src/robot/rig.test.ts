import { describe, expect, it } from "vitest";
import { POSES } from "./expressions";
import { armJoints, FOREARM, UPPER_ARM } from "./rig";

describe("brazos de Tico", () => {
  it("colgando, la mano queda justo debajo del hombro", () => {
    const { shoulder, hand } = armJoints("right", 0, 0);
    expect(hand.x).toBeCloseTo(shoulder.x);
    expect(hand.y).toBeCloseTo(shoulder.y + UPPER_ARM + FOREARM);
  });

  it("los brazos son simétricos", () => {
    const l = armJoints("left", 60, 30).hand;
    const r = armJoints("right", 60, 30).hand;
    expect(l.x + r.x).toBeCloseTo(100);
    expect(l.y).toBeCloseTo(r.y);
  });

  it("contento levanta las manos por encima de los hombros", () => {
    const { shoulder, hand } = armJoints("right", POSES.happy.rightArm.shoulder, POSES.happy.rightArm.elbow);
    expect(hand.y).toBeLessThan(shoulder.y - 10);
  });

  it("pensando lleva una mano a la barbilla (debajo del visor, cerca del centro)", () => {
    const { hand } = armJoints("right", POSES.thinking.rightArm.shoulder, POSES.thinking.rightArm.elbow);
    expect(hand.y).toBeGreaterThan(52);
    expect(hand.y).toBeLessThan(64);
    expect(Math.abs(hand.x - 50)).toBeLessThan(10);
  });

  it("ninguna pose saca las manos del dibujo", () => {
    for (const pose of Object.values(POSES)) {
      for (const [side, arm] of [
        ["left", pose.leftArm],
        ["right", pose.rightArm],
      ] as const) {
        const { hand } = armJoints(side, arm.shoulder, arm.elbow);
        expect(hand.x).toBeGreaterThan(2);
        expect(hand.x).toBeLessThan(98);
        expect(hand.y).toBeGreaterThan(2);
        expect(hand.y).toBeLessThan(98);
      }
    }
  });
});
