import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { I18nContext, resolveLang, useI18nLang, useT } from "../i18n";
import { playSound, type SoundKind } from "../lib/sound";
import { api, isTauri, onEvent, toAppError } from "../lib/tauri";
import type { Expression } from "../robot/expressions";
import { setGaze } from "../robot/gaze";
import { Tico } from "../robot/Tico";
import { useTripleClick } from "../robot/useTripleClick";
import { useSettings } from "../settings/useSettings";
import { findTico, type CapturePreview, type FileInfo, type IslandInfo, type NotchInfo, type Settings } from "../types";
import { ActivityIndicator } from "./ActivityIndicator";
import { CaptureAttachment } from "./CaptureAttachment";
import { Capsule } from "./Capsule";
import { ChatView } from "./ChatView";
import { FilesView } from "./FilesView";
import { Header, type Tab } from "./Header";
import { HomeView } from "./HomeView";
import { wantsPdf, wantsScreen } from "./intents";
import { initialIsland, islandReducer, shouldAutoHide } from "./machine";
import { ModelPicker } from "./ModelPicker";
import { capsuleGeometry, capsuleHitRect, capsuleX, TOP_GAP } from "./sizes";
import { outfitFor, TicoAvatar } from "./TicoAvatar";
import { errorKey, errorVars, useChat, type PdfTask } from "./useChat";
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
const THANKS = /\b(gracias|grac|thanks|thank you|thx|merci|moltes gracies|te quiero|t'estimo|love you|eres el mejor|ets el millor)\b/i;

export function IslandApp() {
  const settings = useSettings();
  const lang = resolveLang(settings.language);
  // Rust no sabe el idioma del sistema; se lo decimos para traducir el menú de la bandeja.
  useEffect(() => {
    if (isTauri()) void api.setUiLanguage(lang).catch(console.error);
  }, [lang]);
  return (
    <I18nContext.Provider value={lang}>
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

/** Emociones cortas (mareado, enamorado, guiño…) que se van solas. */
function useEmote(): [Expression | null, (expression: Expression, ms: number) => void] {
  const [emote, setEmote] = useState<{ expression: Expression; at: number; ms: number } | null>(null);
  useEffect(() => {
    if (!emote) return;
    const id = window.setTimeout(() => setEmote(null), emote.ms);
    return () => window.clearTimeout(id);
  }, [emote]);
  const play = useCallback((expression: Expression, ms: number) => setEmote({ expression, at: Date.now(), ms }), []);
  return [emote?.expression ?? null, play];
}

function Island({ settings }: { settings: Settings }) {
  const t = useT();
  const lang = useI18nLang();
  const [ctx, dispatch] = useReducer(islandReducer, initialIsland);
  const [info, setInfo] = useState<IslandInfo>(() => ({ platform: "", notch: simulatedNotch() }));
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [tab, setTab] = useState<Tab>("home");
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [shake, setShake] = useState(0);
  const [protest, setProtest] = useState<number | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const lastUse = useRef<number | null>(null);
  const active = findTico(settings, settings.activeTico);
  const chat = useChat(active.id, lang);
  const [capturing, setCapturing] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<CapturePreview | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(0);
  /** El selector de archivos está abierto: la isla no se esconde mientras eliges. */
  const [picking, setPicking] = useState(false);
  const [recent, setRecent] = useState<{ id: number; task: PdfTask }[]>([]);
  const [emote, playEmote] = useEmote();
  const showError = useRecent(chat.errorAt, ERROR_MS);

  /** Guarda ajustes desde la isla (cambiar de Tico, de modelo, silenciar…). */
  const save = useCallback((next: Settings) => {
    if (isTauri()) void api.settingsUpdate(next).catch(console.error);
  }, []);

  const soundsOn = settings.sounds;
  const sound = useCallback(
    (kind: SoundKind) => {
      if (soundsOn) playSound(kind);
    },
    [soundsOn],
  );
  useEffect(() => {
    if (chat.doneAt) sound("done");
  }, [chat.doneAt, sound]);
  useEffect(() => {
    if (chat.errorAt) sound("error");
  }, [chat.errorAt, sound]);
  // Al abrirse la isla, Tico suena y saluda con la mano.
  const [wave, setWave] = useState(0);
  const wasHidden = useRef(true);
  useEffect(() => {
    const hidden = ctx.state === "hidden";
    if (wasHidden.current && !hidden) {
      sound("open");
      const id = window.setTimeout(() => setWave((w) => w + 1), 120);
      wasHidden.current = hidden;
      return () => window.clearTimeout(id);
    }
    wasHidden.current = hidden;
  }, [ctx.state, sound]);
  const showHappy = useRecent(chat.doneAt, HAPPY_MS);

  // El notch cambia si la isla pasa del MacBook a un monitor externo.
  useEffect(
    () => onEvent<NotchInfo | null>("island://notch", (notch) => setInfo((i) => ({ ...i, notch }))),
    [],
  );

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

  // --- Archivos ---------------------------------------------------------------------

  const addFiles = useCallback(
    (list: FileInfo[]) => {
      if (list.length === 0) return;
      setFiles((current) => {
        const known = new Set(current.map((f) => f.path));
        return [...current, ...list.filter((f) => !known.has(f.path))];
      });
      setTab("files");
      sound("drop");
      playEmote("happy", 1200);
    },
    [playEmote, sound],
  );

  // Soltar archivos sobre la isla (eventos nativos de Tauri: traen las rutas).
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let unlisten: (() => void) | null = null;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter") {
          setDragging(true);
          setTab("files");
          dispatch({ type: "open" });
        } else if (payload.type === "leave") {
          setDragging(false);
        } else if (payload.type === "drop") {
          setDragging(false);
          api.filesInspect(payload.paths).then(addFiles).catch(console.error);
        }
      })
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [addFiles]);

  const pickFiles = useCallback(async () => {
    if (!isTauri()) return;
    setPicking(true);
    try {
      addFiles(await api.filesPick(false));
    } catch (e) {
      chat.notify(toAppError(e));
    } finally {
      setPicking(false);
    }
  }, [addFiles, chat]);

  const removeFile = useCallback((path: string) => setFiles((list) => list.filter((f) => f.path !== path)), []);

  // --- Pasar a PDF (lo hace Tico solo, sin IA) ----------------------------------------

  const trackRecent = useCallback((id: number, task: PdfTask) => {
    setRecent((list) => {
      const others = list.filter((r) => r.id !== id);
      return [{ id, task }, ...others].slice(0, 12);
    });
  }, []);

  const convertFiles = useCallback(
    async (list: FileInfo[], userText: string) => {
      if (!isTauri()) return;
      setFiles((current) => current.filter((f) => !list.some((l) => l.path === f.path)));
      for (const [i, file] of list.entries()) {
        const id = chat.startTask(i === 0 ? userText : "", file.name, i === 0 ? list : undefined);
        trackRecent(id, { status: "working", source: file.name });
        setConverting((n) => n + 1);
        try {
          const result = await api.convertToPdf(file.path);
          chat.finishTask(id, { result });
          trackRecent(id, { status: "done", source: file.name, result });
          sound("success");
          playEmote("proud", 1800);
        } catch (e) {
          const error = toAppError(e);
          chat.finishTask(id, { error });
          trackRecent(id, { status: "error", source: file.name, error });
        } finally {
          setConverting((n) => n - 1);
        }
      }
    },
    [chat, playEmote, sound, trackRecent],
  );

  /** "Pásame este Word a PDF" sin archivo: el documento abierto en Word (o eliges uno). */
  const convertActiveDocument = useCallback(
    async (userText: string) => {
      if (!isTauri()) return;
      const id = chat.startTask(userText, t("island.lookingForDoc"));
      setConverting((n) => n + 1);
      try {
        const result = await api.convertToPdf();
        chat.finishTask(id, { result });
        trackRecent(id, { status: "done", source: result.source, result });
        sound("success");
        playEmote("proud", 1800);
      } catch (e) {
        const error = toAppError(e);
        if (error.kind === "noDocument") {
          chat.finishTask(id, { error: { ...error, message: t("island.pickDocument"), kind: "pick" } });
          const picked = await api.filesPick(true).catch(() => [] as FileInfo[]);
          const convertible = picked.filter((f) => f.canConvert);
          if (convertible.length) void convertFiles(convertible, "");
        } else {
          chat.finishTask(id, { error });
        }
      } finally {
        setConverting((n) => n - 1);
      }
    },
    [chat, convertFiles, playEmote, sound, t, trackRecent],
  );

  // --- Enviar ---------------------------------------------------------------------------

  /** Envía un mensaje con lo que haya adjunto (captura y archivos). */
  const sendMessage = useCallback(
    (text: string, capture: CapturePreview | null, attached: FileInfo[]) => {
      setDraft("");
      setPendingCapture(null);
      setFiles([]);
      setTab("chat");
      sound("send");
      if (THANKS.test(text)) playEmote("love", 2200);
      void chat.send(text, {
        ...(capture ? { capture: { thumbnail: capture.thumbnail } } : {}),
        files: attached,
      });
    },
    [chat, playEmote, sound],
  );

  /** "Mira mi pantalla": captura y, según el ajuste, enseña la miniatura o la envía ya. */
  const lookAtScreen = useCallback(
    async (question?: string) => {
      if (!isTauri() || capturing) return;
      setTab("chat");
      setCapturing(true);
      try {
        const preview = await api.captureScreen();
        // Si lo ha pedido con palabras ("¿qué ves?"), no hace falta confirmar.
        if (question) sendMessage(question, preview, files);
        else if (settings.captureConfirm) {
          setPendingCapture(preview);
          focusInput();
        } else sendMessage(draft.trim() || t("island.defaultQuestion"), preview, files);
      } catch (e) {
        chat.notify(toAppError(e));
        // Si lo había pedido con palabras, se lo devolvemos al cuadro de texto para no perderlo.
        if (question) {
          setDraft(question);
          focusInput();
        }
      } finally {
        setCapturing(false);
      }
    },
    [capturing, chat, draft, files, focusInput, sendMessage, settings.captureConfirm, t],
  );

  const send = () => {
    const text = draft.trim() || (pendingCapture ? t("island.defaultQuestion") : "");
    if (!text && files.length === 0) return;
    const message = text || t("island.prompt.summary");
    // "Pásame este Word a PDF": lo hacemos nosotros, sin IA.
    if (!pendingCapture && wantsPdf(message)) {
      setDraft("");
      setTab("chat");
      const docs = files.filter((f) => f.canConvert);
      if (docs.length) void convertFiles(docs, message);
      else void convertActiveDocument(message);
      return;
    }
    // "¿Qué ves en mi pantalla?": capturamos sin tener que pulsar el botón.
    if (!pendingCapture && settings.autoCapture && wantsScreen(message)) {
      setDraft("");
      void lookAtScreen(message);
      return;
    }
    sendMessage(message, pendingCapture, files);
  };

  const discardCapture = useCallback(() => {
    setPendingCapture(null);
    if (isTauri()) void api.captureDiscard().catch(console.error);
  }, []);

  const onShortcut = useCallback(
    (action: ShortcutAction) => {
      setTab("chat");
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
    pendingCapture !== null ||
    files.length > 0 ||
    dragging ||
    picking ||
    converting > 0;
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

  // Esc cierra la isla; Ctrl/⌘ + 1, 2, 3 cambian de pestaña.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "escape" });
      const tabs: Record<string, Tab> = { "1": "home", "2": "chat", "3": "files" };
      const next = tabs[e.key];
      if ((e.ctrlKey || e.metaKey) && next) {
        e.preventDefault();
        setTab(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Expandida: pedimos el foco del teclado para poder escribir.
  useEffect(() => {
    if (ctx.state !== "expanded") return;
    if (isTauri()) void api.islandFocus().catch(console.error);
    if (tab === "chat") focusInput();
  }, [ctx.state, tab, focusInput]);

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

  // Tres clics seguidos: Tico se marea y protesta.
  const onTicoClick = useTripleClick(() => {
    setShake((n) => n + 1);
    setProtest(Math.floor(Math.random() * PROTESTS));
    playEmote("dizzy", 2600);
  });
  useEffect(() => {
    if (protest === null) return;
    const id = window.setTimeout(() => setProtest(null), 2500);
    return () => window.clearTimeout(id);
  }, [protest]);

  const pickTico = (id: string) => {
    if (id === active.id) return;
    save({ ...settings, activeTico: id });
    setWave((w) => w + 1);
    sound("pop");
  };

  // Prioridad de expresiones: lo más importante gana.
  let expression: Expression = "idle";
  if (dragging) expression = "box";
  else if (showError) expression = "error";
  else if (emote) expression = emote;
  else if (converting > 0) expression = "working";
  else if (capturing || pendingCapture) expression = "watching";
  else if (chat.phase === "talking") expression = "talking";
  else if (chat.phase === "thinking") expression = "thinking";
  else if (showHappy) expression = "happy";
  else if (sleeping) expression = "sleeping";
  else if (ctx.pointerInside && ctx.state !== "expanded") expression = "curious";

  const notch = info.notch;
  const topGap = notch ? 0 : TOP_GAP;
  const geometry = capsuleGeometry(ctx.state, settings.islandSize, notch);
  // Con notch la isla siempre va centrada (el notch está en el centro).
  const position = notch ? "center" : settings.islandPosition;
  const x = capsuleX(position, windowWidth, geometry.width);

  // Le decimos a Rust dónde está la cápsula para el click-through.
  const hit = capsuleHitRect(ctx.state, settings.islandSize, position, windowWidth, notch, topGap);
  const hitKey = hit ? `${hit.x}|${hit.width}|${hit.height}` : "none";
  useEffect(() => {
    if (isTauri()) void api.islandSetRect(hit).catch(console.error);
    // `hitKey` resume `hit`: solo avisamos cuando cambia de verdad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitKey]);

  const outfit = outfitFor(active, settings.seasonalOutfits);
  const tico = (size: number) => (
    <span className="tico-slot" onClick={onTicoClick}>
      <Tico
        size={size}
        baseColor={active.baseColor}
        accentColor={active.accentColor}
        expression={expression}
        bounce={chat.tokens}
        shake={shake}
        wave={wave}
        outfit={outfit}
      />
    </span>
  );

  const protestText = protest === null ? null : t(`island.protest${protest + 1}` as "island.protest1");
  const lastReply = [...chat.messages].reverse().find((m) => m.role === "assistant");
  let status = t("island.hint");
  if (protestText) status = protestText;
  else if (converting > 0) status = t("island.working");
  else if (capturing) status = t("island.capturing");
  else if (chat.phase === "thinking") status = t("island.thinking");
  else if (lastReply?.error) status = t(errorKey(lastReply.error), errorVars(lastReply.error));
  else if (chat.phase === "talking" && lastReply) status = lastReply.text.slice(-80);
  else if (files.length > 0) status = t("island.dropped", { count: files.length });
  else if (chat.messages.length > 0) status = t("island.conversationOpen");

  const busy = capturing || chat.phase !== "idle" || converting > 0;
  // Con notch, todo el contenido va por debajo de él (contentTop) o a sus lados (orejas).
  const box = {
    width: geometry.width,
    height: geometry.height,
    paddingTop: geometry.contentTop ? geometry.contentTop + 4 : undefined,
  };

  const ticoChip = (
    <span className="tico-chip" style={{ "--pill": active.accentColor } as React.CSSProperties}>
      <TicoAvatar profile={active} size={20} seasonal={settings.seasonalOutfits} />
      <span>{active.name}</span>
    </span>
  );

  let content = null;
  if (ctx.state === "peek" && notch) {
    content = (
      <div className="content content-peek-notch" style={box} key="peek">
        <span className="ear">{tico(Math.min(notch.height - 2, 34))}</span>
        <span className="ear">
          <ActivityIndicator busy={busy} error={showError} />
        </span>
      </div>
    );
  } else if (ctx.state === "peek") {
    content = (
      <div className="content content-peek" style={box} key="peek">
        {tico(32)}
      </div>
    );
  } else if (ctx.state === "compact") {
    content = (
      <div className="content content-compact" style={box} key="compact">
        {tico(notch ? 40 : 44)}
        <span className="status-line">{status}</span>
        {ticoChip}
        <ActivityIndicator busy={busy} error={showError} />
      </div>
    );
  } else if (ctx.state === "expanded") {
    let view;
    if (tab === "home") {
      view = (
        <HomeView
          tico={tico(92)}
          active={active}
          ticos={settings.ticos}
          seasonal={settings.seasonalOutfits}
          status={status === t("island.hint") ? "" : status}
          withChat={chat.hasMessages}
          onPickTico={pickTico}
          onNewTico={() => void api.openSettings("ticos").catch(console.error)}
          onScreen={() => void lookAtScreen()}
          onPdf={() => {
            setTab("chat");
            const docs = files.filter((f) => f.canConvert);
            if (docs.length) void convertFiles(docs, t("island.quick.pdf"));
            else void convertActiveDocument(t("island.quick.pdf"));
          }}
          onFile={() => void pickFiles()}
          onNewChat={() => {
            chat.clear();
            setTab("chat");
          }}
        />
      );
    } else if (tab === "files") {
      view = (
        <FilesView
          tico={tico(files.length && !dragging ? 56 : 76)}
          files={files}
          recent={recent.map((r) => r.task)}
          dragging={dragging}
          onPick={() => void pickFiles()}
          onRemove={removeFile}
          onPdf={(list) => void convertFiles(list, t("island.action.pdf"))}
          onPrompt={(prompt) => sendMessage(prompt, null, files)}
          onAsk={() => {
            setTab("chat");
            focusInput();
          }}
        />
      );
    } else {
      view = (
        <ChatView
          tico={tico(60)}
          ticoName={active.name}
          modelPicker={<ModelPicker settings={settings} tico={active} save={save} />}
          chat={chat}
          draft={draft}
          setDraft={setDraft}
          inputRef={inputRef}
          capture={pendingCapture && <CaptureAttachment preview={pendingCapture} onCancel={discardCapture} />}
          files={files}
          onRemoveFile={removeFile}
          canSendEmpty={pendingCapture !== null || files.length > 0}
          onSend={send}
          onAttach={() => void pickFiles()}
          onLookAtScreen={() => void lookAtScreen()}
          lookDisabled={capturing || !isTauri()}
          onOpenPermission={() => void api.openScreenPermissionSettings().catch(console.error)}
          onCopied={() => playEmote("wink", 1200)}
        />
      );
    }
    content = (
      <div className="content content-expanded" style={box} key="expanded">
        <Header
          tab={tab}
          setTab={setTab}
          status={ticoChip}
          sounds={settings.sounds}
          onToggleSound={() => save({ ...settings, sounds: !settings.sounds })}
          onClear={tab === "chat" && chat.messages.length > 0 ? chat.clear : undefined}
          onSettings={isTauri() ? () => void api.openSettings().catch(console.error) : undefined}
          onCollapse={() => dispatch({ type: "collapse" })}
          onClose={() => dispatch({ type: "escape" })}
          fileCount={files.length}
        />
        <div className="tab-body" key={tab}>
          {view}
        </div>
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
    <div className="island-root" style={{ "--accent": active.accentColor } as React.CSSProperties} {...browserPointer}>
      <Capsule
        geometry={geometry}
        x={x}
        top={topGap}
        visible={ctx.state !== "hidden" || notch !== null}
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

/** En el navegador, `?notch=1` simula el notch de un MacBook para probar el diseño. */
function simulatedNotch(): NotchInfo | null {
  if (isTauri()) return null;
  return new URLSearchParams(window.location.search).has("notch") ? { width: 185, height: 32 } : null;
}
