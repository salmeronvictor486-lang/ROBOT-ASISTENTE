/** Paleta de comandos del chat: escribe "/" y elige qué hacer. */

export interface Command {
  id: string;
  /** Lo que se ve ("Mira mi pantalla"). */
  label: string;
  /** Palabra corta tras la barra ("pantalla"). */
  slug: string;
  /** Explicación breve, a la derecha. */
  hint?: string;
  /** Emoji o símbolo a la izquierda. */
  icon: string;
  run: () => void;
}

/** Minúsculas y sin tildes, para buscar "traduccion" y encontrar "traducción". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** ¿El borrador abre la paleta? Devuelve lo buscado tras la barra (o `null`). */
export function commandQuery(draft: string): string | null {
  const match = /^\/(\S*)$/u.exec(draft);
  return match ? (match[1] ?? "") : null;
}

/**
 * Comandos que encajan con lo escrito tras la barra: primero los que empiezan por ello
 * (en la palabra corta o en el nombre), después los que lo contienen.
 */
export function matchCommands(query: string, commands: Command[], limit = 7): Command[] {
  const q = normalize(query);
  if (!q) return commands.slice(0, limit);
  const scored = commands
    .map((command, order) => {
      const slug = normalize(command.slug);
      const label = normalize(command.label);
      const words = label.split(/\s+/);
      let score = -1;
      if (slug.startsWith(q)) score = 0;
      else if (words.some((w) => w.startsWith(q))) score = 1;
      else if (slug.includes(q) || label.includes(q)) score = 2;
      return { command, score, order };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.slice(0, limit).map((x) => x.command);
}
