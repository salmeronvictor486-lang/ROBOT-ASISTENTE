import { describe, expect, it } from "vitest";
import { EXPRESSIONS, POSES, seasonalOutfit } from "./expressions";
import { lookOffset } from "./gaze";

describe("expresiones de Tico", () => {
  it("hay una pose para cada una de las 15 expresiones", () => {
    expect(EXPRESSIONS).toHaveLength(15);
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

  it("solo una forma de ojos especial a la vez", () => {
    for (const e of EXPRESSIONS) {
      const p = POSES[e];
      const shapes = [p.arcs, p.hearts, p.spirals].filter(Boolean).length;
      expect(shapes, e).toBeLessThanOrEqual(1);
    }
  });

  it("ropa de temporada en Navidad y Halloween", () => {
    expect(seasonalOutfit(new Date(2026, 11, 24))).toBe("santa");
    expect(seasonalOutfit(new Date(2027, 0, 5))).toBe("santa");
    expect(seasonalOutfit(new Date(2026, 9, 31))).toBe("witch");
    expect(seasonalOutfit(new Date(2026, 6, 1))).toBeNull();
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
