import type { Expression } from "../robot/expressions";

/**
 * Lo que contesta la isla de la web. Es una demo: el visitante elige una pregunta y Tico
 * "piensa", responde a trozos (como el streaming de la app) y pone la cara que toca.
 * `replyFrame` es puro (pregunta + milisegundos → lo que se ve), así se puede probar.
 */

export interface Reply {
  id: string;
  question: string;
  answer: string;
  /** Cara mientras trabaja. */
  working: Expression;
  /** Cara al terminar. */
  done: Expression;
  /** Hace como que captura la pantalla (un destello sobre la página). */
  capture?: boolean;
}

export const REPLIES: Reply[] = [
  {
    id: "screen",
    question: "¿Qué ves en mi pantalla?",
    answer:
      "Veo la web de Tico: un titular grande, el botón negro para descargar y a mí, en grande, mirándote.",
    working: "watching",
    done: "happy",
    capture: true,
  },
  {
    id: "pdf",
    question: "Pásame este Word a PDF",
    answer: "Hecho. **Informe.pdf** ya está en Descargas. Lo he pasado con Word, sin gastar IA.",
    working: "working",
    done: "proud",
  },
  {
    id: "music",
    question: "Pon la siguiente canción",
    answer: "Ahora suena **Lluvia en Kioto** en Spotify. Si quieres, subo un poco el volumen.",
    working: "curious",
    done: "happy",
  },
  {
    id: "memory",
    question: "Recuerda que estudio Derecho",
    answer: "Apuntado. Lo tendré en cuenta en **todas** las conversaciones.",
    working: "thinking",
    done: "love",
  },
];

/** Lo que tarda en "pensar" antes del primer trozo. */
export const THINK_MS = 900;
/** Milisegundos por carácter mientras escribe. */
export const CHAR_MS = 24;
/** Cuándo empieza y cuánto dura el destello de la captura. */
const CAPTURE_FROM = 150;
const CAPTURE_MS = 420;

export type ReplyPhase = "thinking" | "typing" | "done";

export interface ReplyFrame {
  phase: ReplyPhase;
  text: string;
  expression: Expression;
  capturing: boolean;
  /** Trozos recibidos: Tico rebota con cada uno. */
  chunks: number;
}

export function replyDuration(reply: Reply): number {
  return THINK_MS + [...reply.answer].length * CHAR_MS;
}

export function replyFrame(reply: Reply, ms: number): ReplyFrame {
  const chars = [...reply.answer];
  const capturing = Boolean(reply.capture) && ms >= CAPTURE_FROM && ms < CAPTURE_FROM + CAPTURE_MS;
  if (ms < THINK_MS) {
    return { phase: "thinking", text: "", expression: reply.working, capturing, chunks: 0 };
  }
  const shown = Math.min(chars.length, Math.floor((ms - THINK_MS) / CHAR_MS));
  if (shown >= chars.length) {
    return { phase: "done", text: reply.answer, expression: reply.done, capturing: false, chunks: Math.ceil(chars.length / 4) };
  }
  return {
    phase: "typing",
    text: chars.slice(0, shown).join(""),
    expression: "talking",
    capturing,
    chunks: Math.floor(shown / 4),
  };
}

/** Preguntas para ofrecer: primero las que aún no se han hecho. */
export function nextSuggestions(asked: readonly string[], count = 3): Reply[] {
  const fresh = REPLIES.filter((r) => !asked.includes(r.id));
  return (fresh.length > 0 ? fresh : REPLIES).slice(0, count);
}

/** `**negrita**` → trozos para pintar sin HTML. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split("**")
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}
