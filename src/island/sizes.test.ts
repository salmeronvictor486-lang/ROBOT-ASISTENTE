import { describe, expect, it } from "vitest";
import { capsuleGeometry, capsuleHitRect, capsuleX, NOTCH_EAR } from "./sizes";

const NOTCH = { width: 185, height: 32 };

describe("tamaños de la isla", () => {
  it("escala con S/M/L", () => {
    expect(capsuleGeometry("compact", "m").width).toBe(360);
    expect(capsuleGeometry("compact", "l").width).toBeCloseTo(432);
    expect(capsuleGeometry("compact", "s").height).toBeCloseTo(40.8);
  });

  it("con notch, peek tiene orejas a los lados del notch", () => {
    const g = capsuleGeometry("peek", "m", NOTCH);
    expect(g.width).toBe(185 + NOTCH_EAR * 2);
    expect(g.height).toBe(32);
    expect(g.flushTop).toBe(true);
  });

  it("con notch, el contenido empieza debajo del notch", () => {
    for (const state of ["compact", "expanded"] as const) {
      const g = capsuleGeometry(state, "m", NOTCH);
      expect(g.contentTop).toBe(32);
      expect(g.height).toBeGreaterThan(32 + 30);
      expect(g.width).toBeGreaterThan(NOTCH.width + 150);
    }
  });

  it("oculta con notch es un pelín más pequeña que el notch", () => {
    const g = capsuleGeometry("hidden", "m", NOTCH);
    expect(g.width).toBeLessThan(NOTCH.width);
    expect(g.height).toBeLessThan(NOTCH.height);
  });

  it("sin notch no reserva espacio arriba", () => {
    expect(capsuleGeometry("expanded", "m").contentTop).toBe(0);
    expect(capsuleGeometry("expanded", "m").flushTop).toBe(false);
  });

  it("la cápsula se alinea según la posición", () => {
    expect(capsuleX("center", 560, 200)).toBe(180);
    expect(capsuleX("left", 560, 200)).toBe(40);
    expect(capsuleX("right", 560, 200)).toBe(320);
  });

  it("oculta no tiene zona sensible", () => {
    expect(capsuleHitRect("hidden", "m", "center", 560, null, 6)).toBeNull();
    expect(capsuleHitRect("peek", "m", "center", 560, null, 6)).toEqual({
      x: 180,
      y: 0,
      width: 200,
      height: 42,
    });
  });
});
