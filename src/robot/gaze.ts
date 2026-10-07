/**
 * Punto al que mira Tico, en coordenadas de la ventana (las mismas que
 * `getBoundingClientRect`). Lo escribe la isla (con el cursor que manda Rust)
 * o la página de pruebas (con el ratón), y lo lee el bucle de animación.
 */

let point: { x: number; y: number } | null = null;

export function setGaze(x: number, y: number): void {
  point = { x, y };
}

export function clearGaze(): void {
  point = null;
}

export function getGaze(): { x: number; y: number } | null {
  return point;
}

/**
 * Desplazamiento de los ojos (px de pantalla) hacia `target` desde `center`.
 * Crece suave con la distancia y nunca supera `max`.
 */
export function lookOffset(
  center: { x: number; y: number },
  target: { x: number; y: number },
  max: number,
): { x: number; y: number } {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const strength = (max * dist) / (dist + 80);
  return { x: (dx / dist) * strength, y: (dy / dist) * strength };
}
