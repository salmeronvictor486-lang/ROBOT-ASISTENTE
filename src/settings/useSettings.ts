import { useEffect, useState } from "react";
import { api, isTauri, onEvent } from "../lib/tauri";
import { DEFAULT_SETTINGS, type Settings } from "../types";

/** Ajustes actuales; se actualizan solos cuando cambian en cualquier ventana. */
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    api
      .settingsGet()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch((e: unknown) => console.error("No se pudieron leer los ajustes", e));
    const off = onEvent<Settings>("settings://changed", setSettings);
    return () => {
      active = false;
      off();
    };
  }, []);

  return settings;
}
