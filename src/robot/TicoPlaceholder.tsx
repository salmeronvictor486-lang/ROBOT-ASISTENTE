interface Props {
  size: number;
  baseColor: string;
  accentColor: string;
}

/** Tico quieto. El robot animado llega en la Fase 2. */
export function TicoPlaceholder({ size, baseColor, accentColor }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="48.5" y="8" width="3" height="14" rx="1.5" fill="#D9D6CF" />
      <circle cx="50" cy="8" r="5" fill={accentColor} />
      <circle cx="12" cy="56" r="6" fill="#D9D6CF" />
      <circle cx="88" cy="56" r="6" fill="#D9D6CF" />
      <rect x="14" y="22" width="72" height="62" rx="23" fill={baseColor} />
      <rect x="22" y="32" width="56" height="42" rx="17" fill="#121417" />
      <rect x="36" y="43" width="8" height="20" rx="4" fill={accentColor} />
      <rect x="56" y="43" width="8" height="20" rx="4" fill={accentColor} />
    </svg>
  );
}
