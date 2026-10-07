import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { I18nContext, resolveLang, useT } from "../i18n";
import { api, isTauri, onEvent, toAppError } from "../lib/tauri";
import type { Expression } from "../robot/expressions";
import { setGaze } from "../robot/gaze";
import { Tico } from "../robot/Tico";
import { useTripleClick } from "../robot/useTripleClick";
import { useSettings } from "../settings/useSettings";
import type { CapturePreview, IslandInfo, Settings } from "../types";
import { CaptureAttachment } from "./CaptureAttachment";
import { Capsule } from "./Capsule";
import { ChatPanel } from "./ChatPanel";
import { initialIsland, islandReducer, shouldAutoHide } from "./machine";
import { capsuleGeometry, capsuleHitRect, capsuleX, TOP_GAP } from "./sizes";
import { errorKey, useChat } from "./useChat";
import { useIslandEvents, type ShortcutAction } from "./useIslandEvents";
import "./island.css";

/** Tiempo con el cursor sobre peek antes de pasar a compact. */
const DWELL_MS = 400;
/** Sin usar la isla durante 5 minutos, Tico se duerme. */
const SLEEP_AFTER_MS = 5 * 60 * 1000;
/** Al despertar, Tico sigue dormido un momento antes de abrir los ojos. */
const WAKE_UP_MS = 1500;
const ERROR_MS = 2000;
const HAPPY_MS = 1600;
const PROTESTS = 3;

export function IslandApp() {
  const settings = useSettings();
  return (
    <I18nContext.Provider value={resolveLang(settings.language)}>
      <Island settings={settings} />
    </I18nContext.Provider>
  );
}

/** `true` durante `ms` milisegundos después de cada cambio de `at`. */
function useRecent(at: number, ms: number): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!at) return;
    const on = window.setTimeout(() => setActive(true), 0);
    const off = window.setTimeout(() => setActive(false), ms);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [at, ms]);
  return active;
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
  const chat = useChat();
  const [capturing, setCapturing] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<CapturePreview | null>(null);
  const showError = useRecent(chat.errorAt, ERROR_MS);
  const showHappy = useRecent(chat.doneAt, HAPPY_MS);

  useEffect(() => {
    if (isTauri()) api.islandInfo().then(setInfo).catch(console.error);
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Los ojos de Tico siguen al cursor (de Rust, o del ratón en el navegador).
  useEffect(() => onEvent<{ x: number; y: number }>("island://cursor", (p) => setGaze(p.x, p.y)), []);
  useEffect(() => {
    if (isTauri()) return;
    const onMove = (e: MouseEvent) => {
      setGaze(e.clientX, e.clientY);
      // Sin Rust simulamos el sensor del borde superior.
      if (e.clientY <= 3) dispatch({ type: "edgeHover" });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  /** Envía un mensaje; si hay captura pendiente, va con ella. */
  const sendMessage = useCallback(
    (text: string, capture: CapturePreview | null) => {
      setDraft("");
      setPendingCapture(null);
      void chat.send(text, capture ? { thumbnail: capture.thumbnail } : undefined);
    },
    [chat],
  );

  /** "Mira mi pantalla": captura y, según el ajuste, enseña la miniatura o la envía ya. */
  const lookAtScreen = useCallback(async () => {
    if (!isTauri() || capturing) return;
    setCapturing(true);
    try {
      const preview = await api.captureScreen();
      if (settings.captureConfirm) {
        setPendingCapture(preview);
        focusInput();
      } else {
        sendMessage(draft.trim() || t("island.defaultQuestion"), preview);
      }
    } catch (e) {
      chat.notify(toAppError(e));
    } finally {
      setCapturing(false);
    }
  }, [capturing, chat, draft, focusInput, sendMessage, settings.captureConfirm, t]);

  const discardCapture = useCallback(() => {
    setPendingCapture(null);
    if (isTauri()) void api.captureDiscard().catch(console.error);
  }, []);

  const onShortcut = useCallback(
    (action: ShortcutAction) => {
      focusInput();
      if (action === "capture") void lookAtScreen();
    },
    [focusInput, lookAtScreen],
  );
  useIslandEvents(dispatch, onShortcut);

  const conversationActive =
    chat.messages.length > 0 ||
    draft.trim().length > 0 ||
    chat.phase !== "idle" ||
    capturing ||
    pendingCapture !== null;
  useEffect(() => {
    dispatch({ type: "conversation", active: conversationActive });
  }, [conversationActive]);

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
    focusInput();
  }, [ctx.state, focusInput]);

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

  const send = () => {
    const text = draft.trim() || (pendingCapture ? t("island.defaultQuestion") : "");
    if (text) sendMessage(text, pendingCapture);
  };

  // Prioridad de expresiones: lo más importante gana.
  let expression: Expression = "idle";
  if (showError) expression = "error";
  else if (capturing || pendingCapture) expression = "watching";
  else if (chat.phase === "talking") expression = "talking";
  else if (chat.phase === "thinking") expression = "thinking";
  else if (showHappy) expression = "happy";
  else if (sleeping) expression = "sleeping";
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

  const tico = (size: number) => (
    <span className="tico-slot" onClick={onTicoClick}>
      <Tico
        size={size}
        baseColor={settings.robotBaseColor}
        accentColor={settings.robotAccentColor}
        expression={expression}
        bounce={chat.tokens}
        shake={shake}
      />
    </span>
  );

  const protestText = protest === null ? null : t(`island.protest${protest + 1}` as "island.protest1");
  const lastReply = [...chat.messages].reverse().find((m) => m.role === "assistant");
  let status = t("island.hint");
  if (protestText) status = protestText;
  else if (capturing) status = t("island.capturing");
  else if (chat.phase === "thinking") status = t("island.thinking");
  else if (lastReply?.error) status = t(errorKey(lastReply.error), { message: lastReply.error.message });
  else if (chat.phase === "talking" && lastReply) status = lastReply.text.slice(-80);
  else if (chat.messages.length > 0) status = t("island.conversationOpen");

  const box = { width: geometry.width, height: geometry.height };
  let content = null;
  if (ctx.state === "peek") {
    content = (
      <div className="content content-peek" style={box} key="peek">
        {tico(28)}
      </div>
    );
  } else if (ctx.state === "compact") {
    content = (
      <div className="content content-compact" style={box} key="compact">
        {tico(36)}
        <span className="status-line">{status}</span>
      </div>
    );
  } else if (ctx.state === "expanded") {
    content = (
      <div className="content content-expanded" style={box} key="expanded">
        <ChatPanel
          tico={tico(40)}
          title={protestText ?? "Tico"}
          chat={chat}
          draft={draft}
          setDraft={setDraft}
          inputRef={inputRef}
          attachment={
            pendingCapture && <CaptureAttachment preview={pendingCapture} onCancel={discardCapture} />
          }
          canSendEmpty={pendingCapture !== null}
          onSend={send}
          onLookAtScreen={() => void lookAtScreen()}
          lookDisabled={capturing || !isTauri()}
          onOpenPermission={() => void api.openScreenPermissionSettings().catch(console.error)}
          onCollapse={() => dispatch({ type: "collapse" })}
          onClose={() => dispatch({ type: "escape" })}
        />
      </div>
    );
  }

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
        capturing={capturing}
        onClick={() => {
          setSleeping(false);
          dispatch({ type: "click" });
        }}
      >
        {content}
      </Capsule>
    </div>
  );
}
