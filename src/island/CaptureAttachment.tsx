import { useT } from "../i18n";
import type { CapturePreview } from "../types";
import { IconClose } from "./icons";

interface Props {
  preview: CapturePreview;
  onCancel: () => void;
}

/** Miniatura de la captura antes de enviarla: el usuario ve exactamente qué sale. */
export function CaptureAttachment({ preview, onCancel }: Props) {
  const t = useT();
  return (
    <div className="capture-attachment">
      <img src={preview.thumbnail} alt={t("island.capturePreview")} />
      <span>{t("island.capturePreview")}</span>
      <button type="button" className="icon-button" title={t("island.captureCancel")} onClick={onCancel}>
        <IconClose />
      </button>
    </div>
  );
}
