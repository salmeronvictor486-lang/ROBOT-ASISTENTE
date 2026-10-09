import { describe, expect, it } from "vitest";
import { ease, inOut, progress, typed } from "./timeline";

describe("línea de tiempo del anuncio", () => {
  it("progress se queda entre 0 y 1", () => {
    expect(progress(0, 1, 2)).toBe(0);
    expect(progress(1.5, 1, 2)).toBe(0.5);
    expect(progress(3, 1, 2)).toBe(1);
  });

  it("las curvas empiezan en 0 y acaban en 1", () => {
    for (const f of Object.values(ease)) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
    }
  });

  it("inOut aparece y desaparece", () => {
    expect(inOut(0, 1, 3)).toBe(0);
    expect(inOut(2, 1, 3)).toBe(1);
    expect(inOut(3, 1, 3)).toBe(0);
  });

  it("typed escribe poco a poco", () => {
    expect(typed("hola", 0, 0, 1)).toBe("");
    expect(typed("hola", 0.5, 0, 1)).toBe("ho");
    expect(typed("hola", 2, 0, 1)).toBe("hola");
  });
});
