import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

/**
 * Web de Tico (GitHub Pages). `npm run site` la arranca y `npm run site:build` la deja en
 * `dist-site/`. GitHub Pages no deja poner cabeceras HTTP, así que la política de seguridad
 * va en una etiqueta <meta> (solo al compilar: en desarrollo Vite necesita scripts en línea).
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "upgrade-insecure-requests",
  // Ningún código puede meter HTML como texto (innerHTML…): corta de raíz los ataques XSS.
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join("; ");

const SECURITY_MARK = "<!-- tico:seguridad (al compilar se cambia por la política de seguridad) -->";

function securityHeaders(): Plugin {
  return {
    name: "tico-site-security",
    transformIndexHtml(html, ctx) {
      if (!html.includes(SECURITY_MARK)) throw new Error("Falta la marca de seguridad en site/index.html");
      // Justo detrás de <meta charset>: así protege todo lo que viene después.
      const tags = ctx.server
        ? ""
        : `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`;
      return html.replace(SECURITY_MARK, tags);
    },
  };
}

export default defineConfig({
  root: "site",
  // Rutas relativas: funciona en salmeronvictor486-lang.github.io/ROBOT-ASISTENTE/ y en un dominio propio.
  base: "./",
  plugins: [react(), securityHeaders()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 1430, strictPort: true },
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
    target: ["chrome111", "safari16", "firefox115", "edge111"],
    // Código compilado y comprimido, sin mapas de código ni comentarios: lo que se descarga
    // el navegador no se parece al código fuente.
    minify: true,
    sourcemap: false,
    cssMinify: true,
    // Nada en línea: con la CSP estricta, todo tiene que venir de un archivo propio.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
        comments: false,
      },
    },
  },
});
