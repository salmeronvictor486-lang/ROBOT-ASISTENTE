import type { ReactNode } from "react";

/** Iconos de línea propios (24×24), heredan el color del texto. */
function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconIsland = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <rect x="8" y="4" width="8" height="4" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconEye = () => (
  <Icon>
    <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icon>
);

export const IconSpark = () => (
  <Icon>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </Icon>
);

export const IconDoc = () => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M9 14h6M9 17h4" />
  </Icon>
);

export const IconMail = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);

export const IconMusic = () => (
  <Icon>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Icon>
);

export const IconRobots = () => (
  <Icon>
    <rect x="3" y="7" width="10" height="9" rx="3" />
    <rect x="11" y="9" width="10" height="9" rx="3" />
    <path d="M8 7V4M16 9V6" />
  </Icon>
);

export const IconMemory = () => (
  <Icon>
    <path d="M12 3a6 6 0 0 0-6 6c0 2.4 1.3 3.7 2.3 4.7.7.7 1.2 1.5 1.2 2.5V18h5v-1.8c0-1 .5-1.8 1.2-2.5C16.7 12.7 18 11.4 18 9a6 6 0 0 0-6-6Z" />
    <path d="M10 21h4" />
  </Icon>
);

export const IconDesktop = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Icon>
);

export const IconLock = () => (
  <Icon>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const IconKey = () => (
  <Icon>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" />
  </Icon>
);

export const IconCloudOff = () => (
  <Icon>
    <path d="M3 3l18 18M8.5 7.4A5 5 0 0 1 17 10a4 4 0 0 1 2.6 6.9M16 18H7a4 4 0 0 1-1.6-7.7" />
  </Icon>
);

export const IconCode = () => (
  <Icon>
    <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
  </Icon>
);

export const IconDownload = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </Icon>
);

export const IconPlay = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
  </svg>
);

export const IconWindows = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 5.5 10.5 4.4v7.1H3Zm8.5-1.2L21 3v8.5h-9.5ZM3 12.5h7.5v7.1L3 18.5Zm8.5 0H21V21l-9.5-1.3Z" fill="currentColor" />
  </svg>
);

export const IconApple = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.9-.8-3.1-.8C6.8 7.2 5.3 8.1 4.5 9.6c-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 2.9 2.4 1.2-.1 1.6-.8 3-.8s1.8.8 3.1.7c1.3 0 2.1-1.2 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.4-1-2.4-3.9ZM14.1 5.6c.6-.8 1.1-1.8 1-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.7-1.3Z"
      fill="currentColor"
    />
  </svg>
);

export const IconLinux = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 2.5c-2.3 0-3.6 1.9-3.6 4.4 0 1.3.3 2.2-.4 3.4-.9 1.5-2.7 3.6-2.9 6-.1 1.1.3 1.9 1 2.4-.4.5-.6 1-.4 1.5.4.9 1.8.8 3.1.4.9-.3 1.8-.3 2.6-.3h1.2c.8 0 1.7 0 2.6.3 1.3.4 2.7.5 3.1-.4.2-.5 0-1-.4-1.5.7-.5 1.1-1.3 1-2.4-.2-2.4-2-4.5-2.9-6-.7-1.2-.4-2.1-.4-3.4 0-2.5-1.3-4.4-3.6-4.4Zm-1.6 4.1c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1Zm3.2 0c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1ZM12 9.4c.9 0 2 .5 2 .9s-1.1 1.1-2 1.1-2-.7-2-1.1 1.1-.9 2-.9Z"
      fill="currentColor"
    />
  </svg>
);

/** Marca de GitHub (para enlazar al repositorio, como indican sus normas de uso del logo). */
export const IconGitHub = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 1.8a10.2 10.2 0 0 0-3.2 19.9c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.3-.3-4.7-1.1-4.7-5 0-1.1.4-2 1-2.7-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.7 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.2 10.2 0 0 0 12 1.8Z"
      fill="currentColor"
    />
  </svg>
);
