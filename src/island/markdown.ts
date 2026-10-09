/**
 * Markdown mínimo y seguro para las respuestas de la IA: párrafos, listas, títulos,
 * bloques de código, **negrita**, *cursiva* y `código`. No genera HTML: devuelve una
 * estructura que React pinta como elementos normales (nada de dangerouslySetInnerHTML).
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "paragraph"; inline: Inline[] }
  | { type: "heading"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; text: string };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index;
    if (index > last) out.push({ type: "text", text: text.slice(last, index) });
    if (token.startsWith("**")) out.push({ type: "bold", text: token.slice(2, -2) });
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
    if (line.trim().startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      // Un bloque sin cerrar (la respuesta aún está llegando) llega hasta el final.
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        code.push(lines[i] ?? "");
        i++;
      }
      blocks.push({ type: "code", text: code.join("\n") });
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
