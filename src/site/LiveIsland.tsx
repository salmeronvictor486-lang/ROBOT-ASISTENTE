import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialIsland, islandReducer } from "../island/machine";
import { useReducedMotion } from "../lib/useReducedMotion";
import { Tico } from "../robot/Tico";
import { boldParts, nextSuggestions, replyDuration, replyFrame, type Reply, type ReplyFrame } from "./replies";

/** Igual que la app: 3 px de borde y 150 ms quieto para asomar. */
const EDGE_PX = 3;
const EDGE_DWELL_MS = 150;
/** Con el cursor encima, cuánto tarda en pasar de "asoma" a "compacta". */
const PEEK_DWELL_MS = 350;
const HIDE_DELAY_MS = 1100;
const OPEN_EVENT = "tico:abrir-isla";

/** Abre la isla desde cualquier parte de la página (el botón «Pruébala» de la portada). */
export function openIsland(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
const NOTICE_MS = 12000;

const BASE = "#F2F0EB";
const ACCENT = "#3DD6D0";

export interface Notice {
  id: number;
  title: string;
  text: string;
}

interface Exchange {
  reply: Reply;
  /** Cuándo empezó a responder (performance.now()). */
  start: number;
}

function Bold({ text }: { text: string }) {
  return (
    <>
      {boldParts(text).map((part, i) =>
        part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}

/**
 * La isla de la web: la misma máquina de estados que la app (`island/machine.ts`) y los
 * mismos gestos. Ratón 150 ms en los 3 px de arriba → asoma; encima → crece; clic → se
 * abre. También Ctrl/⌘ + Mayús + Espacio y Esc. En pantallas táctiles, un toque la abre.
 */
export function LiveIsland({
  notice,
  onNoticeDone,
  onCapture,
}: {
  notice: Notice | null;
  onNoticeDone: () => void;
  /** Destello sobre la página al "capturar la pantalla". */
  onCapture: (on: boolean) => void;
}) {
  const [ctx, dispatch] = useReducer(islandReducer, initialIsland);
  const [log, setLog] = useState<Exchange[]>([]);
  const [frame, setFrame] = useState<ReplyFrame | null>(null);
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const state = notice ? "expanded" : ctx.state;
  const current = log[log.length - 1];
  const busy = Boolean(frame && frame.phase !== "done");

  // Borde de arriba de la página = borde de la pantalla.
  useEffect(() => {
    let timer = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (e.clientY <= EDGE_PX) {
        if (!timer) {
          timer = window.setTimeout(() => {
            dispatch({ type: "edgeHover" });
            // El cursor está en el borde, todavía no encima de la cápsula.
            dispatch({ type: "pointer", inside: false });
          }, EDGE_DWELL_MS);
        }
      } else if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.clearTimeout(timer);
    };
  }, []);

  // Asomada con el cursor encima → compacta.
  useEffect(() => {
    if (ctx.state !== "peek" || !ctx.pointerInside) return;
    const timer = window.setTimeout(() => dispatch({ type: "dwell" }), PEEK_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [ctx.state, ctx.pointerInside]);

  // El cursor se va → se esconde al rato. Abierta solo se cierra con Esc o clic fuera.
  useEffect(() => {
    if (ctx.pointerInside || ctx.state === "hidden" || ctx.state === "expanded") return;
    const timer = window.setTimeout(() => dispatch({ type: "hideTimeout" }), HIDE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ctx.pointerInside, ctx.state]);

  // Atajo de la app, Esc y clic fuera.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dispatch({ type: ctx.state === "expanded" ? "escape" : "open" });
      } else if (e.key === "Escape") {
        dispatch({ type: "escape" });
        if (notice) onNoticeDone();
      }
    };
    const down = (e: PointerEvent) => {
      if (ctx.state === "expanded" && !ref.current?.contains(e.target as Node)) dispatch({ type: "escape" });
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", down);
    };
  }, [ctx.state, notice, onNoticeDone]);

  useEffect(() => {
    const open = () => dispatch({ type: "open" });
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  // Aviso de descarga: se va solo.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onNoticeDone, NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, onNoticeDone]);

  // Reloj de la respuesta en curso: solo re-renderiza cuando cambia lo que se ve.
  useEffect(() => {
    if (!current) return;
    let raf = 0;
    let last = "";
    const tick = () => {
      const ms = reducedMotion ? replyDuration(current.reply) : performance.now() - current.start;
      const next = replyFrame(current.reply, ms);
      const key = `${next.phase}|${next.text.length}|${next.capturing}`;
      if (key !== last) {
        last = key;
        setFrame(next);
        onCapture(next.capturing);
      }
      if (next.phase !== "done") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      onCapture(false);
    };
  }, [current, reducedMotion, onCapture]);

  // La conversación siempre muestra lo último.
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [frame, log.length]);

  const ask = useCallback((reply: Reply) => {
    setLog((prev) => [...prev.slice(-3), { reply, start: performance.now() }]);
  }, []);

  const asked = log.map((e) => e.reply.id);
  const expression = frame?.expression ?? (state === "hidden" ? "idle" : "curious");
  const status = busy ? (frame?.phase === "thinking" ? "Pensando…" : "Respondiendo…") : "Demo · elige una pregunta";

  return (
    <div
      ref={ref}
      className={`island is-${state}${notice ? " is-notice" : ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        if (ctx.state === "hidden") dispatch({ type: "edgeHover" });
        dispatch({ type: "pointer", inside: true });
      }}
      onPointerLeave={(e) => e.pointerType === "mouse" && dispatch({ type: "pointer", inside: false })}
      onClick={() => {
        if (ctx.state === "hidden") dispatch({ type: "open" });
        else dispatch({ type: "click" });
      }}
    >
      <span className="island-eyes" aria-hidden="true">
        <i />
        <i />
      </span>
      <div className="island-tico" aria-hidden="true">
        <Tico
          size={44}
          baseColor={BASE}
          accentColor={ACCENT}
          expression={notice ? "box" : expression}
          bounce={frame?.chunks ?? 0}
          wave={state === "expanded" ? 1 : 0}
        />
      </div>

      <div className="island-compact" aria-hidden={state !== "compact"}>
        <span>Haz clic para hablar conmigo</span>
        <i className="island-live" />
      </div>

      {notice ? (
        <div className="island-panel island-notice" role="status">
          <strong>{notice.title}</strong>
          <p>{notice.text}</p>
          <button type="button" className="island-x" aria-label="Cerrar aviso" onClick={onNoticeDone}>
            ×
          </button>
        </div>
      ) : (
        <section className="island-panel" aria-label="Demo de Tico" aria-hidden={state !== "expanded"}>
          <header>
            <strong>Tico</strong>
            <small>{status}</small>
            <kbd>Esc</kbd>
          </header>
          <div ref={chatRef} className="island-chat" aria-live="polite">
            {log.length === 0 && (
              <p className="island-hello">Hola. En la app me escribes lo que quieras; aquí, elige una:</p>
            )}
            {log.map((exchange, i) => {
              const live = i === log.length - 1;
              const text = live ? (frame?.text ?? "") : exchange.reply.answer;
              return (
                <div key={`${exchange.start}`} className="island-pair">
                  <p className="msg is-you">{exchange.reply.question}</p>
                  {live && frame?.phase === "thinking" ? (
                    <p className="msg is-tico is-thinking" aria-label="Pensando">
                      <i />
                      <i />
                      <i />
                    </p>
                  ) : (
                    text && (
                      <p className="msg is-tico">
                        <Bold text={text} />
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
          <div className="island-chips">
            {nextSuggestions(asked).map((reply) => (
              <button
                key={reply.id}
                type="button"
                disabled={busy || state !== "expanded"}
                onClick={(e) => {
                  e.stopPropagation();
                  ask(reply);
                }}
              >
                {reply.question}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
