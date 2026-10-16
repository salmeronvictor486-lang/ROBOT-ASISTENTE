import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Expression } from "../robot/expressions";
import { setGaze } from "../robot/gaze";
import type { OutfitName } from "../robot/outfits";
import { Tico } from "../robot/Tico";
import {
  ASSETS,
  detectPlatform,
  downloadUrl,
  PLATFORM_NAMES,
  primaryAsset,
  readDevice,
  RELEASES_URL,
  REPO_URL,
  type Asset,
  type DeviceInfo,
  type Platform,
} from "./download";
import { HeroDemo } from "./HeroDemo";
import {
  IconApple,
  IconCloudOff,
  IconCode,
  IconDesktop,
  IconDoc,
  IconDownload,
  IconEye,
  IconGitHub,
  IconIsland,
  IconKey,
  IconLinux,
  IconLock,
  IconMail,
  IconMemory,
  IconMusic,
  IconPlay,
  IconRobots,
  IconSpark,
  IconWindows,
} from "./icons";
import poster from "./poster.jpg";
import video from "../../promo/tico-anuncio.mp4";
import videoWebm from "./tico-anuncio.webm";
import "./site.css";

const VERSION = __APP_VERSION__;
const BASE = "#F2F0EB";
const ACCENT = "#3DD6D0";

/* ------------------------------------------------------------------ */
/* Equipo del visitante y descargas                                    */
/* ------------------------------------------------------------------ */

function useDevice(): { platform: Platform; primary: Asset | null } {
  const [info, setInfo] = useState<DeviceInfo>(() => ({
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints,
  }));
  useEffect(() => {
    let alive = true;
    void readDevice().then((next) => alive && setInfo(next));
    return () => {
      alive = false;
    };
  }, []);
  return { platform: detectPlatform(info), primary: primaryAsset(info) };
}

/** Consejo para la primera vez que se abre (la app no lleva firma de pago). */
function firstRunTip(asset: Asset): string {
  if (asset.file.endsWith(".dmg")) {
    return "Arrastra Tico a Aplicaciones. Si macOS dice que no puede verificarlo: Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente».";
  }
  if (asset.file.endsWith(".AppImage")) {
    return "Dale permiso de ejecución (clic derecho → Propiedades → Permitir ejecutar) y ábrelo con doble clic.";
  }
  if (asset.file.endsWith(".deb")) {
    return "Ábrelo con el Centro de software o instala con: sudo apt install ./Tico-Linux-amd64.deb";
  }
  return "Si Windows muestra «Windows protegió su PC», pulsa «Más información» → «Ejecutar de todas formas».";
}

interface Toast {
  asset: Asset;
  id: number;
}

let toastId = 0;

