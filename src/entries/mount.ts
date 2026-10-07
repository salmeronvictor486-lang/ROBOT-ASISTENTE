import type { ReactNode } from "react";
import type { createRoot } from "react-dom/client";

/** Monta la app en `#root` (común a todas las ventanas). */
export function mount(node: ReactNode, create: typeof createRoot): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("No se encontró el elemento #root");
  create(root).render(node);
}
