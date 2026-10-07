import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppErrorPayload, IslandInfo, Rect, Settings } from "../types";

/** `true` dentro de la app; `false` si abres Vite en un navegador normal. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Llamadas tipadas a los comandos de Rust. */
export const api = {
  settingsGet: () => invoke<Settings>("settings_get"),
  settingsUpdate: (settings: Settings) => invoke<Settings>("settings_update", { settings }),
  islandSetRect: (rect: Rect | null) => invoke<undefined>("island_set_rect", { rect }),
  islandFocus: () => invoke<undefined>("island_focus"),
  islandInfo: () => invoke<IslandInfo>("island_info"),
};

/**
 * Escucha un evento de Rust y devuelve una función para dejar de escuchar.
 * `listen` es asíncrono; si el componente se desmonta antes, cancelamos al llegar.
 */
export function onEvent<T>(name: string, handler: (payload: T) => void): () => void {
  if (!isTauri()) return () => undefined;
  let active = true;
  let unlisten: (() => void) | null = null;
  void listen<T>(name, (event) => {
    if (active) handler(event.payload);
  }).then((fn) => {
    if (active) unlisten = fn;
    else fn();
  });
  return () => {
    active = false;
    unlisten?.();
  };
}

/** Convierte cualquier error (de Rust o de JS) en `{ kind, message }`. */
export function toAppError(error: unknown): AppErrorPayload {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    const { kind, message } = error as Record<string, unknown>;
    return { kind: String(kind), message: String(message) };
  }
  return { kind: "other", message: error instanceof Error ? error.message : String(error) };
}
