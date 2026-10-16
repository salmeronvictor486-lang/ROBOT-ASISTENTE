import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BASE_SIZES } from "../island/sizes";
import type { IslandState } from "../island/machine";
import type { Expression } from "../robot/expressions";
import { setGaze } from "../robot/gaze";
import { Tico } from "../robot/Tico";
import { DEFAULT_TICOS } from "../types";
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
import { IconApple, IconArrowUp, IconExternal, IconGitHub, IconLinux, IconPlay, IconWindows } from "./icons";
import { LiveIsland, openIsland, type Notice } from "./LiveIsland";
import { useMusic, type Music } from "./useMusic";
import music from "./tico-musica.mp3";
import poster from "./poster.jpg";
import videoWebm from "./tico-anuncio.webm";
import video from "../../promo/tico-anuncio.mp4";
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/martian-mono/standard.css";
import "./site.css";

const VERSION = __APP_VERSION__;
const BASE = "#F2F0EB";
const ACCENT = "#3DD6D0";

/* ------------------------------------------------------------------ */
/* Equipo del visitante                                                */
/* ------------------------------------------------------------------ */

function useDevice(): { platform: Platform; primary: Asset | null; touch: boolean } {
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
  const platform = detectPlatform(info);
  return { platform, primary: primaryAsset(info), touch: platform === "mobile" };
}

/** Consejo para la primera vez que se abre (la app no lleva firma de pago). */
function firstRunTip(asset: Asset): string {
  if (asset.file.endsWith(".dmg")) {
    return "Arrastra Tico a Aplicaciones. Si macOS no lo abre: Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente.";
  }
  if (asset.file.endsWith(".AppImage")) {
    return "Dale permiso para ejecutarse (Propiedades → Permitir ejecutar) y ábrelo con doble clic.";
  }
  if (asset.file.endsWith(".deb")) {
    return "Ábrelo con el Centro de software o en la terminal: sudo apt install ./Tico-Linux-amd64.deb";
  }
  return "Si sale «Windows protegió su PC», pulsa Más información → Ejecutar de todas formas.";
}

let noticeId = 0;

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function Site() {
  const device = useDevice();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [flash, setFlash] = useState(false);
  const bgm = useMusic(music);

  useEffect(() => {
    // Todos los Ticos de la página miran al cursor.
    const move = (e: PointerEvent) => setGaze(e.clientX, e.clientY);
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  // Al descargar, avisa la propia isla (como haría Tico en tu escritorio).
  const onDownload = useCallback((asset: Asset) => {
    setNotice({ id: ++noticeId, title: `Descargando ${asset.file}`, text: firstRunTip(asset) });
  }, []);
  const clearNotice = useCallback(() => setNotice(null), []);

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <MenuBar music={bgm} />
      <LiveIsland notice={notice} onNoticeDone={clearNotice} onCapture={setFlash} beat={bgm.beat} />
      <div className={`flash${flash ? " is-on" : ""}`} aria-hidden="true" />
      <main id="contenido">
        <Hero device={device} onDownload={onDownload} beat={bgm.beat} />
        <States />
        <Phrases />
        <Cast beat={bgm.beat} />
        <Film />
        <Doesnt />
        <Downloads device={device} onDownload={onDownload} />
        <Questions />
      </main>
      <Footer />
    </>
  );
}

function DownloadLink({
  asset,
  className,
  onDownload,
  children,
}: {
  asset: Asset;
  className: string;
  onDownload: (asset: Asset) => void;
  children: ReactNode;
}) {
  // Un enlace normal: el archivo baja directo de la última versión publicada en GitHub.
  return (
    <a className={className} href={downloadUrl(asset)} rel="noopener" onClick={() => onDownload(asset)}>
      {children}
    </a>
  );
}

/* Barra de menús: la página hace de pantalla y la isla cuelga de su borde. */

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const day = now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return (
    <time className="clock" dateTime={now.toISOString()}>
      {day} {time}
    </time>
  );
}

