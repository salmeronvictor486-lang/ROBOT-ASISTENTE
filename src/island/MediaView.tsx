import type { ReactNode } from "react";
import { useT } from "../i18n";
import type { NowPlayingApi } from "./useNowPlaying";

interface Props {
  tico: ReactNode;
  media: NowPlayingApi;
}

const Prev = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor" />
  </svg>
);
const Next = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor" />
  </svg>
);
export const PlayIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5v14l11-7z" fill="currentColor" />
  </svg>
);
export const PauseIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
  </svg>
);

/** Portada (o un disco con nota si no hay). */
export function Artwork({ src, size }: { src: string | null; size: number }) {
  return src ? (
    <img className="artwork" src={src} alt="" width={size} height={size} draggable={false} />
  ) : (
    <span className="artwork artwork-empty" style={{ width: size, height: size }} aria-hidden="true">
      ♪
    </span>
  );
}

/** Pestaña de música: portada grande, qué suena, controles y volumen. */
export function MediaView({ tico, media }: Props) {
  const t = useT();
  const { now, volume } = media;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  if (!now) {
    return (
      <section className="card media-empty">
        <div className="media-empty-tico">{tico}</div>
        <div>
          <h2>{t("media.emptyTitle")}</h2>
          <p className="muted">{t("media.emptyHint")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={`card media-card${now.playing ? " is-playing" : ""}`}>
      {now.artwork && <img className="media-backdrop" src={now.artwork} alt="" aria-hidden="true" />}
      <div className="media-art">
        <Artwork src={now.artwork} size={150} />
      </div>
      <div className="media-info">
        <span className="media-app">
          <i className={now.playing ? "eq is-on" : "eq"} aria-hidden="true">
            <b />
            <b />
            <b />
          </i>
          {now.app || t("media.playing")}
        </span>
        <h2 title={now.title}>{now.title}</h2>
        <p className="media-artist" title={[now.artist, now.album].filter(Boolean).join(" · ")}>
          {[now.artist, now.album].filter(Boolean).join(" · ")}
        </p>
        <div className="media-controls">
          <button type="button" className="media-btn" title={t("media.previous")} onClick={stop(() => media.control("previous"))}>
            <Prev />
          </button>
          <button
            type="button"
            className="media-btn media-main"
            title={now.playing ? t("media.pause") : t("media.play")}
            onClick={stop(() => media.control("playPause"))}
          >
            {now.playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </button>
          <button type="button" className="media-btn" title={t("media.next")} onClick={stop(() => media.control("next"))}>
            <Next />
          </button>
        </div>
        {volume !== null && (
          <label className="media-volume" onClick={(e) => e.stopPropagation()}>
            <span aria-hidden="true">{volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              aria-label={t("media.volume")}
              onChange={(e) => media.setVolume(Number(e.target.value) / 100)}
              style={{ "--fill": `${Math.round(volume * 100)}%` } as React.CSSProperties}
            />
            <small>{Math.round(volume * 100)}</small>
          </label>
        )}
      </div>
      <div className="media-tico">{tico}</div>
    </section>
  );
}
