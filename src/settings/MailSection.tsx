import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import { errorKey, errorVars } from "../island/useChat";
import { api, isTauri, toAppError } from "../lib/tauri";
import type { AppErrorPayload, MailSettings, MailStatus, Settings } from "../types";
import { CommitInput, Row, Section, Segmented } from "./fields";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

type Test = { kind: "idle" } | { kind: "testing" } | { kind: "ok" } | { kind: "error"; error: AppErrorPayload };

/** Tu cuenta de correo para que Tico envíe archivos él solo. */
export function MailSection({ settings, update }: Props) {
  const t = useT();
  const mail = settings.mail;
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [password, setPassword] = useState("");
  const [test, setTest] = useState<Test>({ kind: "idle" });
  const [advanced, setAdvanced] = useState(Boolean(mail.host));

  const refresh = useCallback(() => {
    if (isTauri()) api.mailStatus().then(setStatus).catch(console.error);
  }, []);
  // La dirección decide el servidor: al cambiarla, preguntamos otra vez.
  useEffect(refresh, [refresh, mail.address, mail.host]);

  const patch = (changes: Partial<MailSettings>) => {
    setTest({ kind: "idle" });
    update({ mail: { ...mail, ...changes } });
  };

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      await api.mailTest();
      setTest({ kind: "ok" });
    } catch (e) {
      setTest({ kind: "error", error: toAppError(e) });
    }
  };

  const savePassword = async () => {
    try {
      await api.mailSetPassword(password);
      setPassword("");
      refresh();
      void runTest();
    } catch (e) {
      setTest({ kind: "error", error: toAppError(e) });
    }
  };

  return (
    <Section id="mail" title={t("settings.section.mail")}>
      <p className="hint">{t("settings.mailHint")}</p>
      <Row label={t("settings.mailAddress")}>
        <CommitInput type="email" value={mail.address} placeholder="tu.nombre@gmail.com" onCommit={(address) => patch({ address: address.trim() })} />
      </Row>
      <Row label={t("settings.mailName")} hint={t("settings.mailNameHint")}>
        <CommitInput value={mail.name} placeholder="Victor" onCommit={(name) => patch({ name })} />
      </Row>
      <Row label={t("settings.mailPassword")} hint={t("settings.mailPasswordHint")}>
        <div className="stack">
          <div className="inline">
            <span className={`badge ${status?.hasPassword ? "ok" : ""}`}>
              {status?.hasPassword ? t("settings.apiKeySaved") : t("settings.apiKeyMissing")}
            </span>
            {status?.helpUrl && (
              <button type="button" className="link-button" onClick={() => void api.openUrl(status.helpUrl ?? "").catch(console.error)}>
                {t("settings.mailCreatePassword")} ↗
              </button>
            )}
          </div>
          <div className="inline">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("settings.mailPasswordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password.trim()) void savePassword();
              }}
            />
            <button type="button" className="button primary" disabled={!password.trim() || !isTauri()} onClick={() => void savePassword()}>
              {t("settings.apiKeySave")}
            </button>
            {status?.hasPassword && (
              <button
                type="button"
                className="button"
                onClick={() => void api.mailDeletePassword().then(refresh).catch(console.error)}
              >
                {t("settings.apiKeyDelete")}
              </button>
            )}
          </div>
        </div>
      </Row>
      <Row label={t("settings.mailServer")} {...(status?.host ? {} : { hint: t("settings.mailUnknownServer") })}>
        <div className="inline">
          <span className="hint">{status?.host ?? "—"}</span>
          <button type="button" className="button" disabled={!status?.ready || test.kind === "testing"} onClick={() => void runTest()}>
            {test.kind === "testing" ? t("settings.testing") : t("settings.mailTest")}
          </button>
          {test.kind === "ok" && <span className="ok-text">{t("settings.mailOk")}</span>}
          {test.kind === "error" && <span className="error-text">{t(errorKey(test.error), errorVars(test.error))}</span>}
        </div>
      </Row>
      {advanced ? (
        <>
          <Row label={t("settings.mailHost")} hint={t("settings.mailHostHint")}>
            <CommitInput value={mail.host} placeholder="smtp.miempresa.com" onCommit={(host) => patch({ host })} />
          </Row>
          <Row label={t("settings.mailSecurity")}>
            <Segmented
              value={mail.security}
              onChange={(security) => patch({ security })}
              options={[
                { value: "ssl", label: "SSL/TLS · 465" },
                { value: "starttls", label: "STARTTLS · 587" },
              ]}
            />
          </Row>
          <Row label={t("settings.mailPort")}>
            <CommitInput
              type="number"
              value={mail.port ? String(mail.port) : ""}
              placeholder={mail.security === "ssl" ? "465" : "587"}
              onCommit={(port) => patch({ port: Math.max(0, Math.min(65535, Number(port) || 0)) })}
            />
          </Row>
          <Row label={t("settings.mailUser")} hint={t("settings.mailUserHint")}>
            <CommitInput value={mail.username} placeholder={mail.address} onCommit={(username) => patch({ username })} />
          </Row>
        </>
      ) : (
        <div className="inline">
          <button type="button" className="link-button" onClick={() => setAdvanced(true)}>
            {t("settings.mailAdvanced")}
          </button>
        </div>
      )}
    </Section>
  );
}
