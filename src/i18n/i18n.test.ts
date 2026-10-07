import { describe, expect, it } from "vitest";
import ca from "./ca.json";
import en from "./en.json";
import es from "./es.json";
import { resolveLang, translate } from ".";

describe("i18n", () => {
  it("todos los idiomas tienen las mismas claves", () => {
    const keys = Object.keys(es).sort();
    expect(Object.keys(ca).sort()).toEqual(keys);
    expect(Object.keys(en).sort()).toEqual(keys);
  });

  it("auto usa el idioma del sistema y cae en castellano", () => {
    expect(resolveLang("auto", "ca-ES")).toBe("ca");
    expect(resolveLang("auto", "en-GB")).toBe("en");
    expect(resolveLang("auto", "fr-FR")).toBe("es");
    expect(resolveLang("en", "es-ES")).toBe("en");
  });

  it("sustituye variables", () => {
    expect(translate("es", "island.hint")).toBe("Haz clic para hablar conmigo");
  });
});
