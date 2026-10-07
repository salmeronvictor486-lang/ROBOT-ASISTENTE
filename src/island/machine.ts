/**
 * Máquina de estados de la isla, como reducer puro (sin efectos ni temporizadores).
 *
 *   hidden ──hover borde──▶ peek ──cursor quieto──▶ compact
 *      ▲                     │  clic                  │ clic
 *      │ salir / Esc         ▼                        ▼
 *      └──────────────── expanded ◀──── atajo ────────┘
 */

export type IslandState = "hidden" | "peek" | "compact" | "expanded";

export interface IslandContext {
  state: IslandState;
  /** ¿Está el cursor sobre la cápsula? (lo dice Rust). */
  pointerInside: boolean;
  /** Hay conversación en marcha: la isla expandida no se esconde sola. */
  conversationActive: boolean;
}

export type IslandEvent =
  | { type: "edgeHover" }
  | { type: "pointer"; inside: boolean }
  | { type: "dwell" }
  | { type: "click" }
  | { type: "open" }
  | { type: "collapse" }
  | { type: "escape" }
  | { type: "hideTimeout" }
  | { type: "conversation"; active: boolean };

export const initialIsland: IslandContext = {
  state: "hidden",
  pointerInside: false,
  conversationActive: false,
};

export function islandReducer(ctx: IslandContext, event: IslandEvent): IslandContext {
  switch (event.type) {
    case "edgeHover":
      return ctx.state === "hidden" ? { ...ctx, state: "peek", pointerInside: true } : ctx;
    case "pointer":
      return ctx.pointerInside === event.inside ? ctx : { ...ctx, pointerInside: event.inside };
    case "dwell":
      return ctx.state === "peek" ? { ...ctx, state: "compact" } : ctx;
    case "click":
      return ctx.state === "peek" || ctx.state === "compact" ? { ...ctx, state: "expanded" } : ctx;
    case "open":
      return { ...ctx, state: "expanded" };
    case "collapse":
      return ctx.state === "expanded" ? { ...ctx, state: "compact" } : ctx;
    case "escape":
      return ctx.state === "hidden" ? ctx : { ...ctx, state: "hidden", pointerInside: false };
    case "hideTimeout":
      return shouldAutoHide(ctx) ? { ...ctx, state: "hidden" } : ctx;
    case "conversation":
      return { ...ctx, conversationActive: event.active };
  }
}

/** ¿Debe esconderse la isla cuando el cursor se va? */
export function shouldAutoHide(ctx: IslandContext): boolean {
  if (ctx.state === "hidden" || ctx.pointerInside) return false;
  return !(ctx.state === "expanded" && ctx.conversationActive);
}
