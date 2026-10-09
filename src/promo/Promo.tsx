import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Capsule } from "../island/Capsule";
import { ActivityIndicator } from "../island/ActivityIndicator";
import { IconEye } from "../island/icons";
import { Markdown } from "../island/Markdown";
import type { IslandState } from "../island/machine";
import { capsuleGeometry, capsuleX } from "../island/sizes";
import type { Expression } from "../robot/expressions";
import { setGaze } from "../robot/gaze";
import { Tico } from "../robot/Tico";
import { ease, inOut, mix, progress, typed } from "./timeline";
import "../island/island.css";
import "./promo.css";

/**
 * Anuncio de Tico (35 s, 1920×1080). Cada fotograma se calcula a partir de `t`,
 * así `scripts/render-promo.mjs` puede renderizarlo a 60 fps exactos.
 * En el navegador: /promo.html (o /promo.html?t=12 para ver un momento concreto).
 */

export const DURATION = 35;
const W = 1920;
const NOTCH = { width: 200, height: 34 };
const BASE = "#F2F0EB";
const ACCENT = "#3DD6D0";

const Q1 = "¿Cómo paso este documento a PDF?";
const A1 = "Fácil, en 3 pasos:\n1. Pulsa **Archivo → Exportar**.\n2. Elige **PDF** como formato.\n3. Dale a **Guardar**. ¡Listo!";
const Q2 = "¿Qué ves en mi pantalla?";
const A2 =
  "Veo **Ventas 2026**: el **T3 cae un 12 %** respecto al T2.\nLa columna *Marketing* es la que más baja: empezaría por ahí.";

interface PromoWindow {
  __promoReady?: boolean;
  __promoGo?: () => void;
  /** Último instante calculado (lo usa el script de render para comprobar el reloj). */
  __promoT?: number;
}

/**
 * Reloj del anuncio: segundos desde que empieza (+ ?t= para saltar a un momento).
 * Con ?render=1 el reloj espera a que el script de render llame a `__promoGo()`.
 */
function useClock(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const offset = Number(params.get("t") ?? 0) || 0;
    const w = window as unknown as PromoWindow;
    let start = performance.now();
    let running = !params.has("render");
    w.__promoGo = () => {
      start = performance.now();
      running = true;
    };
    let frame = 0;
    // Usamos performance.now() (y no el argumento de rAF) para que el render del anuncio,
    // con tiempo virtual, use el mismo reloj que todo lo demás.
    const loop = () => {
      const now = performance.now();
      const value = offset + (running ? (now - start) / 1000 : 0);
      w.__promoT = value;
      setT(value);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    w.__promoReady = true;
    return () => cancelAnimationFrame(frame);
  }, []);
  return t;
}

