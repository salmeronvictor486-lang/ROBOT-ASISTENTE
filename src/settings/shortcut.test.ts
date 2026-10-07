import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, formatAccelerator } from "./shortcut";

const key = (code: string, mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}) => ({
  code,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe("atajos", () => {
  it("graba Ctrl+Mayús+Espacio en Windows", () => {
    expect(acceleratorFromEvent(key("Space", { ctrl: true, shift: true }), false)).toBe(
      "CommandOrControl+Shift+Space",
    );
  });

  it("en Mac la tecla principal es Cmd", () => {
    expect(acceleratorFromEvent(key("KeyS", { meta: true, shift: true }), true)).toBe("CommandOrControl+Shift+S");
  });

  it("rechaza teclas sueltas o solo modificadores", () => {
    expect(acceleratorFromEvent(key("KeyA"), false)).toBeNull();
    expect(acceleratorFromEvent(key("KeyA", { shift: true }), false)).toBeNull();
    expect(acceleratorFromEvent(key("ControlLeft", { ctrl: true }), false)).toBeNull();
  });

  it("formatea para cada sistema", () => {
    expect(formatAccelerator("CommandOrControl+Shift+Space", true)).toBe("⌘⇧Space");
    expect(formatAccelerator("CommandOrControl+Shift+S", false)).toBe("Ctrl+Shift+S");
  });
});
