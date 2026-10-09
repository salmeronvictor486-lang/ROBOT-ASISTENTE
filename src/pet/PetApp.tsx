import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { I18nContext, resolveLang, useT } from "../i18n";
import { outfitFor } from "../island/TicoAvatar";
import { api, isTauri, onEvent } from "../lib/tauri";
import type { Expression } from "../robot/expressions";
import { setGaze } from "../robot/gaze";
import { Tico } from "../robot/Tico";
import { useTripleClick } from "../robot/useTripleClick";
import { useSettings } from "../settings/useSettings";
import { findTico, type Settings } from "../types";
import "./pet.css";

/** Distancia (px) que hay que mover el ratón con el botón pulsado para empezar a arrastrar. */
const DRAG_THRESHOLD = 4;

export function PetApp() {
  const settings = useSettings();
  return (
    <I18nContext.Provider value={resolveLang(settings.language)}>
      <Pet settings={settings} />
    </I18nContext.Provider>
  );
}

/** Tico en el escritorio: flota, te mira, se arrastra y al pulsarlo abre la isla. */
function Pet({ settings }: { settings: Settings }) {
  const t = useT();
  const active = findTico(settings, settings.activeTico);
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState(false);
  const [wave, setWave] = useState(0);
  const [shake, setShake] = useState(0);
  const [emote, setEmote] = useState<Expression | null>(null);
  const down = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  // Los ojos siguen al cursor por toda la pantalla (Rust nos manda su posición).
  useEffect(() => onEvent<{ x: number; y: number }>("island://cursor", (p) => setGaze(p.x, p.y)), []);
  useEffect(() => {
    if (isTauri()) return;
    const onMove = (e: MouseEvent) => setGaze(e.clientX, e.clientY);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Saluda al aparecer.
  useEffect(() => {
    const id = window.setTimeout(() => setWave((w) => w + 1), 500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!emote) return;
    const id = window.setTimeout(() => setEmote(null), 2400);
    return () => window.clearTimeout(id);
  }, [emote]);

  const dizzy = useTripleClick(() => {
    setShake((n) => n + 1);
    setEmote("dizzy");
  });

  const openIsland = () => {
    setWave((w) => w + 1);
    if (isTauri()) void api.petOpenIsland().catch(console.error);
  };

  const expression: Expression = emote ?? (hover ? "curious" : "idle");

  return (
    <div
      className={`pet${hover ? " is-hover" : ""}`}
      style={{ "--accent": active.accentColor } as React.CSSProperties}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu((m) => !m);
      }}
    >
      {menu ? (
        <div className="pet-menu" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              openIsland();
            }}
          >
            {t("pet.open")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              if (isTauri()) void api.openSettings("ticos").catch(console.error);
            }}
          >
            {t("island.settings")}
          </button>
          <button type="button" onClick={() => isTauri() && void api.petHide().catch(console.error)}>
            {t("pet.hide")}
          </button>
        </div>
      ) : (
        <div className="pet-bubble" aria-hidden={!hover}>
          {t("pet.hello", { name: active.name })}
        </div>
      )}
      <div
        className="pet-body"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          down.current = { x: e.screenX, y: e.screenY, dragging: false };
          setMenu(false);
        }}
        onPointerMove={(e) => {
          const d = down.current;
          if (!d || d.dragging) return;
          if (Math.hypot(e.screenX - d.x, e.screenY - d.y) > DRAG_THRESHOLD) {
            d.dragging = true;
            // A partir de aquí arrastra el sistema (la ventana entera se mueve).
            if (isTauri()) void getCurrentWindow().startDragging().catch(console.error);
          }
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (!d || d.dragging || e.button !== 0) return;
          dizzy();
          openIsland();
        }}
      >
        <Tico
          size={120}
          baseColor={active.baseColor}
          accentColor={active.accentColor}
          expression={expression}
          wave={wave}
          shake={shake}
          outfit={outfitFor(active, settings.seasonalOutfits)}
        />
        <span className="pet-shadow" />
      </div>
    </div>
  );
}
