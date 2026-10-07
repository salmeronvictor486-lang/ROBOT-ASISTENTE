/**
 * Muelle (spring) amortiguado propio, sin librerías.
 *
 * Cada fotograma acercamos `value` a `target` con una fuerza proporcional a la
 * distancia (rigidez) y frenamos con una fuerza proporcional a la velocidad
 * (amortiguación). Así las animaciones se ven físicas y se pueden interrumpir.
 */

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
  /** Distancia y velocidad por debajo de las cuales damos el muelle por parado. */
  precision?: number;
}

export interface SpringState {
  value: number;
  velocity: number;
}

export const SPRINGS = {
  /** Cambios de tamaño de la isla: rápidos y casi sin rebote. */
  snappy: { stiffness: 380, damping: 32 },
  /** Movimientos suaves (inclinación de la cabeza, mirada). */
  gentle: { stiffness: 170, damping: 22 },
  /** Con rebote (saltos, ojos al hablar). */
  bouncy: { stiffness: 300, damping: 14 },
} satisfies Record<string, SpringConfig>;

/** Paso máximo de integración: con pasos grandes el muelle se vuelve inestable. */
const MAX_SUBSTEP = 1 / 120;

/** Avanza el muelle `dt` segundos (integración de Euler semi-implícita). */
export function stepSpring(
  state: SpringState,
  target: number,
  config: SpringConfig,
  dt: number,
): SpringState {
  const mass = config.mass ?? 1;
  let { value, velocity } = state;
  // Si la pestaña estuvo congelada, no intentamos "recuperar" segundos de animación.
  let remaining = Math.min(Math.max(dt, 0), 0.1);
  while (remaining > 0) {
    const h = Math.min(remaining, MAX_SUBSTEP);
    const force = -config.stiffness * (value - target) - config.damping * velocity;
    velocity += (force / mass) * h;
    value += velocity * h;
    remaining -= h;
  }
  return { value, velocity };
}

export function isSettled(state: SpringState, target: number, config: SpringConfig): boolean {
  const precision = config.precision ?? 0.01;
  return Math.abs(state.value - target) < precision && Math.abs(state.velocity) < precision;
}

/** Envoltorio con estado para usarlo dentro de un bucle de `requestAnimationFrame`. */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(
    initial: number,
    public config: SpringConfig = SPRINGS.gentle,
  ) {
    this.value = initial;
    this.target = initial;
  }

  /** Coloca el valor en su sitio sin animar (p. ej. con `prefers-reduced-motion`). */
  snap(value: number = this.target): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  /** Empujón instantáneo: útil para rebotes y sacudidas. */
  impulse(velocity: number): void {
    this.velocity += velocity;
  }

  /** Avanza la animación. Devuelve `true` cuando el muelle ya está quieto. */
  step(dt: number): boolean {
    const next = stepSpring(this, this.target, this.config, dt);
    this.value = next.value;
    this.velocity = next.velocity;
    if (isSettled(this, this.target, this.config)) {
      this.value = this.target;
      this.velocity = 0;
      return true;
    }
    return false;
  }
}
