import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { commandQuery, matchCommands, type Command } from "./commands";
import { useT } from "../i18n";
import type { FileInfo } from "../types";
import { FILE_KINDS } from "./fileKinds";
import { IconClip, IconClose, IconCopy, IconEye, IconGear, IconSend, IconSparkle, IconStop } from "./icons";
import { Markdown } from "./Markdown";
import { TaskCard } from "./TaskCard";
import { errorKey, errorVars, type ChatApi, type UiMessage } from "./useChat";

/** Errores que se arreglan en Ajustes → IA (clave, saldo, modelo, servidor…). */
const SETTINGS_ERRORS = new Set(["missingKey", "invalidKey", "noCredit", "model", "serverOffline", "ollamaOffline", "missingUrl", "keyring"]);

/** Una idea para empezar cuando el chat está vacío. */
export interface Suggestion {
  label: string;
  run: () => void;
}

interface Props {
  /** Tico grande a la izquierda (reacciona a lo que pasa en el chat). */
  tico: ReactNode;
  ticoName: string;
  /** Chip de IA y modelo. */
  modelPicker: ReactNode;
  chat: ChatApi;
  draft: string;
  setDraft: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Miniatura de la captura pendiente. */
  capture: ReactNode;
  files: FileInfo[];
  onRemoveFile: (path: string) => void;
  canSendEmpty: boolean;
  onSend: () => void;
  onAttach: () => void;
  onLookAtScreen: () => void;
  lookDisabled: boolean;
  onOpenPermission: () => void;
  onCopied: () => void;
  /** Abre Ajustes en la sección de IA (para errores de clave, saldo, modelo…). */
  onOpenAiSettings: () => void;
  /** Comandos de la paleta "/". */
  commands: Command[];
  suggestions: Suggestion[];
}

