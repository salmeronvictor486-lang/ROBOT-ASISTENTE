/**
 * Expresiones de Tico. No tiene boca: se expresa con los ojos, la antena, la cabeza
 * y los brazos. Cada expresión es una "pose" objetivo; los muelles hacen la transición,
 * así que cambiar de una a otra siempre es suave y se puede interrumpir.
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

/**
 * Pose de un brazo en grados. `shoulder`: 0 = colgando, 90 = en horizontal hacia fuera,
 * 180 = hacia arriba. `elbow`: cuánto gira el antebrazo respecto al brazo
 * (positivo = hacia fuera/arriba, negativo = hacia el cuerpo).
 */
export interface ArmPose {
  shoulder: number;
  elbow: number;
}

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
  /** Respiración (1 = normal; dormido respira más lento y más hondo). */
  breathe: number;
  antennaPulse: boolean;
  antennaError: boolean;
  zzz: boolean;
  leftArm: ArmPose;
  rightArm: ArmPose;
  /** Cuánto se balancean los brazos solos (grados). */
  sway: number;
  /** Gesticula con los brazos a cada token que llega. */
  gestures: boolean;
  /** Hace cosas por su cuenta (mirar alrededor, estirarse, saludar…). */
  fidgets: boolean;
}

const RELAXED: ArmPose = { shoulder: 14, elbow: 14 };

const BASE: Pose = {
  tilt: 0,
  eyeWidth: 7,
  eyeHeight: 15,
  eyeRound: 1,
  leftScale: 1,
  rightScale: 1,
  arcs: false,
  scan: false,
  look: "cursor",
  blink: true,
  breathe: 1,
  antennaPulse: false,
  antennaError: false,
  zzz: false,
  leftArm: RELAXED,
  rightArm: RELAXED,
  sway: 4,
  gestures: false,
  fidgets: true,
};

export const POSES: Record<Expression, Pose> = {
  idle: BASE,
  // "¿Hm?": cabeza ladeada, ojos grandes y una mano levantada junto a la cabeza.
  curious: {
    ...BASE,
    tilt: 6,
    eyeWidth: 8.5,
    eyeHeight: 17.5,
    rightArm: { shoulder: 150, elbow: 30 },
    sway: 2,
  },
  // Mirando la pantalla: ojos cuadrados, escáner en el visor y manos como prismáticos.
  watching: {
    ...BASE,
    eyeWidth: 11,
    eyeHeight: 9,
    eyeRound: 0.15,
    scan: true,
    look: "center",
    blink: false,
    leftArm: { shoulder: 165, elbow: 75 },
    rightArm: { shoulder: 165, elbow: 75 },
    sway: 0,
    fidgets: false,
  },
  // Pensando: mano en la barbilla, la otra en la tripa, mirada que va y viene.
  thinking: {
    ...BASE,
    tilt: -4,
    eyeHeight: 12,
    look: "sweep",
    antennaPulse: true,
    blink: false,
    leftArm: { shoulder: 20, elbow: -105 },
    rightArm: { shoulder: 165, elbow: 85 },
    sway: 0,
    fidgets: false,
  },
  // Hablando: brazos sueltos que gesticulan con cada palabra.
  talking: {
    ...BASE,
    look: "center",
    leftArm: { shoulder: 24, elbow: 30 },
    rightArm: { shoulder: 24, elbow: 30 },
    gestures: true,
    fidgets: false,
  },
  // Contento: ojos ^ ^ y brazos arriba celebrando.
  happy: {
    ...BASE,
    arcs: true,
    look: "center",
    blink: false,
    leftArm: { shoulder: 112, elbow: 26 },
    rightArm: { shoulder: 112, elbow: 26 },
    sway: 6,
    fidgets: false,
  },
  // Error: un ojo más pequeño, antena roja y encogimiento de hombros.
  error: {
    ...BASE,
    tilt: -3,
    leftScale: 0.55,
    antennaError: true,
    look: "center",
    leftArm: { shoulder: 70, elbow: 80 },
    rightArm: { shoulder: 70, elbow: 80 },
    sway: 0,
    fidgets: false,
  },
  // Dormido: ojos en línea, cabeza caída, brazos sueltos y respiración lenta.
  sleeping: {
    ...BASE,
    eyeWidth: 9,
    eyeHeight: 2.2,
    tilt: -7,
    look: "center",
    blink: false,
    breathe: 0.45,
    zzz: true,
    leftArm: { shoulder: 4, elbow: 2 },
    rightArm: { shoulder: 4, elbow: 2 },
    sway: 0,
    fidgets: false,
  },
};

/** Máximo desplazamiento de los ojos al seguir el cursor, en px de pantalla. */
export const MAX_LOOK_PX = 3;
