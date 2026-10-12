import { useCallback, useState } from "react";
import type { FileInfo } from "../types";

/** Cambia los archivos movidos por su versión nueva (misma posición en `before` y `after`). */
export function withNewPaths(current: FileInfo[], before: FileInfo[], after: FileInfo[]): FileInfo[] {
  return current.map((f) => after[before.findIndex((b) => b.path === f.path)] ?? f);
}

/** Los archivos soltados (o elegidos) que esperan en la isla. */
export function useDroppedFiles() {
  const [files, setFiles] = useState<FileInfo[]>([]);

  /** Añade sin repetir. */
  const add = useCallback((list: FileInfo[]) => {
    setFiles((current) => {
      const known = new Set(current.map((f) => f.path));
      return [...current, ...list.filter((f) => !known.has(f.path))];
    });
  }, []);

  const remove = useCallback((paths: string[]) => {
    setFiles((current) => current.filter((f) => !paths.includes(f.path)));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  /** Tras moverlos: misma lista, rutas nuevas. */
  const replace = useCallback((before: FileInfo[], after: FileInfo[]) => {
    setFiles((current) => withNewPaths(current, before, after));
  }, []);

  return { files, add, remove, clear, replace };
}