function DownloadLink({
  asset,
  className,
  onStart,
  children,
}: {
  asset: Asset;
  className: string;
  onStart: (asset: Asset) => void;
  children: ReactNode;
}) {
  // Enlace normal (sin JavaScript para descargar): el archivo baja directo de la última
  // versión publicada en GitHub. El clic solo muestra el consejo de la primera vez.
  return (
    <a className={className} href={downloadUrl(asset)} rel="noopener" onClick={() => onStart(asset)}>
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function Site() {
  const { platform, primary } = useDevice();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    // Los ojos de Tico siguen el ratón por toda la página.
    const move = (e: PointerEvent) => setGaze(e.clientX, e.clientY);
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 12000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const onStart = (asset: Asset) => setToast({ asset, id: ++toastId });

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <Nav />
      <main id="contenido">
        <Hero platform={platform} primary={primary} onStart={onStart} />
        <VideoSection />
        <Features />
        <Meet />
        <Privacy />
        <Downloads platform={platform} primary={primary} onStart={onStart} />
        <Faq />
        <FinalCta primary={primary} onStart={onStart} />
      </main>
      <Footer />
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <IconDownload />
          <div>
            <strong>Descargando {toast.asset.file}</strong>
            <p>{firstRunTip(toast.asset)}</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}

function GitHubButton({ label = "Ver en GitHub", className = "btn btn-ghost" }) {
  return (
    <a className={className} href={REPO_URL} target="_blank" rel="noopener noreferrer">
      <IconGitHub />
      {label}
    </a>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`nav${scrolled ? " is-scrolled" : ""}`}>
      <div className="nav-inner">
        <a className="brand" href="#inicio" aria-label="Tico, inicio">
          <Tico size={30} baseColor={BASE} accentColor={ACCENT} expression="idle" animated={false} />
          <span>Tico</span>
        </a>
        <nav aria-label="Secciones">
          <a href="#video">Vídeo</a>
          <a href="#funciones">Funciones</a>
          <a href="#privacidad">Privacidad</a>
          <a href="#descargar">Descargar</a>
        </nav>
        <GitHubButton label="GitHub" className="btn btn-ghost btn-small" />
      </div>
    </header>
  );
}

function Hero({
  platform,
  primary,
  onStart,
}: {
  platform: Platform;
  primary: Asset | null;
  onStart: (asset: Asset) => void;
}) {
  return (
    <section className="hero" id="inicio">
      <div className="hero-glow" aria-hidden="true" />
      <p className="eyebrow">
        <span className="dot" /> Nuevo · versión {VERSION}
      </p>
      <h1>
        Tu asistente vive
        <br />
        en lo alto de <span className="grad">tu pantalla</span>.
      </h1>
      <p className="lead">
        Lleva el ratón al borde superior y baja una cápsula con <strong>Tico</strong>, un robot que
        chatea contigo, pasa tus Word a PDF, controla tu música y, solo si se lo pides, mira tu
        pantalla para ayudarte.
      </p>
      <div className="cta-row">
        {primary ? (
          <DownloadLink asset={primary} className="btn btn-primary" onStart={onStart}>
            <IconDownload />
            Descargar para {PLATFORM_NAMES[platform]}
          </DownloadLink>
        ) : (
          <a className="btn btn-primary" href="#descargar">
            <IconDownload />
            Descargar para ordenador
          </a>
        )}
        <GitHubButton />
      </div>
      <p className="fineprint">
        {platform === "mobile"
          ? "Tico es para ordenador: ábrelo desde Windows, macOS o Linux."
          : "Gratis y de código abierto · Windows, macOS y Linux · Sin cuentas"}
        {" · "}
        <a href="#descargar">Otras descargas</a>
      </p>
      <HeroDemo />
    </section>
  );
}

function SectionTitle({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="section-title">
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
      {children && <p className="section-sub">{children}</p>}
    </div>
  );
}

function VideoSection() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const play = () => {
    const el = ref.current;
    if (!el) return;
    el.controls = true;
    void el.play().catch(() => undefined);
  };
  return (
    <section className="section" id="video">
      <SectionTitle kicker="El anuncio" title="Míralo en 35 segundos." />
      <div className={`video-frame${playing ? " is-playing" : ""}`}>
        <video
          ref={ref}
          poster={poster}
          preload="none"
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture={false}
          onPlay={() => setPlaying(true)}
          onEnded={() => setPlaying(false)}
        >
          {/* Primero el MP4 original; WebM (VP9) para los navegadores sin H.264, como algunos Linux. */}
          <source src={video} type="video/mp4" />
          <source src={videoWebm} type="video/webm" />
          Tu navegador no puede reproducir el vídeo.
        </video>
        {!playing && (
          <button type="button" className="video-play" onClick={play} aria-label="Reproducir el anuncio (35 s, con sonido)">
            <span>
              <IconPlay />
            </span>
            Reproducir · 0:35
          </button>
        )}
      </div>
    </section>
  );
}

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <IconIsland />,
    title: "Una isla que no estorba",
    text: "Aparece al llevar el ratón arriba y se aparta cuando no la usas. Fuera de la cápsula, tus clics pasan a las apps de debajo.",
  },
  {
    icon: <IconEye />,
    title: "Mira tu pantalla, si se lo pides",
    text: "Pregúntale «¿qué ves?» y lee hasta la letra pequeña con el OCR del sistema. Nunca captura con tu banco o tu gestor de contraseñas a la vista.",
  },
  {
    icon: <IconSpark />,
    title: "La IA que prefieras",
    text: "Claude, ChatGPT, Gemini, Groq, Mistral, DeepSeek, Grok, OpenRouter… o gratis en tu ordenador con Ollama y LM Studio.",
  },
  {
    icon: <IconDoc />,
    title: "Word a PDF, sin gastar IA",
    text: "«Pásame este Word a PDF» y listo. Usa Word, Pages o LibreOffice, y si no tienes ninguno, su propio motor.",
  },
  {
    icon: <IconMail />,
    title: "Suelta, mueve y envía",
    text: "Arrastra un archivo a la isla: muévelo a la carpeta de tu proyecto o envíalo por correo con el adjunto ya puesto.",
  },
  {
    icon: <IconMusic />,
    title: "Tu música, a mano",
    text: "Spotify, Apple Music o YouTube con su portada, pausa, siguiente y volumen. Y Tico baila mientras suena.",
  },
  {
    icon: <IconRobots />,
    title: "Un Tico para cada tarea",
    text: "Código, Traductor, Escritor, Profe… cada uno con su ropa, sus colores y su IA, organizados en espacios de trabajo.",
  },
  {
    icon: <IconMemory />,
    title: "Te conoce",
    text: "«Recuerda que estudio Derecho» y lo tendrá en cuenta siempre. Va al grano y te propone cómo seguir con un clic.",
  },
  {
    icon: <IconDesktop />,
    title: "Compañía en el escritorio",
    text: "Deja a Tico paseando por tu escritorio: te sigue con la mirada y con un clic abre la isla.",
  },
];

