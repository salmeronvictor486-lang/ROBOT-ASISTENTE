import { describe, expect, it } from "vitest";
import { capsuleGeometry, capsuleHitRect, capsuleX } from "./sizes";

describe("tamaños de la isla", () => {
  it("escala con S/M/L", () => {
    expect(capsuleGeometry("compact", "m").width).toBe(360);
    expect(capsuleGeometry("compact", "l").width).toBeCloseTo(432);
    expect(capsuleGeometry("compact", "s").height).toBeCloseTo(40.8);
  });

  it("en peek usa el ancho del notch si lo hay", () => {
    expect(capsuleGeometry("peek", "m", 185).width).toBe(185);
    expect(capsuleGeometry("compact", "m", 185).width).toBe(360);
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
