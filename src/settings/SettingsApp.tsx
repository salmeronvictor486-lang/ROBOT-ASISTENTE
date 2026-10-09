import { useCallback, useEffect, useRef, useState } from "react";
import { I18nContext, resolveLang, useT, type MessageKey } from "../i18n";
import { outfitFor } from "../island/TicoAvatar";
import { api, isTauri, onEvent, toAppError } from "../lib/tauri";
import { Tico } from "../robot/Tico";
import { DEFAULT_SETTINGS, findTico, type AppErrorPayload, type Settings } from "../types";
import { CommitInput, Row, Section, Segmented, ShortcutInput, Slider, Toggle } from "./fields";
import { ProviderSection } from "./ProviderSection";
import { TicosSection } from "./TicosSection";
import "./settings.css";

const SAVE_DELAY_MS = 400;

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; error: AppErrorPayload };

const SECTIONS = ["ticos", "ai", "island", "appearance", "screen", "files", "shortcuts", "system"] as const;
type SectionId = (typeof SECTIONS)[number];

declare global {
  interface Window {
    /** Sección a la que saltar al abrir (la pone Rust). */
    __TICO_SECTION__?: string;
  }
}

export function SettingsApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isTauri()) return;
    api.settingsGet().then(setSettings).catch(console.error);
    // Si se cambia algo desde la isla (Tico activo, modelo…), lo vemos aquí también.
    return onEvent<Settings>("settings://changed", setSettings);
  }, []);

  // Tema del panel: automático, claro u oscuro.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  /** Cambia los ajustes al momento y los guarda poco después (sin botón "Guardar"). */
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (!isTauri()) return;
        setSave({ kind: "saving" });
        api
          .settingsUpdate(next)
          .then((saved) => {
            setSettings(saved);
            setSave({ kind: "saved" });
          })
          .catch((e: unknown) => {
            setSave({ kind: "error", error: toAppError(e) });
            // Volvemos a lo que de verdad está guardado.
            api.settingsGet().then(setSettings).catch(console.error);
          });
      }, SAVE_DELAY_MS);
      return next;
    });
  }, []);

  return (
    <I18nContext.Provider value={resolveLang(settings.language)}>
      <SettingsPage settings={settings} update={update} save={save} />
    </I18nContext.Provider>
  );
}

