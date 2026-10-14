# CLAUDE.md — Tico

Guía del proyecto (para Victor y para el asistente de código) sobre cómo está montado.
**Actualízala al terminar cada fase o cambio grande.**

## Qué es
Tico es una "isla dinámica" de escritorio para Windows, macOS y Linux: al llevar el ratón al
borde superior baja una cápsula negra con un robot (Tico) que chatea y, solo cuando el
usuario lo pide, mira la pantalla para ayudar. El documento de diseño completo es el
"Prompt maestro" que Victor pegó al empezar.

## Cómo trabajamos
- Hablar en castellano y explicar cada decisión técnica en 2-3 frases sencillas.
- Commits pequeños con Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`…).
- 0 € en servicios: sin backends propios, sin cuentas, sin telemetría.
- Prohibido copiar código, sonidos o la mascota de coucou (Mochi). Tico es un diseño propio.

## Fase actual
**Versión 1.1.0**. Fases 0-6 hechas, la 1.0 (varios Ticos, 12 servicios de IA, OCR,
archivos, Word → PDF e interfaz nueva con pestañas) y la 1.1: espacios de trabajo y base
de datos local (SQLite) con ajustes, conversaciones y PDF convertidos.
Pendiente: que Victor pruebe en Windows (y en un Mac si puede) y corregir lo que falle.

| Fase | Contenido | Estado |
| ---- | --------- | ------ |
| 0 | Proyecto, git, CLAUDE.md, README, licencias, CI | ✅ |
| 1 | Isla: ventana transparente, hover, estados, click-through, atajo | ✅ (sin probar en real) |
| 2 | Tico con 8 expresiones + `playground.html` | ✅ |
| 3 | Chat: Anthropic/OpenAI/Gemini/Ollama, streaming, llavero | ✅ (sin probar con clave real) |
| 4 | Visión: captura, miniatura, apps bloqueadas, permiso macOS | ✅ (sin probar en real) |
| 5 | Ajustes, idiomas, autoarranque, sonidos, bandeja | ✅ |
| 6 | Instaladores NSIS, .dmg, .deb y AppImage con GitHub Actions | ✅ |

Lo que solo se puede verificar en un equipo real (CI solo compila y pasa tests):
- Que la ventana transparente y el click-through se comporten bien en Windows y macOS.
- macOS: que la isla quede por encima de la barra de menús y que el ancho del notch encaje.
- macOS 15+: que `contentProtected` excluya de verdad la isla de la captura.
- Que el foco del teclado llegue al cuadro de texto al abrir con el atajo.
- Soltar archivos sobre la isla (eventos nativos de Tauri) y el OCR de Windows/macOS.
- Pasar a PDF con Word (PowerShell + COM) en Windows y con Pages (AppleScript) en Mac.
- Que el cambio de espacio por app (`workspace.rs`, ventana activa con `xcap`) acierte.
- La música: que Spotify/YouTube salgan con portada y respondan a los botones en cada sistema.
- Linux: la isla con XWayland en GNOME y KDE, la bandeja y el llavero.
- Enviar un correo real con Gmail (contraseña de aplicación) y abrir el borrador en Outlook
  (COM) en Windows y en Mail (AppleScript) en macOS.

## Stack
- Tauri 2 (Rust) + Vite 8 + React 19 + TypeScript 6 (estricto).
- TypeScript se queda en 6.0 porque typescript-eslint aún no soporta TS 7.
- Crates: `xcap` (captura), `keyring` 3 (llavero), `reqwest` (HTTP con streaming),
  `image` (JPEG/PNG), `tauri-nspanel` (macOS), plugins `global-shortcut`, `autostart`,
  `single-instance`, `dialog`. Archivos y PDF: `zip` + `quick-xml` (leer .docx/.xlsx/.pptx),
  `pdf-extract` (leer PDF), `pdf-writer` + `ttf-parser` + `subsetter` (motor de PDF propio).
  OCR: `windows` (Windows.Media.Ocr) y `objc2-vision` (macOS).
  Base de datos: `rusqlite` con `bundled` (SQLite compilado dentro: nada que instalar).
  Correo: `lettre` (SMTP con rustls + ring, sin OpenSSL).
  Linux: `keyring` con Secret Service (GNOME Keyring/KWallet) y `mpris` para la música.
- Tests: Vitest (frontend) y `cargo test` (Rust). Lint: ESLint + Clippy.

## Arquitectura
```
index.html / settings.html / playground.html / pet.html / welcome.html   Una página por ventana
src/
  entries/           Punto de entrada de cada ventana
  island/            La isla: máquina de estados, cápsula, pestañas, chat, archivos
    machine.ts       Reducer puro hidden/peek/compact/expanded (con tests)
    sizes.ts         Tamaños S/M/L y rectángulo para el click-through
    IslandApp.tsx    Une sensores de Rust, pestañas, chat, archivos, PDF, expresiones y sonidos
    Header/HomeView/ChatView/FilesView  Cabecera con pestañas y las tres vistas
    ModelPicker.tsx  Chip para cambiar de IA y de modelo desde el chat
    intents.ts       "Pásame este Word a PDF" / "¿qué ves en mi pantalla?" (con tests)
    commands.ts      Paleta "/" del chat: buscar comandos sin tildes (con tests)
    useChat.ts       Conversación por Tico, streaming por Channel, tareas de PDF
    useDroppedFiles.ts  Archivos soltados que esperan en la isla (añadir, quitar, mover)
    MailSheet.tsx    Ventanita de correo dentro de la isla (Para, Asunto, Mensaje, adjuntos)
    MediaView.tsx / useNowPlaying.ts  Reproductor: portada, controles y volumen (pestaña 🎵
                     y mini reproductor en compacto)
  robot/             Tico: Tico.tsx (SVG + bucle rAF), expressions.ts (15 poses), outfits.tsx
                     (ropa), rig.ts (brazos), gaze.ts, Playground
  settings/          Ventana de ajustes con menú lateral, editor de Ticos, espacios y proveedores
  pet/               Tico en el escritorio (ventana transparente aparte)
  lib/               spring.ts (muelle propio), tauri.ts (API tipada), sound.ts (Web Audio)
  workspaces.ts      Espacios: cambiar de espacio o de Tico, espacio nuevo (con tests)
  welcome/           Bienvenida de primer uso (welcome.html): idioma, IA, clave, cómo llamarlo
  i18n/              es.json (referencia), ca.json, en.json
