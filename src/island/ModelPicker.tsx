import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { api, isTauri, toAppError } from "../lib/tauri";
import { PROVIDER_INFO, PROVIDERS, providerFor, type ProviderKind, type Settings, type TicoProfile } from "../types";
import { IconCheck, IconChevron } from "./icons";

interface Props {
  settings: Settings;
  tico: TicoProfile;
  /** Guarda unos ajustes nuevos. */
  save: (next: Settings) => void;
}

/** Nombre corto del modelo para el chip ("claude-haiku-4-5" → "haiku-4-5"). */
export function shortModel(model: string): string {
  const last = model.split("/").pop() ?? model;
  return last.replace(/^(claude|gpt|gemini|models)-/, "").slice(0, 26);
}

/**
 * Chip con la IA y el modelo del Tico activo. Al pulsarlo se abre una lista para
 * cambiar de proveedor o de modelo sin ir a Ajustes.
 */
export function ModelPicker({ settings, tico, save }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { provider, model } = providerFor(settings, tico);
  const [selected, setSelected] = useState<ProviderKind>(provider);
  const [keys, setKeys] = useState<Partial<Record<ProviderKind, boolean>>>({});
  const [models, setModels] = useState<{ provider: ProviderKind; list: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const own = tico.provider !== null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !isTauri()) return;
    api.secretStatus().then(setKeys).catch(console.error);
  }, [open]);

  // Se cierra al pulsar fuera del menú.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Modelos del proveedor elegido (se piden al abrirlo).
  useEffect(() => {
    if (!open || !isTauri()) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const list = await api.aiTestConnection(selected);
        if (active) setModels({ provider: selected, list });
      } catch (e) {
        console.error(toAppError(e));
        if (active) {
          setModels({ provider: selected, list: [] });
          setFailed(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [open, selected]);

  /** Cambia proveedor y modelo: los del Tico si tiene propios, si no los generales. */
  const choose = (p: ProviderKind, m?: string) => {
    if (own) {
      const ticos = settings.ticos.map((x) => (x.id === tico.id ? { ...x, provider: p, model: m ?? "" } : x));
      save({ ...settings, ticos });
    } else {
      save({ ...settings, provider: p, models: m ? { ...settings.models, [p]: m } : settings.models });
    }
  };

  const info = PROVIDER_INFO[provider];
  return (
    <div className="model-picker" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`model-chip${open ? " is-open" : ""}`}
        title={t("island.changeModel")}
        onClick={() => {
          setSelected(provider);
          setOpen((o) => !o);
        }}
      >
        <i style={{ background: info.color }} />
        <span className="model-provider">{provider === "custom" ? t("island.customProvider") : info.label}</span>
        {provider !== "demo" && model && <span className="model-name">{shortModel(model)}</span>}
        <IconChevron />
      </button>
      {open && (
        <div className="model-menu" role="dialog" aria-label={t("island.changeModel")}>
          <div className="model-providers">
            {PROVIDERS.map((p) => {
              const pi = PROVIDER_INFO[p];
              const missing = pi.needsKey && keys[p] === false;
              return (
                <button
                  key={p}
                  type="button"
                  className={`provider-row${p === selected ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelected(p);
                    if (p !== provider) choose(p);
                  }}
                >
                  <i style={{ background: pi.color }} />
                  <span>{p === "custom" ? t("island.customProvider") : pi.label}</span>
                  {missing && <em>{t("island.noKey")}</em>}
                  {!missing && pi.local && <em className="ok">{t("island.local")}</em>}
                  {!missing && !pi.local && pi.free && <em className="ok">{t("island.free")}</em>}
                  {p === provider && <IconCheck />}
                </button>
              );
            })}
          </div>
          <div className="model-list">
            {own && <p className="model-scope">{t("island.forThisTico", { name: tico.name })}</p>}
            {loading && <p className="model-hint">{t("island.loadingModels")}</p>}
            {!loading && failed && <p className="model-hint">{t("island.modelsError")}</p>}
            {!loading &&
              models?.provider === selected &&
              models.list.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`model-row${selected === provider && m === model ? " is-selected" : ""}`}
                  onClick={() => {
                    choose(selected, m);
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
