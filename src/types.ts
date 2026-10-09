/** Tipos compartidos con Rust. Deben coincidir con `src-tauri/src/settings.rs`. */

export type IslandSize = "s" | "m" | "l";
export type IslandPosition = "center" | "left" | "right";
export type LanguageSetting = "auto" | "es" | "ca" | "en";
export type ThemeSetting = "auto" | "light" | "dark";

export type CaptureMode = "screen" | "window";
export type AnswerLength = "short" | "normal" | "long";
export type OutputFolder = "downloads" | "same";

export type ProviderKind =
  | "anthropic"
  | "openai"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "groq"
  | "mistral"
  | "deepseek"
  | "xai"
  | "lmstudio"
  | "custom"
  | "demo";

/** Orden en el que se enseñan los proveedores. */
export const PROVIDERS: ProviderKind[] = [
  "anthropic",
  "openai",
  "gemini",
  "openrouter",
  "groq",
  "mistral",
  "deepseek",
  "xai",
  "ollama",
  "lmstudio",
  "custom",
  "demo",
];

export interface ProviderInfo {
  /** Nombre corto para el chip del modelo. */
  label: string;
  /** Hace falta clave de API. */
  needsKey: boolean;
  /** Admite clave (aunque no la exija). */
  acceptsKey: boolean;
  /** Dónde se consigue la clave. */
  keyUrl?: string;
  /** Cómo empiezan sus claves (para avisar si se pega la de otro). */
  keyPrefixes?: string[];
  /** Tiene opción gratis. */
  free?: boolean;
  /** Funciona en este ordenador, sin internet. */
  local?: boolean;
  /** Color del punto en el chip. */
  color: string;
}

export const PROVIDER_INFO: Record<ProviderKind, ProviderInfo> = {
  anthropic: { label: "Claude", needsKey: true, acceptsKey: true, keyUrl: "https://console.anthropic.com/settings/keys", keyPrefixes: ["sk-ant-"], color: "#D97757" },
  openai: { label: "OpenAI", needsKey: true, acceptsKey: true, keyUrl: "https://platform.openai.com/api-keys", keyPrefixes: ["sk-proj-", "sk-svcacct-", "sk-"], color: "#10A37F" },
  gemini: { label: "Gemini", needsKey: true, acceptsKey: true, keyUrl: "https://aistudio.google.com/apikey", keyPrefixes: ["AIza"], free: true, color: "#4C8DF6" },
  openrouter: { label: "OpenRouter", needsKey: true, acceptsKey: true, keyUrl: "https://openrouter.ai/keys", keyPrefixes: ["sk-or-"], free: true, color: "#8B7CF6" },
  groq: { label: "Groq", needsKey: true, acceptsKey: true, keyUrl: "https://console.groq.com/keys", keyPrefixes: ["gsk_"], free: true, color: "#F55036" },
  mistral: { label: "Mistral", needsKey: true, acceptsKey: true, keyUrl: "https://console.mistral.ai/api-keys", free: true, color: "#FF8205" },
  deepseek: { label: "DeepSeek", needsKey: true, acceptsKey: true, keyUrl: "https://platform.deepseek.com/api_keys", keyPrefixes: ["sk-"], color: "#4D6BFE" },
  xai: { label: "Grok", needsKey: true, acceptsKey: true, keyUrl: "https://console.x.ai", keyPrefixes: ["xai-"], color: "#E5E5E5" },
  ollama: { label: "Ollama", needsKey: false, acceptsKey: false, free: true, local: true, color: "#F2F0EB" },
  lmstudio: { label: "LM Studio", needsKey: false, acceptsKey: false, free: true, local: true, color: "#6E8BFF" },
  custom: { label: "API", needsKey: false, acceptsKey: true, color: "#9A9A9A" },
  demo: { label: "Demo", needsKey: false, acceptsKey: false, free: true, color: "#3DD6D0" },
};

/** ¿De qué proveedor parece esta clave? (`null` si no se sabe o encaja con varios.) */
export function providerForKey(key: string): ProviderKind | null {
  const k = key.trim();
  const specific: [string, ProviderKind][] = [
    ["sk-ant-", "anthropic"],
    ["sk-or-", "openrouter"],
    ["gsk_", "groq"],
    ["xai-", "xai"],
    ["AIza", "gemini"],
    ["sk-proj-", "openai"],
    ["sk-svcacct-", "openai"],
  ];
  for (const [prefix, provider] of specific) if (k.startsWith(prefix)) return provider;
  return null;
}

export type ProviderModels = Record<ProviderKind, string>;

/** Ropa y accesorios de Tico (igual que `OUTFITS` en Rust). */
export const OUTFITS = [
  "none",
  "glasses",
  "headphones",
  "cap",
  "beret",
  "graduation",
  "crown",
  "bow",
  "scarf",
  "wizard",
  "flower",
  "bandana",
] as const;
export type Outfit = (typeof OUTFITS)[number];

/** Un Tico para un tipo de tarea. */
export interface TicoProfile {
  id: string;
  name: string;
  baseColor: string;
  accentColor: string;
  outfit: Outfit;
  /** Instrucciones extra para la IA. */
  instructions: string;
  /** `null`: el proveedor general. */
  provider: ProviderKind | null;
  /** Vacío: el modelo general de ese proveedor. */
  model: string;
}

export interface Settings {
  language: LanguageSetting;
  theme: ThemeSetting;
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
  lmstudioUrl: string;
  customUrl: string;
  answerLength: AnswerLength;
  shortcutCapture: string;
  captureMode: CaptureMode;
  captureConfirm: boolean;
  autoCapture: boolean;
  ocr: boolean;
  blockedApps: string[];
  autostart: boolean;
  ticos: TicoProfile[];
  activeTico: string;
  seasonalOutfits: boolean;
  outputFolder: OutputFolder;
}

