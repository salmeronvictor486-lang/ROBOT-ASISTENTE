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
  "love",
  "wink",
  "surprised",
  "dizzy",
  "box",
  "proud",
  "working",
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
  /** Ojos de corazón. */
  hearts: boolean;
  /** Ojos en espiral (mareado). */
  spirals: boolean;
  /** Guiña el ojo derecho. */
  wink: boolean;
  /** Sujeta una caja (cuando le sueltas un archivo encima). */
  box: boolean;
  /** Teclea: los antebrazos suben y bajan deprisa. */
  typing: boolean;
  /** La cabeza se tambalea (mareado). */
  wobble: boolean;
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
  hearts: false,
  spirals: false,
  wink: false,
  box: false,
  typing: false,
  wobble: false,
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
  // Enamorado: ojos de corazón y manos juntas en el pecho.
  love: {
    ...BASE,
    hearts: true,
    tilt: 5,
    look: "center",
    blink: false,
    leftArm: { shoulder: 30, elbow: -95 },
    rightArm: { shoulder: 30, elbow: -95 },
    sway: 3,
    fidgets: false,
  },
  // Guiño: un ojo cerrado y el pulgar arriba.
  wink: {
    ...BASE,
    wink: true,
    tilt: -5,
    look: "center",
    blink: false,
    rightArm: { shoulder: 120, elbow: 70 },
    sway: 2,
    fidgets: false,
  },
  // Sorprendido: ojos redondos y grandes, brazos abiertos.
  surprised: {
    ...BASE,
    eyeWidth: 11,
    eyeHeight: 12.5,
    look: "center",
    blink: false,
    leftArm: { shoulder: 62, elbow: 40 },
    rightArm: { shoulder: 62, elbow: 40 },
    sway: 0,
    fidgets: false,
  },
  // Mareado (3 clics seguidos): ojos en espiral y cabeza que se tambalea.
  dizzy: {
    ...BASE,
    spirals: true,
    wobble: true,
    look: "center",
    blink: false,
    leftArm: { shoulder: 38, elbow: 60 },
    rightArm: { shoulder: 50, elbow: 20 },
    sway: 10,
    fidgets: false,
  },
  // Con una caja: le estás soltando un archivo y lo recoge.
  box: {
    ...BASE,
    box: true,
    eyeWidth: 8.5,
    eyeHeight: 16.5,
    tilt: 0,
    look: "center",
    leftArm: { shoulder: 46, elbow: -78 },
    rightArm: { shoulder: 46, elbow: -78 },
    sway: 0,
    fidgets: false,
  },
  // Orgulloso: ojos ^ ^ y manos en la cintura.
  proud: {
    ...BASE,
    arcs: true,
    tilt: -3,
    look: "center",
    blink: false,
    leftArm: { shoulder: 48, elbow: -120 },
    rightArm: { shoulder: 48, elbow: -120 },
    sway: 0,
    fidgets: false,
  },
  // Trabajando (convirtiendo un archivo): mira hacia abajo y teclea.
  working: {
    ...BASE,
    eyeWidth: 9,
    eyeHeight: 9,
    eyeRound: 0.6,
    look: "center",
    antennaPulse: true,
    blink: true,
    typing: true,
    leftArm: { shoulder: 38, elbow: -60 },
    rightArm: { shoulder: 38, elbow: -60 },
    sway: 0,
    fidgets: false,
  },
};

/**
 * Ropa de temporada si el Tico no lleva nada: gorro de Papá Noel en Navidad y sombrero
 * de bruja por Halloween.
 */
export function seasonalOutfit(date: Date): "santa" | "witch" | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if ((m === 12 && d >= 10) || (m === 1 && d <= 6)) return "santa";
  if ((m === 10 && d >= 25) || (m === 11 && d <= 1)) return "witch";
  return null;
}

/** Máximo desplazamiento de los ojos al seguir el cursor, en px de pantalla. */
export const MAX_LOOK_PX = 3;
