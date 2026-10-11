import { BASE_TICO, MAX_WORKSPACES, type Settings, type TicoProfile, type Workspace } from "./types";

/** Colores para los espacios nuevos (van rotando). */
const PALETTE = ["#3DD6D0", "#FFB84D", "#C59BFF", "#7CF29A", "#5AB0FF", "#FF8FB8", "#FF6B6B", "#F5C542"];

/** El espacio activo (o el primero). */
export function activeWorkspace(settings: Settings): Workspace {
  return (
    settings.workspaces.find((w) => w.id === settings.activeWorkspace) ??
    settings.workspaces[0] ?? {
      id: "general",
      name: "General",
      icon: "🏠",
      color: "#3DD6D0",
      ticos: settings.ticos.map((t) => t.id),
      activeTico: settings.activeTico,
      instructions: "",
      folder: "",
      apps: [],
    }
  );
}

/** Los Ticos de un espacio, en el orden del espacio. */
export function workspaceTicos(settings: Settings, workspace: Workspace): TicoProfile[] {
  const list = workspace.ticos
    .map((id) => settings.ticos.find((t) => t.id === id))
    .filter((t): t is TicoProfile => t !== undefined);
  return list.length ? list : [settings.ticos[0] ?? BASE_TICO];
}

/** Cambia de espacio: el espacio que dejas recuerda su Tico y vuelves al del nuevo. */
export function switchWorkspace(settings: Settings, id: string): Settings {
  const target = settings.workspaces.find((w) => w.id === id);
  if (!target || id === settings.activeWorkspace) return settings;
  const workspaces = settings.workspaces.map((w) =>
    w.id === settings.activeWorkspace && w.ticos.includes(settings.activeTico) ? { ...w, activeTico: settings.activeTico } : w,
  );
  const activeTico = target.ticos.includes(target.activeTico) ? target.activeTico : (target.ticos[0] ?? settings.activeTico);
  return { ...settings, workspaces, activeWorkspace: id, activeTico };
}

/** Usa un Tico en el espacio activo (si no estaba en él, lo añade). */
export function pickTico(settings: Settings, id: string): Settings {
  const ws = activeWorkspace(settings);
  const workspaces = settings.workspaces.map((w) =>
    w.id === ws.id ? { ...w, ticos: w.ticos.includes(id) ? w.ticos : [...w.ticos, id], activeTico: id } : w,
  );
  return { ...settings, workspaces, activeTico: id };
}

/** Solo lo que cambia al elegir espacio o Tico (para no pisar otros ajustes sin guardar). */
export function selection(settings: Settings): Pick<Settings, "workspaces" | "activeWorkspace" | "activeTico"> {
  return { workspaces: settings.workspaces, activeWorkspace: settings.activeWorkspace, activeTico: settings.activeTico };
}

/** Un espacio nuevo con el Tico activo dentro. */
export function newWorkspace(settings: Settings, name: string): Workspace | null {
  if (settings.workspaces.length >= MAX_WORKSPACES) return null;
  const n = settings.workspaces.length;
  return {
    id: `ws-${Date.now().toString(36)}`,
    name,
    icon: ["💼", "🎓", "🎨", "📚", "💡", "🧪"][n % 6] ?? "💼",
    color: PALETTE[n % PALETTE.length] ?? "#3DD6D0",
    ticos: [settings.activeTico],
    activeTico: settings.activeTico,
    instructions: "",
    folder: "",
    apps: [],
  };
}

/** Clave de una conversación: cada Tico tiene una por espacio (igual que en Rust). */
export function chatKey(workspace: string, tico: string): string {
  return `${workspace}/${tico}`;
}

/** Nombre de la carpeta (lo último de la ruta). */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
