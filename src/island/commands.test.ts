import { describe, expect, it } from "vitest";
import { commandQuery, matchCommands, normalize, type Command } from "./commands";

const make = (slug: string, label: string): Command => ({ id: slug, slug, label, icon: "•", run: () => undefined });
const list = [
  make("pantalla", "Mira mi pantalla"),
  make("pdf", "Pasar a PDF"),
  make("traducir", "Traducir un texto"),
  make("nuevo", "Nueva conversación"),
  make("tico-profe", "Hablar con Tico Profe"),
];

describe("paleta de comandos", () => {
  it("solo se abre con una barra al principio y sin espacios", () => {
    expect(commandQuery("/")).toBe("");
    expect(commandQuery("/tra")).toBe("tra");
    expect(commandQuery("/traducir hola")).toBeNull();
    expect(commandQuery("hola /pdf")).toBeNull();
  });

  it("busca sin tildes ni mayúsculas", () => {
    expect(normalize("Conversación")).toBe("conversacion");
    expect(matchCommands("CONVERS", list).map((c) => c.id)).toEqual(["nuevo"]);
  });

  it("primero lo que empieza por lo escrito", () => {
    expect(matchCommands("p", list).map((c) => c.id)).toEqual(["pantalla", "pdf", "tico-profe"]);
    expect(matchCommands("profe", list).map((c) => c.id)).toEqual(["tico-profe"]);
    expect(matchCommands("", list, 2)).toHaveLength(2);
    expect(matchCommands("zzz", list)).toEqual([]);
  });
});
