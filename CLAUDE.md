# CLAUDE.md — Tico

Guía para Claude Code (y para Victor) sobre cómo está montado el proyecto.
**Actualízala al terminar cada fase.**

## Qué es
Tico es una "isla dinámica" de escritorio para Windows y macOS: al llevar el ratón al
borde superior baja una cápsula negra con un robot (Tico) que chatea y, solo cuando el
usuario lo pide, mira la pantalla para ayudar. El documento de diseño completo es el
"Prompt maestro" que Victor pegó al empezar.

## Cómo trabajamos
- Hablar en castellano y explicar cada decisión técnica en 2-3 frases sencillas.
- Fase a fase: al terminar una, parar, dar instrucciones exactas de prueba y esperar el OK.
- Commits pequeños con Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`…).
- 0 € en servicios: sin backends propios, sin cuentas, sin telemetría.
- Prohibido copiar código, sonidos o la mascota de coucou (Mochi). Tico es un diseño propio.

## Fase actual
**Fase 0 — Preparación: terminada (pendiente de que Victor la pruebe en Windows).**
Siguiente: Fase 1 — la isla.

| Fase | Contenido | Estado |
| ---- | --------- | ------ |
| 0 | Proyecto, git, CLAUDE.md, README, licencias, CI | ✅ |
| 1 | Isla: ventana transparente, hover, estados, click-through | ⏳ |
| 2 | Tico con todas sus expresiones | — |
| 3 | Chat: proveedores, streaming, claves en el llavero | — |
| 4 | Visión: captura, miniatura, privacidad | — |
| 5 | Ajustes, idiomas, autoarranque | — |
| 6 | Instaladores (NSIS y .dmg) con GitHub Actions | — |

## Stack
- Tauri 2 (Rust) + Vite 8 + React 19 + TypeScript 6 (estricto).
- TypeScript se queda en 6.0 porque typescript-eslint aún no soporta TS 7.
- Tests: Vitest (frontend) y `cargo test` (Rust). Lint: ESLint + Clippy.

## Arquitectura
```
src/                 Interfaz web (React): dibuja la isla y a Tico
  main.tsx           Punto de entrada
  App.tsx            Pantalla de prueba de la Fase 0
src-tauri/           Núcleo Rust: lo que el navegador no puede hacer
  src/main.rs        Solo llama a tico_lib::run()
  src/lib.rs         Arranque, plugins y registro de comandos
  src/error.rs       AppError: error tipado que devuelven todos los comandos
  tauri.conf.json    Ventanas, permisos y empaquetado
  capabilities/      Qué APIs de Tauri puede usar cada ventana
assets/tico.svg      Diseño original de Tico (fuente de los iconos)
```
Estructura prevista para las siguientes fases: `island.rs`, `capture.rs`, `ai/`,
`secrets.rs`, `settings.rs` en Rust; `src/island/`, `src/robot/`, `src/settings/`,
`src/i18n/` y `src/lib/` (utilidades compartidas como `spring.ts`) en el frontend.

## Comandos
| Comando | Qué hace |
| ------- | -------- |
| `npm install` | Instala dependencias del frontend |
| `npm run tauri dev` | Arranca la app en modo desarrollo |
| `npm run typecheck` | Comprueba tipos de TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Tests de Vitest |
| `npm run build` | Compila el frontend a `dist/` |
| `npm run tauri build` | Genera el instalador |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | Lint de Rust |
| `cd src-tauri && cargo test` | Tests de Rust |
| `npx tauri icon assets/tico.svg` | Regenera los iconos (borra luego `icons/android` e `icons/ios`) |

## Decisiones tomadas
1. **Proyecto en la raíz del repo** (no en `tico/`): el repo es el proyecto.
2. **Tauri 2 estable**, no la alfa de Tauri 3.
3. **`lib.rs` + `main.rs`**: lo exige el soporte móvil (Android en la Fase 3).
4. **Errores tipados** con `thiserror`; se serializan como texto para el frontend.
   Nada de `unwrap()` fuera de tests.
5. **Ventana de tamaño fijo con la cápsula animada dentro** (Fase 1): redimensionar
   ventanas nativas a 60 fps da tirones en Windows.
6. **Click-through desde Rust** (Fase 1): Rust compara el cursor con el rectángulo de la
   cápsula y activa/desactiva `set_ignore_cursor_events`.
7. **Máquina de estados de la isla en el frontend** (reducer puro y testeable); Rust solo
   emite eventos de sensores (hover en el borde, cursor dentro/fuera).
8. **`spring.ts` en `src/lib/`**: lo comparten la isla y Tico.
9. Identificador de la app: `com.victorsalmeron.tico`.
10. **CI en Windows y macOS** desde la Fase 0: así se sabe que compila en Mac sin tener Mac.

## Licencias
Código: MIT (`LICENSE`). Tico, su nombre, su diseño y sus sonidos: todos los derechos
reservados (`ASSETS-LICENSE.md`).
