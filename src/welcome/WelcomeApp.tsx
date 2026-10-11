import { useCallback, useEffect, useState, type ReactNode } from "react";
import { I18nContext, resolveLang, useT, type MessageKey } from "../i18n";
import { errorKey, errorVars } from "../island/useChat";
import { api, isTauri, toAppError } from "../lib/tauri";
import type { Expression } from "../robot/expressions";
import { Tico } from "../robot/Tico";
import { isMac } from "../settings/fields";
import { formatAccelerator } from "../settings/shortcut";
import { useSettings } from "../settings/useSettings";
import { PROVIDER_INFO, providerForKey, type AppErrorPayload, type ProviderKind, type Settings } from "../types";
import "./welcome.css";

const STEPS = ["hello", "ai", "connect", "how", "done"] as const;
type Step = (typeof STEPS)[number];

/** Las IA que se ofrecen al empezar (el resto, en Ajustes). */
const CHOICES: { id: ProviderKind; tag: "free" | "local" | "paid" | "nokey" }[] = [
  { id: "gemini", tag: "free" },
  { id: "groq", tag: "free" },
  { id: "anthropic", tag: "paid" },
  { id: "openai", tag: "paid" },
  { id: "ollama", tag: "local" },
  { id: "demo", tag: "nokey" },
];

const EXPRESSION: Record<Step, Expression> = {
  hello: "happy",
  ai: "curious",
  connect: "thinking",
  how: "wink",
  done: "proud",
};

type Connection =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; count: number }
  | { kind: "error"; error: AppErrorPayload };

export function WelcomeApp() {
  const settings = useSettings();
  return (
    <I18nContext.Provider value={resolveLang(settings.language)}>
      <Welcome settings={settings} />
    </I18nContext.Provider>
  );
}

