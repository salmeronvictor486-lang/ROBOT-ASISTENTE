/**
 * Entender lo que pide el usuario sin gastar IA: "pásame este Word a PDF" lo hace Tico
 * por su cuenta, y "¿qué ves en mi pantalla?" hace la captura sin pulsar el botón.
 * Funciona en castellano, catalán e inglés.
 */

/** Quita acentos y pasa a minúsculas para comparar sin líos. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const CONVERT_VERBS = [
  // castellano
  "pasa", "pasame", "pasalo", "pasarlo", "pasar", "convierte", "conviertelo", "convierteme", "convertir",
  "transforma", "transformalo", "transformar", "exporta", "exportalo", "exportar", "guarda", "guardalo",
  "guardar", "descarga", "descargame", "descargalo", "descargar", "hazme", "haz", "hacer", "genera",
  "generame", "crea", "creame", "dame", "quiero", "necesito", "ponlo", "ponmelo", "sacame", "saca",
  // catalán
  "passa", "passa'm", "passam", "converteix", "transforma", "exporta", "desa", "descarrega", "fes", "fes-me",
  "vull", "necessito",
  // inglés
  "convert", "turn", "export", "save", "make", "change", "download", "give", "create", "want", "need",
];

/** ¿Pide pasar algo a PDF? ("pásame este word a pdf", "convert this to pdf", "en PDF porfa") */
export function wantsPdf(text: string): boolean {
  const t = normalize(text);
  if (!/\bpdf\b/.test(t)) return false;
  // Preguntas sobre PDFs ("¿qué es un pdf?", "resume este pdf") no son conversiones.
  if (/\b(que es|que son|what is|what's|resume|resumeme|resumir|summari[sz]e|lee|read|explica|explain|traduce|translate)\b/.test(t)) {
    return false;
  }
  const words = t.split(/[^a-z0-9'-]+/).filter(Boolean);
  const hasVerb = words.some((w) => CONVERT_VERBS.includes(w));
  // "a pdf", "en pdf", "to pdf", "como pdf", "as pdf", "into pdf"
  const hasTarget = /\b(a|al|en|como|to|into|as|in|per|com)\s+(un\s+|una\s+|a\s+)?pdf\b/.test(t);
  return hasVerb || hasTarget;
}

const SCREEN_PATTERNS = [
  // castellano
  /\bpantalla\b/,
  /\bque (ves|hay|pone|sale|aparece)\b/,
  /\bmira (esto|aqui|lo que|esta|este)\b/,
  /\blee(me)? (esto|lo que|esta|este)\b/,
  /\b(este|esta) (error|ventana|pagina|web|mensaje|aviso|codigo|grafico|tabla|formulario|imagen)\b/,
  /\blo que (estoy viendo|tengo delante|tengo abierto|veo)\b/,
  /\bcaptura\b/,
  // catalán
  /\bque (veus|hi ha|posa|surt)\b/,
  /\bmira (aixo|aqui)\b/,
  /\b(aquest|aquesta) (error|finestra|pagina|missatge)\b/,
  // inglés
  /\bscreen\b/,
  /\bscreenshot\b/,
  /\bwhat (do you see|can you see|is this|'?s this|is on)\b/,
  /\blook at (this|my|the)\b/,
  /\bread (this|what|my)\b/,
  /\bthis (error|window|page|message|warning|chart|form)\b/,
];

/** ¿Pide que mire la pantalla? */
export function wantsScreen(text: string): boolean {
  const t = normalize(text);
  if (wantsPdf(text)) return false;
  return SCREEN_PATTERNS.some((re) => re.test(t));
}
