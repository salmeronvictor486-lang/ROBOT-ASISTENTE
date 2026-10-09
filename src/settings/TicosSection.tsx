import { useState } from "react";
import { useT, type MessageKey } from "../i18n";
import { outfitFor, TicoAvatar } from "../island/TicoAvatar";
import { Tico } from "../robot/Tico";
import {
  BASE_TICO,
  DEFAULT_TICOS,
  OUTFITS,
  PROVIDER_INFO,
  PROVIDERS,
  type Outfit,
  type ProviderKind,
  type Settings,
  type TicoProfile,
} from "../types";
import { CommitInput, Row, Section, Toggle } from "./fields";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const MAX_TICOS = 12;
/** Colores para los Ticos nuevos (van rotando). */
const PALETTE = ["#3DD6D0", "#FF8FB8", "#FFB84D", "#7CF29A", "#C59BFF", "#5AB0FF", "#FF6B6B", "#F5C542"];

/** Lista de Ticos y editor del elegido. */
export function TicosSection({ settings, update }: Props) {
  const t = useT();
  const [selectedId, setSelectedId] = useState(settings.activeTico);
  const selected = settings.ticos.find((x) => x.id === selectedId) ?? settings.ticos[0] ?? BASE_TICO;

  const patchTico = (patch: Partial<TicoProfile>) =>
    update({ ticos: settings.ticos.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)) });

  const add = () => {
    if (settings.ticos.length >= MAX_TICOS) return;
    const accent = PALETTE[settings.ticos.length % PALETTE.length] ?? "#3DD6D0";
    const tico: TicoProfile = {
      id: `tico-${Date.now().toString(36)}`,
      name: t("settings.newTicoName"),
      baseColor: "#F2F0EB",
      accentColor: accent,
      outfit: "none",
      instructions: "",
      provider: null,
      model: "",
    };
    update({ ticos: [...settings.ticos, tico] });
    setSelectedId(tico.id);
  };

  const remove = () => {
    if (settings.ticos.length <= 1) return;
    const ticos = settings.ticos.filter((x) => x.id !== selected.id);
    const activeTico = settings.activeTico === selected.id ? (ticos[0]?.id ?? "tico") : settings.activeTico;
    update({ ticos, activeTico });
    setSelectedId(ticos[0]?.id ?? "tico");
  };

  const generalProvider = PROVIDER_INFO[settings.provider].label;

  return (
    <Section id="ticos" title={t("settings.section.ticos")}>
      <p className="hint">{t("settings.ticosHint")}</p>
      <div className="ticos-layout">
        <div className="ticos-list">
          {settings.ticos.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tico-item${p.id === selected.id ? " is-selected" : ""}`}
              style={{ "--pill": p.accentColor } as React.CSSProperties}
              onClick={() => setSelectedId(p.id)}
            >
              <TicoAvatar profile={p} size={34} seasonal={settings.seasonalOutfits} />
              <span>{p.name}</span>
              {p.id === settings.activeTico && <em>{t("settings.activeTico")}</em>}
            </button>
          ))}
          <button type="button" className="tico-item add" onClick={add} disabled={settings.ticos.length >= MAX_TICOS}>
            <span className="plus">+</span>
            <span>{t("settings.addTico")}</span>
          </button>
          {settings.ticos.length >= MAX_TICOS && <small className="hint">{t("settings.maxTicos")}</small>}
        </div>

        <div className="tico-editor" key={selected.id}>
          <div className="tico-stage" style={{ "--pill": selected.accentColor } as React.CSSProperties}>
            <Tico
              size={128}
              baseColor={selected.baseColor}
              accentColor={selected.accentColor}
              expression="curious"
              outfit={outfitFor(selected, settings.seasonalOutfits)}
            />
            <div className="stage-actions">
              {selected.id === settings.activeTico ? (
                <span className="badge ok">{t("settings.activeTico")}</span>
              ) : (
                <button type="button" className="button primary" onClick={() => update({ activeTico: selected.id })}>
                  {t("settings.useTico")}
                </button>
              )}
            </div>
          </div>

          <Row label={t("settings.ticoName")}>
            <CommitInput value={selected.name} onCommit={(name) => patchTico({ name: name.trim() || selected.name })} />
          </Row>
          <Row label={t("settings.baseColor")}>
            <div className="inline">
              <input type="color" value={selected.baseColor} onChange={(e) => patchTico({ baseColor: e.target.value.toUpperCase() })} />
              <input type="color" value={selected.accentColor} onChange={(e) => patchTico({ accentColor: e.target.value.toUpperCase() })} />
              <span className="hint">{t("settings.accentColor")}</span>
            </div>
          </Row>
          <Row label={t("settings.outfit")} wide>
            <div className="outfit-grid">
              {OUTFITS.map((o: Outfit) => (
                <button
                  key={o}
                  type="button"
                  className={`outfit-option${selected.outfit === o ? " is-selected" : ""}`}
                  onClick={() => patchTico({ outfit: o })}
                  title={t(`settings.outfit.${o}` as MessageKey)}
                >
                  <TicoAvatar profile={{ ...selected, outfit: o }} size={40} seasonal={false} />
                  <span>{t(`settings.outfit.${o}` as MessageKey)}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label={t("settings.instructions")} hint={t("settings.instructionsHint")} wide>
            <CommitInput
              multiline
              rows={4}
              value={selected.instructions}
              onCommit={(instructions) => patchTico({ instructions })}
            />
          </Row>
          <Row label={t("settings.ticoProvider")}>
            <select
              value={selected.provider ?? ""}
              onChange={(e) => {
                const value = e.target.value as ProviderKind | "";
                patchTico({ provider: value === "" ? null : value, model: "" });
              }}
            >
              <option value="">{t("settings.ticoProviderGeneral", { provider: generalProvider })}</option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {t(`settings.provider.${p}` as MessageKey)}
                </option>
              ))}
            </select>
          </Row>
          {selected.provider && (
            <Row label={t("settings.ticoModel")} hint={t("settings.ticoModelHint")}>
              <CommitInput
                value={selected.model}
                placeholder={settings.models[selected.provider]}
                onCommit={(model) => patchTico({ model: model.trim() })}
              />
            </Row>
          )}
          <div className="inline editor-footer">
            <button type="button" className="button danger" onClick={remove} disabled={settings.ticos.length <= 1}>
              {t("settings.deleteTico")}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                update({ ticos: DEFAULT_TICOS, activeTico: "tico" });
                setSelectedId("tico");
              }}
            >
              {t("settings.resetTicos")}
            </button>
          </div>
        </div>
      </div>
      <Row label={t("settings.seasonal")}>
        <Toggle
          label={t("settings.seasonal")}
          checked={settings.seasonalOutfits}
          onChange={(seasonalOutfits) => update({ seasonalOutfits })}
        />
      </Row>
    </Section>
  );
}
