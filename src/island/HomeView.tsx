import { useState, type ReactNode } from "react";
import { useT, type MessageKey } from "../i18n";
import type { TicoProfile, UpdateInfo, Workspace } from "../types";
import { IconChat, IconCheck, IconChevron, IconClip, IconEye, IconPlus, IconSparkle } from "./icons";
import { TicoAvatar } from "./TicoAvatar";

interface Props {
  tico: ReactNode;
  active: TicoProfile;
  ticos: TicoProfile[];
  seasonal: boolean;
  status: string;
  /** Ticos con conversación abierta (llevan un puntito). */
  withChat: (id: string) => boolean;
  onPickTico: (id: string) => void;
  onNewTico: () => void;
  workspaces: Workspace[];
  workspace: Workspace;
  onPickWorkspace: (id: string) => void;
  onEditWorkspaces: () => void;
  update: UpdateInfo | null;
  onGetUpdate: (update: UpdateInfo) => void;
  onDismissUpdate: (update: UpdateInfo) => void;
  onScreen: () => void;
  onPdf: () => void;
  onFile: () => void;
  onNewChat: () => void;
}

const ROLES: Record<string, MessageKey> = {
  tico: "island.role.tico",
  code: "island.role.code",
  translate: "island.role.translate",
  write: "island.role.write",
  teach: "island.role.teach",
};

/** Pestaña de inicio: Tico grande con atajos a la izquierda y tus Ticos a la derecha. */
export function HomeView(props: Props) {
  const t = useT();
  const { active, workspace } = props;
  const [choosing, setChoosing] = useState(false);
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const quick: { icon: ReactNode; label: string; run: () => void }[] = [
    { icon: <IconEye />, label: t("island.quick.screen"), run: props.onScreen },
    { icon: <IconSparkle />, label: t("island.quick.pdf"), run: props.onPdf },
    { icon: <IconClip />, label: t("island.quick.file"), run: props.onFile },
    { icon: <IconChat />, label: t("island.quick.newChat"), run: props.onNewChat },
  ];
  return (
    <div className="home-view">
      <section className="card hero-card">
        {props.update && (
          <div className="update-bar" role="status">
            <span>✨ {t("island.update.available", { version: props.update.version })}</span>
            <button type="button" className="update-get" onClick={stop(() => props.update && props.onGetUpdate(props.update))}>
              {t("island.update.get")}
            </button>
            <button
              type="button"
              className="update-close"
              title={t("island.update.later")}
              onClick={stop(() => props.update && props.onDismissUpdate(props.update))}
            >
              ×
            </button>
          </div>
        )}
        <div className="hero-tico">{props.tico}</div>
        <div className="hero-text">
          <h2>{t("island.greeting", { name: active.name })}</h2>
          <p>{t(ROLES[active.id] ?? "island.role.custom")}</p>
          {props.status && <p className="hero-status">{props.status}</p>}
        </div>
        <div className="quick-actions">
          {quick.map((q, i) => (
            <button key={q.label} type="button" className="quick" style={{ "--i": i } as React.CSSProperties} onClick={stop(q.run)}>
              {q.icon}
              <span>{q.label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card ticos-card" style={{ "--ws": workspace.color } as React.CSSProperties}>
        <div className="ticos-head">
          <button
            type="button"
            className={`ws-chip${choosing ? " is-open" : ""}`}
            title={t("island.workspace.change")}
            onClick={stop(() => setChoosing((c) => !c))}
          >
            <span className="ws-icon">{workspace.icon}</span>
            <span className="ws-name">{workspace.name}</span>
            <IconChevron />
          </button>
        </div>
        {choosing ? (
          <div className="ws-list" role="listbox" aria-label={t("island.workspace.change")}>
            {props.workspaces.map((w, i) => (
              <button
                key={w.id}
                type="button"
                role="option"
                aria-selected={w.id === workspace.id}
                className={`ws-row${w.id === workspace.id ? " is-active" : ""}`}
                style={{ "--ws": w.color, "--i": i } as React.CSSProperties}
                onClick={stop(() => {
                  setChoosing(false);
                  props.onPickWorkspace(w.id);
                })}
              >
                <span className="ws-icon">{w.icon}</span>
                <span className="ws-name">{w.name}</span>
                <small>{t("island.workspace.ticos", { count: w.ticos.length })}</small>
                {w.id === workspace.id && <IconCheck />}
              </button>
            ))}
            <button type="button" className="ws-row ws-edit" onClick={stop(props.onEditWorkspaces)}>
              <span className="ws-icon">
                <IconPlus />
              </span>
              <span className="ws-name">{t("island.workspace.edit")}</span>
            </button>
          </div>
        ) : (
          <div className="tico-pills">
            {props.ticos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`tico-pill${p.id === active.id ? " is-active" : ""}`}
                style={{ "--pill": p.accentColor, "--i": i } as React.CSSProperties}
                onClick={stop(() => props.onPickTico(p.id))}
                title={p.name}
              >
                <span className="pill-avatar">
                  <TicoAvatar profile={p} size={30} seasonal={props.seasonal} />
                </span>
                <span className="pill-name">{p.name}</span>
                {props.withChat(p.id) && <i className="pill-dot" />}
              </button>
            ))}
            <button type="button" className="tico-pill add-pill" onClick={stop(props.onNewTico)}>
              <span className="pill-avatar">
                <IconPlus />
              </span>
              <span className="pill-name">{t("island.newTico")}</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
