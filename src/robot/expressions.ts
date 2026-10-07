/**
 * Expresiones de Tico. Tico no tiene boca: todo sale de los ojos y la antena.
 * Cada expresión es una "pose" objetivo; los muelles se encargan de la transición.
 */

export const EXPRESSIONS = [
  "idle",
  "curious",
  "watching",
  "thinking",
  "talking",
  "happy",
  "error",
  "sleeping",
] as const;

export type Expression = (typeof EXPRESSIONS)[number];

export interface Pose {
  /** Inclinación de la cabeza en grados. */
  tilt: number;
  /** Tamaño de los ojos (unidades del viewBox 100×100). */
  eyeWidth: number;
  eyeHeight: number;
  /** 1 = píldora redonda, 0 = rectángulo. */
  eyeRound: number;
  leftScale: number;
  rightScale: number;
  /** Ojos en arco ^ ^ (contento). */
  arcs: boolean;
  /** Línea de escaneo en el visor (mirando la pantalla). */
  scan: boolean;
  /** Hacia dónde miran los ojos. */
  look: "cursor" | "sweep" | "center";
  blink: boolean;
  breathe: boolean;
  antennaPulse: boolean;
  antennaError: boolean;
  zzz: boolean;
}

const BASE: Pose = {
  tilt: 0,
  eyeWidth: 8,
  eyeHeight: 20,
  eyeRound: 1,
  leftScale: 1,
  rightScale: 1,
  arcs: false,
  scan: false,
  look: "cursor",
  blink: true,
  breathe: true,
  antennaPulse: false,
  antennaError: false,
  zzz: false,
};

export const POSES: Record<Expression, Pose> = {
  idle: BASE,
  curious: { ...BASE, tilt: 6, eyeWidth: 9.5, eyeHeight: 23 },
  watching: {
    ...BASE,
    eyeWidth: 13,
    eyeHeight: 12,
    eyeRound: 0.15,
    scan: true,
    look: "center",
    blink: false,
  },
  thinking: { ...BASE, eyeHeight: 17, look: "sweep", antennaPulse: true, blink: false },
  talking: { ...BASE, look: "center" },
  happy: { ...BASE, arcs: true, look: "center", blink: false },
  error: { ...BASE, leftScale: 0.55, antennaError: true, look: "center" },
  sleeping: {
    ...BASE,
    eyeWidth: 11,
    eyeHeight: 2.6,
    tilt: -4,
    look: "center",
    blink: false,
    zzz: true,
  },
};

/** Máximo desplazamiento de los ojos al seguir el cursor, en px de pantalla. */
export const MAX_LOOK_PX = 3;
