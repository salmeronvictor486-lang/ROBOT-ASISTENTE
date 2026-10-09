import type { Outfit } from "../types";

/** Ropa de Tico: la elegida en Ajustes o la de temporada. */
export type OutfitName = Outfit | "santa" | "witch";

interface Props {
  outfit: OutfitName;
  /** "head": va con la cabeza (gorros, gafas); "body": con el cuerpo (bufanda). */
  part: "head" | "body";
  accent: string;
}

/** Oscurece un color #RRGGBB. */
function darker(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const f = 1 - amount;
  return `rgb(${Math.round(((n >> 16) & 255) * f)} ${Math.round(((n >> 8) & 255) * f)} ${Math.round((n & 255) * f)})`;
}

/**
 * Accesorios dibujados en el mismo espacio (100×100) que Tico. La cabeza ocupa
 * x 18–82, y 20–64; el visor x 25–75, y 27–57; los ojos están en (41, 42) y (59, 42).
 */
export function OutfitLayer({ outfit, part, accent }: Props) {
  if (part === "body") {
    if (outfit !== "scarf") return null;
    return (
      <g aria-hidden="true">
        <rect x="35" y="60" width="30" height="8" rx="4" fill={accent} />
        <path d="M56 64 L61 82 L54.5 83 L51 66 Z" fill={darker(accent, 0.14)} />
        <path d="M38 61.5 L38 66.5 M43 61 L43 67 M48 61 L48 67" stroke={darker(accent, 0.22)} strokeWidth="1.2" />
      </g>
    );
  }
  switch (outfit) {
    case "glasses":
      return (
        <g aria-hidden="true" fill="rgba(255,255,255,0.07)" stroke="#F4F4F4" strokeWidth="1.7">
          <circle cx="41" cy="42" r="8.2" />
          <circle cx="59" cy="42" r="8.2" />
          <path d="M49 40.5 Q50 39.3 51 40.5" fill="none" />
          <path d="M32.8 40.5 L20 38" fill="none" />
          <path d="M67.2 40.5 L80 38" fill="none" />
        </g>
      );
    case "headphones":
      return (
        <g aria-hidden="true">
          <path d="M17 40 C17 4 83 4 83 40" fill="none" stroke="#6B717C" strokeWidth="4.6" strokeLinecap="round" />
          <path d="M19 33 C21 9 79 9 81 33" fill="none" stroke="#8C929C" strokeWidth="1.2" strokeLinecap="round" />
          <rect x="8" y="31" width="13" height="23" rx="5.5" fill="#4A4F58" />
          <rect x="79" y="31" width="13" height="23" rx="5.5" fill="#4A4F58" />
          <rect x="9.5" y="34" width="4.5" height="17" rx="2.2" fill={accent} />
          <rect x="86" y="34" width="4.5" height="17" rx="2.2" fill={accent} />
        </g>
      );
    case "cap":
      return (
        <g aria-hidden="true">
          <path d="M23 26 C23 9 77 9 77 26 Z" fill={accent} />
          <path d="M58 24 L93 26.5 Q95 30 89 30.5 L56 29 Z" fill={darker(accent, 0.18)} />
          <path d="M50 11 L50 25 M36 14 Q40 20 38 26 M64 14 Q60 20 62 26" stroke={darker(accent, 0.12)} strokeWidth="1" fill="none" />
          <circle cx="50" cy="11" r="2.2" fill={darker(accent, 0.25)} />
        </g>
      );
    case "beret":
      return (
        <g aria-hidden="true" transform="rotate(-9 48 18)">
          <ellipse cx="47" cy="19" rx="28" ry="7.5" fill={accent} />
          <ellipse cx="47" cy="22.5" rx="25" ry="3" fill={darker(accent, 0.2)} />
          <rect x="45.5" y="9" width="3" height="5" rx="1.4" fill={darker(accent, 0.25)} />
        </g>
      );
    case "graduation":
      return (
        <g aria-hidden="true">
          <path d="M31 23 L69 23 L67 13 L33 13 Z" fill="#3A4252" />
          <path d="M50 1 L86 10 L50 19 L14 10 Z" fill="#4B5568" stroke="#6A7590" strokeWidth="0.8" strokeLinejoin="round" />
          <circle cx="50" cy="10" r="1.8" fill={accent} />
          <path d="M50 10 L79 13 L79 25" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
          <rect x="77" y="24" width="4" height="7" rx="1.5" fill={accent} />
        </g>
      );
    case "crown":
      return (
        <g aria-hidden="true">
          <path d="M30 23 L29 9 L38.5 16 L44 5 L50 14 L56 5 L61.5 16 L71 9 L70 23 Z" fill="#F5C542" stroke="#D9A21B" strokeWidth="1.2" strokeLinejoin="round" />
          <circle cx="50" cy="19" r="2.2" fill={accent} />
          <circle cx="39" cy="19.5" r="1.6" fill="#E5484D" />
          <circle cx="61" cy="19.5" r="1.6" fill="#E5484D" />
        </g>
      );
    case "bow":
      return (
        <g aria-hidden="true">
          <path d="M72 21 L61 13 Q59 21 61 29 Z" fill={accent} />
          <path d="M72 21 L83 13 Q85 21 83 29 Z" fill={accent} />
          <circle cx="72" cy="21" r="3.4" fill={darker(accent, 0.2)} />
        </g>
      );
    case "wizard":
    case "witch": {
      const hat = outfit === "witch" ? "#4A3A5E" : "#5B4BD6";
      const brim = outfit === "witch" ? "#3A2D4C" : "#4A3CC0";
      const band = outfit === "witch" ? "#FF8A1F" : "#F5C542";
      return (
        <g aria-hidden="true">
          <path d="M31 22 L52 -14 L69 22 Z" fill={hat} />
          <path d="M33.5 18 L66.5 18 L68 22 L32 22 Z" fill={band} />
          <ellipse cx="50" cy="22.5" rx="27" ry="4.6" fill={brim} />
          {outfit === "wizard" && (
            <g fill="#F5C542">
              <path d="M47 3 l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z" />
              <circle cx="57" cy="11" r="1.3" />
              <circle cx="44" cy="13" r="0.9" />
            </g>
          )}
        </g>
      );
    }
    case "flower":
      return (
        <g aria-hidden="true">
          {[0, 72, 144, 216, 288].map((a) => (
            <circle
              key={a}
              cx={73 + Math.cos((a * Math.PI) / 180) * 4.2}
              cy={22 + Math.sin((a * Math.PI) / 180) * 4.2}
              r="3.6"
              fill="#FF8FB8"
            />
          ))}
          <circle cx="73" cy="22" r="2.8" fill="#FFD43B" />
        </g>
      );
    case "bandana":
      return (
        <g aria-hidden="true">
          <path d="M19 27 Q50 15 81 27 L81 22 Q50 9 19 22 Z" fill={accent} />
          <path d="M80 23 L91 17 L89 26 Z M80 25 L90 29 L84 32 Z" fill={darker(accent, 0.15)} />
          <circle cx="40" cy="19.5" r="1" fill="#fff" opacity="0.8" />
          <circle cx="56" cy="19" r="1" fill="#fff" opacity="0.8" />
        </g>
      );
    case "santa":
      return (
        <g aria-hidden="true">
          <path d="M23 24 C25 6 62 -2 82 14 L80 24 Z" fill="#E5484D" />
          <rect x="19" y="20" width="64" height="7" rx="3.5" fill="#FBFBFB" />
          <circle cx="84" cy="14" r="4.6" fill="#FBFBFB" />
        </g>
      );
    case "none":
    case "scarf":
      return null;
  }
}
