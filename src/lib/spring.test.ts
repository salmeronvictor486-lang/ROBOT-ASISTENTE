import { describe, expect, it } from "vitest";
import { Spring, SPRINGS, isSettled, stepSpring } from "./spring";

function simulate(spring: Spring, seconds: number, fps = 60): void {
  for (let i = 0; i < seconds * fps; i++) spring.step(1 / fps);
}

describe("spring", () => {
  it("llega al objetivo y se para", () => {
    const s = new Spring(0, SPRINGS.snappy);
    s.target = 100;
    simulate(s, 2);
    expect(s.value).toBe(100);
    expect(s.velocity).toBe(0);
  });

  it("un muelle con rebote se pasa del objetivo antes de volver", () => {
    const s = new Spring(0, SPRINGS.bouncy);
    s.target = 1;
    let max = 0;
    for (let i = 0; i < 120; i++) {
      s.step(1 / 60);
      max = Math.max(max, s.value);
    }
    expect(max).toBeGreaterThan(1);
  });

  it("es estable con fotogramas largos", () => {
    const next = stepSpring({ value: 0, velocity: 0 }, 1, SPRINGS.snappy, 5);
    expect(Number.isFinite(next.value)).toBe(true);
    expect(Math.abs(next.value)).toBeLessThan(10);
  });

  it("snap coloca el valor sin animar", () => {
    const s = new Spring(0);
    s.target = 50;
    s.snap();
    expect(s.value).toBe(50);
    expect(isSettled(s, 50, s.config)).toBe(true);
  });
});
