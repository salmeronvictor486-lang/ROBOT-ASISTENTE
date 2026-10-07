import type { IslandPosition, IslandSize, Rect } from "../types";
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
/** Separación entre el borde superior de la pantalla y la cápsula. */
export const TOP_GAP = 6;

export interface CapsuleGeometry {
  width: number;
  height: number;
  radius: number;
}

export function capsuleGeometry(
  state: IslandState,
  size: IslandSize,
  notchWidth: number | null = null,
): CapsuleGeometry {
  const scale = SIZE_SCALE[size];
  const base = BASE_SIZES[state];
  // En un MacBook con notch, en peek la isla tiene el mismo ancho que el notch.
  const width = state === "peek" && notchWidth ? notchWidth : base.width * scale;
  const height = base.height * scale;
  const radius = state === "expanded" ? 28 * scale : height / 2;
  return { width, height, radius };
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
  notchWidth: number | null,
  topGap: number,
): Rect | null {
  if (state === "hidden") return null;
  const { width, height } = capsuleGeometry(state, size, notchWidth);
  return { x: capsuleX(position, windowWidth, width), y: 0, width, height: height + topGap };
}
