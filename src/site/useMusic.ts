import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Música de fondo de la web (compuesta con `scripts/web-music.py`): 72 s exactos a 80 BPM.
 * Va con Web Audio y no con <audio loop>, para que el bucle empalme sin hueco. Nunca suena
 * sola: los navegadores no dejan poner sonido sin que lo pidas, y así debe ser. Si la
 * encendiste en otra visita, arranca con tu primer clic o tecla.
 */

const LOOP_SECONDS = 72;
const BPM = 80;
const VOLUME = 0.3;
const FADE = 0.6;
const STORAGE_KEY = "tico-web-musica";

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function savePreference(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Sin almacenamiento (ventana privada…): solo no se recuerda.
  }
}

/** Primer instante con sonido: algunos decodificadores dejan silencio delante del MP3. */
function leadingSilence(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.floor(buffer.sampleRate * 0.2));
  for (let i = 0; i < limit; i++) {
    if (Math.abs(data[i] ?? 0) > 1e-3) return i / buffer.sampleRate;
  }
  return 0;
}

export interface Music {
  playing: boolean;
  toggle: () => void;
  /** Tiempos de compás que han sonado: los Ticos rebotan con cada uno. */
  beat: number;
}

export function useMusic(src: string): Music {
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const audio = useRef<{ ctx: AudioContext; gain: GainNode; started: number } | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const wanted = useRef(false);

  const ensure = useCallback(async () => {
    if (audio.current) return;
    if (!loading.current) {
      loading.current = (async () => {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);
        const response = await fetch(src);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        const start = leadingSilence(buffer);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = start;
        source.loopEnd = Math.min(buffer.duration, start + LOOP_SECONDS);
        source.connect(gain);
        source.start(0, start);
        audio.current = { ctx, gain, started: ctx.currentTime };
      })();
    }
    await loading.current;
  }, [src]);

  const fadeTo = useCallback(async (on: boolean) => {
    wanted.current = on;
    if (on) await ensure();
    const a = audio.current;
    if (!a) return;
    const now = a.ctx.currentTime;
    a.gain.gain.cancelScheduledValues(now);
    a.gain.gain.setValueAtTime(a.gain.gain.value, now);
    if (on) {
      await a.ctx.resume();
      a.gain.gain.linearRampToValueAtTime(VOLUME, a.ctx.currentTime + FADE);
    } else {
      a.gain.gain.linearRampToValueAtTime(0, now + FADE);
      window.setTimeout(() => {
        if (!wanted.current) void a.ctx.suspend();
      }, FADE * 1000 + 50);
    }
  }, [ensure]);

  const toggle = useCallback(() => {
    const next = !wanted.current;
    setPlaying(next);
    savePreference(next);
    fadeTo(next).catch(() => {
      wanted.current = false;
      setPlaying(false);
    });
  }, [fadeTo]);

  // Si la encendiste en otra visita, suena con tu primer gesto en la página.
  useEffect(() => {
    if (!readPreference()) return;
    const start = (e: Event) => {
      // El propio botón de música ya hace lo suyo.
      if (e.target instanceof Element && e.target.closest("[data-music-toggle]")) return;
      if (!wanted.current) toggle();
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [toggle]);

  // En otra pestaña, silencio; al volver, sigue donde iba.
  useEffect(() => {
    const onVisibility = () => {
      const a = audio.current;
      if (!a || !wanted.current) return;
      if (document.hidden) void a.ctx.suspend();
      else void a.ctx.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Compás: lo lee del reloj del audio, así va a tiempo aunque el navegador vaya lento.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const a = audio.current;
      if (!a || a.ctx.state !== "running") return;
      setBeat(Math.floor(((a.ctx.currentTime - a.started) * BPM) / 60));
    }, 60);
    return () => window.clearInterval(timer);
  }, [playing]);

  return { playing, toggle, beat };
}
