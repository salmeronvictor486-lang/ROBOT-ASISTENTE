# Tico

Una **isla dinámica de escritorio** para Windows y macOS. Lleva el ratón al borde
superior de la pantalla y baja una cápsula negra con **Tico**, un pequeño robot que
chatea contigo y, solo cuando tú se lo pides, mira tu pantalla para ayudarte.

> Estado: **Fase 0** — el proyecto arranca y abre una ventana. La isla llega en la Fase 1.

<p align="center"><img src="assets/tico.svg" alt="Tico" width="160"></p>

## Requisitos (Windows 11)
1. **Rust** con [rustup](https://rustup.rs) (toolchain `stable-msvc`, la de por defecto).
2. **Node.js LTS** (22 o superior).
3. **Microsoft C++ Build Tools** con la carga de trabajo *Desarrollo para el escritorio con C++*.
4. **WebView2**: ya viene con Windows 11.

Guía oficial: <https://v2.tauri.app/start/prerequisites/>

Comprueba que todo está:
```powershell
rustc -V
cargo -V
node -v
npm -v
```

## Arrancar en desarrollo
```powershell
git clone https://github.com/salmeronvictor486-lang/ROBOT-ASISTENTE.git
cd ROBOT-ASISTENTE
npm install
npx tauri info      # resumen del entorno: debe salir todo con ✔
npm run tauri dev   # la primera vez tarda varios minutos (compila Rust)
```

## Comprobaciones
```powershell
npm run typecheck
npm run lint
npm test
cd src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
```
GitHub Actions ejecuta lo mismo en Windows y macOS en cada push.

## Privacidad
Sin telemetría y sin cuentas. Tico solo captura la pantalla cuando tú se lo pides, la
imagen vive solo en memoria y la clave de la IA se guarda en el llavero del sistema.

## Licencia
- Código: [MIT](LICENSE).
- Tico (personaje, nombre, diseño y sonidos): todos los derechos reservados, ver
  [ASSETS-LICENSE.md](ASSETS-LICENSE.md).

Inspirado en la idea de [coucou](https://github.com/Louis-CFM/coucou); no usa su código,
sus sonidos ni su mascota.
