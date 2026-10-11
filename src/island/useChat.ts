import { useCallback, useEffect, useRef, useState } from "react";
import { api, Channel, isTauri, onEvent, toAppError } from "../lib/tauri";
import type { AppErrorPayload, ChatEvent, ConvertResult, FileInfo } from "../types";
import { chatKey } from "../workspaces";

export interface Notice {
  kind: "noVision" | "modelChanged" | "retrying";
  detail: string;
}

/** Una conversión a PDF hecha por Tico (sin IA). */
export interface PdfTask {
  status: "working" | "done" | "error";
  /** Nombre del archivo de origen. */
  source: string;
  result?: ConvertResult;
  error?: AppErrorPayload;
}

export interface UiMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Miniatura de la captura enviada con el mensaje (data URL). */
  thumbnail?: string;
  /** Llevaba captura, pero viene de la base de datos (la imagen no se guarda). */
  capture?: boolean;
  /** Archivos enviados con el mensaje. */
  files?: FileInfo[];
  error?: AppErrorPayload;
  notices?: Notice[];
  task?: PdfTask;
}

export type ChatPhase = "idle" | "thinking" | "talking";

export interface SendExtras {
  capture?: { thumbnail: string };
  files?: FileInfo[];
}

export interface ChatApi {
  /** Mensajes del Tico activo en el espacio activo. */
  messages: UiMessage[];
  phase: ChatPhase;
  /** Conversación ("espacio/tico") que está respondiendo ahora (o `null`). */
  busyTico: string | null;
  /** Sube con cada token: hace rebotar los ojos de Tico. */
  tokens: number;
  /** Momento del último error / de la última respuesta terminada (para las expresiones). */
  errorAt: number;
  doneAt: number;
  send: (text: string, extras?: SendExtras) => Promise<void>;
  cancel: () => void;
  /** Borra la conversación del Tico activo. */
  clear: () => void;
  /** Muestra un error de Tico (p. ej. de la captura) como si fuera su respuesta. */
  notify: (error: AppErrorPayload) => void;
  /** Añade el mensaje del usuario y una tarjeta de "convirtiendo…"; devuelve su id. */
  startTask: (userText: string, source: string, files?: FileInfo[]) => number;
  finishTask: (id: number, outcome: { result: ConvertResult } | { error: AppErrorPayload }) => void;
  /** ¿Tiene conversación este Tico en el espacio activo? */
  hasMessages: (tico: string) => boolean;
}

/** El mensaje sin el aviso de "reintentando" (ya no hace falta cuando acaba). */
function dropRetrying(m: UiMessage): UiMessage {
  const copy = { ...m };
  const kept = m.notices?.filter((n) => n.kind !== "retrying") ?? [];
  if (kept.length) copy.notices = kept;
  else delete copy.notices;
  return copy;
}

/** Fecha y hora locales, para que la IA sepa qué día es. */
function localNow(lang: string): string {
  try {
    return new Date().toLocaleString(lang, { dateStyle: "full", timeStyle: "short" });
  } catch {
    return new Date().toString();
  }
}

/**
 * Estado del chat en la isla: una conversación por Tico y espacio de trabajo. El historial
 * "de verdad" (lo que se manda a la IA) lo guarda Rust en memoria.
 */
