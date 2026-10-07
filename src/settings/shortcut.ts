/** Utilidades para grabar y mostrar atajos con el formato de Tauri ("CommandOrControl+Shift+Space"). */

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight",
]);

/** Nombre de tecla para Tauri a partir de `KeyboardEvent.code`, o `null` si no vale. */
export function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const named: Record<string, string> = {
    Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert",
    Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
    Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backquote: "`",
  };
  return named[code] ?? null;
}

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Convierte una pulsación en acelerador. Exige al menos un modificador además de Mayús. */
export function acceleratorFromEvent(e: KeyLike, isMac: boolean): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const key = keyFromCode(e.code);
  if (!key) return null;
  const primary = isMac ? e.metaKey : e.ctrlKey;
  if (!primary && !e.altKey) return null;
  const parts: string[] = [];
  if (primary) parts.push("CommandOrControl");
  if (isMac && e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** Texto bonito para enseñar el atajo: "⌘⇧Space" en Mac, "Ctrl+Mayús+Espacio"-like en Windows. */
export function formatAccelerator(accelerator: string, isMac: boolean): string {
  const parts = accelerator.split("+");
  if (isMac) {
    const symbols: Record<string, string> = {
      CommandOrControl: "⌘", CmdOrCtrl: "⌘", Command: "⌘", Control: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧",
    };
    return parts.map((p) => symbols[p] ?? p).join("");
  }
  const names: Record<string, string> = { CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl", Control: "Ctrl" };
  return parts.map((p) => names[p] ?? p).join("+");
}
