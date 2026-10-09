# CLAUDE.md — Tico

Guía para Claude Code (y para Victor) sobre cómo está montado el proyecto.
**Actualízala al terminar cada fase o cambio grande.**

## Qué es
Tico es una "isla dinámica" de escritorio para Windows y macOS: al llevar el ratón al
borde superior baja una cápsula negra con un robot (Tico) que chatea y, solo cuando el
usuario lo pide, mira la pantalla para ayudar. El documento de diseño completo es el
"Prompt maestro" que Victor pegó al empezar.

## Cómo trabajamos
- Hablar en castellano y explicar cada decisión técnica en 2-3 frases sencillas.
- Commits pequeños con Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`…).
- 0 € en servicios: sin backends propios, sin cuentas, sin telemetría.
- Prohibido copiar código, sonidos o la mascota de coucou (Mochi). Tico es un diseño propio.

## Fase actual
**Fases 0-6 implementadas** (Victor pidió hacerlas todas seguidas y corregir después).
Pendiente: que Victor pruebe en Windows (y en un Mac si puede) y corregir lo que falle.

| Fase | Contenido | Estado |
| ---- | --------- | ------ |
| 0 | Proyecto, git, CLAUDE.md, README, licencias, CI | ✅ |
| 1 | Isla: ventana transparente, hover, estados, click-through, atajo | ✅ (sin probar en real) |
| 2 | Tico con 8 expresiones + `playground.html` | ✅ |
| 3 | Chat: Anthropic/OpenAI/Gemini/Ollama, streaming, llavero | ✅ (sin probar con clave real) |
| 4 | Visión: captura, miniatura, apps bloqueadas, permiso macOS | ✅ (sin probar en real) |
| 5 | Ajustes, idiomas, autoarranque, sonidos, bandeja | ✅ |
| 6 | Instaladores NSIS y .dmg con GitHub Actions | ✅ |

Lo que solo se puede verificar en un equipo real (CI solo compila y pasa tests):
- Que la ventana transparente y el click-through se comporten bien en Windows y macOS.
- macOS: que la isla quede por encima de la barra de menús y que el ancho del notch encaje.
- macOS 15+: que `contentProtected` excluya de verdad la isla de la captura.
- Que el foco del teclado llegue al cuadro de texto al abrir con el atajo.

## Stack
- Tauri 2 (Rust) + Vite 8 + React 19 + TypeScript 6 (estricto).
- TypeScript se queda en 6.0 porque typescript-eslint aún no soporta TS 7.
- Crates: `xcap` (captura), `keyring` 3 (llavero), `reqwest` (HTTP con streaming),
  `image` (JPEG), `tauri-nspanel` (macOS), plugins `global-shortcut`, `autostart`,
  `single-instance`.
- Tests: Vitest (frontend) y `cargo test` (Rust). Lint: ESLint + Clippy.

## Arquitectura
```
index.html / settings.html / playground.html   Una página por ventana (Vite multipágina)
src/
  entries/           Punto de entrada de cada ventana
  island/            La isla: máquina de estados, cápsula, chat, captura
    machine.ts       Reducer puro hidden/peek/compact/expanded (con tests)
    sizes.ts         Tamaños S/M/L y rectángulo para el click-through
    IslandApp.tsx    Une sensores de Rust, chat, captura, expresiones y sonidos
    useChat.ts       Estado del chat y streaming por Channel de Tauri
  robot/             Tico: Tico.tsx (SVG + bucle rAF), expressions.ts (poses), rig.ts (brazos),
                     gaze.ts, Playground
  settings/          Ventana de ajustes (se guarda sola) y grabación de atajos
  lib/               spring.ts (muelle propio), tauri.ts (API tipada), sound.ts (Web Audio)
  i18n/              es.json (referencia), ca.json, en.json
src-tauri/src/
  lib.rs             Arranque, plugins y registro de comandos
  island.rs          Hilo sensor ~60 Hz: hover del borde, click-through, cursor, multimonitor
  capture.rs         Captura con xcap, apps bloqueadas, JPEG 1568 px, solo en memoria
  chat.rs            Comandos del chat (streaming, cancelar, borrar, probar conexión)
  ai/                Trait Provider + anthropic, openai, gemini, ollama y lector de streaming
  secrets.rs         Claves en el llavero (nunca salen hacia el frontend)
  settings.rs        Ajustes en JSON en la carpeta de config del sistema
  shortcuts.rs       Atajos globales (abrir y capturar)
  tray.rs            Menú de la bandeja/barra de menús traducido
  platform/macos.rs  NSPanel no activable por encima de la barra de menús y pantallas con notch
.github/workflows/   ci.yml (comprobaciones) y release.yml (instaladores)
```

### Flujo de la isla
1. Rust (`island.rs`) mira el cursor cada 16 ms. Si está 150 ms en los 3 px superiores
   de la zona de activación, coloca la ventana en ese monitor y emite `island://edge-hover`.
2. React pasa a `peek`; con el cursor encima, a `compact`; con clic, a `expanded`.
3. React manda a Rust el rectángulo de la cápsula (`island_set_rect`). Rust activa el
   click-through (`set_ignore_cursor_events`) cuando el cursor está fuera y emite
   `island://pointer` al entrar o salir.
4. Si el cursor sale y no hay conversación, React se oculta tras `hideDelayMs`.