export function Promo() {
  const t = useClock();
  const blackout = Math.max(1 - progress(t, 0, 0.35), progress(t, DURATION - 0.6, DURATION));
  return (
    <div className="promo">
      {t < 21.9 && <DesktopScene t={t} />}
      {t < 3.5 && <HookScene t={t} />}
      {t > 21.3 && t < 27.1 && <CharacterScene t={t} />}
      {t > 26.6 && t < 31.1 && <FeaturesScene t={t} />}
      {t > 30.5 && <EndCard t={t} />}
      <div className="promo-black" style={{ opacity: blackout }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escena 1: gancho                                                    */
/* ------------------------------------------------------------------ */

function HookScene({ t }: { t: number }) {
  const out = 1 - progress(t, 2.95, 3.45);
  const line = (start: number) => {
    const p = ease.outExpo(progress(t, start, start + 0.9));
    return { opacity: p * out, transform: `translateY(${mix(40, 0, p)}px)`, filter: `blur(${mix(14, 0, p)}px)` };
  };
  // Los ojos de Tico se encienden dentro del notch: un adelanto de lo que viene.
  const eyes = inOut(t, 1.9, 3.3, 0.35);
  const blink = t > 2.6 && t < 2.72 ? 0.15 : 1;
  return (
    <div className="scene hook">
      <div className="hook-notch">
        <i style={{ opacity: eyes, transform: `scaleY(${blink})` }} />
        <i style={{ opacity: eyes, transform: `scaleY(${blink})` }} />
      </div>
      <h1 style={line(0.35)}>Tu pantalla.</h1>
      <h1 style={line(1.15)}>
        Ahora con <span className="accent">alguien</span> dentro.
      </h1>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escenas 2-4: escritorio, chat y visión                              */
/* ------------------------------------------------------------------ */

function islandState(t: number): IslandState {
  if (t < 4.9) return "hidden";
  if (t < 6.5) return "peek";
  if (t < 7.6) return "compact";
  return "expanded";
}

function islandExpression(t: number): Expression {
  if (t < 4.9) return "idle";
  if (t < 7.6) return "curious";
  if (t < 9.9) return "curious";
  if (t < 11.0) return "thinking";
  if (t < 13.5) return "talking";
  if (t < 15.4) return "happy";
  if (t < 17.4) return "watching";
  if (t < 18.2) return "thinking";
  if (t < 20.0) return "talking";
  return "happy";
}

function DesktopScene({ t }: { t: number }) {
  // Cámara: aparece, plano general, se acerca a la isla y se aleja al final.
  const reveal = ease.outCubic(progress(t, 2.9, 3.9));
  const push = ease.inOutCubic(progress(t, 7.5, 8.8));
  const pull = ease.inOutCubic(progress(t, 20.6, 21.6));
  // Plano general con un acercamiento lento (Ken Burns) y luego "push-in" hasta la isla.
  const drift = mix(1, 1.08, ease.inOutCubic(progress(t, 3.4, 7.6)));
  const zoom = mix(1.08, 1, reveal) * drift * mix(1, 1.9 / 1.08, push) * mix(1, 0.92, pull);
  const shiftY = mix(0, 40, push);
  const opacity = Math.min(reveal, 1 - pull);

  const state = islandState(t);
  const capturing = t > 15.7 && t < 17.2;
  const busy = (t > 9.9 && t < 13.5) || (t > 15.6 && t < 20.0);

  // Las respuestas llegan "en streaming": los ojos rebotan a cada trocito.
  const a1 = typed(A1, t, 11.0, 13.4);
  const a2 = typed(A2, t, 18.2, 19.9);
  const bounce = Math.floor((a1.length + a2.length) / 3);
  const wave = t > 5.0 ? 1 + (t > 13.5 ? 1 : 0) : 0;

  // El cursor va al notch, baja un poco a la isla y hace clic.
  const cursorIn = ease.inOutCubic(progress(t, 3.6, 4.85));
  const cursorDown = ease.inOutCubic(progress(t, 6.2, 6.9));
  const cursor = {
    x: mix(1340, 960, cursorIn),
    y: mix(mix(720, 4, cursorIn), 46, cursorDown),
    opacity: inOut(t, 3.5, 8.2, 0.3),
    click: t > 7.5 && t < 7.75,
  };
  useEffect(() => {
    // Tico mira hacia el cursor (en coordenadas de la página).
    const scale = 1;
    setGaze(cursor.x * scale, cursor.y * scale);
  }, [cursor.x, cursor.y]);

  return (
    <div className="scene desktop" style={{ opacity }}>
      <div
        className="stage"
        style={{ transform: `translateY(${shiftY}px) scale(${zoom})`, transformOrigin: "50% 0%" }}
      >
        <Wallpaper />
        <MenuBar />
        <AppWindow />
        <Dock />
        <div className="notch" />
        <PromoIsland
          t={t}
          state={state}
          expression={islandExpression(t)}
          capturing={capturing}
          busy={busy}
          bounce={bounce}
          wave={wave}
          a1={a1}
          a2={a2}
        />
        <Cursor {...cursor} />
      </div>

      <Caption t={t} start={4.0} end={7.4} title="Pasa el ratón por el notch." sub="Tico vive arriba del todo." />
      <Caption
        t={t}
        start={8.9}
        end={14.9}
        title="Pregunta lo que quieras."
        sub="Responde al momento, paso a paso."
        center
      />
      <Caption
        t={t}
        start={15.5}
        end={20.7}
        title="Mira tu pantalla."
        sub="Solo cuando tú se lo pides. Nada se guarda."
        center
      />
      <Keycaps t={t} start={15.0} end={16.4} keys={["⌘", "⇧", "S"]} />
    </div>
  );
}

interface IslandProps {
  t: number;
  state: IslandState;
  expression: Expression;
  capturing: boolean;
  busy: boolean;
  bounce: number;
  wave: number;
  a1: string;
  a2: string;
}

function PromoIsland({ t, state, expression, capturing, busy, bounce, wave, a1, a2 }: IslandProps) {
  const windowWidth = 560;
  const geometry = capsuleGeometry(state, "m", NOTCH);
  const x = capsuleX("center", windowWidth, geometry.width);
  const tico = (size: number) => (
    <Tico size={size} baseColor={BASE} accentColor={ACCENT} expression={expression} bounce={bounce} wave={wave} />
  );
  const box = {
    width: geometry.width,
    height: geometry.height,
    paddingTop: geometry.contentTop ? geometry.contentTop + 4 : undefined,
  };

  let content: ReactNode = null;
  if (state === "peek") {
    content = (
      <div className="content content-peek-notch" style={box}>
        <span className="ear">{tico(32)}</span>
        <span className="ear">
          <ActivityIndicator busy={false} error={false} />
        </span>
      </div>
    );
  } else if (state === "compact") {
    content = (
      <div className="content content-compact" style={box}>
        {tico(40)}
        <span className="status-line">Haz clic para hablar conmigo</span>
        <ActivityIndicator busy={false} error={false} />
      </div>
    );
  } else if (state === "expanded") {
    const draft = t < 9.8 ? typed(Q1, t, 8.3, 9.6) : "";
    const q1Sent = t >= 9.8;
    const showA1 = t >= 9.9;
    const thumb = t >= 16.6 && t < 17.3;
    const q2Sent = t >= 17.3;
    const showA2 = t >= 17.4;
    content = (
      <div className="content content-expanded" style={box}>
        <header className="panel-header">
          {tico(52)}
          <strong className="panel-title">Tico</strong>
          <span className="icon-button" aria-hidden="true">
            ⌃
          </span>
        </header>
        <div className="messages promo-messages">
          {!q1Sent && <p className="empty-chat">Pregúntame lo que quieras.</p>}
          {q1Sent && <Bubble role="user">{Q1}</Bubble>}
          {showA1 && <Bubble role="assistant">{a1 ? <Markdown text={a1} /> : <Typing />}</Bubble>}
          {q2Sent && (
            <Bubble role="user">
              <ThumbScreen />
              {Q2}
            </Bubble>
          )}
          {showA2 && <Bubble role="assistant">{a2 ? <Markdown text={a2} /> : <Typing />}</Bubble>}
        </div>
        <div className="composer">
          {thumb && (
            <div className="capture-attachment">
              <ThumbScreen />
              <span>Esto es lo que voy a enviar</span>
            </div>
          )}
          <div className={`promo-input${draft ? " typing-now" : ""}`}>
            {draft || <span className="placeholder">Pregúntale algo a Tico…</span>}
            {draft && <span className="caret" />}
          </div>
          <div className="composer-actions">
            <span className={`pill-button${capturing ? " pressed" : ""}`}>
              <IconEye /> Mira mi pantalla
            </span>
            <span className="pill-button primary">{busy ? "Parar" : "Enviar"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="promo-island" style={{ width: windowWidth }}>
      <Capsule geometry={geometry} x={x} top={0} visible capturing={capturing} onClick={() => undefined}>
        {content}
      </Capsule>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  return <div className={`message message-${role} promo-bubble`}>{children}</div>;
}

function Typing() {
  return (
    <p className="typing">
      <span />
      <span />
      <span />
    </p>
  );
}

/** Miniatura de la captura: la misma ventana de la hoja de cálculo, en pequeño. */
function ThumbScreen() {
  return (
    <div className="thumb-screen">
      <div className="thumb-inner">
        <Wallpaper />
        <AppWindow />
      </div>
    </div>
  );
}

function Wallpaper() {
  return <div className="wallpaper" />;
}

function MenuBar() {
  return (
    <div className="menubar">
      <span className="apple" />
      <b>Numbers</b>
      <span>Archivo</span>
      <span>Edición</span>
      <span>Insertar</span>
      <span>Tabla</span>
      <span>Ventana</span>
      <span className="spacer" />
      <span className="status">
        <i className="battery" />
        Vie 9 oct 11:43
      </span>
    </div>
  );
}

const SALES = [
  { q: "T1", v: 82, m: 34 },
  { q: "T2", v: 96, m: 41 },
  { q: "T3", v: 84, m: 27 },
  { q: "T4", v: 91, m: 38 },
];

function AppWindow() {
  return (
    <div className="appwin">
      <div className="appwin-bar">
        <i />
        <i />
        <i />
        <span>Ventas 2026</span>
      </div>
      <div className="appwin-body">
        <table>
          <thead>
            <tr>
              <th>Trimestre</th>
              <th>Ventas (k€)</th>
              <th>Marketing</th>
            </tr>
          </thead>
          <tbody>
            {SALES.map((r) => (
              <tr key={r.q} className={r.q === "T3" ? "hl" : ""}>
                <td>{r.q}</td>
                <td>{r.v}</td>
                <td>{r.m}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="chart">
          {SALES.map((r) => (
            <div key={r.q} className="bar-wrap">
              <div className={`bar${r.q === "T3" ? " low" : ""}`} style={{ height: `${r.v * 2}px` }} />
              <span>{r.q}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Dock() {
  const apps = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#eab308", "#0ea5e9"];
  return (
    <div className="dock">
      {apps.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </div>
  );
}

function Cursor({ x, y, opacity, click }: { x: number; y: number; opacity: number; click: boolean }) {
  return (
    <svg
      className="cursor"
      width="34"
      height="34"
      viewBox="0 0 24 24"
      style={{ left: x, top: y, opacity, transform: `scale(${click ? 0.85 : 1})` }}
    >
      <path
        d="M4 2.5 L4 19 L8.6 14.8 L11.6 21.4 L14.4 20.2 L11.5 13.8 L17.6 13.6 Z"
        fill="#111"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface CaptionProps {
  t: number;
  start: number;
  end: number;
  title: string;
  sub: string;
  center?: boolean;
}

function Caption({ t, start, end, title, sub, center = false }: CaptionProps) {
  const o = inOut(t, start, end, 0.45);
  if (o <= 0) return null;
  const p = ease.outCubic(progress(t, start, start + 0.6));
  return (
    <div
      className={`caption${center ? " center" : ""}`}
      style={{ opacity: o, transform: `translateY(${mix(26, 0, p)}px)` }}
    >
      <strong>{title}</strong>
      <span>{sub}</span>
    </div>
  );
}

function Keycaps({ t, start, end, keys }: { t: number; start: number; end: number; keys: string[] }) {
  const o = inOut(t, start, end, 0.25);
  if (o <= 0) return null;
  return (
    <div className="keycaps" style={{ opacity: o }}>
      {keys.map((k, i) => {
        const press = ease.outBack(progress(t, start + 0.15 + i * 0.12, start + 0.45 + i * 0.12));
        const down = t > start + 0.55 && t < start + 0.8;
        return (
          <kbd key={k} style={{ transform: `translateY(${mix(30, 0, press) + (down ? 4 : 0)}px)`, opacity: press }}>
            {k}
          </kbd>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escena 5: el personaje                                              */
/* ------------------------------------------------------------------ */

const MOODS: { at: number; expression: Expression; label: string }[] = [
  { at: 21.5, expression: "happy", label: "Saluda." },
  { at: 22.4, expression: "curious", label: "Curiosea." },
  { at: 23.1, expression: "thinking", label: "Piensa." },
  { at: 23.8, expression: "watching", label: "Mira." },
  { at: 24.5, expression: "error", label: "Se equivoca." },
  { at: 25.2, expression: "sleeping", label: "Se duerme." },
  { at: 25.9, expression: "happy", label: "Y vuelve." },
];

function CharacterScene({ t }: { t: number }) {
  const o = inOut(t, 21.4, 27.0, 0.5);
  const current = [...MOODS].reverse().find((m) => t >= m.at) ?? MOODS[0];
  const index = current ? MOODS.indexOf(current) : 0;
  const swap = ease.outExpo(progress(t, current?.at ?? 0, (current?.at ?? 0) + 0.35));
  const title = ease.outExpo(progress(t, 21.6, 22.4));
  const zoom = mix(1.06, 1, ease.outCubic(progress(t, 21.4, 23)));
  useEffect(() => setGaze(1300, 520), []);
  return (
    <div className="scene character" style={{ opacity: o }}>
      <div className="character-glow" />
      <div className="character-tico" style={{ transform: `scale(${zoom})` }}>
        <Tico
          size={560}
          baseColor={BASE}
          accentColor={ACCENT}
          expression={current?.expression ?? "happy"}
          wave={t > 21.6 ? 1 : 0}
          bounce={Math.floor(t * 6)}
        />
      </div>
      <div className="character-copy">
        <p className="eyebrow" style={{ opacity: title }}>
          Tico tiene personalidad
        </p>
        <h2 key={index} style={{ opacity: swap, transform: `translateY(${mix(40, 0, swap)}px)` }}>
          {current?.label}
        </h2>
        <p className="small" style={{ opacity: title }}>
          8 expresiones · brazos · animado a 60 fps
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escena 6: ventajas                                                  */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: "✦", title: "Claude · OpenAI · Gemini · Ollama", text: "Tu IA favorita, o una local y gratis." },
  { icon: "◉", title: "Privacidad primero", text: "Solo mira cuando tú lo pides. Nada se guarda." },
  { icon: "▲", title: "Windows y macOS", text: "Y en MacBook, nace del notch." },
  { icon: "❝", title: "Castellano · Català · English", text: "Habla tu idioma." },
];

function FeaturesScene({ t }: { t: number }) {
  const o = inOut(t, 26.7, 31.0, 0.45);
  const head = ease.outExpo(progress(t, 26.8, 27.6));
  return (
    <div className="scene features" style={{ opacity: o }}>
      <h2 style={{ opacity: head, transform: `translateY(${mix(30, 0, head)}px)` }}>
        Todo lo que necesitas. <span className="dim">Nada que no.</span>
      </h2>
      <div className="feature-grid">
        {FEATURES.map((f, i) => {
          const p = ease.outBack(progress(t, 27.1 + i * 0.18, 27.75 + i * 0.18));
          return (
            <div
              key={f.title}
              className="feature"
              style={{ opacity: Math.min(1, p * 1.4), transform: `translateY(${mix(60, 0, p)}px) scale(${mix(0.94, 1, p)})` }}
            >
              <span className="feature-icon">{f.icon}</span>
              <strong>{f.title}</strong>
              <span>{f.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escena 7: cierre                                                    */
/* ------------------------------------------------------------------ */

function EndCard({ t }: { t: number }) {
  const o = progress(t, 30.6, 31.1);
  const logo = ease.outBack(progress(t, 31.0, 31.7));
  const tag = ease.outExpo(progress(t, 31.6, 32.4));
  const cta = ease.outBack(progress(t, 32.2, 32.9));
  useEffect(() => setGaze(W / 2, 760), []);
  const style = (p: number): CSSProperties => ({ opacity: Math.min(1, p), transform: `translateY(${mix(30, 0, p)}px)` });
  return (
    <div className="scene endcard" style={{ opacity: o }}>
      <div className="end-tico" style={{ transform: `scale(${mix(0.6, 1, ease.outBack(progress(t, 30.7, 31.5)))})` }}>
        <Tico size={330} baseColor={BASE} accentColor={ACCENT} expression="happy" wave={t > 31.2 ? 1 : 0} />
      </div>
      <h1 className="wordmark" style={{ opacity: Math.min(1, logo), transform: `scale(${mix(0.85, 1, logo)})` }}>
        TICO
      </h1>
      <p className="tagline" style={style(tag)}>
        La isla dinámica con un robot dentro.
      </p>
      <p className="cta" style={style(cta)}>
        Descárgalo gratis · Windows y macOS
      </p>
    </div>
  );
}
