import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppErrorPayload,
  CapturePreview,
  ChatEvent,
  ConvertResult,
  FileInfo,
  IslandInfo,
  ProviderKind,
  Rect,
  SendOptions,
  Settings,
} from "../types";

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
  chatSend: (options: SendOptions, onEvent: Channel<ChatEvent>) =>
    invoke<undefined>("chat_send", { options, onEvent }),
  chatCancel: () => invoke<undefined>("chat_cancel"),
  chatClear: (tico?: string) => invoke<undefined>("chat_clear", { tico }),
  aiTestConnection: (provider: ProviderKind) => invoke<string[]>("ai_test_connection", { provider }),
  secretSet: (provider: ProviderKind, key: string) => invoke<undefined>("secret_set", { provider, key }),
  secretDelete: (provider: ProviderKind) => invoke<undefined>("secret_delete", { provider }),
  captureScreen: () => invoke<CapturePreview>("capture_screen"),
  captureDiscard: () => invoke<undefined>("capture_discard"),
  openScreenPermissionSettings: () => invoke<undefined>("open_screen_permission_settings"),
  openSettings: (page?: "settings" | "playground" | "ticos") => invoke<undefined>("open_settings", { page }),
  setUiLanguage: (lang: string) => invoke<undefined>("set_ui_language", { lang }),
  openUrl: (url: string) => invoke<undefined>("open_url", { url }),
  secretStatus: () => invoke<Partial<Record<ProviderKind, boolean>>>("secret_status"),
  filesInspect: (paths: string[]) => invoke<FileInfo[]>("files_inspect", { paths }),
  filesPick: (documents: boolean) => invoke<FileInfo[]>("files_pick", { documents }),
  fileOpen: (path: string) => invoke<undefined>("file_open", { path }),
  fileReveal: (path: string) => invoke<undefined>("file_reveal", { path }),
  fileThumbnail: (path: string) => invoke<string>("file_thumbnail", { path }),
  convertToPdf: (path?: string) => invoke<ConvertResult>("convert_to_pdf", { path }),
};

export { Channel };

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
    const { kind, message, detail } = error as Record<string, unknown>;
    return {
      kind: String(kind),
      message: String(message),
      ...(typeof detail === "string" && detail ? { detail } : {}),
    };
  }
  return { kind: "other", message: error instanceof Error ? error.message : String(error) };
}