function Welcome({ settings }: { settings: Settings }) {
  const t = useT();
  const [step, setStep] = useState<Step>("hello");
  const [wave, setWave] = useState(1);
  const [connection, setConnection] = useState<Connection>({ kind: "idle" });
  const index = STEPS.indexOf(step);

  useEffect(() => {
    document.title = t("welcome.windowTitle");
  }, [t]);

  // Tema: el de Ajustes.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const save = useCallback(
    (patch: Partial<Settings>) => {
      if (isTauri()) void api.settingsUpdate({ ...settings, ...patch }).catch(console.error);
    },
    [settings],
  );

  const go = (next: Step) => {
    setStep(next);
    if (next === "done" || next === "hello") setWave((w) => w + 1);
  };
  const next = () => {
    const following = STEPS[index + 1];
    if (following) go(following);
  };
  const back = () => {
    const previous = STEPS[index - 1];
    if (previous) go(previous);
  };

  // Si cambia de IA, la prueba anterior ya no vale.
  const provider = settings.provider;
  const pick = (p: ProviderKind) => {
    if (p !== provider) setConnection(p === "demo" ? { kind: "ok", count: 1 } : { kind: "idle" });
    save({ provider: p });
  };

  const finish = () => {
    if (isTauri()) void api.welcomeFinish().catch(console.error);
  };

  let body: ReactNode;
  if (step === "hello") body = <HelloStep settings={settings} save={save} />;
  else if (step === "ai") body = <AiStep provider={provider} onPick={pick} />;
  else if (step === "connect") body = <ConnectStep provider={provider} connection={connection} setConnection={setConnection} />;
  else if (step === "how") body = <HowStep settings={settings} />;
  else body = <DoneStep settings={settings} save={save} />;

  const connected = connection.kind === "ok" || provider === "demo";
  let nextLabel = t("welcome.next");
  if (step === "hello") nextLabel = t("welcome.start");
  if (step === "connect" && !connected) nextLabel = t("welcome.skip");

  return (
    <div className="welcome" style={{ "--accent": "#3DD6D0" } as React.CSSProperties}>
      <aside className="stage">
        <div className="stage-glow" />
        <div className="stage-tico" key={step}>
          <Tico size={190} baseColor="#F2F0EB" accentColor="#3DD6D0" expression={EXPRESSION[step]} wave={wave} />
        </div>
        <div className="stage-brand">
          <strong>Tico</strong>
          <small>{__APP_VERSION__}</small>
        </div>
      </aside>
      <main className="panel">
        <div className="progress" aria-label={t("welcome.progress", { step: index + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <i key={s} className={i < index ? "done" : i === index ? "current" : ""} />
          ))}
        </div>
        <div className="step" key={step}>
          {body}
        </div>
        <footer className="actions">
          {index > 0 && step !== "done" ? (
            <button type="button" className="ghost" onClick={back}>
              {t("welcome.back")}
            </button>
          ) : (
            <span />
          )}
          {step === "done" ? (
            <button type="button" className="primary" onClick={finish} autoFocus>
              {t("welcome.open")}
            </button>
          ) : (
            <button type="button" className={step === "connect" && !connected ? "ghost" : "primary"} onClick={next} autoFocus>
              {nextLabel}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

function HelloStep({ settings, save }: { settings: Settings; save: (p: Partial<Settings>) => void }) {
  const t = useT();
  const langs: { value: Settings["language"]; label: string }[] = [
    { value: "auto", label: t("settings.language.auto") },
    { value: "es", label: "Castellano" },
    { value: "ca", label: "Català" },
    { value: "en", label: "English" },
  ];
  return (
    <>
      <h1>{t("welcome.hello.title")}</h1>
      <p className="lead">{t("welcome.hello.lead")}</p>
      <ul className="features">
        <li>{t("welcome.hello.f1")}</li>
        <li>{t("welcome.hello.f2")}</li>
        <li>{t("welcome.hello.f3")}</li>
      </ul>
      <div className="field">
        <span>{t("settings.language")}</span>
        <div className="chips" role="radiogroup">
          {langs.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={settings.language === l.value}
              className={settings.language === l.value ? "chip is-on" : "chip"}
              onClick={() => save({ language: l.value })}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function AiStep({ provider, onPick }: { provider: ProviderKind; onPick: (p: ProviderKind) => void }) {
  const t = useT();
  return (
    <>
      <h1>{t("welcome.ai.title")}</h1>
      <p className="lead">{t("welcome.ai.lead")}</p>
      <div className="ai-grid" role="radiogroup">
        {CHOICES.map(({ id, tag }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={provider === id}
            className={`ai-card${provider === id ? " is-on" : ""}`}
            onClick={() => onPick(id)}
          >
            <span className="ai-head">
              <i style={{ background: PROVIDER_INFO[id].color }} />
              <b>{id === "demo" ? t("welcome.ai.demoName") : PROVIDER_INFO[id].label}</b>
              <em className={`tag tag-${tag}`}>{t(`welcome.tag.${tag}` as MessageKey)}</em>
            </span>
            <small>{t(`welcome.ai.${id}` as MessageKey)}</small>
          </button>
        ))}
      </div>
      <p className="hint">{t("welcome.ai.more")}</p>
    </>
  );
}

function ConnectStep({
  provider,
  connection,
  setConnection,
}: {
  provider: ProviderKind;
  connection: Connection;
  setConnection: (c: Connection) => void;
}) {
  const t = useT();
  const info = PROVIDER_INFO[provider];
  const [key, setKey] = useState("");
  const owner = key ? providerForKey(key) : null;
  const wrong = owner && owner !== provider ? owner : null;

  const test = async (withKey: boolean) => {
    if (!isTauri()) return;
    setConnection({ kind: "testing" });
    try {
      if (withKey) {
        await api.secretSet(provider, key);
        setKey("");
      }
      const models = await api.aiTestConnection(provider);
      setConnection({ kind: "ok", count: models.length });
    } catch (e) {
      setConnection({ kind: "error", error: toAppError(e) });
    }
  };

  const status = (
    <div className="status" role="status">
      {connection.kind === "testing" && <span className="spinner" aria-hidden="true" />}
      {connection.kind === "testing" && t("welcome.connect.testing")}
      {connection.kind === "ok" && provider !== "demo" && <span className="ok">✓ {t("welcome.connect.ok", { count: connection.count })}</span>}
      {connection.kind === "error" && <span className="bad">{t(errorKey(connection.error), errorVars(connection.error))}</span>}
    </div>
  );

  if (provider === "demo") {
    return (
      <>
        <h1>{t("welcome.connect.demoTitle")}</h1>
        <p className="lead">{t("welcome.connect.demoLead")}</p>
      </>
    );
  }
  if (provider === "ollama") {
    return (
      <>
        <h1>{t("welcome.connect.title", { provider: info.label })}</h1>
        <ol className="how-list">
          <li>
            {t("welcome.connect.ollama1")}{" "}
            <button type="button" className="link" onClick={() => void api.openUrl("https://ollama.com/download").catch(console.error)}>
              ollama.com ↗
            </button>
          </li>
          <li>
            {t("welcome.connect.ollama2")} <code>ollama pull gemma3</code>
          </li>
          <li>{t("welcome.connect.ollama3")}</li>
        </ol>
        <button type="button" className="secondary" onClick={() => void test(false)} disabled={connection.kind === "testing"}>
          {t("welcome.connect.check")}
        </button>
        {status}
      </>
    );
  }
  return (
    <>
      <h1>{t("welcome.connect.title", { provider: info.label })}</h1>
      <ol className="how-list">
        <li>
          {t("welcome.connect.step1", { provider: info.label })}{" "}
          {info.keyUrl && (
            <button type="button" className="link" onClick={() => void api.openUrl(info.keyUrl ?? "").catch(console.error)}>
              {t("settings.getKey")} ↗
            </button>
          )}
        </li>
        <li>{t("welcome.connect.step2")}</li>
        <li>{t("welcome.connect.step3")}</li>
      </ol>
      <form
        className="key-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) void test(true);
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("settings.apiKeyPlaceholder")}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label={t("settings.apiKey")}
        />
        <button type="submit" className="secondary" disabled={!key.trim() || connection.kind === "testing"}>
          {t("welcome.connect.connect")}
        </button>
      </form>
      {wrong && <p className="warn">{t("settings.keyLooksLike", { provider: PROVIDER_INFO[wrong].label })}</p>}
      {status}
      <p className="hint">🔒 {t(isMac ? "welcome.connect.safeMac" : "welcome.connect.safeWin")}</p>
    </>
  );
}

function HowStep({ settings }: { settings: Settings }) {
  const t = useT();
  const keys = settings.shortcutOpen.split("+").map((part) => formatAccelerator(part, isMac));
  return (
    <>
      <h1>{t("welcome.how.title")}</h1>
      <div className="how-grid">
        <div className="how-card">
          <div className="mini-screen" aria-hidden="true">
            <span className="mini-island" />
            <span className="mini-cursor" />
          </div>
          <p>{t("welcome.how.edge")}</p>
        </div>
        <div className="how-card">
          <div className="keycaps" aria-label={formatAccelerator(settings.shortcutOpen, isMac)}>
            {keys.map((k, i) => (
              <kbd key={`${k}-${i}`}>{k}</kbd>
            ))}
          </div>
          <p>{t("welcome.how.shortcut")}</p>
        </div>
      </div>
      <ul className="features compact">
        <li>{t("welcome.how.tip1")}</li>
        <li>{t("welcome.how.tip2")}</li>
        <li>{t("welcome.how.tip3")}</li>
      </ul>
    </>
  );
}

function DoneStep({ settings, save }: { settings: Settings; save: (p: Partial<Settings>) => void }) {
  const t = useT();
  return (
    <>
      <h1>{t("welcome.done.title")}</h1>
      <p className="lead">{t("welcome.done.lead")}</p>
      <label className="switch-row">
        <span>
          <b>{t("settings.autostart")}</b>
          <small>{t("welcome.done.autostartHint")}</small>
        </span>
        <input type="checkbox" checked={settings.autostart} onChange={(e) => save({ autostart: e.target.checked })} />
      </label>
      <label className="switch-row">
        <span>
          <b>{t("settings.desktopTico")}</b>
          <small>{t("settings.desktopTicoHint")}</small>
        </span>
        <input type="checkbox" checked={settings.desktopTico} onChange={(e) => save({ desktopTico: e.target.checked })} />
      </label>
    </>
  );
}
