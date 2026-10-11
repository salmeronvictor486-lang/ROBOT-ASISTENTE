import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import { api, isTauri, toAppError } from "../lib/tauri";
import type { DbInfo, Settings } from "../types";
import { Row, Section, Toggle } from "./fields";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

/** "12,3 MB", "850 KB"… */
function formatBytes(bytes: number, lang: string): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString(lang, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

/** Botón que pide un segundo clic antes de borrar. */
function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      className="button danger"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

/** Base de datos local: qué guarda, dónde, copia de seguridad y borrar. */
export function DataSection({ settings, update }: Props) {
  const t = useT();
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (isTauri()) api.dbInfo().then(setInfo).catch(console.error);
  }, []);
  useEffect(refresh, [refresh]);

  const run = (action: () => Promise<unknown>, done: string) => {
    action()
      .then(() => setNotice(done))
      .catch((e: unknown) => setNotice(t("settings.error", { message: toAppError(e).message })))
      .finally(refresh);
  };

  const lang = settings.language === "auto" ? navigator.language : settings.language;
  return (
    <Section id="data" title={t("settings.section.data")}>
      <p className="hint">{t("settings.dataHint")}</p>
      <Row label={t("settings.saveHistory")} hint={t("settings.saveHistoryHint")}>
        <Toggle label={t("settings.saveHistory")} checked={settings.saveHistory} onChange={(saveHistory) => update({ saveHistory })} />
      </Row>
      <Row label={t("settings.database")} hint={info?.path ?? "tico.db"}>
        <span className="db-stats">
          {info
            ? t("settings.databaseStats", {
                messages: info.messages,
                conversations: info.conversations,
                pdfs: info.conversions,
                size: formatBytes(info.bytes, lang),
              })
            : "—"}
        </span>
      </Row>
      <div className="inline data-actions">
        <button type="button" className="button" disabled={!info} onClick={() => info && void api.fileReveal(info.path).catch(console.error)}>
          {t("settings.showDatabase")}
        </button>
        <button
          type="button"
          className="button"
          disabled={!isTauri()}
          onClick={() =>
            void api
              .dbBackup()
              .then((path) => {
                setNotice(t("settings.backupDone"));
                void api.fileReveal(path).catch(console.error);
              })
              .catch((e: unknown) => setNotice(t("settings.error", { message: toAppError(e).message })))
          }
        >
          {t("settings.backup")}
        </button>
        <ConfirmButton
          label={t("settings.clearChats")}
          confirm={t("settings.confirmClear")}
          onConfirm={() => run(api.historyClearAll, t("settings.chatsCleared"))}
        />
        <ConfirmButton
          label={t("settings.clearPdfs")}
          confirm={t("settings.confirmClear")}
          onConfirm={() => run(api.conversionsClear, t("settings.pdfsCleared"))}
        />
      </div>
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
    </Section>
  );
}
