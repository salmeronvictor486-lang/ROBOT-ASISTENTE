import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import { activeWorkspace, chatKey, folderName, newWorkspace, pickTico, switchWorkspace, workspaceTicos } from "./workspaces";

describe("espacios de trabajo", () => {
  it("cambiar de espacio recuerda el Tico de cada uno", () => {
    let s = { ...DEFAULT_SETTINGS, activeTico: "write" };
    s = switchWorkspace(s, "study");
    expect(s.activeWorkspace).toBe("study");
    expect(s.activeTico).toBe("teach");
    s = pickTico(s, "translate");
    s = switchWorkspace(s, "general");
    expect(s.activeTico).toBe("write");
    s = switchWorkspace(s, "study");
    expect(s.activeTico).toBe("translate");
  });

  it("usar un Tico de fuera lo añade al espacio", () => {
    const s = pickTico(switchWorkspace(DEFAULT_SETTINGS, "study"), "code");
    expect(activeWorkspace(s).ticos).toContain("code");
    expect(workspaceTicos(s, activeWorkspace(s)).map((t) => t.id)).toEqual(["teach", "write", "translate", "code"]);
  });

  it("un espacio que no existe no cambia nada", () => {
    expect(switchWorkspace(DEFAULT_SETTINGS, "nada")).toBe(DEFAULT_SETTINGS);
  });

  it("espacio nuevo con el Tico activo", () => {
    const ws = newWorkspace(DEFAULT_SETTINGS, "Clase");
    expect(ws?.ticos).toEqual(["tico"]);
    expect(newWorkspace({ ...DEFAULT_SETTINGS, workspaces: Array(12).fill(DEFAULT_SETTINGS.workspaces[0]) }, "x")).toBeNull();
  });

  it("claves y carpetas", () => {
    expect(chatKey("code", "tico")).toBe("code/tico");
    expect(folderName("C:\\Users\\Victor\\Clase\\")).toBe("Clase");
    expect(folderName("/Users/victor/Trabajo")).toBe("Trabajo");
  });
});
