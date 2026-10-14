/**
 * Markdown mínimo y seguro para las respuestas de la IA: párrafos, listas, títulos, tablas,
 * bloques de código, **negrita**, *cursiva*, `código` y enlaces. No genera HTML: devuelve una
 * estructura que React pinta como elementos normales (nada de dangerouslySetInnerHTML).
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; url: string };

export type Block =
  | { type: "paragraph"; inline: Inline[] }
  | { type: "heading"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; text: string; lang: string }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const INLINE =
  /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"»]|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
const MD_LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index;
    if (index > last) out.push({ type: "text", text: text.slice(last, index) });
    const link = MD_LINK.exec(token);
    if (link) out.push({ type: "link", text: link[1] ?? "", url: link[2] ?? "" });
    else if (/^https?:\/\//.test(token)) out.push({ type: "link", text: token, url: token });
    else if (token.startsWith("**")) out.push({ type: "bold", text: token.slice(2, -2) });
    else if (token.startsWith("`")) out.push({ type: "code", text: token.slice(1, -1) });
    else out.push({ type: "italic", text: token.slice(1, -1) });
    last = index + token.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** "| a | b |" → ["a", "b"] */
function cells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => parseInline(c.trim()));
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", inline: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Tabla: fila de cabecera, línea de guiones y filas.
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? "")) {
      flush();
      const header = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i] ?? "")) {
        rows.push(cells(lines[i] ?? ""));
        i++;
      }
      i--;
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (line.trim().startsWith("```")) {
      flush();
      const lang = line.trim().slice(3).trim().toLowerCase();
      const code: string[] = [];
      i++;
      // Un bloque sin cerrar (la respuesta aún está llegando) llega hasta el final.
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        code.push(lines[i] ?? "");
        i++;
      }
      blocks.push({ type: "code", text: code.join("\n"), lang });
      continue;
    }
    const ordered = ORDERED.exec(line);
    const bullet = BULLET.exec(line);
    if (ordered || bullet) {
      flush();
      const isOrdered = Boolean(ordered);
      const item = parseInline((ordered ?? bullet)?.[1] ?? "");
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "list" && prev.ordered === isOrdered) prev.items.push(item);
      else blocks.push({ type: "list", ordered: isOrdered, items: [item] });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", inline: parseInline(heading[1] ?? "") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Marca con la que la IA deja las ideas para seguir (igual que en Rust). */
const NEXT = "<<next:";

/**
 * Separa la respuesta de sus ideas para seguir ("<<next: a | b | c>>" al final). También
 * esconde la marca mientras aún está llegando ("<<ne").
 */
export function splitSuggestions(text: string): { text: string; suggestions: string[] } {
  const start = text.lastIndexOf("<<");
  if (start < 0) return { text, suggestions: [] };
  const rest = text.slice(start).toLowerCase();
  if (!(rest.startsWith("<<next") || NEXT.startsWith(rest.trimEnd()))) return { text, suggestions: [] };
  const colon = rest.indexOf(":");
  const suggestions =
    colon < 0
      ? []
      : text
          .slice(start + colon + 1)
          .trimEnd()
          .replace(/>+$/, "")
          .split("|")
          .map((s) => s.trim().replace(/^["«]|["»]$/g, ""))
          .filter((s) => s && s.length <= 80)
          .slice(0, 3);
  return { text: text.slice(0, start).trimEnd(), suggestions };
}