src-tauri/src/
  lib.rs             Arranque, plugins y registro de comandos
  island.rs          Hilo sensor ~60 Hz: hover del borde, click-through, cursor, multimonitor
  capture.rs         Captura con xcap, apps bloqueadas, JPEG 1568 px + OCR, solo en memoria
  ocr.rs             Texto de una imagen con el OCR del sistema (Windows / macOS)
  chat.rs            Chat por Tico: adjuntos, reintentos, cambio de modelo, sin visión → OCR
  ai/                Trait Provider + anthropic, openai (y compatibles), gemini, ollama, demo,
                     models.rs (elegir el modelo más parecido) y router.rs (qué proveedor)
  files.rs           Tipos de archivo, leer texto (docx/pdf/xlsx/pptx/rtf…), abrir y mostrar
  convert/           Word → PDF: mod.rs (Office/Pages/LibreOffice/propio), docx.rs (lector),
                     pdf.rs (motor propio con fuentes del sistema recortadas)
  secrets.rs         Claves en el llavero (nunca salen hacia el frontend)
  settings.rs        Ajustes (struct, valores por defecto, saneado y migraciones)
  db.rs              Base de datos SQLite tico.db: ajustes, conversaciones, PDF, copias
  shortcuts.rs       Atajos globales (abrir y capturar)
  tray.rs            Menú de la bandeja/barra de menús traducido (con "Tico en el escritorio")
  pet.rs             Ventana de Tico en el escritorio: crearla, quitarla y recordar dónde está
  workspace.rs       Cambiar solo al espacio de la app que estás usando al abrir la isla
  updates.rs         ¿Hay versión nueva? (última Release de GitHub, comparación semver)
  media.rs           Lo que suena y sus controles: GSMTC (Windows), AppleScript + teclas
                     multimedia (macOS), MPRIS (Linux); volumen del sistema; portadas a JPEG
  mail.rs            Enviar archivos por correo: SMTP con tu cuenta (lettre) o borrador en
                     Outlook/Thunderbird/Mail; servidores de Gmail, iCloud… por dominio
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
25. **Respuestas con formato**: `src/island/parseMarkdown.ts` convierte el Markdown básico en
    elementos de React (sin `dangerouslySetInnerHTML`), con botón de copiar.
