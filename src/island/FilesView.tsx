import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { api, isTauri } from "../lib/tauri";
import type { FileInfo } from "../types";
import { folderName } from "../workspaces";
import { FILE_KINDS } from "./fileKinds";
import { IconClose, IconFile, IconFolder, IconOpen } from "./icons";
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
  /** Carpeta del espacio de trabajo ("" si no tiene). */
  folder: string;
  onAddFiles: (files: FileInfo[]) => void;
  /** Carpetas de los espacios, para mover ahí con un clic. */
  destinations: { name: string; icon: string; path: string }[];
  /** Mover a `dir` (o a la carpeta que se elija si no se da). */
  onMove: (files: FileInfo[], dir?: string) => void;
  onMail: (files: FileInfo[]) => void;
}

/** Archivos de la carpeta del espacio (se vuelven a leer al cambiar de carpeta). */
function useFolderFiles(folder: string): { files: FileInfo[]; failed: boolean } {
  const [state, setState] = useState<{ folder: string; files: FileInfo[]; failed: boolean }>({ folder: "", files: [], failed: false });
  useEffect(() => {
    if (!folder || !isTauri()) return;
    let alive = true;
    api
      .workspaceFiles(folder)
      .then((files) => alive && setState({ folder, files, failed: false }))
      .catch(() => alive && setState({ folder, files: [], failed: true }));
    return () => {
      alive = false;
    };
  }, [folder]);
  return state.folder === folder ? state : { files: [], failed: false };
}

/** Pestaña de archivos: zona para soltar, qué hacer con lo soltado y los PDF de hoy. */
export function FilesView({
  tico,
  files,
  recent,
  dragging,
  onPick,
  onRemove,
  onPdf,
  onPrompt,
  onAsk,
  folder,
  onAddFiles,
  destinations,
  onMove,
  onMail,
}: Props) {
  const t = useT();
  const inFolder = useFolderFiles(folder);
  const [moving, setMoving] = useState(false);
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
            <div className="action-row suggest-row">
              <button type="button" className="pill-button suggest" onClick={stop(() => onMail(files))}>
                ✉️ {t("island.action.mail")}
              </button>
              <div className="move-wrap">
                <button
                  type="button"
                  className={`pill-button suggest${moving ? " is-open" : ""}`}
                  aria-expanded={moving}
                  onClick={stop(() => (destinations.length ? setMoving((m) => !m) : onMove(files)))}
                >
                  📁 {t("island.action.move")}
                </button>
                {moving && (
                  <div className="move-menu" role="menu">
                    {destinations.map((d) => (
                      <button
                        key={d.path}
                        type="button"
                        role="menuitem"
                        title={d.path}
                        onClick={stop(() => {
                          setMoving(false);
                          onMove(files, d.path);
                        })}
                      >
                        <span>{d.icon}</span> {d.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={stop(() => {
                        setMoving(false);
                        onMove(files);
                      })}
                    >
                      <span>…</span> {t("island.action.moveOther")}
                    </button>
                  </div>
                )}
              </div>
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
        {folder && (
          <>
            <h3 className="folder-title">
              <IconFolder />
              <span title={folder}>{folderName(folder)}</span>
              <button
                type="button"
                className="icon-button"
                title={t("island.folder.open")}
                onClick={stop(() => void api.fileOpen(folder).catch(console.error))}
              >
                <IconOpen />
              </button>
            </h3>
            <div className="recent-list folder-list">
              {inFolder.failed && <p className="muted">{t("island.folder.missing")}</p>}
              {!inFolder.failed && inFolder.files.length === 0 && <p className="muted">{t("island.folder.empty")}</p>}
              {inFolder.files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="file-row folder-file"
                  title={t("island.folder.attach", { name: f.name })}
                  onClick={stop(() => onAddFiles([f]))}
                >
                  <IconFile label={FILE_KINDS[f.kind].label} color={FILE_KINDS[f.kind].color} />
                  <span className="file-name">{f.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {(!folder || recent.length > 0) && (
          <>
            <h3>{t("island.recent")}</h3>
            {recent.length === 0 && <p className="muted">{t("island.noRecent")}</p>}
            <div className="recent-list">
              {recent.map((task, i) => (
                <TaskCard key={`${task.source}-${i}`} task={task} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
