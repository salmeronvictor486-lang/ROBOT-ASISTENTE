import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { api, isTauri, toAppError } from "../lib/tauri";
import type { AppErrorPayload, FileInfo, MailStatus } from "../types";
import { FILE_KINDS } from "./fileKinds";
import { IconClip, IconClose, IconSend } from "./icons";
import { errorKey, errorVars } from "./useChat";

interface Props {
  files: FileInfo[];
  /** Destinatarios ya escritos (de "envíalo a ana@x.com"). */
  to?: string;
  /** Tu nombre, para firmar. */
  signature: string;
  onClose: () => void;
  onAddFiles: () => Promise<FileInfo[]>;
  /** Enviado (con tu cuenta) o abierto en la app de correo. */
  onDone: (result: { kind: "sent"; to: string[] } | { kind: "app"; app: string }) => void;
  onOpenSettings: () => void;
}

/** "1,2 MB", "830 KB". */
function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Nombre sin extensión ("Informe final.pdf" → "Informe final"). */
function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Ventanita para enviar archivos por correo, dentro de la isla. */
export function MailSheet({ files: initial, to: initialTo, signature, onClose, onAddFiles, onDone, onOpenSettings }: Props) {
  const t = useT();
  const [files, setFiles] = useState(initial);
  const first = initial[0];
  const label = initial.length === 1 && first ? stem(first.name) : t("mail.theFiles", { count: initial.length });
  const [to, setTo] = useState(initialTo ?? "");
  const [subject, setSubject] = useState(() => t("mail.subjectDefault", { name: label }));
  const [body, setBody] = useState(() =>
    t("mail.bodyDefault", { name: label }) + (signature ? `\n${signature}` : ""),
  );
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorPayload | null>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    api.mailStatus().then(setStatus).catch(console.error);
    api.mailContacts().then(setContacts).catch(console.error);
  }, []);
  useEffect(() => {
    toRef.current?.focus();
  }, []);

  const total = files.reduce((sum, f) => sum + f.size, 0);
  const tooBig = total > 24 * 1024 * 1024;
  const ready = status?.ready ?? false;
  const draft = () => ({ to, subject, body, attachments: files.map((f) => f.path) });
  const canSend = to.trim().length > 0 && files.length > 0 && !tooBig && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      const sentTo = await api.mailSend(draft());
      onDone({ kind: "sent", to: sentTo });
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(false);
    }
  };

  const openApp = async () => {
    if (busy || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const app = await api.mailOpenApp(draft());
      onDone({ kind: "app", app });
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className="mail-sheet"
      role="dialog"
      aria-label={t("mail.title")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Esc cierra el correo, no la isla. Ctrl/⌘ + Intro envía.
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void (ready ? send() : openApp());
        }
      }}
    >
      <header className="mail-head">
        <span className="mail-icon">✉️</span>
        <h2>{t("mail.title")}</h2>
        <button type="button" className="icon-button" title={t("mail.cancel")} onClick={stop(onClose)}>
          <IconClose />
        </button>
      </header>

      <label className="mail-field">
        <span>{t("mail.to")}</span>
        <input
          ref={toRef}
          type="email"
          multiple
          list="tico-contacts"
          value={to}
          placeholder={t("mail.toPlaceholder")}
          onChange={(e) => setTo(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id="tico-contacts">
          {contacts.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="mail-field">
        <span>{t("mail.subject")}</span>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <textarea className="mail-body" value={body} onChange={(e) => setBody(e.target.value)} aria-label={t("mail.body")} />

      <div className="mail-files">
        {files.map((f) => (
          <span key={f.path} className="file-chip" style={{ "--kind": FILE_KINDS[f.kind].color } as React.CSSProperties}>
            <b>{FILE_KINDS[f.kind].label}</b>
            <span>{f.name}</span>
            <small>{size(f.size)}</small>
            <button
              type="button"
              title={t("island.remove")}
              onClick={stop(() => setFiles((list) => list.filter((x) => x.path !== f.path)))}
            >
              <IconClose />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="mail-add"
          onClick={stop(() => {
            void onAddFiles().then((more) =>
              setFiles((list) => [...list, ...more.filter((m) => !list.some((l) => l.path === m.path))]),
            );
          })}
        >
          <IconClip /> {t("mail.addFile")}
        </button>
      </div>

      <footer className="mail-foot">
        <div className="mail-note" role="status">
          {error ? (
            <span className="mail-error">
              {t(errorKey(error), errorVars(error))}{" "}
              {(error.kind === "mailAuth" || error.kind === "mailSetup") && (
                <button type="button" className="link-inline" onClick={stop(onOpenSettings)}>
                  {t("mail.review")}
                </button>
              )}
            </span>
          ) : tooBig ? (
            <span className="mail-error">{t("mail.tooBig", { size: size(total) })}</span>
          ) : status && !ready ? (
            <span>
              {t("mail.notReady")}{" "}
              <button type="button" className="link-inline" onClick={stop(onOpenSettings)}>
                {t("mail.connect")}
              </button>
            </span>
          ) : ready ? (
            <span className="mail-from">{t("mail.from", { host: status?.host ?? "" })}</span>
          ) : null}
        </div>
        {ready ? (
          <>
            <button type="button" className="pill-button" onClick={stop(() => void openApp())} disabled={busy || files.length === 0}>
              {t("mail.openApp")}
            </button>
            <button type="button" className="pill-button primary send-mail" onClick={stop(() => void send())} disabled={!canSend}>
              {busy ? <span className="mini-spinner" aria-hidden="true" /> : <IconSend />}
              {busy ? t("mail.sending") : t("mail.send")}
            </button>
          </>
        ) : (
          <button type="button" className="pill-button primary send-mail" onClick={stop(() => void openApp())} disabled={busy || files.length === 0 || tooBig}>
            {busy ? <span className="mini-spinner" aria-hidden="true" /> : <IconSend />}
            {t("mail.openAppPrimary")}
          </button>
        )}
      </footer>
    </div>
  );
}
