import { describe, expect, it } from "vitest";
import { boldParts, nextSuggestions, REPLIES, replyDuration, replyFrame, THINK_MS } from "./replies";

function reply(id: string) {
  const found = REPLIES.find((r) => r.id === id);
  if (!found) throw new Error(`No existe la respuesta ${id}`);
  return found;
}

const screen = reply("screen");
const pdf = reply("pdf");

describe("replyFrame", () => {
  it("piensa, escribe a trozos y termina", () => {
    expect(replyFrame(pdf, 100)).toMatchObject({ phase: "thinking", text: "", expression: "working" });
    const middle = replyFrame(pdf, THINK_MS + 300);
    expect(middle.phase).toBe("typing");
    expect(middle.expression).toBe("talking");
    expect(pdf.answer.startsWith(middle.text)).toBe(true);
    expect(middle.text.length).toBeGreaterThan(0);
    expect(replyFrame(pdf, replyDuration(pdf))).toMatchObject({ phase: "done", text: pdf.answer, expression: "proud" });
  });

  it("solo «¿qué ves?» hace el destello de la captura, y al principio", () => {
    expect(replyFrame(screen, 300).capturing).toBe(true);
    expect(replyFrame(screen, 2000).capturing).toBe(false);
    expect(replyFrame(pdf, 300).capturing).toBe(false);
  });

  it("cuenta trozos para que Tico rebote", () => {
    expect(replyFrame(pdf, THINK_MS + 24 * 8).chunks).toBe(2);
  });
});

describe("nextSuggestions", () => {
  it("ofrece primero lo que no se ha preguntado", () => {
    expect(nextSuggestions([]).map((r) => r.id)).toEqual(["screen", "pdf", "music"]);
    expect(nextSuggestions(["screen", "pdf"]).map((r) => r.id)).toEqual(["music", "memory"]);
  });

  it("cuando ya se ha preguntado todo, vuelve a empezar", () => {
    expect(nextSuggestions(REPLIES.map((r) => r.id))).toHaveLength(3);
  });
});

describe("boldParts", () => {
  it("separa la negrita sin HTML", () => {
    expect(boldParts("Ya está **Informe.pdf** en Descargas")).toEqual([
      { text: "Ya está ", bold: false },
      { text: "Informe.pdf", bold: true },
      { text: " en Descargas", bold: false },
    ]);
  });
});
