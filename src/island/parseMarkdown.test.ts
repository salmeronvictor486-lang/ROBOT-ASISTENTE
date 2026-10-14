import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, splitSuggestions } from "./parseMarkdown";

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
    expect(parseMarkdown("```\nnpm i\n```")).toEqual([{ type: "code", text: "npm i", lang: "" }]);
    expect(parseMarkdown("Mira:\n```bash\nls -la")).toEqual([
      { type: "paragraph", inline: [{ type: "text", text: "Mira:" }] },
      { type: "code", text: "ls -la", lang: "bash" },
    ]);
  });

  it("no interpreta HTML: se queda como texto", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([
      { type: "paragraph", inline: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] },
    ]);
  });
});

describe("enlaces, tablas y sugerencias", () => {
  it("enlaces con texto y sueltos", () => {
    expect(parseInline("Mira [la web](https://tico.app/guia) o https://ejemplo.com/a.")).toEqual([
      { type: "text", text: "Mira " },
      { type: "link", text: "la web", url: "https://tico.app/guia" },
      { type: "text", text: " o " },
      { type: "link", text: "https://ejemplo.com/a", url: "https://ejemplo.com/a" },
      { type: "text", text: "." },
    ]);
  });

  it("tablas", () => {
    const blocks = parseMarkdown("Comparativa:\n\n| IA | Precio |\n| --- | :---: |\n| Gemini | **Gratis** |\n| Claude | De pago |\n\nFin");
    const table = blocks[1];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") return;
    expect(table.header).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.[1]).toEqual([{ type: "bold", text: "Gratis" }]);
    expect(blocks[2]).toEqual({ type: "paragraph", inline: [{ type: "text", text: "Fin" }] });
  });

  it("bloques de código con lenguaje", () => {
    expect(parseMarkdown("```Python\nprint(1)\n```")).toEqual([{ type: "code", text: "print(1)", lang: "python" }]);
  });

  it("separa las sugerencias del final", () => {
    expect(splitSuggestions("Hecho.\n<<next: Hazlo más corto | Tradúcelo>>")).toEqual({
      text: "Hecho.",
      suggestions: ["Hazlo más corto", "Tradúcelo"],
    });
    expect(splitSuggestions("Escribiendo…\n<<nex").text).toBe("Escribiendo…");
    expect(splitSuggestions("cout << x;").text).toBe("cout << x;");
  });
});