26. **Varios Ticos (1.0)**: `Settings.ticos` (perfil con colores, ropa, instrucciones y
    proveedor/modelo propios opcionales) y `activeTico`. Rust guarda una conversación por Tico.
    Los ajustes de la 0.x (`robotBaseColor`…) se migran al primer Tico.
27. **Proveedores compatibles con OpenAI en un solo módulo** (`ai/openai.rs`): OpenAI,
    OpenRouter, Groq, Mistral, DeepSeek, xAI, LM Studio y personalizado. OpenAI usa
    `max_completion_tokens` (y `reasoning_effort: low` en o-series/gpt-5); el resto `max_tokens`.
28. **Recuperación automática** en `chat.rs`: reintenta 2 veces si hay saturación o corte (antes
    del primer token), busca el modelo más parecido si el elegido no existe (y lo guarda) y
    reenvía sin imágenes si el modelo no ve. Los errores llevan `detail` para traducirlos.
29. **OCR del sistema** (gratis, sin internet) en cada captura e imagen adjunta: el texto va en
    el `context` del mensaje (no se ve en el chat). Así "lee" la pantalla con cualquier modelo.
30. **Word → PDF sin IA**: se detecta la intención en el frontend (`intents.ts`) y Rust prueba
    la app original (PowerShell + COM en Windows, AppleScript en Mac), luego LibreOffice y por
    último el motor propio. Sin archivo, usa el documento abierto en Word/Pages o pide uno.
31. **Motor de PDF propio** con fuentes del sistema (Calibri/Arial…) recortadas con `subsetter`
    y tabla Unicode: el PDF pesa poco y se puede buscar texto. `panic = "unwind"` en release
    para que un PDF raro no cierre la app (se aísla con `catch_unwind`).
32. **Isla de 600×340** (a escala M) con pestañas Inicio/Chat/Archivos; sigue siendo una ventana
    fija con la cápsula animada dentro.
33. **Tico quieto en miniaturas** (`animated={false}`): sin bucle rAF, para listas de Ticos.
34. **Tico en el escritorio** (`pet.rs`, `src/pet/`): ventana transparente de 180×214 siempre
    encima. Se arrastra con `startDragging()` (a partir de 4 px; si no, es un clic que abre la
    isla). Rust le manda la posición del cursor para los ojos y guarda dónde lo dejas (solo
    Rust toca `petPosition`: una ventana con ajustes viejos no la pisa).
35. **Espacios de trabajo (1.1)**: `Settings.workspaces` + `activeWorkspace`. Los Ticos siguen
    siendo una lista global y cada espacio guarda los ids de los suyos (un Tico puede estar en
    varios) y su último Tico. `activeTico` es siempre del espacio activo (lo asegura
    `sanitized()`). Las conversaciones van por `"espacio/tico"`. El contexto del espacio y los
    nombres de los últimos archivos de su carpeta van en el prompt de sistema (solo si hay más
    de un espacio o algo que contar). Al abrir la isla, `workspace.rs` mira la ventana activa y
    cambia al espacio cuyas apps coinciden (por palabra, como las apps bloqueadas); solo cuando
    cambias de app, para no pisar un cambio hecho a mano. Los ajustes de la 1.0 (sin
    `workspaces`) estrenan los espacios con los Ticos que ya tenían.
36. **Base de datos local (1.1)**: `tico.db` (SQLite con `rusqlite` + `bundled`) en la carpeta
    de datos de la app, en modo WAL. Tablas `settings` (una fila con el JSON de `Settings`:
    así los campos nuevos no necesitan migración), `messages` (por espacio y Tico) y
    `conversions`. El esquema va en `PRAGMA user_version`; un cambio de tablas añade un paso
    en `db::migrate`. La primera vez se importa el `settings.json` antiguo (queda como
    `settings.json.bak`). De cada mensaje solo se guarda el texto, los archivos adjuntos y si
    llevaba captura: ni la imagen ni el texto OCR tocan el disco. Al volver a una
    conversación se cargan los 60 últimos mensajes y a la IA se le mandan como mucho los 30
    últimos. Una pregunta se guarda junto a su respuesta (en una transacción) y solo si hubo
    respuesta. Si el archivo está roto se aparta (`tico.db.broken-…`) y se crea otro.
