import { useEffect, useRef, type Dispatch } from "react";
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
  // La función cambia en cada render (mientras llega una respuesta, a cada palabra):
  // la guardamos en una ref para no darnos de baja y de alta de los eventos todo el rato.
  const handler = useRef(onShortcut);
  useEffect(() => {
    handler.current = onShortcut;
  }, [onShortcut]);

  useEffect(() => {
    const offs = [
      onEvent<null>("island://edge-hover", () => dispatch({ type: "edgeHover" })),
      onEvent<{ inside: boolean }>("island://pointer", ({ inside }) =>
        dispatch({ type: "pointer", inside }),
      ),
      onEvent<ShortcutPayload>("island://shortcut", ({ action }) => {
        dispatch({ type: "open" });
        handler.current(action);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [dispatch]);
}