/** El Tico de siempre (el primero de la lista). */
export const BASE_TICO: TicoProfile = {
  id: "tico",
  name: "Tico",
  baseColor: "#F2F0EB",
  accentColor: "#3DD6D0",
  outfit: "none",
  instructions: "",
  provider: null,
  model: "",
};

/** Igual que `default_ticos()` en Rust. */
export const DEFAULT_TICOS: TicoProfile[] = [
  BASE_TICO,
  {
    id: "code",
    name: "Tico Código",
    baseColor: "#E9EEF2",
    accentColor: "#7CF29A",
    outfit: "glasses",
    instructions:
      "You are an expert programmer. Give working code in fenced code blocks with the language name, explain briefly why it works, and point out bugs you notice. Prefer simple, modern solutions.",
    provider: null,
    model: "",
  },
  {
    id: "translate",
    name: "Tico Traductor",
    baseColor: "#F4EFE6",
    accentColor: "#FFB84D",
    outfit: "scarf",
    instructions:
      "You are a professional translator. If the user gives you text, translate it: into Spanish if it is in another language, or into English if it is in Spanish, unless they ask for a specific language. Keep the tone and formatting. Give only the translation unless asked for more.",
    provider: null,
    model: "",
  },
  {
    id: "write",
    name: "Tico Escritor",
    baseColor: "#F3ECF7",
    accentColor: "#C59BFF",
    outfit: "beret",
    instructions:
      "You are a writing assistant. Help write, rewrite, shorten and correct texts and emails. Keep the user's voice, fix spelling and grammar, and offer the improved text ready to copy.",
    provider: null,
    model: "",
  },
  {
    id: "teach",
    name: "Tico Profe",
    baseColor: "#EEF3FA",
    accentColor: "#5AB0FF",
    outfit: "graduation",
    instructions:
      "You are a patient teacher. Explain step by step with simple words and a short example, then check understanding with one quick question.",
    provider: null,
    model: "",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  theme: "auto",
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
    openrouter: "openrouter/auto",
    groq: "meta-llama/llama-4-scout-17b-16e-instruct",
    mistral: "mistral-small-latest",
    deepseek: "deepseek-chat",
    xai: "grok-4",
    lmstudio: "",
    custom: "",
    demo: "tico-demo",
  },
  ollamaUrl: "http://localhost:11434",
  lmstudioUrl: "http://localhost:1234/v1",
  customUrl: "",
  answerLength: "normal",
  shortcutCapture: "CommandOrControl+Shift+S",
  captureMode: "screen",
  captureConfirm: true,
  autoCapture: true,
  ocr: true,
  // Igual que `default_blocked_apps()` en Rust.
  blockedApps: [
    "1Password", "Bitwarden", "KeePass", "KeePassXC", "LastPass", "Dashlane", "Keeper",
    "NordPass", "Proton Pass", "Enpass", "Keychain Access", "Acceso a Llaveros",
    "Contraseñas", "Passwords", "Banco", "Bank", "BBVA", "CaixaBank", "Santander",
    "Sabadell", "Bankinter", "Openbank", "Unicaja", "Abanca", "Kutxabank", "ING",
    "Revolut", "N26", "PayPal",
  ],
  autostart: false,
  ticos: DEFAULT_TICOS,
  activeTico: "tico",
  seasonalOutfits: true,
  outputFolder: "downloads",
};

/** El Tico con ese id (o el primero). */
export function findTico(settings: Settings, id: string): TicoProfile {
  return settings.ticos.find((t) => t.id === id) ?? settings.ticos[0] ?? BASE_TICO;
}

/** Proveedor y modelo que usa un Tico (los suyos o los generales). */
export function providerFor(settings: Settings, tico: TicoProfile): { provider: ProviderKind; model: string } {
  const provider = tico.provider ?? settings.provider;
  const model = tico.provider && tico.model ? tico.model : settings.models[provider];
  return { provider, model };
}

/** Rectángulo en px lógicos relativo a la ventana. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Notch del MacBook en px lógicos. */
export interface NotchInfo {
  width: number;
  height: number;
}

export interface IslandInfo {
  platform: string;
  notch: NotchInfo | null;
}

/** Error que devuelven los comandos de Rust (`AppError`). */
export interface AppErrorPayload {
  kind: string;
  message: string;
  /** El dato concreto (proveedor, modelo, motivo…) para meterlo en la frase traducida. */
  detail?: string;
}

/** Eventos del streaming del chat (`ChatEvent` en Rust). */
export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "notice"; kind: "noVision" | "modelChanged" | "retrying"; detail: string }
  | { type: "done" };

/** Miniatura de una captura pendiente de enviar. */
export interface CapturePreview {
  thumbnail: string;
  width: number;
  height: number;
  /** Caracteres leídos con OCR (0 si nada). */
  textChars: number;
}

export type FileKind = "word" | "pdf" | "image" | "sheet" | "slides" | "text" | "code" | "other";

/** Un archivo soltado o elegido (`FileInfo` en Rust). */
export interface FileInfo {
  path: string;
  name: string;
  size: number;
  kind: FileKind;
  canConvert: boolean;
}

/** Resultado de pasar algo a PDF (`ConvertResult` en Rust). */
export interface ConvertResult {
  source: string;
  output: string;
  name: string;
  size: number;
  engine: "word" | "excel" | "powerpoint" | "pages" | "numbers" | "keynote" | "libreoffice" | "tico";
}

/** Lo que se manda a `chat_send`. */
export interface SendOptions {
  tico: string;
  text: string;
  attachCapture: boolean;
  files: string[];
  lang: string;
  now: string;
}
