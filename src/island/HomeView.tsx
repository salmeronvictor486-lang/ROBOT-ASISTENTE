import type { ReactNode } from "react";
import { useT, type MessageKey } from "../i18n";
import type { TicoProfile } from "../types";
import { IconChat, IconClip, IconEye, IconPlus, IconSparkle } from "./icons";
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
  const { active } = props;
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
      <section className="card ticos-card">
        <h3>{t("island.ticos")}</h3>
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
      </section>
    </div>
  );
}