37. **Experiencia pulida (1.1)**: bienvenida de primer uso en su propia ventana (`onboarded`
    se marca al abrirla, así sale una sola vez; quien viene de un `settings.json` no la ve).
    Chat con paleta "/" (comandos como objetos literales: el lint de React Compiler no deja
    pasar a otra función, durante el render, cierres que tocan refs), sugerencias por Tico,
    "Reintentar" y botón a Ajustes → IA en los errores, y "Otra respuesta"
    (`chat_forget_last` quita la última pareja de memoria y de la base de datos). Aviso de
    versión nueva consultando la API pública de GitHub (`check_updates`, se puede apagar;
    descartar una versión se recuerda en `localStorage`).
38. **Mover y enviar por correo (1.1)**: al soltar archivos, la isla propone "Enviar por correo"
    y "Mover a…" (carpetas de los espacios o elegir otra; nunca pisa: "x (2).pdf"; entre discos
    copia y borra). El correo sale por SMTP con la cuenta del usuario (`Settings.mail`, la
    contraseña de aplicación en el llavero como `mail`); el servidor se deduce del dominio
    (`mail::preset_for`) salvo que se escriba a mano. Sin cuenta, `mail_open_app` abre el
    borrador en Outlook (COM), Thunderbird (`-compose`) o Mail (AppleScript) con los adjuntos;
    si no hay ninguno, `mailto:` y enseña el archivo para arrastrarlo. Límite de 24 MB. Las
    direcciones usadas se guardan en la tabla `contacts` (esquema v2) para sugerirlas.
    Los archivos soltados viven en `useDroppedFiles`: con `setFiles` dentro de `IslandApp`, el
    React Compiler dejaba de reconocer el setter tras añadir más actualizaciones asíncronas.
39. **Música y vídeo**: `media.rs` pregunta qué suena cada 2 s solo con la isla a la vista
    (`useNowPlaying`). Windows usa el panel multimedia del sistema (ve Spotify, Apple Music y
    los navegadores con YouTube) y el volumen con Core Audio. macOS no deja leer el panel a
    apps de terceros desde macOS 15.4: Spotify y Música van por AppleScript (con portada) y el
    resto con teclas multimedia simuladas (necesitan el permiso de Accesibilidad). Linux usa
    MPRIS y `wpctl`/`pactl` para el volumen. Las portadas se reducen a JPEG de 256 px y viajan
    como `data:` (la CSP solo permite imágenes `self` y `data:`); se cachea la última.
    «Pausa», «siguiente canción» o «sube el volumen» se hacen sin IA (`mediaIntent`).
40. **Linux (1.2)**: AppImage y .deb hechos en Ubuntu 22.04 (glibc antigua = arranca en más
    distribuciones). Con Wayland, `main.rs` pone `GDK_BACKEND=x11` para que la isla pueda
    colocarse y quedar encima (XWayland). Sin OCR en Linux.

## Anuncio (`promo/`)
`promo.html` + `src/promo/` dibujan el anuncio de 35 s con los componentes reales (Tico,
cápsula, notch, Markdown); todo depende de `t`. `scripts/render-promo.mjs` lo renderiza
fotograma a fotograma a 60 fps con el tiempo virtual de Chrome (BeginFrame) y
`scripts/promo-music.py` sintetiza la música y los efectos. `npm run promo` lo regenera
(necesita `npm run dev` arrancado, ffmpeg y numpy). En el render, las animaciones CSS no
avanzan: dentro de `.promo` están desactivadas y todo se anima desde la línea de tiempo.
Los bucles de animación usan `performance.now()` (no el argumento de rAF) por lo mismo.
En el README se ve `promo/tico-anuncio.gif` (720 px, 15 fps, 128 colores, ~5 MB), que GitHub
reproduce solo; un `.mp4` del repositorio solo se descarga. Para un reproductor con sonido
dentro del README hay que subir el MP4 arrastrándolo al editor web de GitHub (da una URL
`github.com/user-attachments/assets/…` que se pega sola en una línea). Para regenerar el GIF:
`ffmpeg -i promo/tico-anuncio.mp4 -vf "fps=15,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 promo/tico-anuncio.gif`.

## Licencias
Código: MIT (`LICENSE`). Tico, su nombre, su diseño y sus sonidos: todos los derechos
reservados (`ASSETS-LICENSE.md`).
