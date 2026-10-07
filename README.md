# Tico

Una **isla dinámica de escritorio** para Windows y macOS. Lleva el ratón al borde
superior de la pantalla y baja una cápsula negra con **Tico**, un pequeño robot que
chatea contigo y, solo cuando tú se lo pides, mira tu pantalla para ayudarte.

<p align="center"><img src="assets/tico.svg" alt="Tico" width="160"></p>

## Qué hace

- **La isla**: aparece al dejar el ratón en el borde superior (zona central), crece al
  pasar por encima y se abre al hacer clic. Fuera de la cápsula, los clics pasan a las
  apps de debajo. `Ctrl/⌘ + Mayús + Espacio` la abre para escribir y `Esc` la cierra.
- **Tico**: robot propio animado a 60 fps. Respira, parpadea, te sigue con la mirada y
  tiene 8 expresiones: reposo, curioso, mirando, pensando, hablando, contento, error y
  dormido. Si le haces 3 clics seguidos, protesta.
- **Chat con IA**: Claude, OpenAI, Gemini u Ollama (local y gratis). Pones tu propia
  clave, que se guarda en el llavero del sistema. Las respuestas llegan en streaming.
- **Mira mi pantalla**: botón o `Ctrl/⌘ + Mayús + S`. Captura la pantalla o la ventana
  activa, te enseña la miniatura antes de enviarla y no captura nada si hay a la vista
  un gestor de contraseñas o la web de un banco. La imagen nunca se guarda en disco.
- **Personalizable**: colores de Tico, tamaño, posición, retardos, tema, idioma
  (castellano, català, English), atajos, apps bloqueadas, sonidos e inicio con el sistema.

Sin telemetría y sin cuentas.

## Instalar (sin compilar)

Los instaladores se generan con GitHub Actions: pestaña **Actions → Instaladores →
Run workflow**. Al terminar, descárgalos en **Artifacts** (`Tico-Windows` y `Tico-macOS`).

Como la app **no está firmada** (firmar cuesta dinero), el sistema avisará la primera vez:

- **Windows**: SmartScreen dice "Windows protegió su PC". Pulsa **Más información →
  Ejecutar de todas formas**. Se instala solo para tu usuario (no pide administrador).
- **macOS**: abre el `.dmg` y arrastra Tico a Aplicaciones. Al abrirlo, macOS dirá que
  no puede comprobar el desarrollador. Ve a **Ajustes del Sistema → Privacidad y
  seguridad** y pulsa **Abrir igualmente** (o clic derecho sobre Tico → Abrir).
  Si dice que la app "está dañada", ejecuta en la Terminal:
  `xattr -dr com.apple.quarantine /Applications/Tico.app`
- **macOS, ver la pantalla**: la primera vez que uses "Mira mi pantalla", macOS pedirá
  permiso de **Grabación de pantalla**. Actívalo para Tico y vuelve a abrirlo.

Tico no sale en la barra de tareas ni en el Dock: vive en la **bandeja del sistema**
(Windows) o en la **barra de menús** (macOS). Desde ahí abres los ajustes o lo cierras.

## Requisitos para desarrollar (Windows 11)

1. **Rust** con [rustup](https://rustup.rs) (toolchain `stable-msvc`, la de por defecto).
2. **Node.js LTS** (22 o superior).
3. **Microsoft C++ Build Tools** con la carga de trabajo *Desarrollo para el escritorio con C++*.
4. **WebView2**: ya viene con Windows 11.

En macOS: `xcode-select --install`, Rust y Node. Guía oficial:
<https://v2.tauri.app/start/prerequisites/>

```powershell
git clone https://github.com/salmeronvictor486-lang/ROBOT-ASISTENTE.git
cd ROBOT-ASISTENTE
npm install
npx tauri info      # resumen del entorno: debe salir todo con ✔
npm run tauri dev   # la primera vez tarda varios minutos (compila Rust)
```

Para la IA gratis en local: instala [Ollama](https://ollama.com), descarga un modelo con
visión (`ollama pull gemma3`) y elige "Ollama" en Ajustes.

También puedes ver a Tico sin Rust: `npm run dev` y abre
<http://localhost:1420/playground.html> (página de pruebas de las expresiones).

## Comprobaciones

```powershell
npm run typecheck
npm run lint
npm test
cd src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
```

GitHub Actions ejecuta lo mismo en Windows y macOS en cada push (workflow **CI**).

## Licencia

- Código: [MIT](LICENSE).
- Tico (personaje, nombre, diseño y sonidos): todos los derechos reservados, ver
  [ASSETS-LICENSE.md](ASSETS-LICENSE.md).

Inspirado en la idea de [coucou](https://github.com/Louis-CFM/coucou); no usa su código,
sus sonidos ni su mascota.
