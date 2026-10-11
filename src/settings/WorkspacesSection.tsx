import { useState } from "react";
import { useT } from "../i18n";
import { TicoAvatar } from "../island/TicoAvatar";
import { api, isTauri } from "../lib/tauri";
import { MAX_WORKSPACES, WORKSPACE_ICONS, type Settings, type Workspace } from "../types";
import { activeWorkspace, folderName, newWorkspace, selection, switchWorkspace, workspaceTicos } from "../workspaces";
import { CommitInput, Row, Section, Toggle } from "./fields";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

/** Espacios de trabajo: cada uno con sus Ticos, su contexto, su carpeta y sus apps. */
export function WorkspacesSection({ settings, update }: Props) {
  const t = useT();
  const current = activeWorkspace(settings);
  const [selectedId, setSelectedId] = useState(current.id);
  const selected = settings.workspaces.find((w) => w.id === selectedId) ?? current;

  const patch = (changes: Partial<Workspace>) =>
    update({ workspaces: settings.workspaces.map((w) => (w.id === selected.id ? { ...w, ...changes } : w)) });

  const add = () => {
    const ws = newWorkspace(settings, t("settings.newWorkspaceName"));
    if (!ws) return;
    update({ workspaces: [...settings.workspaces, ws] });
    setSelectedId(ws.id);
  };

  const remove = () => {
    if (settings.workspaces.length <= 1) return;
    const workspaces = settings.workspaces.filter((w) => w.id !== selected.id);
    const next = workspaces[0];
    if (selected.id === settings.activeWorkspace && next) {
      update({ workspaces, activeWorkspace: next.id, activeTico: next.activeTico });
    } else {
      update({ workspaces });
    }
    setSelectedId(next?.id ?? "general");
  };

  const toggleTico = (id: string) => {
    const has = selected.ticos.includes(id);
    if (has && selected.ticos.length <= 1) return;
    patch({ ticos: has ? selected.ticos.filter((x) => x !== id) : [...selected.ticos, id] });
  };

  const pickFolder = async () => {
    if (!isTauri()) return;
    const folder = await api.folderPick().catch(() => null);
    if (folder) patch({ folder });
  };

  return (
    <Section id="workspaces" title={t("settings.section.workspaces")}>
      <p className="hint">{t("settings.workspacesHint")}</p>
      <div className="ticos-layout">
        <div className="ticos-list">
          {settings.workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`tico-item ws-item${w.id === selected.id ? " is-selected" : ""}`}
              style={{ "--pill": w.color } as React.CSSProperties}
              onClick={() => setSelectedId(w.id)}
            >
              <i className="ws-badge">{w.icon}</i>
              <span>{w.name}</span>
              {w.id === settings.activeWorkspace && <em>{t("settings.activeWorkspace")}</em>}
            </button>
          ))}
          <button type="button" className="tico-item add" onClick={add} disabled={settings.workspaces.length >= MAX_WORKSPACES}>
            <span className="plus">+</span>
            <span>{t("settings.addWorkspace")}</span>
          </button>
          {settings.workspaces.length >= MAX_WORKSPACES && <small className="hint">{t("settings.maxWorkspaces")}</small>}
        </div>

        <div className="tico-editor" key={selected.id}>
          <div className="tico-stage ws-stage" style={{ "--pill": selected.color } as React.CSSProperties}>
            <span className="ws-stage-icon">{selected.icon}</span>
            <div className="ws-stage-ticos">
              {workspaceTicos(settings, selected).map((p) => (
                <TicoAvatar key={p.id} profile={p} size={44} seasonal={settings.seasonalOutfits} />
              ))}
            </div>
            <div className="stage-actions">
              {selected.id === settings.activeWorkspace ? (
                <span className="badge ok">{t("settings.activeWorkspace")}</span>
              ) : (
                <button type="button" className="button primary" onClick={() => update(selection(switchWorkspace(settings, selected.id)))}>
                  {t("settings.useWorkspace")}
                </button>
              )}
            </div>
          </div>

          <Row label={t("settings.workspaceName")}>
            <CommitInput value={selected.name} onCommit={(name) => patch({ name: name.trim() || selected.name })} />
          </Row>
          <Row label={t("settings.workspaceIcon")} wide>
            <div className="icon-grid">
              {WORKSPACE_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={`icon-option${selected.icon === icon ? " is-selected" : ""}`}
                  onClick={() => patch({ icon })}
                >
                  {icon}
                </button>
              ))}
              <input type="color" value={selected.color} title={t("settings.workspaceColor")} onChange={(e) => patch({ color: e.target.value.toUpperCase() })} />
            </div>
          </Row>
          <Row label={t("settings.workspaceTicos")} hint={t("settings.workspaceTicosHint")} wide>
            <div className="outfit-grid ws-ticos">
              {settings.ticos.map((p) => {
                const on = selected.ticos.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    className={`outfit-option${on ? " is-selected" : ""}`}
                    onClick={() => toggleTico(p.id)}
                    title={p.name}
                  >
                    <TicoAvatar profile={p} size={40} seasonal={settings.seasonalOutfits} />
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label={t("settings.workspaceInstructions")} hint={t("settings.workspaceInstructionsHint")} wide>
            <CommitInput
              multiline
              rows={3}
              value={selected.instructions}
              placeholder={t("settings.workspaceInstructionsPlaceholder")}
              onCommit={(instructions) => patch({ instructions })}
            />
          </Row>
          <Row label={t("settings.workspaceFolder")} hint={t("settings.workspaceFolderHint")}>
            <div className="inline">
              {selected.folder ? (
                <span className="folder-path" title={selected.folder}>
                  📁 {folderName(selected.folder)}
                </span>
              ) : (
                <span className="hint">{t("settings.workspaceNoFolder")}</span>
              )}
              <button type="button" className="button" onClick={() => void pickFolder()} disabled={!isTauri()}>
                {t("settings.pickFolder")}
              </button>
              {selected.folder && (
                <button type="button" className="button" onClick={() => patch({ folder: "" })}>
                  {t("settings.removeFolder")}
                </button>
              )}
            </div>
          </Row>
          <Row label={t("settings.workspaceApps")} hint={t("settings.workspaceAppsHint")} wide>
            <CommitInput
              multiline
              rows={3}
              value={selected.apps.join("\n")}
              placeholder={t("settings.workspaceAppsPlaceholder")}
              onCommit={(text) => patch({ apps: text.split("\n") })}
            />
          </Row>
          <div className="inline editor-footer">
            <button type="button" className="button danger" onClick={remove} disabled={settings.workspaces.length <= 1}>
              {t("settings.deleteWorkspace")}
            </button>
          </div>
        </div>
      </div>
      <Row label={t("settings.autoWorkspace")} hint={t("settings.autoWorkspaceHint")}>
        <Toggle label={t("settings.autoWorkspace")} checked={settings.autoWorkspace} onChange={(autoWorkspace) => update({ autoWorkspace })} />
      </Row>
    </Section>
  );
}