/** Botón de música: barras que se mueven mientras suena. */
function MusicButton({ music }: { music: Music }) {
  return (
    <button
      type="button"
      className={`music-btn${music.playing ? " is-on" : ""}`}
      aria-pressed={music.playing}
      aria-label="Música de fondo"
      data-music-toggle=""
      title="Música de fondo compuesta para Tico"
      onClick={music.toggle}
    >
      <span className="music-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="music-label">{music.playing ? "Música" : "Poner música"}</span>
    </button>
  );
}

function MenuBar({ music }: { music: Music }) {
  return (
    <header className="menubar">
      <a className="menubar-brand" href="#inicio">
        <Tico size={20} baseColor={BASE} accentColor={ACCENT} expression="idle" animated={false} />
        Tico
      </a>
      <nav className="menubar-items" aria-label="Secciones">
        <a href="#estados">La isla</a>
        <a href="#frases">Qué hace</a>
        <a href="#ticos">Los Ticos</a>
        <a href="#anuncio">Anuncio</a>
        <a href="#descargar">Descargar</a>
      </nav>
      <div className="menubar-right">
        <MusicButton music={music} />
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <IconGitHub size={15} />
          <span className="menubar-gh">GitHub</span>
        </a>
        <Clock />
      </div>
    </header>
  );
}

/* Portada */

const PET_MOODS: Expression[] = ["happy", "love", "wink", "surprised", "proud", "dizzy", "curious"];

/** Tico en el escritorio: se arrastra, y con un clic saluda y cambia de cara. */
function PetTico({ beat }: { beat: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef({ x: 0, y: 0, startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false, on: false });
  const [mood, setMood] = useState(0);
  const [wave, setWave] = useState(0);
  const expression = PET_MOODS[mood % PET_MOODS.length] ?? "happy";

  const place = () => {
    const el = ref.current;
    if (el) el.style.transform = `translate(${drag.current.x}px, ${drag.current.y}px)`;
  };

  return (
    <figure className="pet">
      <button
        ref={ref}
        type="button"
        className="pet-tico"
        aria-label="Tico: haz clic para que salude, o arrástralo"
        onPointerDown={(e) => {
          const d = drag.current;
          Object.assign(d, { on: true, moved: false, startX: e.clientX, startY: e.clientY, baseX: d.x, baseY: d.y });
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.on) return;
          const dx = e.clientX - d.startX;
          const dy = e.clientY - d.startY;
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          d.moved = true;
          d.x = d.baseX + dx;
          d.y = d.baseY + dy;
          place();
        }}
        onPointerUp={() => {
          drag.current.on = false;
        }}
        onClick={() => {
          if (drag.current.moved) return;
          setMood((m) => m + 1);
          setWave((w) => w + 1);
        }}
      >
        <Tico size={260} baseColor={BASE} accentColor={ACCENT} expression={expression} wave={wave} bounce={beat} />
      </button>
      <figcaption>
        <span>Tico en el escritorio</span>
        <span>arrástralo · clic para saludar</span>
      </figcaption>
    </figure>
  );
}

