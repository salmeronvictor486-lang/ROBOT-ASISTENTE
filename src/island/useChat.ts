import { useCallback, useRef, useState } from "react";
import { api, Channel, isTauri, toAppError } from "../lib/tauri";
import type { AppErrorPayload, ChatEvent } from "../types";

export interface UiMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Miniatura de la captura enviada con el mensaje (data URL). */
  thumbnail?: string;
  error?: AppErrorPayload;
}

export type ChatPhase = "idle" | "thinking" | "talking";

export interface ChatApi {
  messages: UiMessage[];
  phase: ChatPhase;
  /** Sube con cada token: hace rebotar los ojos de Tico. */
  tokens: number;
  /** Momento del último error / de la última respuesta terminada (para las expresiones). */
  errorAt: number;
  doneAt: number;
  send: (text: string, capture?: { thumbnail: string }) => Promise<void>;
  cancel: () => void;
  clear: () => void;
  /** Muestra un error de Tico (p. ej. de la captura) como si fuera su respuesta. */
  notify: (error: AppErrorPayload) => void;
}

/** Estado del chat en la isla. El historial "de verdad" lo guarda Rust en memoria. */
export function useChat(): ChatApi {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [tokens, setTokens] = useState(0);
  const [errorAt, setErrorAt] = useState(0);
  const [doneAt, setDoneAt] = useState(0);
  const nextId = useRef(1);
  // Cada envío tiene su número: un envío viejo (cancelado) no toca el estado del nuevo.
  const seq = useRef(0);

  const send = useCallback(async (text: string, capture?: { thumbnail: string }) => {
    const mySeq = ++seq.current;
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text, ...(capture ? { thumbnail: capture.thumbnail } : {}) },
      { id: replyId, role: "assistant", text: "" },
    ]);
    setPhase("thinking");

    const patchReply = (patch: (msg: UiMessage) => UiMessage) =>
      setMessages((m) => m.map((msg) => (msg.id === replyId ? patch(msg) : msg)));

    if (!isTauri()) {
      patchReply((msg) => ({ ...msg, text: "(En el navegador no hay IA: abre Tico con `npm run tauri dev`.)" }));
      setPhase("idle");
      return;
    }

    const channel = new Channel<ChatEvent>();
    channel.onmessage = (event) => {
      if (event.type !== "token" || seq.current !== mySeq) return;
      setPhase("talking");
      setTokens((n) => n + 1);
      patchReply((msg) => ({ ...msg, text: msg.text + event.text }));
    };

    try {
      await api.chatSend(text, Boolean(capture), channel);
      if (seq.current === mySeq) setDoneAt(Date.now());
    } catch (e) {
      const error = toAppError(e);
      patchReply((msg) => ({ ...msg, error }));
      if (seq.current === mySeq) setErrorAt(Date.now());
    } finally {
      if (seq.current === mySeq) setPhase("idle");
    }
  }, []);

  const cancel = useCallback(() => {
    seq.current++;
    setPhase("idle");
    if (isTauri()) void api.chatCancel().catch(console.error);
  }, []);

  const clear = useCallback(() => {
    seq.current++;
    setMessages([]);
    setPhase("idle");
    if (isTauri()) void api.chatClear().catch(console.error);
  }, []);

  const notify = useCallback((error: AppErrorPayload) => {
    const id = nextId.current++;
    setMessages((m) => [...m, { id, role: "assistant", text: "", error }]);
    setErrorAt(Date.now());
  }, []);

  return { messages, phase, tokens, errorAt, doneAt, send, cancel, clear, notify };
}

/** Clave de traducción para un error de Rust. */
export function errorKey(error: AppErrorPayload) {
  switch (error.kind) {
    case "missingKey":
    case "invalidKey":
    case "rateLimited":
    case "network":
    case "ollamaOffline":
    case "model":
    case "refused":
    case "keyring":
    case "blocked":
    case "screenPermission":
    case "capture":
      return `error.${error.kind}` as const;
    default:
      return "error.other" as const;
  }
}
