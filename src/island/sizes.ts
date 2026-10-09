import type { IslandPosition, IslandSize, NotchInfo, Rect } from "../types";
import type { IslandState } from "./machine";

/** Tamaños base a escala M (px lógicos). Deben coincidir con `island.rs`. */
export const BASE_SIZES: Record<IslandState, { width: number; height: number }> = {
  hidden: { width: 140, height: 0 },
  peek: { width: 200, height: 36 },
  compact: { width: 360, height: 48 },
  expanded: { width: 480, height: 320 },
};

export const SIZE_SCALE: Record<IslandSize, number> = { s: 0.85, m: 1, l: 1.2 };

/** Margen lateral de la ventana reservado para la sombra (igual que en Rust). */
export const SIDE_MARGIN = 40;
/** Separación entre el borde superior de la pantalla y la cápsula (sin notch). */
export const TOP_GAP = 6;
/** Ancho de cada "oreja" de la isla a los lados del notch en peek. */
export const NOTCH_EAR = 46;

export interface CapsuleGeometry {
  width: number;
  height: number;
  radius: number;
  /** Con notch, la isla cuelga del borde superior: esquinas de arriba rectas. */
  flushTop: boolean;
  /** Alto reservado arriba para que nada quede tapado por el notch. */
  contentTop: number;
}

/**
 * Tamaño de la cápsula en cada estado.
 *
 * Con notch, la isla "nace" del notch: oculta tiene su mismo tamaño (negro sobre negro),
 * en peek le salen dos orejas a los lados y, al crecer, el contenido va por debajo.
 */
export function capsuleGeometry(
  state: IslandState,
  size: IslandSize,
  notch: NotchInfo | null = null,
): CapsuleGeometry {
  const scale = SIZE_SCALE[size];
  const base = BASE_SIZES[state];
  if (!notch) {
    const height = base.height * scale;
    const radius = state === "expanded" ? 28 * scale : height / 2;
    return { width: base.width * scale, height, radius, flushTop: false, contentTop: 0 };
  }
  const n = notch;
  switch (state) {
    case "hidden":
      // Un pelín más pequeña que el notch real: así nunca asoma por los bordes.
      return { width: n.width - 4, height: n.height - 2, radius: 10, flushTop: true, contentTop: 0 };
    case "peek":
      return { width: n.width + NOTCH_EAR * 2, height: n.height, radius: 14, flushTop: true, contentTop: 0 };
    case "compact":
      return {
        width: Math.max(base.width * scale, n.width + 200),
        height: n.height + 44 * scale,
        radius: 22 * scale,
        flushTop: true,
        contentTop: n.height,
      };
    case "expanded":
      return {
        width: Math.max(base.width * scale, n.width + 220),
        height: base.height * scale + n.height,
        radius: 30 * scale,
        flushTop: true,
        contentTop: n.height,
      };
  }
}

/** Posición x de la cápsula dentro de la ventana según el ajuste de posición. */
export function capsuleX(position: IslandPosition, windowWidth: number, width: number): number {
  switch (position) {
    case "left":
      return SIDE_MARGIN;
    case "right":
      return windowWidth - SIDE_MARGIN - width;
    case "center":
      return (windowWidth - width) / 2;
  }
}

/**
 * Rectángulo "sensible" de la cápsula para el click-through de Rust.
 * Empieza en y = 0 para incluir el hueco superior: así el cursor pegado al borde
 * cuenta como dentro y la isla no se esconde.
 */
export function capsuleHitRect(
  state: IslandState,
  size: IslandSize,
  position: IslandPosition,
  windowWidth: number,
  notch: NotchInfo | null,
  topGap: number,
): Rect | null {
  if (state === "hidden") return null;
  const { width, height } = capsuleGeometry(state, size, notch);
  return { x: capsuleX(position, windowWidth, width), y: 0, width, height: height + topGap };
}
