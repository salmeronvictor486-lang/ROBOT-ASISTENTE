import { describe, expect, it } from "vitest";
import { initialIsland, islandReducer, shouldAutoHide, type IslandEvent } from "./machine";

function run(...events: IslandEvent[]) {
  return events.reduce(islandReducer, initialIsland);
}

describe("máquina de la isla", () => {
  it("hover en el borde → peek → compact → expanded", () => {
    expect(run({ type: "edgeHover" }).state).toBe("peek");
    expect(run({ type: "edgeHover" }, { type: "dwell" }).state).toBe("compact");
    expect(run({ type: "edgeHover" }, { type: "dwell" }, { type: "click" }).state).toBe("expanded");
    expect(run({ type: "edgeHover" }, { type: "click" }).state).toBe("expanded");
  });

  it("el atajo abre directamente expanded", () => {
    expect(run({ type: "open" }).state).toBe("expanded");
  });

  it("Esc la oculta desde cualquier estado", () => {
    expect(run({ type: "open" }, { type: "escape" }).state).toBe("hidden");
    expect(run({ type: "edgeHover" }, { type: "escape" }).state).toBe("hidden");
  });

  it("se oculta al salir el cursor si no hay conversación", () => {
    const ctx = run({ type: "edgeHover" }, { type: "pointer", inside: false });
    expect(shouldAutoHide(ctx)).toBe(true);
    expect(islandReducer(ctx, { type: "hideTimeout" }).state).toBe("hidden");
  });

  it("no se oculta si el cursor ha vuelto", () => {
    const ctx = run(
      { type: "edgeHover" },
      { type: "pointer", inside: false },
      { type: "pointer", inside: true },
      { type: "hideTimeout" },
    );
    expect(ctx.state).toBe("peek");
  });

  it("expanded con conversación activa no se oculta sola", () => {
    const ctx = run(
      { type: "open" },
      { type: "conversation", active: true },
      { type: "pointer", inside: false },
      { type: "hideTimeout" },
    );
    expect(ctx.state).toBe("expanded");
    expect(islandReducer(ctx, { type: "escape" }).state).toBe("hidden");
  });

  it("contraer pasa de expanded a compact", () => {
    expect(run({ type: "open" }, { type: "collapse" }).state).toBe("compact");
  });

  it("dwell y click no hacen nada con la isla oculta", () => {
    expect(run({ type: "dwell" }).state).toBe("hidden");
    expect(run({ type: "click" }).state).toBe("hidden");
  });
});
