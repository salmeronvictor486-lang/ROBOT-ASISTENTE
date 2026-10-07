import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { I18nContext, resolveLang, useT } from "../i18n";
import { api, isTauri } from "../lib/tauri";
import type { Expression } from "../robot/expressions";
import { setGaze } from "../robot/gaze";
import { Tico } from "../robot/Tico";
import { useTripleClick } from "../robot/useTripleClick";
import { useSettings } from "../settings/useSettings";
import type { IslandInfo, Settings } from "../types";
import { Capsule } from "./Capsule";
import { initialIsland, islandReducer, shouldAutoHide, type IslandState } from "./machine";
import { capsuleGeometry, capsuleHitRect, capsuleX, TOP_GAP } from "./sizes";
import { useIslandEvents } from "./useIslandEvents";
import { onEvent } from "../lib/tauri";
import "./island.css";

/** Tiempo con el cursor sobre peek antes de pasar a compact. */
const DWELL_MS = 400;
/** Sin usar la isla durante 5 minutos, Tico se duerme. */
const SLEEP_AFTER_MS = 5 * 60 * 1000;
/** Al despertar, Tico sigue dormido un momento antes de abrir los ojos. */
const WAKE_UP_MS = 1500;
const PROTESTS = 3;

export function IslandApp() {
  const settings = useSettings();
  return (
    <I18nContext.Provider value={resolveLang(settings.language)}>
      <Island settings={settings} />
    </I18nContext.Provider>
  );
}

