import type { ReactNode } from "react";
import { useT } from "../i18n";
import type { FileInfo } from "../types";
import { FILE_KINDS } from "./fileKinds";
import { IconClose, IconFile } from "./icons";
import { TaskCard } from "./TaskCard";
import type { PdfTask } from "./useChat";

interface Props {
  tico: ReactNode;
  files: FileInfo[];
  recent: PdfTask[];
  dragging: boolean;
  onPick: () => void;
  onRemove: (path: string) => void;
  onPdf: (files: FileInfo[]) => void;
  onPrompt: (prompt: string) => void;
  onAsk: () => void;
}

/** Pestaña de archivos: zona para soltar, qué hacer con lo soltado y los PDF de hoy. */
export function FilesView({ tico, files, recent, dragging, onPick, onRemove, onPdf, onPrompt, onAsk }: Props) {
  const t = useT();
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const convertible = files.filter((f) => f.canConvert);
  const title =
    files.length === 1 ? t("island.fileActions", { name: files[0]?.name ?? "" }) : t("island.filesActions", { count: files.length });

  return (
    <div className="files-view">
      {files.length === 0 || dragging ? (
        <section className={`card drop-zone${dragging ? " is-over" : ""}`} onClick={stop(onPick)}>
          <div className="drop-tico">{tico}</div>
          <div className="drop-text">
            <h2>{t("island.dropHere")}</h2>
            <p>{t("island.dropHint")}</p>
            <div className="kind-chips">
              <span>{t("island.chip.pdf")}</span>
              <span>{t("island.chip.word")}</span>
              <span>{t("island.chip.images")}</span>
              <span>{t("island.chip.code")}</span>
            </div>
            <button type="button" className="pill-button" onClick={stop(onPick)}>
              {t("island.pickFiles")}
            </button>
          </div>
        </section>
      ) : (
        <section className="card file-actions">
          <div className="drop-tico small">{tico}</div>
          <div className="file-actions-body">
            <h2>{title}</h2>
            <div className="file-list">
              {files.map((f) => (
                <div key={f.path} className="file-row">
                  <IconFile label={FILE_KINDS[f.kind].label} color={FILE_KINDS[f.kind].color} />
                  <span className="file-name" title={f.path}>
                    {f.name}
                  </span>
                  <button type="button" className="icon-button" title={t("island.remove")} onClick={stop(() => onRemove(f.path))}>
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
            <div className="action-row">
              {convertible.length > 0 && (
                <button type="button" className="pill-button primary" onClick={stop(() => onPdf(convertible))}>
                  {t("island.action.pdf")}
                </button>
              )}
              <button type="button" className="pill-button" onClick={stop(() => onPrompt(t("island.prompt.summary")))}>
                {t("island.action.summary")}
              </button>
              <button type="button" className="pill-button" onClick={stop(() => onPrompt(t("island.prompt.translate")))}>
                {t("island.action.translate")}
              </button>
              <button type="button" className="pill-button" onClick={stop(onAsk)}>
                {t("island.action.ask")}
              </button>
            </div>
          </div>
        </section>
      )}
      <section className="card recent-card">
        <h3>{t("island.recent")}</h3>
        {recent.length === 0 && <p className="muted">{t("island.noRecent")}</p>}
        <div className="recent-list">
          {recent.map((task, i) => (
            <TaskCard key={`${task.source}-${i}`} task={task} />
          ))}
        </div>
      </section>
    </div>
  );
}
