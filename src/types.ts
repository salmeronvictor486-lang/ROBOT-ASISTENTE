/** Tipos compartidos con Rust. Deben coincidir con `src-tauri/src/settings.rs`. */

export type IslandSize = "s" | "m" | "l";
export type IslandPosition = "center" | "left" | "right";
export type LanguageSetting = "auto" | "es" | "ca" | "en";
export type ThemeSetting = "auto" | "light" | "dark";

export type CaptureMode = "screen" | "window";

export type ProviderKind = "anthropic" | "openai" | "gemini" | "ollama";
export const PROVIDERS: ProviderKind[] = ["anthropic", "openai", "gemini", "ollama"];

export type ProviderModels = Record<ProviderKind, string>;

export interface Settings {
  language: LanguageSetting;
  theme: ThemeSetting;
  robotBaseColor: string;
  robotAccentColor: string;
  islandSize: IslandSize;
  islandPosition: IslandPosition;
  activationWidth: number;
  showDelayMs: number;
  hideDelayMs: number;
  followCursorMonitor: boolean;
  hideOnFullscreen: boolean;
  shortcutOpen: string;
  sounds: boolean;
  provider: ProviderKind;
  models: ProviderModels;
  ollamaUrl: string;
  shortcutCapture: string;
  captureMode: CaptureMode;
  captureConfirm: boolean;
  blockedApps: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  theme: "auto",
  robotBaseColor: "#F2F0EB",
  robotAccentColor: "#3DD6D0",
  islandSize: "m",
  islandPosition: "center",
  activationWidth: 400,
  showDelayMs: 150,
  hideDelayMs: 600,
  followCursorMonitor: true,
  hideOnFullscreen: true,
  shortcutOpen: "CommandOrControl+Shift+Space",
  sounds: true,
  provider: "anthropic",
  models: {
    anthropic: "claude-haiku-4-5",
    openai: "gpt-4.1-mini",
    gemini: "gemini-2.5-flash",
    ollama: "gemma3",
  },
  ollamaUrl: "http://localhost:11434",
  shortcutCapture: "CommandOrControl+Shift+S",
  captureMode: "screen",
  captureConfirm: true,
  // Igual que `default_blocked_apps()` en Rust.
  blockedApps: [
    "1Password", "Bitwarden", "KeePass", "KeePassXC", "LastPass", "Dashlane", "Keeper",
    "NordPass", "Proton Pass", "Enpass", "Keychain Access", "Acceso a Llaveros",
    "Contraseñas", "Passwords", "Banco", "Bank", "BBVA", "CaixaBank", "Santander",
    "Sabadell", "Bankinter", "Openbank", "Unicaja", "Abanca", "Kutxabank", "ING",
    "Revolut", "N26", "PayPal",
  ],
};

/** Rectángulo en px lógicos relativo a la ventana. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IslandInfo {
  platform: string;
  notchWidth: number | null;
}

/** Error que devuelven los comandos de Rust (`AppError`). */
export interface AppErrorPayload {
  kind: string;
  message: string;
}

/** Eventos del streaming del chat (`ChatEvent` en Rust). */
export type ChatEvent = { type: "token"; text: string } | { type: "done" };

/** Miniatura de una captura pendiente de enviar. */
export interface CapturePreview {
  thumbnail: string;
  width: number;
  height: number;
}
