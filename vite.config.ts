import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Si `tauri dev` corre en un móvil o en otra máquina, Tauri pasa aquí su IP.
const host = process.env.TAURI_DEV_HOST;
const debug = Boolean(process.env.TAURI_ENV_DEBUG);

export default defineConfig({
  plugins: [react()],
  // Tauri espera un puerto fijo y que Vite no limpie la terminal (para ver los logs de Rust).
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // WebView2 (Windows) es Chromium; WKWebView (macOS) es Safari.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: !debug,
    sourcemap: debug,
  },
});
