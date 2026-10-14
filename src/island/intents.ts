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

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Direcciones de correo escritas en el texto. */
export function emailsIn(text: string): string[] {
  return [...new Set(text.match(EMAIL_RE) ?? [])];
}

const SEND_VERBS = /\b(envia|enviame|envialo|enviala|envialos|enviar|enviarlo|manda|mandame|mandalo|mandala|mandar|mandarlo|reenvia|reenvialo|envia-ho|envia'l|envia-la|send|email|mail|forward)\b/;
const MAIL_WORDS = /\b(correo|correu|mail|email|e-mail|gmail|outlook)\b/;

/**
 * ¿Pide enviar por correo lo que hay adjunto? ("mándalo por correo", "envía este PDF a
 * ana@x.com", "send it by email"). Si solo pide escribir un correo ("escríbeme un correo
 * para mi jefe"), no: eso lo hace la IA.
 */
export function wantsMail(text: string): boolean {
  const t = normalize(text);
  const hasAddress = emailsIn(t).length > 0;
  const sends = SEND_VERBS.test(t);
  if (!sends) return false;
  return hasAddress || MAIL_WORDS.test(t);
}

export type MediaIntent = "playPause" | "next" | "previous" | "volumeUp" | "volumeDown" | "mute";

/**
 * Órdenes de música cortas ("pausa la música", "siguiente canción", "sube el volumen").
 * Solo frases cortas: "¿qué canción es la siguiente del disco?" no es una orden.
 */
export function mediaIntent(text: string): MediaIntent | null {
  const t = normalize(text)
    .replace(/[¡!¿?.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.split(" ").length > 6) return null;
  const media = "(la |el |esta |este |a |the |this )?(musica|cancion|tema|video|spotify|youtube|music|song|track|musica|canco|video)";
  const rules: [RegExp, MediaIntent][] = [
    [new RegExp(`^(tico )?(siguiente|pasa|salta|next|skip|seguent|passa)( ${media}| a la siguiente)?$`), "next"],
    [new RegExp(`^(tico )?(siguiente|next|seguent) ${media}$`), "next"],
    [new RegExp(`^(tico )?(pon |play )?(la |el )?(cancion|video|tema|song|track|canco) (siguiente|next|seguent)$`), "next"],
    [new RegExp(`^(tico )?(anterior|atras|previous|back|enrere)( ${media})?$`), "previous"],
    [new RegExp(`^(tico )?(la |el )?(cancion|video|tema|song|track|canco) (anterior|previous)$`), "previous"],
    [new RegExp(`^(tico )?(pausa|pausala|pausalo|para|parala|paralo|detén|deten|pause|stop|atura)( ${media})?$`), "playPause"],
    [new RegExp(`^(tico )?(reanuda|sigue|continua|play|reproduce|dale al play|resume|continue)( ${media})?$`), "playPause"],
    [/^(tico )?(sube|subele|subir|mas|turn up|volume up|puja|apuja)( el)? (volumen|volume|musica|music|so)$/, "volumeUp"],
    [/^(tico )?(baja|bajale|bajar|menos|turn down|volume down|abaixa)( el)? (volumen|volume|musica|music|so)$/, "volumeDown"],
    [/^(tico )?(silencio|silencia|mute|calla la musica|silenci)$/, "mute"],
  ];
  for (const [re, intent] of rules) if (re.test(t)) return intent;
  return null;
}

export type MemoryIntent = { kind: "remember"; text: string } | { kind: "forget"; text: string } | { kind: "list" };

/** Primera letra en mayúscula ("vivo en Barcelona" → "Vivo en Barcelona"). */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Recuerda que soy alérgico al marisco", "olvida que vivo en Madrid", "¿qué recuerdas de mí?".
 * "Recuérdame cómo se hace…" no es esto (es pedir una explicación): hace falta "que" o ":".
 */
export function memoryIntent(text: string): MemoryIntent | null {
  const clean = text.trim().replace(/^tico[,:]?\s+/i, "");
  const n = normalize(clean).replace(/[¿?¡!]/g, "").trim();
  if (/^(que|what) (recuerdas|sabes|do you remember|do you know|recordes|saps) (de mi|about me|sobre mi)$/.test(n)) {
    return { kind: "list" };
  }
  const remember =
    /^(recuerda|acuerdate de|apunta|guarda en tu memoria|no olvides|recorda|recorda't|remember|don't forget)( que| that|:)\s*(.+)$/i;
  const forget = /^(olvida|olvidate de|borra de tu memoria|oblida|forget)( que| that|:)?\s+(.+)$/i;
  // Se busca en el texto sin tildes, pero se guarda el original (con sus tildes).
  const r = remember.exec(n);
  if (r) {
    const start = clean.length - (r[3] ?? "").length;
    return { kind: "remember", text: capitalize(clean.slice(start).trim()) };
  }
  const f = forget.exec(n);
  if (f && (f[3] ?? "").split(" ").length >= 2) {
    const start = clean.length - (f[3] ?? "").length;
    return { kind: "forget", text: clean.slice(start).trim() };
  }
  return null;
}

/** El recuerdo que más se parece a lo que se pide olvidar (o `undefined`). */
export function findMemory<T extends { text: string }>(memories: T[], query: string): T | undefined {
  const words = normalize(query)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 2);
  let best: { memory: T; score: number } | undefined;
  for (const memory of memories) {
    const target = normalize(memory.text);
    const score = words.filter((w) => target.includes(w)).length / Math.max(1, words.length);
    if (score > (best?.score ?? 0)) best = { memory, score };
  }
  return best && best.score >= 0.5 ? best.memory : undefined;
}