function Island({ settings }: { settings: Settings }) {
  const t = useT();
  const [ctx, dispatch] = useReducer(islandReducer, initialIsland);
  const [info, setInfo] = useState<IslandInfo>({ platform: "", notchWidth: null });
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [shake, setShake] = useState(0);
  const [protest, setProtest] = useState<number | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const lastUse = useRef<number | null>(null);

  // Los ojos de Tico siguen al cursor que manda Rust.
  useEffect(() => onEvent<{ x: number; y: number }>("island://cursor", (p) => setGaze(p.x, p.y)), []);
  useEffect(() => {
    if (isTauri()) return;
    const onMove = (e: MouseEvent) => setGaze(e.clientX, e.clientY);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Si llevaba 5 minutos sin usarse, Tico aparece dormido y se despierta enseguida.
  useEffect(() => {
    if (ctx.state === "hidden" || lastUse.current === null) {
      lastUse.current = Date.now();
      return;
    }
    if (Date.now() - lastUse.current < SLEEP_AFTER_MS) return;
    setSleeping(true);
    const id = window.setTimeout(() => setSleeping(false), WAKE_UP_MS);
    return () => window.clearTimeout(id);
  }, [ctx.state]);

  // Tres clics seguidos: Tico se sacude y protesta.
  const onTicoClick = useTripleClick(() => {
    setShake((n) => n + 1);
    setProtest(Math.floor(Math.random() * PROTESTS));
  });
  useEffect(() => {
    if (protest === null) return;
    const id = window.setTimeout(() => setProtest(null), 2500);
    return () => window.clearTimeout(id);
  }, [protest]);

  useEffect(() => {
    if (isTauri()) api.islandInfo().then(setInfo).catch(console.error);
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onShortcut = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);
  useIslandEvents(dispatch, onShortcut);

  useEffect(() => {
    dispatch({ type: "conversation", active: draft.trim().length > 0 });
  }, [draft]);

  // Temporizador para esconderse cuando el cursor se va.
  const autoHide = shouldAutoHide(ctx);
  useEffect(() => {
    if (!autoHide) return;
    const id = window.setTimeout(() => dispatch({ type: "hideTimeout" }), settings.hideDelayMs);
    return () => window.clearTimeout(id);
  }, [autoHide, settings.hideDelayMs]);

  // Si el cursor se queda sobre peek, la isla crece a compact.
  useEffect(() => {
    if (ctx.state !== "peek" || !ctx.pointerInside) return;
    const id = window.setTimeout(() => dispatch({ type: "dwell" }), DWELL_MS);
    return () => window.clearTimeout(id);
  }, [ctx.state, ctx.pointerInside]);

  // Esc cierra la isla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "escape" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Expandida: pedimos el foco del teclado para poder escribir.
  useEffect(() => {
    if (ctx.state !== "expanded") return;
    if (isTauri()) void api.islandFocus().catch(console.error);
    inputRef.current?.focus();
  }, [ctx.state]);

  // En el navegador (sin Rust) simulamos el sensor del borde con el ratón.
  useEffect(() => {
    if (isTauri()) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= 3) dispatch({ type: "edgeHover" });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  let expression: Expression = "idle";
  if (sleeping) expression = "sleeping";
  else if (ctx.pointerInside && ctx.state !== "expanded") expression = "curious";

  const topGap = info.notchWidth ? 0 : TOP_GAP;
  const geometry = capsuleGeometry(ctx.state, settings.islandSize, info.notchWidth);
  const x = capsuleX(settings.islandPosition, windowWidth, geometry.width);

  // Le decimos a Rust dónde está la cápsula para el click-through.
  const hit = capsuleHitRect(
    ctx.state,
    settings.islandSize,
    settings.islandPosition,
    windowWidth,
    info.notchWidth,
    topGap,
  );
  const hitKey = hit ? `${hit.x}|${hit.width}|${hit.height}` : "none";
  useEffect(() => {
    if (isTauri()) void api.islandSetRect(hit).catch(console.error);
    // `hitKey` resume `hit`: solo avisamos cuando cambia de verdad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitKey]);

  const browserPointer = isTauri()
    ? {}
    : {
        onPointerEnter: () => dispatch({ type: "pointer", inside: true }),
        onPointerLeave: () => dispatch({ type: "pointer", inside: false }),
      };

  return (
    <div
      className="island-root"
      style={{ "--accent": settings.robotAccentColor } as React.CSSProperties}
      {...browserPointer}
    >
      <Capsule
        geometry={geometry}
        x={x}
        top={topGap}
        visible={ctx.state !== "hidden"}
        capturing={false}
        onClick={() => {
          setSleeping(false);
          dispatch({ type: "click" });
        }}
      >
        <CapsuleContent
          state={ctx.state}
          settings={settings}
          geometry={geometry}
          t={t}
          expression={expression}
          shake={shake}
          protest={protest}
          onTicoClick={onTicoClick}
          draft={draft}
          setDraft={setDraft}
          inputRef={inputRef}
          onCollapse={() => dispatch({ type: "collapse" })}
          onClose={() => dispatch({ type: "escape" })}
        />
      </Capsule>
    </div>
  );
}

interface ContentProps {
  state: IslandState;
  settings: Settings;
  geometry: { width: number; height: number };
  t: ReturnType<typeof useT>;
  expression: Expression;
  shake: number;
  protest: number | null;
  onTicoClick: () => void;
  draft: string;
  setDraft: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onCollapse: () => void;
  onClose: () => void;
}

function CapsuleContent({
  state,
  settings,
  geometry,
  t,
  expression,
  shake,
  protest,
  onTicoClick,
  draft,
  setDraft,
  inputRef,
  onCollapse,
  onClose,
}: ContentProps) {
  const tico = (size: number) => (
    <span className="tico-slot" onClick={onTicoClick}>
      <Tico
        size={size}
        baseColor={settings.robotBaseColor}
        accentColor={settings.robotAccentColor}
        expression={expression}
        shake={shake}
      />
    </span>
  );
  const protestText =
    protest === null ? null : t(`island.protest${protest + 1}` as "island.protest1");
  const box = { width: geometry.width, height: geometry.height };

  switch (state) {
    case "hidden":
      return null;
    case "peek":
      return (
        <div className="content content-peek" style={box} key="peek">
          {tico(28)}
        </div>
      );
    case "compact":
      return (
        <div className="content content-compact" style={box} key="compact">
          {tico(36)}
          <span className="status-line">{protestText ?? t("island.hint")}</span>
        </div>
      );
    case "expanded":
      return (
        <div className="content content-expanded" style={box} key="expanded">
          <header className="panel-header">
            {tico(40)}
            <strong className="panel-title">{protestText ?? "Tico"}</strong>
            <button
              type="button"
              className="icon-button"
              title={t("island.collapse")}
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
            >
              ▾
            </button>
            <button
              type="button"
              className="icon-button"
              title={t("island.close")}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              ×
            </button>
          </header>
          <div className="messages" />
          <form className="composer" onSubmit={(e) => e.preventDefault()}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder={t("island.placeholder")}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="composer-actions">
              <button type="button" className="pill-button" disabled>
                {t("island.lookAtScreen")}
              </button>
              <button type="submit" className="pill-button primary" disabled>
                {t("island.send")}
              </button>
            </div>
          </form>
        </div>
      );
  }
}
