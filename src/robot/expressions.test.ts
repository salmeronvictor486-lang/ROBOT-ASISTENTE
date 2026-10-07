import { describe, expect, it } from "vitest";
import { EXPRESSIONS, POSES } from "./expressions";
import { lookOffset } from "./gaze";

describe("expresiones de Tico", () => {
  it("hay una pose para cada una de las 8 expresiones", () => {
    expect(EXPRESSIONS).toHaveLength(8);
    for (const e of EXPRESSIONS) expect(POSES[e]).toBeDefined();
  });

  it("los ojos caben siempre en el visor", () => {
    for (const e of EXPRESSIONS) {
      const p = POSES[e];
      expect(p.eyeWidth * Math.max(p.leftScale, p.rightScale)).toBeLessThan(18);
      expect(p.eyeHeight * Math.max(p.leftScale, p.rightScale)).toBeLessThan(34);
    }
  });

  it("curious inclina la cabeza 6° y agranda los ojos", () => {
    expect(POSES.curious.tilt).toBe(6);
    expect(POSES.curious.eyeHeight).toBeGreaterThan(POSES.idle.eyeHeight);
  });

  it("error tiene un ojo más pequeño y la antena roja", () => {
    expect(POSES.error.leftScale).toBeLessThan(POSES.error.rightScale);
    expect(POSES.error.antennaError).toBe(true);
  });
});

describe("mirada", () => {
  it("nunca se pasa del máximo", () => {
    const o = lookOffset({ x: 0, y: 0 }, { x: 5000, y: -3000 }, 3);
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(3);
  });

  it("mira hacia el cursor", () => {
    const o = lookOffset({ x: 100, y: 100 }, { x: 300, y: 100 }, 3);
    expect(o.x).toBeGreaterThan(0);
    expect(o.y).toBeCloseTo(0);
  });
});