function Features() {
  return (
    <section className="section" id="funciones">
      <SectionTitle kicker="Funciones" title="Todo lo que necesitas, a un gesto.">
        Sin abrir ventanas ni cambiar de app: Tico está donde ya miras.
      </SectionTitle>
      <div className="features">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const MOODS: { id: Expression; label: string }[] = [
  { id: "happy", label: "Feliz" },
  { id: "curious", label: "Curioso" },
  { id: "thinking", label: "Pensando" },
  { id: "love", label: "Enamorado" },
  { id: "wink", label: "Guiño" },
  { id: "surprised", label: "Sorpresa" },
  { id: "proud", label: "Orgulloso" },
  { id: "dizzy", label: "Mareado" },
  { id: "working", label: "Trabajando" },
  { id: "sleeping", label: "Dormido" },
];

const LOOKS: { id: OutfitName; label: string }[] = [
  { id: "none", label: "Sin nada" },
  { id: "glasses", label: "Gafas" },
  { id: "headphones", label: "Cascos" },
  { id: "cap", label: "Gorra" },
  { id: "graduation", label: "Birrete" },
  { id: "crown", label: "Corona" },
  { id: "wizard", label: "Mago" },
  { id: "flower", label: "Flor" },
];

const CYAN = { base: "#F2F0EB", accent: "#3DD6D0", label: "Cian" };
const PALETTES = [
  CYAN,
  { base: "#E9EEF2", accent: "#7CF29A", label: "Verde" },
  { base: "#F4EFE6", accent: "#FFB84D", label: "Naranja" },
  { base: "#F3ECF7", accent: "#C59BFF", label: "Lila" },
  { base: "#F6EEF0", accent: "#FF7AA8", label: "Rosa" },
];

function Meet() {
  const [mood, setMood] = useState<Expression>("happy");
  const [look, setLook] = useState<OutfitName>("none");
  const [palette, setPalette] = useState(0);
  const [wave, setWave] = useState(0);
  const colors = PALETTES[palette] ?? CYAN;
  return (
    <section className="section meet">
      <SectionTitle kicker="Conoce a Tico" title="Un robot con mucha personalidad.">
        Respira, parpadea, te sigue con la mirada y tiene 15 expresiones. Pruébalas:
      </SectionTitle>
      <div className="meet-grid">
        <div className="meet-stage" style={{ ["--accent" as string]: colors.accent }}>
          <button type="button" className="meet-tico" onClick={() => setWave((w) => w + 1)} aria-label="Saludar a Tico">
            <Tico size={240} baseColor={colors.base} accentColor={colors.accent} expression={mood} outfit={look} wave={wave} />
          </button>
          <p className="meet-hint">Haz clic en Tico para que te salude</p>
        </div>
        <div className="meet-controls">
          <Chips label="Expresión" items={MOODS} value={mood} onChange={setMood} />
          <Chips label="Ropa" items={LOOKS} value={look} onChange={setLook} />
          <fieldset className="chips">
            <legend>Color</legend>
            <div className="swatches">
              {PALETTES.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  className={`swatch${i === palette ? " is-active" : ""}`}
                  style={{ ["--swatch" as string]: p.accent }}
                  aria-label={p.label}
                  aria-pressed={i === palette}
                  onClick={() => setPalette(i)}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  );
}

function Chips<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <fieldset className="chips">
      <legend>{label}</legend>
      <div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip${item.id === value ? " is-active" : ""}`}
            aria-pressed={item.id === value}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const PRIVACY: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <IconCloudOff />,
    title: "Sin cuentas ni servidores",
    text: "Tico no tiene servidores propios ni telemetría. Habla directamente con la IA que tú elijas, o con ninguna.",
  },
  {
    icon: <IconKey />,
    title: "Claves en el llavero",
    text: "Tus claves de IA y la contraseña del correo se guardan en el llavero del sistema, nunca en un archivo de texto.",
  },
  {
    icon: <IconLock />,
    title: "Capturas que no se guardan",
    text: "Solo mira la pantalla cuando se lo pides, la imagen vive en memoria y la isla no sale en tus capturas.",
  },
  {
    icon: <IconCode />,
    title: "Código abierto",
    text: "Licencia MIT: cualquiera puede revisar lo que hace. Los instaladores se compilan a la vista en GitHub Actions.",
  },
];

function Privacy() {
  return (
    <section className="section" id="privacidad">
      <SectionTitle kicker="Privacidad" title="Tus cosas se quedan en tu ordenador.">
        Conversaciones, ajustes y memorias van en una base de datos local. Nada sale de tu equipo
        salvo lo que mandas a tu IA.
      </SectionTitle>
      <div className="privacy">
        {PRIVACY.map((p) => (
          <article key={p.title} className="privacy-item">
            <div className="feature-icon">{p.icon}</div>
            <div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const PLATFORMS: {
  id: Exclude<Platform, "mobile" | "unknown">;
  name: string;
  icon: ReactNode;
  assets: Asset[];
  requires: string;
}[] = [
  {
    id: "windows",
    name: "Windows",
    icon: <IconWindows />,
    assets: [ASSETS.winX64, ASSETS.winX86, ASSETS.winX64Zip, ASSETS.winX86Zip],
    requires: "Windows 10 u 11",
  },
  {
    id: "mac",
    name: "macOS",
    icon: <IconApple />,
    assets: [ASSETS.mac],
    requires: "macOS 11 Big Sur o posterior",
  },
  {
    id: "linux",
    name: "Linux",
    icon: <IconLinux />,
    assets: [ASSETS.appImage, ASSETS.deb],
    requires: "Ubuntu 24.04+, Debian 13, Fedora 40+",
  },
];

function Downloads({
  platform,
  primary,
  onStart,
}: {
  platform: Platform;
  primary: Asset | null;
  onStart: (asset: Asset) => void;
}) {
  return (
    <section className="section" id="descargar">
      <SectionTitle kicker="Descargar" title={`Tico ${VERSION}, gratis.`}>
        Elige tu sistema. La descarga empieza al momento y siempre es la última versión.
      </SectionTitle>
      <div className="downloads">
        {PLATFORMS.map((p) => {
          const mine = p.id === platform;
          return (
            <article key={p.id} className={`download${mine ? " is-mine" : ""}`}>
              <header>
                <span className="download-icon">{p.icon}</span>
                <h3>{p.name}</h3>
                {mine && <span className="badge">Tu sistema</span>}
              </header>
              <ul>
                {p.assets.map((asset, i) => {
                  const main = mine ? asset === primary : i === 0;
                  return (
                    <li key={asset.file}>
                      <DownloadLink asset={asset} className={`file${main ? " is-main" : ""}`} onStart={onStart}>
                        <IconDownload size={18} />
                        <span>
                          <strong>{asset.label}</strong>
                          <small>{asset.note}</small>
                        </span>
                      </DownloadLink>
                    </li>
                  );
                })}
              </ul>
              <p className="requires">{p.requires}</p>
            </article>
          );
        })}
      </div>
      <p className="downloads-more">
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
          Notas de la versión y todas las descargas en GitHub →
        </a>
      </p>
    </section>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "¿Es gratis?",
    a: "Sí, del todo. Tico es gratis y de código abierto. Solo pagas la IA si eliges un servicio de pago; con el modo demo, Groq, Gemini (capa gratuita), Ollama o LM Studio no pagas nada.",
  },
  {
    q: "¿Necesito una clave de IA?",
    a: "No para probarlo: trae un modo demo. Para conversaciones de verdad, la bienvenida te guía en un minuto para elegir una IA (las gratis van destacadas) y pegar su clave.",
  },
  {
    q: "¿Mira mi pantalla todo el rato?",
    a: "No. Solo cuando se lo pides (botón, atajo o «¿qué ves?»). La imagen no se guarda en disco y no captura nada si hay una app bloqueada a la vista, como tu banco.",
  },
  {
    q: "¿Por qué Windows o macOS avisan al abrirlo?",
    a: "Porque la app no lleva una firma de pago (cuesta cientos de euros al año). Es normal en proyectos independientes: en Windows pulsa «Más información» → «Ejecutar de todas formas»; en macOS, Ajustes → Privacidad y seguridad → «Abrir igualmente».",
  },
  {
    q: "¿Funciona en mi ordenador?",
    a: "En Windows 10 y 11 (64 bits, 32 bits y ARM), macOS 11 o posterior (Apple Silicon e Intel) y Linux moderno (Ubuntu 24.04, Debian 13, Fedora 40 y similares).",
  },
];

function Faq() {
  return (
    <section className="section faq-section" id="preguntas">
      <SectionTitle kicker="Preguntas" title="Lo que todo el mundo pregunta." />
      <div className="faq">
        {FAQ.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta({ primary, onStart }: { primary: Asset | null; onStart: (asset: Asset) => void }) {
  return (
    <section className="final">
      <Tico size={120} baseColor={BASE} accentColor={ACCENT} expression="happy" />
      <h2>Pon a Tico en tu pantalla.</h2>
      <div className="cta-row">
        {primary ? (
          <DownloadLink asset={primary} className="btn btn-primary" onStart={onStart}>
            <IconDownload />
            Descargar gratis
          </DownloadLink>
        ) : (
          <a className="btn btn-primary" href="#descargar">
            <IconDownload />
            Ver descargas
          </a>
        )}
        <GitHubButton label="Código en GitHub" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="brand">
          <Tico size={26} baseColor={BASE} accentColor={ACCENT} expression="idle" animated={false} />
          <span>Tico</span>
        </div>
        <p>
          Código bajo licencia MIT. Tico, su nombre, su diseño y sus sonidos © Victor, todos los
          derechos reservados. Esta web no usa cookies ni rastreadores.
        </p>
        <nav aria-label="Enlaces">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
            Versiones
          </a>
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
            Informar de un problema
          </a>
        </nav>
      </div>
    </footer>
  );
}
