import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../lib/useReducedMotion";
import { Tico } from "../robot/Tico";
import { boldParts, demoFrame, restingFrame, sameFrame, type DemoFrame } from "./demo";

const BASE = "#F2F0EB";
const ACCENT = "#3DD6D0";
/** Tamaño de diseño de la pantalla de mentira; se escala para que quepa. En el móvil se usa
 * una pantalla más estrecha, así la isla sale más grande y se puede leer. */
const STAGE = { width: 960, height: 560 };
const NARROW_STAGE = { width: 500, height: 520 };
const NARROW_BELOW = 640;

/**
 * Reloj de la demo: solo corre con la demo a la vista y la pestaña activa, y solo
 * re-renderiza cuando cambia algo visible (no 60 veces por segundo).
 */
function useDemo(target: React.RefObject<HTMLElement | null>): DemoFrame {
  const reducedMotion = useReducedMotion();
  const [frame, setFrame] = useState<DemoFrame>(() => demoFrame(0));

  useEffect(() => {
    // Con "reducir movimiento" se enseña una escena ya respondida, sin reloj.
    if (reducedMotion) return;
    const el = target.current;
    let visible = true;
    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    let current = demoFrame(0);

    const tick = () => {
      const now = performance.now();
      // Si la pestaña estuvo en segundo plano, seguimos donde lo dejamos (sin saltos).
      elapsed += Math.min(now - last, 100) / 1000;
      last = now;
      const next = demoFrame(elapsed);
      if (!sameFrame(next, current)) {
        current = next;
        setFrame(next);
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    if (el) observer.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion, target]);

  return reducedMotion ? restingFrame(0) : frame;
}

/** Escala la pantalla de mentira al ancho disponible. */
function useStage(target: React.RefObject<HTMLElement | null>): { scale: number; narrow: boolean } {
  const [width, setWidth] = useState(STAGE.width);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? STAGE.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);
  const narrow = width < NARROW_BELOW;
  const stage = narrow ? NARROW_STAGE : STAGE;
  return { scale: Math.min(1, width / stage.width), narrow };
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

export function HeroDemo() {
  const frameRef = useRef<HTMLDivElement>(null);
  const frame = useDemo(frameRef);
  const { scale, narrow } = useStage(frameRef);
  const stage = narrow ? NARROW_STAGE : STAGE;
  const { state } = frame;
  const open = state !== "hidden";

  return (
    <div
      ref={frameRef}
      className={`demo${narrow ? " is-narrow" : ""}`}
      style={{ height: stage.height * scale }}
      role="img"
      aria-label="Demostración: la isla de Tico baja del borde superior de la pantalla, se abre y responde a una pregunta"
    >
      <div
        className="demo-stage"
        style={{ width: stage.width, height: stage.height, transform: `scale(${scale})` }}
      >
        <div className="demo-wallpaper" />
        <div className="demo-window">
          <div className="demo-window-bar">
            <i />
            <i />
            <i />
            <span>Ventas 2026.xlsx</span>
          </div>
          <div className="demo-chart">
            {[
              ["T1", 62],
              ["T2", 78],
              ["T3", 66],
              ["T4", 84],
            ].map(([label, value]) => (
              <div key={label} className="demo-bar">
                <b style={{ height: `${value}%` }} className={label === "T3" ? "is-down" : ""} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`demo-flash${frame.capturing ? " is-on" : ""}`} />

        <div className={`demo-island is-${state}`} aria-hidden="true">
          {/* Un solo Tico que se recoloca en cada estado (un bucle de animación, no tres). */}
          <div className="demo-tico">
            <Tico
              size={44}
              baseColor={BASE}
              accentColor={ACCENT}
              expression={frame.expression}
              bounce={frame.chunks}
              wave={open ? frame.scene + 1 : 0}
            />
          </div>
          <div className="demo-compact">
            <span>Pregúntame lo que quieras</span>
            <kbd>Ctrl ⇧ Espacio</kbd>
          </div>
          <div className="demo-expanded">
            <header>
              <strong>Tico</strong>
              <small>{frame.answer ? "Respondiendo…" : frame.question ? "Pensando…" : "En línea"}</small>
            </header>
            <div className="demo-chat">
              {frame.question && <p className="demo-msg is-user">{frame.question}</p>}
              {frame.answer && (
                <p className="demo-msg is-tico">
                  <Bold text={frame.answer} />
                </p>
              )}
            </div>
            <div className="demo-input">Escribe a Tico…</div>
          </div>
        </div>
      </div>
    </div>
  );
}
