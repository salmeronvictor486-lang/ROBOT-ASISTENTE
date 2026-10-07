import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useT } from "../i18n";
import { IconClose, IconCollapse, IconEye, IconGear, IconTrash } from "./icons";
import { errorKey, type ChatApi } from "./useChat";

interface Props {
  tico: ReactNode;
  title: string;
  chat: ChatApi;
  draft: string;
  setDraft: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Contenido extra encima del cuadro de texto (p. ej. la miniatura de la captura). */
  attachment?: ReactNode;
  canSendEmpty: boolean;
  onSend: () => void;
  onLookAtScreen: () => void;
  lookDisabled: boolean;
  onCollapse: () => void;
  onClose: () => void;
  onSettings?: (() => void) | undefined;
  onOpenPermission: () => void;
}

/** Panel expandido: cabecera, mensajes y cuadro de texto. */
export function ChatPanel({
  tico,
  title,
  chat,
  draft,
  setDraft,
  inputRef,
  attachment,
  canSendEmpty,
  onSend,
  onLookAtScreen,
  lookDisabled,
  onCollapse,
  onClose,
  onSettings,
  onOpenPermission,
}: Props) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  const busy = chat.phase !== "idle";

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
    <>
      <header className="panel-header">
        {tico}
        <strong className="panel-title">{title}</strong>
        {chat.messages.length > 0 && (
          <button type="button" className="icon-button" title={t("island.clear")} onClick={stop(chat.clear)}>
            <IconTrash />
          </button>
        )}
        {onSettings && (
          <button type="button" className="icon-button" title={t("island.settings")} onClick={stop(onSettings)}>
            <IconGear />
          </button>
        )}
        <button type="button" className="icon-button" title={t("island.collapse")} onClick={stop(onCollapse)}>
          <IconCollapse />
        </button>
        <button type="button" className="icon-button" title={t("island.close")} onClick={stop(onClose)}>
          <IconClose />
        </button>
      </header>

      <div className="messages" ref={listRef}>
        {chat.messages.length === 0 && <p className="empty-chat">{t("island.emptyChat")}</p>}
        {chat.messages.map((m) => (
          <div key={m.id} className={`message message-${m.role}`}>
            {m.thumbnail && <img className="message-thumb" src={m.thumbnail} alt="" />}
            {m.text && <p>{m.text}</p>}
            {m.role === "assistant" && !m.text && !m.error && busy && (
              <p className="typing" aria-label={t("island.thinking")}>
                <span />
                <span />
                <span />
              </p>
            )}
            {m.error && (
              <p className="message-error">{t(errorKey(m.error), { message: m.error.message })}</p>
            )}
            {m.error?.kind === "screenPermission" && (
              <button type="button" className="pill-button" onClick={onOpenPermission}>
                {t("island.openPermission")}
              </button>
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
        {attachment}
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={t("island.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Intro envía; Mayús+Intro hace salto de línea.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy && (draft.trim() || canSendEmpty)) onSend();
            }
          }}
        />
        <div className="composer-actions">
          <button type="button" className="pill-button" onClick={onLookAtScreen} disabled={lookDisabled || busy}>
            <IconEye /> {t("island.lookAtScreen")}
          </button>
          <button
            type="submit"
            className={`pill-button ${busy ? "" : "primary"}`}
            disabled={!busy && !draft.trim() && !canSendEmpty}
          >
            {busy ? t("island.stop") : t("island.send")}
          </button>
        </div>
      </form>
    </>
  );
}
