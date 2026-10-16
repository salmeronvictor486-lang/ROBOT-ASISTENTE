import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Site } from "../src/site/Site";
import { mount } from "../src/entries/mount";

// Si otra web mete esta página en un marco (para engañar con clics encima), no pintamos
// nada: solo un enlace para abrirla en su sitio. GitHub Pages no deja enviar la cabecera
// `frame-ancestors`, así que se comprueba aquí.
if (window.self !== window.top) {
  document.body.textContent = "";
  const link = document.createElement("a");
  link.href = window.location.href;
  link.target = "_top";
  link.rel = "noopener";
  link.textContent = "Abrir la web de Tico";
  document.body.append(link);
} else {
  mount(
    <StrictMode>
      <Site />
    </StrictMode>,
    createRoot,
  );
}
