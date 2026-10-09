import { useI18nLang, useT } from "../i18n";
import { api, isTauri } from "../lib/tauri";
import { formatSize } from "./fileKinds";
import { IconFile, IconFolder, IconOpen } from "./icons";
import { errorKey, errorVars, type PdfTask } from "./useChat";

/** Tarjeta de una conversión a PDF: trabajando, hecha (con Abrir / Mostrar) o con error. */
export function TaskCard({ task }: { task: PdfTask }) {
  const t = useT();
  const lang = useI18nLang();
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  if (task.status === "working") {
    return (
      <div className="task-card is-working">
        <IconFile label="PDF" color="#FF6B6B" />
        <div className="task-text">
          <strong>{t("island.converting", { name: task.source })}</strong>
          <span className="task-progress" aria-hidden="true">
            <i />
          </span>
        </div>
      </div>
    );
  }
  if (task.status === "error" || !task.result) {
    return (
      <div className="task-card is-error">
        <IconFile label="PDF" color="#6F6F6F" />
        <div className="task-text">
          <strong>{task.source}</strong>
          <span>
            {/* "pick": no es un fallo, es que vamos a pedirle el archivo. */}
            {task.error ? (task.error.kind === "pick" ? task.error.message : t(errorKey(task.error), errorVars(task.error))) : ""}
          </span>
        </div>
      </div>
    );
  }
  const result = task.result;
  const open = () => {
    if (isTauri()) void api.fileOpen(result.output).catch(console.error);
  };
  return (
    <div className="task-card is-done">
      <IconFile label="PDF" color="#FF6B6B" />
      <div className="task-text">
        <strong title={result.output}>{t("island.convertDone", { name: result.name })}</strong>
        <span>
          {formatSize(result.size, lang)} · {t(`island.engine.${result.engine}`)}
        </span>
      </div>
      <div className="task-actions">
        <button type="button" className="pill-button primary" onClick={stop(open)}>
          <IconOpen /> {t("island.open")}
        </button>
        <button
          type="button"
          className="pill-button"
          onClick={stop(() => {
            if (isTauri()) void api.fileReveal(result.output).catch(console.error);
          })}
        >
          <IconFolder /> {t("island.reveal")}
        </button>
      </div>
    </div>
  );
}