/** Pestaña de chat: Tico a la izquierda, mensajes y cuadro de texto a la derecha. */
export function ChatView({
  tico,
  ticoName,
  modelPicker,
  chat,
  draft,
  setDraft,
  inputRef,
  capture,
  files,
  onRemoveFile,
  canSendEmpty,
  onSend,
  onAttach,
  onLookAtScreen,
  lookDisabled,
  onOpenPermission,
  onCopied,
  onOpenAiSettings,
  commands,
  suggestions,
}: Props) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  const busy = chat.phase !== "idle";

  // Paleta de comandos: se abre al escribir "/" y se cierra con Esc hasta que cambie el texto.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const query = commandQuery(draft);
  const matches = query === null || dismissed === draft ? [] : matchCommands(query, commands);
  const menuOpen = matches.length > 0;
  const active = Math.min(selected, Math.max(0, matches.length - 1));
  const runCommand = (command: Command) => {
    setDraft("");
    setSelected(0);
    command.run();
  };

  const lastId = chat.messages[chat.messages.length - 1]?.id;
  const before = (m: UiMessage): UiMessage | undefined => chat.messages[chat.messages.findIndex((x) => x.id === m.id) - 1];

  // Siempre mostramos lo último que ha llegado.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.messages]);

  const stop = (handler: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    handler();
  };

  return (
    <div className="chat-view">
      <div className="chat-side">{tico}</div>
      <div className="chat-main">
        <div className="messages" ref={listRef}>
          {chat.messages.length === 0 && (
            <div className="empty-chat">
              <p>{t("island.emptyChat")}</p>
              <div className="suggestions">
                {suggestions.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    className="suggestion"
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={stop(s.run)}
                  >
                    <IconSparkle />
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="slash-tip">{t("island.slashTip")}</p>
            </div>
          )}
          {chat.messages.map((m) => (
            <div key={m.id} className={`message message-${m.role}${m.task ? " message-task" : ""}`}>
              {m.thumbnail && <img className="message-thumb" src={m.thumbnail} alt="" />}
              {!m.thumbnail && m.capture && <span className="capture-tag">{t("island.capturedBefore")}</span>}
              {m.files && m.files.length > 0 && (
                <div className="message-files">
                  {m.files.map((f) => (
                    <span key={f.path} className="file-tag" style={{ "--kind": FILE_KINDS[f.kind].color } as React.CSSProperties}>
                      <b>{FILE_KINDS[f.kind].label}</b> {f.name}
                    </span>
                  ))}
                </div>
              )}
              {m.task && <TaskCard task={m.task} />}
              {m.text && (m.role === "assistant" ? <Markdown text={m.text} /> : <p>{m.text}</p>)}
              {m.notices?.map((n, i) => (
                <p key={`${n.kind}-${i}`} className="notice">
                  {t(`island.notice.${n.kind}`, { detail: n.detail })}
                </p>
              ))}
              {m.role === "assistant" && m.text && !busy && (
                <div className="message-actions">
                  <CopyButton text={m.text} onCopied={onCopied} />
                  {m.id === lastId && !m.task && !before(m)?.thumbnail && !before(m)?.capture && (
                    <button type="button" className="copy-button" onClick={stop(chat.regenerate)}>
                      ↻ {t("island.regenerate")}
                    </button>
                  )}
                </div>
              )}
              {m.role === "assistant" && !m.text && !m.error && !m.task && busy && (
                <p className="typing" aria-label={t("island.thinking")}>
                  <span />
                  <span />
                  <span />
                </p>
              )}
              {m.error && <p className="message-error">{t(errorKey(m.error), errorVars(m.error))}</p>}
              {m.error && !busy && (
                <div className="error-actions">
                  {before(m)?.role === "user" && !m.task && (
                    <button type="button" className="pill-button primary" onClick={stop(() => chat.retry(m.id))}>
                      ↻ {t("island.retry")}
                    </button>
                  )}
                  {SETTINGS_ERRORS.has(m.error.kind) && (
                    <button type="button" className="pill-button" onClick={stop(onOpenAiSettings)}>
                      <IconGear /> {t(m.error.kind === "missingKey" ? "island.addKey" : "island.fixInSettings")}
                    </button>
                  )}
                  {m.error.kind === "screenPermission" && (
                    <button type="button" className="pill-button" onClick={stop(onOpenPermission)}>
                      {t("island.openPermission")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) chat.cancel();
            else onSend();
          }}
        >
          {(capture || files.length > 0) && (
            <div className="attachments">
              {capture}
              {files.map((f) => (
                <span key={f.path} className="file-chip" style={{ "--kind": FILE_KINDS[f.kind].color } as React.CSSProperties}>
                  <b>{FILE_KINDS[f.kind].label}</b>
                  <span>{f.name}</span>
                  <button type="button" title={t("island.remove")} onClick={stop(() => onRemoveFile(f.path))}>
                    <IconClose />
                  </button>
                </span>
              ))}
            </div>
          )}
          {menuOpen && (
            <div className="command-menu" role="listbox" aria-label={t("island.commands")}>
              {matches.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`command-row${i === active ? " is-active" : ""}`}
                  onMouseEnter={() => setSelected(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={stop(() => runCommand(c))}
                >
                  <span className="command-icon">{c.icon}</span>
                  <span className="command-label">{c.label}</span>
                  <span className="command-slug">/{c.slug}</span>
                </button>
              ))}
            </div>
          )}
          <div className="composer-top">{modelPicker}</div>
          <div className="composer-row">
            <button type="button" className="round-button" title={t("island.attach")} onClick={stop(onAttach)}>
              <IconClip />
            </button>
            <button
              type="button"
              className="round-button"
              title={t("island.lookAtScreen")}
              onClick={stop(onLookAtScreen)}
              disabled={lookDisabled || busy}
            >
              <IconEye />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder={t("island.placeholderTico", { name: ticoName })}
              onChange={(e) => {
                setDraft(e.target.value);
                setSelected(0);
              }}
              aria-autocomplete="list"
              aria-expanded={menuOpen}
              onKeyDown={(e) => {
                if (menuOpen) {
                  const count = matches.length;
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelected((active + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
                    return;
                  }
                  if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                    e.preventDefault();
                    const command = matches[active];
                    if (command) runCommand(command);
                    return;
                  }
                  if (e.key === "Escape") {
                    // Solo cierra la paleta, no la isla.
                    e.preventDefault();
                    e.stopPropagation();
                    setDismissed(draft);
                    return;
                  }
                }
                // Intro envía; Mayús+Intro hace salto de línea.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!busy && (draft.trim() || canSendEmpty)) onSend();
                }
              }}
            />
            <button
              type="submit"
              className={`send-button${busy ? " is-busy" : ""}`}
              title={busy ? t("island.stop") : t("island.send")}
              disabled={!busy && !draft.trim() && !canSendEmpty}
            >
              {busy ? <IconStop /> : <IconSend />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Copia la respuesta al portapapeles y avisa un momento con "Copiado". */
function CopyButton({ text, onCopied }: { text: string; onCopied: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      className="copy-button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            onCopied();
          })
          .catch(console.error);
      }}
    >
      <IconCopy /> {copied ? t("island.copied") : t("island.copy")}
    </button>
  );
}
