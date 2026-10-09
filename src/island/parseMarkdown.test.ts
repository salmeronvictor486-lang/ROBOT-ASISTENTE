import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./parseMarkdown";

describe("markdown de las respuestas", () => {
  it("formato en línea", () => {
    expect(parseInline("Pulsa **Inicio** y luego `Ajustes`")).toEqual([
      { type: "text", text: "Pulsa " },
      { type: "bold", text: "Inicio" },
      { type: "text", text: " y luego " },
      { type: "code", text: "Ajustes" },
    ]);
  });

  it("listas numeradas seguidas forman una sola lista", () => {
    const blocks = parseMarkdown("Pasos:\n1. Abre Ajustes\n2. Ve a *Sistema*\n3. Listo");
    expect(blocks[0]?.type).toBe("paragraph");
    const list = blocks[1];
    expect(list?.type === "list" && list.ordered && list.items.length).toBe(3);
  });

  it("bloques de código, también sin cerrar mientras llega la respuesta", () => {
    expect(parseMarkdown("```\nnpm i\n```")).toEqual([{ type: "code", text: "npm i" }]);
    expect(parseMarkdown("Mira:\n```bash\nls -la")).toEqual([
      { type: "paragraph", inline: [{ type: "text", text: "Mira:" }] },
      { type: "code", text: "ls -la" },
    ]);
  });

  it("no interpreta HTML: se queda como texto", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([
      { type: "paragraph", inline: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] },
    ]);
  });
});
