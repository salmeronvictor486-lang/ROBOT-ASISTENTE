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
