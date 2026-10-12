import { describe, expect, it } from "vitest";
import type { FileInfo } from "../types";
import { withNewPaths } from "./useDroppedFiles";

const file = (path: string): FileInfo => ({ path, name: path.split("/").pop() ?? path, size: 1, kind: "pdf", canConvert: false });

describe("archivos soltados", () => {
  it("al moverlos, cambian de ruta sin cambiar de sitio en la lista", () => {
    const a = file("/tmp/a.pdf");
    const b = file("/tmp/b.pdf");
    const moved = file("/clase/a.pdf");
    expect(withNewPaths([a, b], [a], [moved]).map((f) => f.path)).toEqual(["/clase/a.pdf", "/tmp/b.pdf"]);
  });
});