function Hero({
  device,
  onDownload,
  beat,
}: {
  device: ReturnType<typeof useDevice>;
  onDownload: (asset: Asset) => void;
  beat: number;
}) {
  const { platform, primary, touch } = device;
  return (
    <section className="hero" id="inicio">
      <div className="hero-try">
        <IconArrowUp />
        {touch ? (
          <span>Toca la cápsula negra de arriba: es Tico.</span>
        ) : (
          <span>
            Pruébalo aquí: lleva el ratón al borde de arriba de esta página o pulsa <kbd>Ctrl</kbd> <kbd>Mayús</kbd>{" "}
            <kbd>Espacio</kbd>
          </span>
        )}
      </div>

      <div className="hero-grid">
        <div className="hero-copy">
          <h1>Un asistente que vive arriba de tu pantalla.</h1>
          <p className="hero-lead">
            Tico es una isla para Windows, macOS y Linux. Llevas el ratón arriba, baja una cápsula
            negra con un robot dentro y le pides lo que necesites: que mire tu pantalla, que pase un
            Word a PDF o que cambie de canción. Cuando no lo usas, no ocupa nada.
          </p>
          <div className="hero-actions">
            {primary ? (
              <DownloadLink asset={primary} className="capsule-btn" onDownload={onDownload}>
                <span className="capsule-eyes" aria-hidden="true">
                  <i />
                  <i />
                </span>
                <span className="capsule-btn-text">
                  Descargar para {PLATFORM_NAMES[platform]}
                  <small>
                    {primary.file} · {primary.size}
                  </small>
                </span>
              </DownloadLink>
            ) : (
              <a className="capsule-btn" href="#descargar">
                <span className="capsule-eyes" aria-hidden="true">
                  <i />
                  <i />
                </span>
                <span className="capsule-btn-text">
                  Descargar para ordenador
                  <small>Windows, macOS y Linux</small>
                </span>
              </a>
            )}
            <a className="text-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <IconGitHub size={18} />
              Código en GitHub
              <IconExternal />
            </a>
          </div>
          <p className="hero-meta">
            Versión {VERSION} · gratis · código abierto (MIT) · sin cuenta ·{" "}
            <a href="#descargar">todas las descargas</a>
          </p>
        </div>
        <PetTico beat={beat} />
      </div>
    </section>
  );
}

/* Los cuatro estados, dibujados a escala con las medidas reales de la app. */

const STATES: { id: IslandState; name: string; how: string }[] = [
  { id: "hidden", name: "Oculta", how: "No ocupa nada. Tus clics pasan a lo que hay debajo." },
  { id: "peek", name: "Asoma", how: "Ratón 150 ms en los 3 px de arriba." },
  { id: "compact", name: "Crece", how: "Pasas el ratón por encima." },
  { id: "expanded", name: "Abierta", how: "Un clic, o Ctrl + Mayús + Espacio desde cualquier app." },
];

const DRAW_SCALE = 0.5;

function StateDrawing({ id }: { id: IslandState }) {
  const size = BASE_SIZES[id];
  const w = size.width * DRAW_SCALE;
  const h = size.height * DRAW_SCALE;
  const r = id === "expanded" ? 28 * DRAW_SCALE : h / 2;
  return (
    <div className="state-draw" style={{ width: w }}>
      <div className={`state-capsule is-${id}`} style={{ width: w, height: Math.max(h, 1), borderRadius: r }}>
        {id === "peek" && <Tico size={22} baseColor={BASE} accentColor={ACCENT} expression="curious" animated={false} />}
        {id === "compact" && (
          <>
            <Tico size={22} baseColor={BASE} accentColor={ACCENT} expression="idle" animated={false} />
            <i className="state-line" />
          </>
        )}
        {id === "expanded" && (
          <>
            <Tico size={26} baseColor={BASE} accentColor={ACCENT} expression="talking" animated={false} />
            <i className="state-bubble is-you" />
            <i className="state-bubble" />
            <i className="state-bubble is-short" />
          </>
        )}
      </div>
      <span className="state-dim">
        {size.width} × {size.height}
      </span>
    </div>
  );
}

