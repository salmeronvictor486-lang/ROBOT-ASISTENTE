import { useEffect, type Dispatch } from "react";
import { onEvent } from "../lib/tauri";
import type { IslandEvent } from "./machine";

export type ShortcutAction = "open" | "capture";

interface ShortcutPayload {
  action: ShortcutAction;
}

/** Traduce los eventos de Rust (sensores y atajos) a eventos de la máquina. */
export function useIslandEvents(
  dispatch: Dispatch<IslandEvent>,
  onShortcut: (action: ShortcutAction) => void,
) {
  useEffect(() => {
    const offs = [
      onEvent<null>("island://edge-hover", () => dispatch({ type: "edgeHover" })),
      onEvent<{ inside: boolean }>("island://pointer", ({ inside }) =>
        dispatch({ type: "pointer", inside }),
      ),
      onEvent<ShortcutPayload>("island://shortcut", ({ action }) => {
        dispatch({ type: "open" });
        onShortcut(action);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [dispatch, onShortcut]);
}
