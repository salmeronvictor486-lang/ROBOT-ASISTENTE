import type { Expression } from "../robot/expressions";

/**
 * Guion de la isla de demostración de la web: baja, crece, se abre, responde y se va.
 * `demoFrame(t)` es puro (segundos desde el inicio → lo que se ve), así se puede probar.
 */

export type DemoState = "hidden" | "peek" | "compact" | "expanded";

export interface DemoScene {
  question: string;
  answer: string;
  /** Expresión mientras "trabaja" (antes de responder). */
  working: Expression;
  /** Expresión al terminar. */
  done: Expression;
  /** Hace como que captura la pantalla. */
  capture?: boolean;
}

export const SCENES: DemoScene[] = [
  {
    question: "¿Qué ves en mi pantalla?",
    answer: "Veo **Ventas 2026**: el T3 cae un **12 %**. Empezaría por Marketing, que es lo que más baja.",
    working: "watching",
    done: "happy",
    capture: true,
  },
  {
    question: "Pásame este Word a PDF",
    answer: "Hecho. **Informe.pdf** ya está en Descargas, sin gastar IA.",
    working: "working",
    done: "proud",
  },
  {
    question: "Recuerda que estudio Derecho",
    answer: "Apuntado. Lo tendré en cuenta en **todas** nuestras conversaciones.",
    working: "thinking",
    done: "love",
  },
];

/** Duración de cada escena (s). */
export const SCENE_SECONDS = 9.4;

const T = {
  peek: 0.9,
  compact: 1.8,
  expanded: 2.6,
  askStart: 2.9,
  askEnd: 3.9,
  answerStart: 4.9,
  answerEnd: 6.7,
  hide: 8.6,
} as const;

export interface DemoFrame {
  scene: number;
  state: DemoState;
  expression: Expression;
  question: string;
  answer: string;
  capturing: boolean;
  /** Trozos de respuesta recibidos (para que Tico rebote con cada uno). */
  chunks: number;
}

/** Parte de `text` que se ve a medio escribir entre `start` y `end`. */
function typed(text: string, t: number, start: number, end: number): string {
  if (t <= start) return "";
  if (t >= end) return text;
  const chars = [...text];
  return chars.slice(0, Math.round((chars.length * (t - start)) / (end - start))).join("");
}

export function demoFrame(time: number): DemoFrame {
  const total = SCENE_SECONDS * SCENES.length;
  const loop = ((time % total) + total) % total;
  const index = Math.min(Math.floor(loop / SCENE_SECONDS), SCENES.length - 1);
  const scene = SCENES[index] as DemoScene;
  const t = loop - index * SCENE_SECONDS;

  let state: DemoState = "hidden";
  if (t >= T.hide) state = "hidden";
  else if (t >= T.expanded) state = "expanded";
  else if (t >= T.compact) state = "compact";
  else if (t >= T.peek) state = "peek";

  let expression: Expression = "idle";
  if (t >= T.answerEnd) expression = scene.done;
  else if (t >= T.answerStart) expression = "talking";
  else if (t >= T.askEnd) expression = scene.working;
  else if (t >= T.peek) expression = "curious";

  const answer = typed(scene.answer, t, T.answerStart, T.answerEnd);
  return {
    scene: index,
    state,
    expression,
    question: typed(scene.question, t, T.askStart, T.askEnd),
    answer,
    capturing: Boolean(scene.capture) && t >= T.askEnd && t < T.askEnd + 0.5,
    chunks: Math.floor([...answer].length / 4),
  };
}

/** El último fotograma de una escena, ya respondida (para "reducir movimiento"). */
export function restingFrame(index: number): DemoFrame {
  return demoFrame(index * SCENE_SECONDS + T.hide - 0.1);
}

export function sameFrame(a: DemoFrame, b: DemoFrame): boolean {
  return (
    a.scene === b.scene &&
    a.state === b.state &&
    a.expression === b.expression &&
    a.question === b.question &&
    a.answer === b.answer &&
    a.capturing === b.capturing
  );
}

/** `**negrita**` → trozos para pintar sin HTML. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split("**")
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}
