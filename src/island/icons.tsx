/** Iconos pequeños dibujados a mano (sin librerías ni archivos de terceros). */

const common = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconClose = () => (
  <svg {...common}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const IconCollapse = () => (
  <svg {...common}>
    <path d="M4 10l4-4 4 4" />
  </svg>
);

export const IconTrash = () => (
  <svg {...common}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
  </svg>
);

export const IconGear = () => (
  <svg {...common}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
  </svg>
);

export const IconEye = () => (
  <svg {...common}>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="1.8" />
  </svg>
);

export const IconCopy = () => (
  <svg {...common} width={13} height={13}>
    <rect x="5" y="5" width="8.5" height="8.5" rx="2" />
    <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10H4" />
  </svg>
);

export const IconHome = () => (
  <svg {...common}>
    <path d="M2.8 7.4L8 3l5.2 4.4M4.4 6.2V13h2.6V9.6h2V13h2.6V6.2" />
  </svg>
);

export const IconChat = () => (
  <svg {...common}>
    <path d="M3 4.2C3 3.5 3.5 3 4.2 3h7.6c.7 0 1.2.5 1.2 1.2v5.4c0 .7-.5 1.2-1.2 1.2H7l-2.8 2.4v-2.4C3.5 10.8 3 10.3 3 9.6z" />
  </svg>
);

export const IconClip = () => (
  <svg {...common}>
    <path d="M10.6 5.2L6 9.8a1.3 1.3 0 001.8 1.8l4.9-4.9a2.6 2.6 0 00-3.7-3.7L4 8a3.9 3.9 0 005.5 5.5l3.7-3.7" />
  </svg>
);

export const IconPlus = () => (
  <svg {...common}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

export const IconSound = () => (
  <svg {...common}>
    <path d="M3 6.3h2.2L8.2 4v8L5.2 9.7H3zM10.4 6a2.8 2.8 0 010 4M12.2 4.4a5.2 5.2 0 010 7.2" />
  </svg>
);

export const IconMute = () => (
  <svg {...common}>
    <path d="M3 6.3h2.2L8.2 4v8L5.2 9.7H3zM10.6 6.2l3 3.6M13.6 6.2l-3 3.6" />
  </svg>
);

export const IconSend = () => (
  <svg {...common} strokeWidth={2}>
    <path d="M8 12.5v-9M4.3 7.2L8 3.5l3.7 3.7" />
  </svg>
);

export const IconStop = () => (
  <svg {...common}>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconChevron = () => (
  <svg {...common} width={12} height={12}>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </svg>
);

export const IconFolder = () => (
  <svg {...common}>
    <path d="M2.5 4.6c0-.6.5-1.1 1.1-1.1h2.8l1.4 1.5h4.6c.6 0 1.1.5 1.1 1.1v5.8c0 .6-.5 1.1-1.1 1.1H3.6c-.6 0-1.1-.5-1.1-1.1z" />
  </svg>
);

export const IconOpen = () => (
  <svg {...common}>
    <path d="M9 3h4v4M13 3L7.5 8.5M11.5 9.5v2.8c0 .4-.3.7-.7.7H3.7c-.4 0-.7-.3-.7-.7V5.2c0-.4.3-.7.7-.7h2.8" />
  </svg>
);

export const IconSparkle = () => (
  <svg {...common}>
    <path d="M8 2.5l1.3 3.4 3.4 1.3-3.4 1.3L8 11.9 6.7 8.5 3.3 7.2l3.4-1.3zM12.5 11l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />
  </svg>
);

export const IconCheck = () => (
  <svg {...common}>
    <path d="M3.5 8.4l2.8 2.8 6.2-6.4" />
  </svg>
);

/** Icono de un tipo de archivo (con su etiqueta corta dentro). */
export function IconFile({ label, color }: { label: string; color: string }) {
  return (
    <svg width={30} height={36} viewBox="0 0 30 36" aria-hidden="true">
      <path d="M4 2h15l7 7v23a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" fill="#1f2126" stroke="#3a3d44" />
      <path d="M19 2v6a1 1 0 001 1h6" fill="none" stroke="#3a3d44" />
      <rect x="4" y="19" width="22" height="10" rx="3" fill={color} />
      <text x="15" y="26.6" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="#0b0c0e" fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </svg>
  );
}
