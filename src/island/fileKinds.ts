import type { FileKind } from "../types";

/** Etiqueta corta y color de cada tipo de archivo. */
export const FILE_KINDS: Record<FileKind, { label: string; color: string }> = {
  word: { label: "DOC", color: "#5B9BFF" },
  pdf: { label: "PDF", color: "#FF6B6B" },
  image: { label: "IMG", color: "#3DD6D0" },
  sheet: { label: "XLS", color: "#4CD48A" },
  slides: { label: "PPT", color: "#FF9447" },
  text: { label: "TXT", color: "#B8B8B8" },
  code: { label: "</>", color: "#C59BFF" },
  other: { label: "?", color: "#7A7A7A" },
};

/** "1,2 MB", "340 KB"… */
export function formatSize(bytes: number, lang: string): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toLocaleString(lang, { maximumFractionDigits: digits })} ${units[unit]}`;
}