export function useChat(ticoId: string, workspaceId: string, lang: string): ChatApi {
  // Clave de la conversación visible: los mensajes se guardan por "espacio/tico".
  const current = chatKey(workspaceId, ticoId);
  const [byTico, setByTico] = useState<Record<string, UiMessage[]>>({});
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [busyTico, setBusyTico] = useState<string | null>(null);
  const [tokens, setTokens] = useState(0);
  const [errorAt, setErrorAt] = useState(0);
  const [doneAt, setDoneAt] = useState(0);
  const nextId = useRef(1);
  // Cada envío tiene su número: un envío viejo (cancelado) no toca el estado del nuevo.
  const seq = useRef(0);

  const patch = useCallback((tico: string, id: number, fn: (m: UiMessage) => UiMessage) => {
    setByTico((all) => ({
      ...all,
      [tico]: (all[tico] ?? []).map((m) => (m.id === id ? fn(m) : m)),
    }));
  }, []);

  const append = useCallback((tico: string, ...messages: UiMessage[]) => {
    setByTico((all) => ({ ...all, [tico]: [...(all[tico] ?? []), ...messages] }));
  }, []);

  // Se han borrado todas las conversaciones desde Ajustes.
  useEffect(
    () =>
      onEvent("chat://cleared", () => {
        seq.current++;
        setByTico({});
        setPhase("idle");
        setBusyTico(null);
      }),
    [],
  );

  // La primera vez que se abre una conversación, traemos lo guardado en la base de datos.
  const loaded = useRef(new Set<string>());
  useEffect(() => {
    if (!isTauri() || loaded.current.has(current)) return;
    loaded.current.add(current);
    let alive = true;
    let done = false;
    api
      .chatHistory(workspaceId, ticoId)
      .then((saved) => {
        if (!alive) return;
        done = true;
        if (saved.length === 0) return;
        const restored: UiMessage[] = saved.map((m) => ({
          id: nextId.current++,
          role: m.role,
          text: m.text,
          ...(m.files.length ? { files: m.files } : {}),
          ...(m.capture ? { capture: true } : {}),
        }));
        // Va delante de lo que se haya escrito mientras cargaba.
        setByTico((all) => ({ ...all, [current]: [...restored, ...(all[current] ?? [])] }));
      })
      .catch((e: unknown) => {
        console.error(e);
        if (alive) loaded.current.delete(current);
      });
    const seen = loaded.current;
    return () => {
      alive = false;
      // Si se cambia de conversación antes de que llegue, se volverá a pedir.
      if (!done) seen.delete(current);
    };
  }, [current, ticoId, workspaceId]);

  const send = useCallback(
    async (text: string, extras: SendExtras = {}) => {
      const tico = current;
      const mySeq = ++seq.current;
      const userId = nextId.current++;
      const replyId = nextId.current++;
      append(
        tico,
        {
          id: userId,
          role: "user",
          text,
          ...(extras.capture ? { thumbnail: extras.capture.thumbnail } : {}),
          ...(extras.files?.length ? { files: extras.files } : {}),
        },
        { id: replyId, role: "assistant", text: "" },
      );
      setPhase("thinking");
      setBusyTico(tico);

      if (!isTauri()) {
        patch(tico, replyId, (m) => ({ ...m, text: "(En el navegador no hay IA: abre Tico con `npm run tauri dev`.)" }));
        setPhase("idle");
        setBusyTico(null);
        return;
      }

      const channel = new Channel<ChatEvent>();
      channel.onmessage = (event) => {
        if (seq.current !== mySeq) return;
        if (event.type === "token") {
          setPhase("talking");
          setTokens((n) => n + 1);
          patch(tico, replyId, (m) => ({ ...m, text: m.text + event.text }));
        } else if (event.type === "notice") {
          const notice: Notice = { kind: event.kind, detail: event.detail };
          patch(tico, replyId, (m) => ({
            ...m,
            // "Reintentando" se sustituye por el último; los demás se acumulan.
            notices: [...(m.notices ?? []).filter((n) => n.kind !== "retrying" || notice.kind !== "retrying"), notice],
          }));
        }
      };

      try {
        await api.chatSend(
          {
            tico: ticoId,
            workspace: workspaceId,
            text,
            attachCapture: Boolean(extras.capture),
            files: (extras.files ?? []).map((f) => f.path),
            lang,
            now: localNow(lang),
          },
          channel,
        );
        if (seq.current === mySeq) {
          setDoneAt(Date.now());
          // Ya respondió: el aviso de "reintentando" sobra.
          patch(tico, replyId, dropRetrying);
        }
      } catch (e) {
        const error = toAppError(e);
        patch(tico, replyId, (m) => ({ ...dropRetrying(m), error }));
        if (seq.current === mySeq) setErrorAt(Date.now());
      } finally {
        if (seq.current === mySeq) {
          setPhase("idle");
          setBusyTico(null);
        }
      }
    },
    [append, current, lang, patch, ticoId, workspaceId],
  );

  const cancel = useCallback(() => {
    seq.current++;
    setPhase("idle");
    setBusyTico(null);
    if (isTauri()) void api.chatCancel().catch(console.error);
  }, []);

  const clear = useCallback(() => {
    seq.current++;
    setByTico((all) => ({ ...all, [current]: [] }));
    setPhase("idle");
    setBusyTico(null);
    if (isTauri()) void api.chatClear(ticoId, workspaceId).catch(console.error);
  }, [current, ticoId, workspaceId]);

  const notify = useCallback(
    (error: AppErrorPayload) => {
      append(current, { id: nextId.current++, role: "assistant", text: "", error });
      setErrorAt(Date.now());
    },
    [append, current],
  );

  const startTask = useCallback(
    (userText: string, source: string, files?: FileInfo[]) => {
      const id = nextId.current++;
      const task: UiMessage = { id, role: "assistant", text: "", task: { status: "working", source } };
      if (userText) {
        append(current, { id: nextId.current++, role: "user", text: userText, ...(files?.length ? { files } : {}) }, task);
      } else {
        append(current, task);
      }
      return id;
    },
    [append, current],
  );

  const finishTask = useCallback(
    (id: number, outcome: { result: ConvertResult } | { error: AppErrorPayload }) => {
      // La tarea puede ser de cualquier Tico: la buscamos en todos.
      setByTico((all) => {
        const next: Record<string, UiMessage[]> = {};
        for (const [tico, list] of Object.entries(all)) {
          next[tico] = list.map((m) => {
            if (m.id !== id || !m.task) return m;
            return "result" in outcome
              ? { ...m, task: { ...m.task, status: "done", result: outcome.result } }
              : { ...m, task: { ...m.task, status: "error", error: outcome.error } };
          });
        }
        return next;
      });
      if ("result" in outcome) setDoneAt(Date.now());
      else setErrorAt(Date.now());
    },
    [],
  );

  const hasMessages = useCallback(
    (tico: string) => (byTico[chatKey(workspaceId, tico)]?.length ?? 0) > 0,
    [byTico, workspaceId],
  );

  return {
    messages: byTico[current] ?? [],
    phase,
    busyTico,
    tokens,
    errorAt,
    doneAt,
    send,
    cancel,
    clear,
    notify,
    startTask,
    finishTask,
    hasMessages,
  };
}

/** Clave de traducción para un error de Rust. */
export function errorKey(error: AppErrorPayload) {
  switch (error.kind) {
    case "missingKey":
    case "invalidKey":
    case "rateLimited":
    case "noCredit":
    case "overloaded":
    case "timeout":
    case "network":
    case "ollamaOffline":
    case "serverOffline":
    case "missingUrl":
    case "model":
    case "noVision":
    case "tooLarge":
    case "refused":
    case "keyring":
    case "blocked":
    case "screenPermission":
    case "capture":
    case "file":
    case "convert":
    case "noDocument":
    case "database":
      return `error.${error.kind}` as const;
    default:
      return "error.other" as const;
  }
}

/** Variables para traducir un error: el mensaje completo y el dato concreto. */
export function errorVars(error: AppErrorPayload): Record<string, string> {
  return { message: error.message, detail: error.detail ?? error.message };
}