function SettingsPage({
  settings,
  update,
  save,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  save: SaveState;
}) {
  const t = useT();
  const [current, setCurrent] = useState<SectionId>("ticos");
  const scroller = useRef<HTMLDivElement>(null);
  const active = findTico(settings, settings.activeTico);

  useEffect(() => {
    document.title = t("settings.title");
  }, [t]);

  const goTo = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Abrir en una sección concreta ("Nuevo Tico" desde la isla).
  useEffect(() => {
    const initial = window.__TICO_SECTION__;
    if (initial) window.setTimeout(() => goTo(initial), 80);
    return onEvent<string>("settings://section", goTo);
  }, [goTo]);

  // El menú lateral marca la sección que se está viendo.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = visible?.target.getAttribute("data-section");
        if (id && (SECTIONS as readonly string[]).includes(id)) setCurrent(id as SectionId);
      },
      { root, rootMargin: "0px 0px -65% 0px" },
    );
    root.querySelectorAll("[data-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="settings-shell">
      <aside className="sidebar">
        <div className="brand">
          <Tico
            size={44}
            baseColor={active.baseColor}
            accentColor={active.accentColor}
            expression="idle"
            outfit={outfitFor(active, settings.seasonalOutfits)}
          />
          <div>
            <strong>Tico</strong>
            <small>{__APP_VERSION__}</small>
          </div>
        </div>
        <nav>
          {SECTIONS.map((id) => (
            <button key={id} type="button" className={current === id ? "active" : ""} onClick={() => goTo(id)}>
              {t(`settings.nav.${id}` as MessageKey)}
            </button>
          ))}
        </nav>
        <span className={`save-state ${save.kind}`} role="status">
          {save.kind === "saving" && t("settings.saving")}
          {save.kind === "saved" && t("settings.saved")}
          {save.kind === "error" && t("settings.error", { message: save.error.message })}
        </span>
      </aside>

      <main className="settings" ref={scroller}>
        <h1>{t("settings.title")}</h1>

        <TicosSection settings={settings} update={update} />

        <ProviderSection settings={settings} update={update} />

        <Section id="island" title={t("settings.section.island")}>
          <Row label={t("settings.size")}>
            <Segmented
              value={settings.islandSize}
              onChange={(islandSize) => update({ islandSize })}
              options={[
                { value: "s", label: t("settings.size.s") },
                { value: "m", label: t("settings.size.m") },
                { value: "l", label: t("settings.size.l") },
              ]}
            />
          </Row>
          <Row label={t("settings.position")}>
            <Segmented
              value={settings.islandPosition}
              onChange={(islandPosition) => update({ islandPosition })}
              options={[
                { value: "left", label: t("settings.position.left") },
                { value: "center", label: t("settings.position.center") },
                { value: "right", label: t("settings.position.right") },
              ]}
            />
          </Row>
          <Row label={t("settings.activationWidth")}>
            <Slider value={settings.activationWidth} min={100} max={1200} step={20} unit="px" onChange={(activationWidth) => update({ activationWidth })} />
          </Row>
          <Row label={t("settings.showDelay")}>
            <Slider value={settings.showDelayMs} min={0} max={1000} step={50} unit="ms" onChange={(showDelayMs) => update({ showDelayMs })} />
          </Row>
          <Row label={t("settings.hideDelay")}>
            <Slider value={settings.hideDelayMs} min={100} max={3000} step={100} unit="ms" onChange={(hideDelayMs) => update({ hideDelayMs })} />
          </Row>
          <Row label={t("settings.followCursor")} hint={t("settings.followCursorHint")}>
            <Toggle label={t("settings.followCursor")} checked={settings.followCursorMonitor} onChange={(followCursorMonitor) => update({ followCursorMonitor })} />
          </Row>
          <Row label={t("settings.hideOnFullscreen")}>
            <Toggle label={t("settings.hideOnFullscreen")} checked={settings.hideOnFullscreen} onChange={(hideOnFullscreen) => update({ hideOnFullscreen })} />
          </Row>
          <Row label={t("settings.desktopTico")} hint={t("settings.desktopTicoHint")}>
            <Toggle label={t("settings.desktopTico")} checked={settings.desktopTico} onChange={(desktopTico) => update({ desktopTico })} />
          </Row>
          <div className="inline">
            <button type="button" className="button" onClick={() => void api.openSettings("playground").catch(console.error)}>
              {t("settings.openPlayground")}
            </button>
          </div>
        </Section>

        <Section id="appearance" title={t("settings.section.appearance")}>
          <Row label={t("settings.theme")}>
            <Segmented
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: "auto", label: t("settings.theme.auto") },
                { value: "light", label: t("settings.theme.light") },
                { value: "dark", label: t("settings.theme.dark") },
              ]}
            />
          </Row>
          <Row label={t("settings.language")}>
            <select value={settings.language} onChange={(e) => update({ language: e.target.value as Settings["language"] })}>
              <option value="auto">{t("settings.language.auto")}</option>
              <option value="es">Castellano</option>
              <option value="ca">Català</option>
              <option value="en">English</option>
            </select>
          </Row>
        </Section>

        <Section id="screen" title={t("settings.section.capture")}>
          <Row label={t("settings.autoCapture")}>
            <Toggle label={t("settings.autoCapture")} checked={settings.autoCapture} onChange={(autoCapture) => update({ autoCapture })} />
          </Row>
          <Row label={t("settings.ocr")} hint={t("settings.ocrHint")}>
            <Toggle label={t("settings.ocr")} checked={settings.ocr} onChange={(ocr) => update({ ocr })} />
          </Row>
          <Row label={t("settings.captureMode")}>
            <Segmented
              value={settings.captureMode}
              onChange={(captureMode) => update({ captureMode })}
              options={[
                { value: "screen", label: t("settings.captureMode.screen") },
                { value: "window", label: t("settings.captureMode.window") },
              ]}
            />
          </Row>
          <Row label={t("settings.captureConfirm")}>
            <Toggle label={t("settings.captureConfirm")} checked={settings.captureConfirm} onChange={(captureConfirm) => update({ captureConfirm })} />
          </Row>
          <Row label={t("settings.blockedApps")} hint={t("settings.blockedAppsHint")}>
            <div className="stack">
              <CommitInput multiline rows={6} value={settings.blockedApps.join("\n")} onCommit={(text) => update({ blockedApps: text.split("\n") })} />
              <button type="button" className="button" onClick={() => update({ blockedApps: DEFAULT_SETTINGS.blockedApps })}>
                {t("settings.resetBlocked")}
              </button>
            </div>
          </Row>
        </Section>

        <Section id="files" title={t("settings.section.files")}>
          <p className="hint">{t("settings.pdfHint")}</p>
          <Row label={t("settings.outputFolder")}>
            <Segmented
              value={settings.outputFolder}
              onChange={(outputFolder) => update({ outputFolder })}
              options={[
                { value: "downloads", label: t("settings.outputFolder.downloads") },
                { value: "same", label: t("settings.outputFolder.same") },
              ]}
            />
          </Row>
        </Section>

        <Section id="shortcuts" title={t("settings.section.shortcuts")}>
          <p className="hint">{t("settings.shortcutHint")}</p>
          <Row label={t("settings.shortcutOpen")}>
            <ShortcutInput value={settings.shortcutOpen} onChange={(shortcutOpen) => update({ shortcutOpen })} />
          </Row>
          <Row label={t("settings.shortcutCapture")}>
            <ShortcutInput value={settings.shortcutCapture} onChange={(shortcutCapture) => update({ shortcutCapture })} />
          </Row>
        </Section>

        <Section id="system" title={t("settings.section.system")}>
          <Row label={t("settings.sounds")}>
            <Toggle label={t("settings.sounds")} checked={settings.sounds} onChange={(sounds) => update({ sounds })} />
          </Row>
          <Row label={t("settings.autostart")}>
            <Toggle label={t("settings.autostart")} checked={settings.autostart} onChange={(autostart) => update({ autostart })} />
          </Row>
        </Section>

        <footer className="settings-footer">
          <p>{t("settings.privacy")}</p>
          <p>Tico {__APP_VERSION__} · MIT</p>
        </footer>
      </main>
    </div>
  );
}
