import { describe, expect, it } from "vitest";
import { wantsPdf, wantsScreen } from "./intents";

describe("wantsPdf", () => {
  it.each([
    "pásame este word a pdf",
    "Pasame este Word a PDF",
    "descárgame este word en pdf",
    "conviérteme el documento a PDF por favor",
    "quiero este archivo en pdf",
    "guárdalo como PDF",
    "converteix aquest document a pdf",
    "convert this to PDF",
    "export it as pdf please",
    "a pdf",
  ])("detecta «%s»", (text) => expect(wantsPdf(text)).toBe(true));

  it.each([
    "¿qué es un pdf?",
    "resume este pdf",
    "léeme el pdf que te he pasado",
    "summarize this PDF",
    "pásame la sal",
    "convierte 30 grados a fahrenheit",
  ])("ignora «%s»", (text) => expect(wantsPdf(text)).toBe(false));
});

describe("wantsScreen", () => {
  it.each([
    "¿Qué ves en mi pantalla?",
    "qué pone aquí",
    "mira esto",
    "ayúdame con este error",
    "explícame lo que estoy viendo",
    "què veus?",
    "what's on my screen?",
    "look at this",
    "can you read this page",
  ])("detecta «%s»", (text) => expect(wantsScreen(text)).toBe(true));

  it.each(["hola, ¿qué tal?", "escríbeme un correo", "translate hello to Spanish", "pásame este word a pdf"])(
    "ignora «%s»",
    (text) => expect(wantsScreen(text)).toBe(false),
  );
});