## Comandos
| Comando | Qué hace |
| ------- | -------- |
| `npm install` | Instala dependencias del frontend |
| `npm run tauri dev` | Arranca la app en modo desarrollo |
| `npm run dev` | Solo el frontend (isla simulada y `playground.html` en el navegador) |
| `npm run typecheck` / `npm run lint` / `npm test` | Tipos, ESLint y Vitest |
| `npm run tauri build` | Genera el instalador del sistema actual |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | Lint de Rust |
| `cd src-tauri && cargo test` | Tests de Rust (incluye un servidor HTTP falso para el streaming) |
| `npx tauri icon assets/tico.svg` | Regenera los iconos (borra luego `icons/android` e `icons/ios`) |
| Actions → Instaladores → Run workflow | Publica la Release `v<versión>` con `.exe`, `.zip` portable y `.dmg` |

## Decisiones tomadas
1. **Proyecto en la raíz del repo** (no en `tico/`): el repo es el proyecto.
2. **Tauri 2 estable**, no la alfa de Tauri 3.
3. **`lib.rs` + `main.rs`**: lo exige el soporte móvil (Android en el futuro).
4. **Errores tipados** con `thiserror`; viajan al frontend como `{ kind, message }` para
   traducirlos. Nada de `unwrap()` fuera de tests.
5. **Ventana de tamaño fijo con la cápsula animada dentro**: redimensionar ventanas
   nativas a 60 fps da tirones en Windows.
6. **Click-through desde Rust**, comparando el cursor con el rectángulo de la cápsula.
7. **Máquina de estados en el frontend** (reducer puro); Rust solo emite sensores.
8. **`spring.ts` en `src/lib/`**: lo comparten la isla y Tico.
9. Identificador de la app: `com.victorsalmeron.tico`.
10. **CI en Windows y macOS** desde la Fase 0.
11. **Tico se anima escribiendo atributos SVG en un bucle rAF**, no con estado de React:
    así no hay re-render a 60 fps.
12. **Streaming con `Channel` de Tauri** (no eventos globales): cada envío tiene su canal.
13. **Solo se reenvía la última captura** en el historial: las anteriores gastarían tokens.
14. **Modelo por defecto `claude-haiku-4-5`** (el que propuso Victor por coste), editable;
    "Probar conexión" lista los modelos reales de cada proveedor.
15. **Apps bloqueadas por palabra completa** (así "ING" no bloquea "Settings").
16. **La isla tiene `contentProtected`**: no aparece en capturas (tampoco en las tuyas).
17. **Ajustes de texto se guardan al salir del campo**, el resto al momento.
18. **Instalador de Windows por usuario** (sin admin) y **.dmg universal** firmado ad hoc.
    Windows tiene dos instaladores: x64 y x86 (32 bits). El de x86 existe porque el PC de
    Victor (Windows 10) mostró "No se puede ejecutar esta aplicación en el equipo" con el x64:
    sirve para Windows de 32 bits y para Windows 10 ARM (que no emula x64).
    El NSIS de Tauri no tiene catalán: el instalador va en castellano o inglés.
19. **Copyright a nombre de "Victor"** (como en `LICENSE`).
20. **Descargas directas desde el README**: el workflow publica una Release con nombres
    de archivo fijos (sin versión), así `releases/latest/download/<archivo>` siempre baja
    la última. Para una versión nueva, sube `version` en `package.json`,
    `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json` antes de lanzarlo.
21. **Commits con el correo privado de GitHub**
    (`237393936+salmeronvictor486-lang@users.noreply.github.com`): la cuenta bloquea los
    push que exponen el Gmail.
22. **Firma de Apple opcional**: `release.yml` firma con Developer ID y notariza solo si
    existen los secrets `APPLE_*` (cuenta de 99 $/año). Sin ellos, firma ad hoc y
    Gatekeeper avisa ("Apple no ha podido verificar…"); el README explica cómo abrirla.
23. **Notch de MacBook (v0.2.0)**: Rust detecta cada pantalla con notch (ancho y alto, vía
    `NSScreen.safeAreaInsets` y `auxiliaryTopLeft/RightArea`) y la reconoce entre los
    monitores por su tamaño lógico. En esa pantalla la isla va siempre centrada, nace del
    notch (oculta mide como él), en peek le salen orejas a los lados y en compact/expanded
    el contenido empieza por debajo (`contentTop`). Pasar el ratón por el notch la abre.
    En el navegador, `?notch=1` simula el notch para probar el diseño.
24. **Tico 2.0**: cuerpo, cuello, luz en el pecho y brazos con hombro y codo
    (`src/robot/rig.ts`, cinemática directa con tests). Animación por capas: pose con
    muelles, respiración y parpadeos dobles, sacadas de los ojos, antena con inercia,
    cabeza con retraso (follow-through), squash & stretch, gestos al hablar, saludo al
    abrir la isla y gestos espontáneos en reposo. Los brazos van delante de la cabeza para
    que se vean al saludar o pensar.
25. **Respuestas con formato**: `src/island/markdown.ts` convierte el Markdown básico en
    elementos de React (sin `dangerouslySetInnerHTML`), con botón de copiar.

## Licencias
Código: MIT (`LICENSE`). Tico, su nombre, su diseño y sus sonidos: todos los derechos
reservados (`ASSETS-LICENSE.md`).
