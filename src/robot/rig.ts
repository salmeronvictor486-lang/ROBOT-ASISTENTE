/**
 * Esqueleto de Tico: dónde están los hombros y cuánto miden los brazos (viewBox 100×100),
 * y la cinemática directa para calcular codo y mano a partir de los ángulos.
 */

export const SHOULDER_L = { x: 36, y: 71 };
export const SHOULDER_R = { x: 64, y: 71 };
export const UPPER_ARM = 12.5;
export const FOREARM = 11.5;

export interface Point {
  x: number;
  y: number;
}

const RAD = Math.PI / 180;

/**
 * Dirección de un segmento: 0° = hacia abajo, 90° = hacia fuera, 180° = hacia arriba.
 * "Hacia fuera" es a la izquierda para el brazo izquierdo y a la derecha para el derecho.
 */
export function direction(side: "left" | "right", degrees: number): Point {
  const sign = side === "left" ? -1 : 1;
  return { x: sign * Math.sin(degrees * RAD), y: Math.cos(degrees * RAD) };
}

/** Posición del codo y de la mano. */
export function armJoints(
  side: "left" | "right",
  shoulderDeg: number,
  elbowDeg: number,
): { shoulder: Point; elbow: Point; hand: Point } {
  const shoulder = side === "left" ? SHOULDER_L : SHOULDER_R;
  const upper = direction(side, shoulderDeg);
  const elbow = { x: shoulder.x + upper.x * UPPER_ARM, y: shoulder.y + upper.y * UPPER_ARM };
  const fore = direction(side, shoulderDeg + elbowDeg);
  const hand = { x: elbow.x + fore.x * FOREARM, y: elbow.y + fore.y * FOREARM };
  return { shoulder, elbow, hand };
}
