import { createContext, useContext } from "react";
import ca from "./ca.json";
import en from "./en.json";
import es from "./es.json";
import type { LanguageSetting } from "../types";

export type Lang = "es" | "ca" | "en";
/** El castellano es el idioma de referencia: define todas las claves. */
export type MessageKey = keyof typeof es;
type Dict = Record<MessageKey, string>;

// `satisfies` hace que TypeScript avise si a un idioma le falta una clave.
const DICTS = { es, ca, en } satisfies Record<Lang, Dict>;

/** Convierte el ajuste ("auto" incluido) en un idioma concreto. */
export function resolveLang(setting: LanguageSetting, browserLang = navigator.language): Lang {
  if (setting !== "auto") return setting;
  const code = browserLang.toLowerCase().slice(0, 2);
  return code === "ca" || code === "en" ? code : "es";
}

/** Traduce una clave; `{nombre}` en el texto se sustituye por `vars.nombre`. */
export function translate(
  lang: Lang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const text: string = DICTS[lang][key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match));
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const I18nContext = createContext<Lang>("es");

export function useT(): Translate {
  const lang = useContext(I18nContext);
  return (key, vars) => translate(lang, key, vars);
}
