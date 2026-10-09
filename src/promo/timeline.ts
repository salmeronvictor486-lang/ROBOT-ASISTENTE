/**
 * Utilidades de la línea de tiempo del anuncio. Todo se calcula a partir de `t`
 * (segundos desde el inicio), así cada fotograma es reproducible.
 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Progreso 0→1 de `t` dentro del tramo [start, end]. */
export function progress(t: number, start: number, end: number): number {
  return clamp01((t - start) / (end - start));
}

/** Curvas de animación (easing). */
export const ease = {
  outCubic: (x: number) => 1 - (1 - x) ** 3,
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  /** Con un pequeño rebote al final (como un muelle). */
  outBack: (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  },
};

/** Interpola entre a y b. */
export const mix = (a: number, b: number, x: number) => a + (b - a) * x;

/**
 * Opacidad de un elemento que aparece en `start`, se queda y desaparece en `end`,
 * con fundidos de `fade` segundos.
 */
export function inOut(t: number, start: number, end: number, fade = 0.4): number {
  return Math.min(progress(t, start, start + fade), 1 - progress(t, end - fade, end));
}

/** Texto que se escribe letra a letra entre start y end. */
export function typed(text: string, t: number, start: number, end: number): string {
  const n = Math.round(text.length * progress(t, start, end));
  return text.slice(0, n);
}
