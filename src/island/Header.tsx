import type { ReactNode } from "react";
import { useT } from "../i18n";
import { IconChat, IconClip, IconClose, IconCollapse, IconGear, IconHome, IconMute, IconSound, IconTrash } from "./icons";

export type Tab = "home" | "chat" | "files";

interface Props {
  tab: Tab;
  setTab: (tab: Tab) => void;
  /** Texto de estado (centro). */
  status: ReactNode;
  sounds: boolean;
  onToggleSound: () => void;
  onClear?: (() => void) | undefined;
  onSettings?: (() => void) | undefined;
  onCollapse: () => void;
  onClose: () => void;
  /** Hay archivos esperando: la pestaña lleva un número. */
  fileCount: number;
}

/** Cabecera de la isla abierta: pestañas a la izquierda, botones a la derecha. */
export function Header(props: Props) {
  const t = useT();
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const tabs: { id: Tab; icon: ReactNode; label: string }[] = [
    { id: "home", icon: <IconHome />, label: t("island.tab.home") },
    { id: "chat", icon: <IconChat />, label: t("island.tab.chat") },
    { id: "files", icon: <IconClip />, label: t("island.tab.files") },
  ];
  return (
    <header className="island-header">
      <nav className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={props.tab === tab.id}
            className={`tab${props.tab === tab.id ? " is-active" : ""}`}
            title={tab.label}
            onClick={stop(() => props.setTab(tab.id))}
          >
            {tab.icon}
            {tab.id === "files" && props.fileCount > 0 && <b className="tab-badge">{props.fileCount}</b>}
          </button>
        ))}
      </nav>
      <div className="header-status">{props.status}</div>
      <div className="header-actions">
        {props.onClear && (
          <button type="button" className="icon-button" title={t("island.clear")} onClick={stop(props.onClear)}>
            <IconTrash />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          title={props.sounds ? t("island.soundOff") : t("island.soundOn")}
          onClick={stop(props.onToggleSound)}
        >
          {props.sounds ? <IconSound /> : <IconMute />}
        </button>
        {props.onSettings && (
          <button type="button" className="icon-button" title={t("island.settings")} onClick={stop(props.onSettings)}>
            <IconGear />
          </button>
        )}
        <button type="button" className="icon-button" title={t("island.collapse")} onClick={stop(props.onCollapse)}>
          <IconCollapse />
        </button>
        <button type="button" className="icon-button" title={t("island.close")} onClick={stop(props.onClose)}>
          <IconClose />
        </button>
      </div>
    </header>
  );
}
