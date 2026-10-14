import { useCallback, useEffect, useState } from "react";
import { api, isTauri } from "../lib/tauri";
import type { MediaAction, NowPlaying } from "../types";

/** Cada cuánto se pregunta qué suena (solo con la isla visible). */
const POLL_MS = 2000;

export interface NowPlayingApi {
  now: NowPlaying | null;
  /** Volumen del sistema (0 a 1) o null si no se puede leer. */
  volume: number | null;
  control: (action: MediaAction) => void;
  setVolume: (level: number) => void;
  /** Sube o baja un 10 %, o silencia. */
  nudgeVolume: (delta: number | "mute") => void;
}

/** Lo que suena en Spotify, Apple Music, YouTube… y sus controles. */
export function useNowPlaying(visible: boolean): NowPlayingApi {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [volume, setVolumeState] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!isTauri()) return;
    api.mediaNow().then(setNow).catch(() => setNow(null));
  }, []);

  useEffect(() => {
    if (!visible || !isTauri()) return;
    refresh();
    api.mediaVolume().then(setVolumeState).catch(() => undefined);
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [visible, refresh]);

  const control = useCallback(
    (action: MediaAction) => {
      if (!isTauri()) return;
      // Respuesta inmediata en pantalla; luego se confirma con lo que diga el sistema.
      if (action === "playPause") setNow((n) => (n ? { ...n, playing: !n.playing } : n));
      api
        .mediaControl(action)
        .catch(console.error)
        .finally(() => window.setTimeout(refresh, action === "playPause" ? 400 : 900));
    },
    [refresh],
  );

  const setVolume = useCallback((level: number) => {
    const clamped = Math.min(1, Math.max(0, level));
    setVolumeState(clamped);
    if (isTauri()) void api.mediaSetVolume(clamped).catch(console.error);
  }, []);

  const nudgeVolume = useCallback(
    (delta: number | "mute") => {
      if (!isTauri()) return;
      void api.mediaVolume().then((current) => {
        const base = current ?? volume ?? 0.5;
        setVolume(delta === "mute" ? 0 : base + delta);
      });
    },
    [setVolume, volume],
  );

  return { now, volume, control, setVolume, nudgeVolume };
}