function States() {
  return (
    <section className="section states" id="estados">
      <div className="section-head">
        <h2>Cuatro tamaños, según lo cerca que estés.</h2>
        <p>
          La isla está pensada para no molestar. Mientras trabajas no la ves; cuando la buscas,
          aparece donde ya estás mirando. Fuera de la cápsula, los clics pasan a la app de debajo.
        </p>
      </div>
      <div className="states-sheet" role="img" aria-label="Los cuatro estados de la isla dibujados a escala">
        <div className="states-edge">
          <span>borde superior de la pantalla</span>
          <span>escala 1:2 · px</span>
        </div>
        <ol className="states-row">
          {STATES.map((s) => (
            <li key={s.id}>
              <StateDrawing id={s.id} />
              <h3>{s.name}</h3>
              <p>{s.how}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* Lo que le puedes decir */

const PHRASES: { say: string; does: string; tag: string }[] = [
  {
    say: "¿Qué ves en mi pantalla?",
    does: "Hace una captura solo en ese momento, lee hasta la letra pequeña con el OCR del sistema y te contesta. Con tu banco o tu gestor de contraseñas a la vista, no captura.",
    tag: "solo si se lo pides",
  },
  {
    say: "Pásame este Word a PDF",
    does: "Lo convierte con Word, Pages o LibreOffice. Si no tienes ninguno, usa su propio motor. El PDF aparece en Descargas.",
    tag: "sin gastar IA",
  },
  {
    say: "Envíaselo a ana@…",
    does: "Sueltas un archivo en la isla y se abre una ventanita con Para, Asunto y Mensaje, con el adjunto ya puesto. Sale desde tu cuenta de correo.",
    tag: "Gmail, iCloud, Outlook…",
  },
  {
    say: "Pausa. Siguiente canción.",
    does: "Controla lo que suena en Spotify, Apple Music o YouTube, con la portada en la isla, y sube o baja el volumen. Tico baila mientras tanto.",
    tag: "sin gastar IA",
  },
  {
    say: "Recuerda que estudio Derecho",
    does: "Lo apunta y lo tiene en cuenta en todas las conversaciones. «¿Qué recuerdas de mí?» te enseña la lista y «olvida que…» la corrige.",
    tag: "se guarda en tu ordenador",
  },
  {
    say: "/traducir",
    does: "Escribe una barra y salen los comandos: traducir, mejorar un texto, explicar, resumir un archivo, cambiar de Tico o de espacio de trabajo.",
    tag: "paleta de comandos",
  },
  {
    say: "Usa Gemini para esto",
    does: "Funciona con Claude, ChatGPT, Gemini, Groq, Mistral, DeepSeek, Grok u OpenRouter, o gratis en tu ordenador con Ollama y LM Studio. Cambias de IA desde el chat.",
    tag: "12 servicios",
  },
];

function Phrases() {
  return (
    <section className="section" id="frases">
      <div className="section-head">
        <h2>Le hablas como a una persona.</h2>
        <p>Algunas cosas que le puedes pedir, y lo que hace con cada una.</p>
      </div>
      <dl className="phrases">
        {PHRASES.map((p) => (
          <div key={p.say} className="phrase">
            <dt>«{p.say}»</dt>
            <dd>
              <p>{p.does}</p>
              <span className="tag">{p.tag}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* Los Ticos de serie, con sus colores y su ropa reales. */

const CAST_LINES: Record<string, string> = {
  tico: "Para todo. El de siempre.",
  code: "Código que funciona, con el porqué.",
  translate: "Al castellano o al inglés, sin rodeos.",
  write: "Corrige y mejora tus textos.",
  teach: "Te lo explica paso a paso.",
};

const CAST_MOODS: Expression[] = ["happy", "wink", "love", "surprised", "proud", "dizzy", "thinking"];

function CastMember({ tico, index, beat }: { tico: (typeof DEFAULT_TICOS)[number]; index: number; beat: number }) {
  const [taps, setTaps] = useState(0);
  const expression: Expression = taps === 0 ? "idle" : (CAST_MOODS[(taps + index) % CAST_MOODS.length] ?? "happy");
  return (
    <li className="cast-member" style={{ ["--tico-accent" as string]: tico.accentColor }}>
      <button type="button" onClick={() => setTaps((t) => t + 1)} aria-label={`${tico.name}: haz clic para que reaccione`}>
        <Tico size={132} baseColor={tico.baseColor} accentColor={tico.accentColor} expression={expression} outfit={tico.outfit} wave={taps} bounce={beat} />
      </button>
      <h3>
        <i aria-hidden="true" />
        {tico.name}
      </h3>
      <p>{CAST_LINES[tico.id]}</p>
    </li>
  );
}

function Cast({ beat }: { beat: number }) {
  return (
    <section className="section" id="ticos">
      <div className="section-head">
        <h2>Un Tico para cada cosa.</h2>
        <p>
          Vienen cinco de serie y puedes crear hasta doce, cada uno con su ropa, sus colores, su
          forma de responder y, si quieres, su propia IA. Los agrupas en espacios de trabajo, y si
          abres la isla con Visual Studio Code delante, aparece el de programar.
        </p>
      </div>
      <ul className="cast">
        {DEFAULT_TICOS.map((tico, i) => (
          <CastMember key={tico.id} tico={tico} index={i} beat={beat} />
        ))}
      </ul>
      <p className="cast-note">Haz clic en cualquiera: tienen 15 expresiones.</p>
    </section>
  );
}

/* El anuncio */

function Film() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const play = () => {
    const el = ref.current;
    if (!el) return;
    el.controls = true;
    void el.play().catch(() => undefined);
  };
  return (
    <section className="film" id="anuncio">
      <div className="film-inner">
        <div className="film-head">
          <h2>El anuncio.</h2>
          <p>35 segundos, con sonido. Hecho con los mismos componentes que la app.</p>
        </div>
        <div className="film-window">
          <div className="film-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>tico-anuncio.mp4</span>
          </div>
          <div className="film-screen">
            <video
              ref={ref}
              poster={poster}
              preload="none"
              playsInline
              controlsList="nodownload noremoteplayback"
              onPlay={() => setPlaying(true)}
              onEnded={() => setPlaying(false)}
            >
              {/* Primero el MP4 original; WebM (VP9) para los navegadores sin H.264. */}
              <source src={video} type="video/mp4" />
              <source src={videoWebm} type="video/webm" />
              Tu navegador no puede reproducir el vídeo.
            </video>
            {!playing && (
              <button type="button" className="film-play" onClick={play}>
                <IconPlay />
                Reproducir · 0:35
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* Privacidad, dicha en negativo: lo que no hace. */

const DOESNT = [
  "No tiene servidores ni te pide una cuenta.",
  "No envía estadísticas de uso a nadie.",
  "No mira tu pantalla si no se lo pides.",
  "No guarda las capturas en el disco.",
  "No deja tus claves en archivos: van al llavero del sistema.",
];

function Doesnt() {
  return (
    <section className="section doesnt" id="privacidad">
      <h2>Lo que Tico no hace.</h2>
      <ul>
        {DOESNT.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="doesnt-note">
        Las conversaciones, los ajustes y lo que le pides que recuerde van en una base de datos en tu
        ordenador. Solo sale lo que mandas a la IA que elijas. El código es abierto y los
        instaladores se compilan a la vista en GitHub.
      </p>
    </section>
  );
}

/* Descargas, como una hoja de versión. */

const PLATFORMS: {
  id: Exclude<Platform, "mobile" | "unknown">;
  name: string;
  icon: ReactNode;
  assets: Asset[];
  firstRun: string;
}[] = [
  {
    id: "windows",
    name: "Windows",
    icon: <IconWindows />,
    assets: [ASSETS.winX64, ASSETS.winX86, ASSETS.winX64Zip, ASSETS.winX86Zip],
    firstRun: "Si sale «Windows protegió su PC», pulsa Más información → Ejecutar de todas formas.",
  },
  {
    id: "mac",
    name: "macOS",
    icon: <IconApple />,
    assets: [ASSETS.mac],
    firstRun: "Si dice que no puede verificarlo: Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente.",
  },
  {
    id: "linux",
    name: "Linux",
    icon: <IconLinux />,
    assets: [ASSETS.appImage, ASSETS.deb],
    firstRun: "AppImage: Propiedades → Permitir ejecutar. Paquete: sudo apt install ./Tico-Linux-amd64.deb",
  },
];

function Downloads({
  device,
  onDownload,
}: {
  device: ReturnType<typeof useDevice>;
  onDownload: (asset: Asset) => void;
}) {
  const { platform, primary } = device;
  return (
    <section className="section" id="descargar">
      <div className="section-head">
        <h2>Descargar Tico {VERSION}.</h2>
        <p>Gratis y sin cuenta. Los enlaces bajan siempre la última versión publicada.</p>
      </div>
      <div className="sheet">
        {PLATFORMS.map((p) => (
          <div key={p.id} className={`sheet-group${p.id === platform ? " is-yours" : ""}`}>
            <div className="sheet-os">
              {p.icon}
              <h3>{p.name}</h3>
              {p.id === platform && <span className="tag">tu equipo</span>}
            </div>
            <ul>
              {p.assets.map((asset) => (
                <li key={asset.file} className={asset === primary ? "is-primary" : ""}>
                  <DownloadLink asset={asset} className="sheet-row" onDownload={onDownload}>
                    <span className="sheet-label">
                      {asset.label}
                      <small>{asset.note}</small>
                    </span>
                    <code>{asset.file}</code>
                    <span className="sheet-size">{asset.size}</span>
                    <span className="sheet-get">Descargar</span>
                  </DownloadLink>
                </li>
              ))}
            </ul>
            <p className="sheet-first">
              <b>La primera vez:</b> {p.firstRun}
            </p>
          </div>
        ))}
      </div>
      <p className="sheet-more">
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
          Notas de la versión en GitHub
          <IconExternal />
        </a>
      </p>
    </section>
  );
}

/* Preguntas (todas a la vista, sin acordeón) */

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "¿Cuánto cuesta?",
    a: "Nada. Solo pagarías la IA si eliges un servicio de pago. Con el modo demo, Groq, la capa gratuita de Gemini, Ollama o LM Studio no pagas nada.",
  },
  {
    q: "¿Necesito una clave de IA?",
    a: "Para probarlo, no: trae un modo demo. Para usarlo de verdad, la bienvenida te ayuda en un minuto a elegir una IA y pegar su clave.",
  },
  {
    q: "¿Mira mi pantalla todo el rato?",
    a: "No. Solo cuando se lo pides con el botón, el atajo o una pregunta como «¿qué ves?». La imagen no se guarda en el disco.",
  },
  {
    q: "¿Funciona en mi ordenador?",
    a: "En Windows 10 y 11 (64 bits, 32 bits y ARM), en macOS 11 o posterior (Apple Silicon e Intel) y en Linux reciente: Ubuntu 24.04, Debian 13, Fedora 40 y similares.",
  },
];

function Questions() {
  return (
    <section className="section" id="preguntas">
      <div className="section-head">
        <h2>Preguntas.</h2>
      </div>
      <dl className="questions">
        {QUESTIONS.map((item) => (
          <div key={item.q}>
            <dt>{item.q}</dt>
            <dd>{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-brand">
          <Tico size={28} baseColor={BASE} accentColor={ACCENT} expression="sleeping" animated={false} />
          <span>
            Tico {VERSION}
            <small>Hecho por Victor</small>
          </span>
        </p>
        <p className="footer-legal">
          El código tiene licencia MIT. Tico, su nombre, su diseño y sus sonidos son de Victor, con
          todos los derechos reservados. La música de fondo es original, compuesta para Tico. Esta
          web no usa cookies ni analítica.
        </p>
        <nav aria-label="Enlaces">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
            Versiones
          </a>
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
            Avisar de un fallo
          </a>
          <button type="button" className="footer-try" onClick={openIsland}>
            Abrir la isla
          </button>
        </nav>
      </div>
    </footer>
  );
}
