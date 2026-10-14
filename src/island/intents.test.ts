import { describe, expect, it } from "vitest";
import { emailsIn, mediaIntent, wantsMail, wantsPdf, wantsScreen } from "./intents";

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

describe("wantsMail", () => {
  it.each([
    "mándalo por correo",
    "envía este PDF a ana@ejemplo.com",
    "envialo a luis@empresa.es y eva@x.org",
    "send it by email",
    "envia-ho per correu",
  ])("sí: %s", (text) => expect(wantsMail(text)).toBe(true));

  it.each([
    "escríbeme un correo para mi jefe",
    "¿qué es el correo electrónico?",
    "resume este pdf",
    "envíame un resumen",
  ])("no: %s", (text) => expect(wantsMail(text)).toBe(false));

  it("saca las direcciones", () => {
    expect(emailsIn("a ana@x.com, ana@x.com y luis.p+tico@sub.y.es")).toEqual(["ana@x.com", "luis.p+tico@sub.y.es"]);
  });
});

describe("mediaIntent", () => {
  it.each([
    ["pausa la música", "playPause"],
    ["Pausa", "playPause"],
    ["reanuda la canción", "playPause"],
    ["siguiente canción", "next"],
    ["pasa a la siguiente", "next"],
    ["salta este vídeo", "next"],
    ["la canción anterior", "previous"],
    ["sube el volumen", "volumeUp"],
    ["baja el volumen!", "volumeDown"],
    ["next song", "next"],
    ["pause the music", "playPause"],
    ["silencio", "mute"],
  ])("%s → %s", (text, intent) => expect(mediaIntent(text)).toBe(intent));

  it.each([
    "¿cuál es la siguiente canción del disco de Rosalía?",
    "escríbeme la letra de la canción anterior que te pedí",
    "para qué sirve el volumen de un cilindro",
    "siguiente paso",
  ])("no: %s", (text) => expect(mediaIntent(text)).toBeNull());
});
