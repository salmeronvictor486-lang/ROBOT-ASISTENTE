import { useEffect, useState } from "react";
import { useT, type MessageKey } from "../i18n";
import { errorKey, errorVars } from "../island/useChat";
import { api, isTauri, toAppError } from "../lib/tauri";
import {
  PROVIDER_INFO,
  PROVIDERS,
  providerForKey,
  type AppErrorPayload,
  type ProviderKind,
  type Settings,
} from "../types";
import { CommitInput, Row, Section, Segmented } from "./fields";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; count: number; changedTo?: string }
  | { kind: "error"; error: AppErrorPayload };

/** Proveedor general, su clave (en el llavero), su modelo y "Probar conexión". */
export function ProviderSection({ settings, update }: Props) {
  const t = useT();
  const provider = settings.provider;
  const info = PROVIDER_INFO[provider];
  const [keys, setKeys] = useState<Partial<Record<ProviderKind, boolean>>>({});
  const [keyDraft, setKeyDraft] = useState("");
  const [keyError, setKeyError] = useState<AppErrorPayload | null>(null);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [models, setModels] = useState<string[]>([]);

  const refreshKeys = () => {
    if (isTauri()) api.secretStatus().then(setKeys).catch(console.error);
  };
  useEffect(refreshKeys, []);

  const changeProvider = (p: ProviderKind) => {
    setTest({ kind: "idle" });
    setModels([]);
    setKeyError(null);
    update({ provider: p });
  };

  const saveKey = async () => {
    try {
      await api.secretSet(provider, keyDraft);
      setKeyDraft("");
      setKeyError(null);
      refreshKeys();
      void runTest();
    } catch (e) {
      setKeyError(toAppError(e));
    }
  };

  const deleteKey = async () => {
    try {
      await api.secretDelete(provider);
      refreshKeys();
    } catch (e) {
      setKeyError(toAppError(e));
    }
  };

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const list = await api.aiTestConnection(provider);
      setModels(list);
      // Si el modelo escrito no está en la lista, ponemos el primero disponible.
      const current = settings.models[provider];
      if (list.length > 0 && !list.includes(current)) {
        const first = list[0] ?? current;
        update({ models: { ...settings.models, [provider]: first } });
        setTest({ kind: "ok", count: list.length, changedTo: first });
      } else {
        setTest({ kind: "ok", count: list.length });
      }
    } catch (e) {
      setTest({ kind: "error", error: toAppError(e) });
    }
  };

  const hasKey = keys[provider] ?? false;
  // ¿La clave pegada es de otro proveedor? Pasa mucho (sk-ant- en OpenAI…).
  const keyOwner = keyDraft ? providerForKey(keyDraft) : null;
  const wrongKey = keyOwner && keyOwner !== provider ? keyOwner : null;

  return (
    <Section id="ai" title={t("settings.section.ai")}>
      <p className="hint">{t("settings.freeTip")}</p>
      <div className="provider-grid" role="radiogroup">
        {PROVIDERS.map((p) => {
          const pi = PROVIDER_INFO[p];
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === provider}
              className={`provider-card${p === provider ? " is-selected" : ""}`}
              onClick={() => changeProvider(p)}
            >
              <i style={{ background: pi.color }} />
              <span>{p === "custom" ? t("island.customProvider") : pi.label}</span>
              {pi.local ? (
                <em>{t("island.local")}</em>
              ) : pi.free ? (
                <em>{t("settings.providerFree")}</em>
              ) : null}
              {pi.acceptsKey && keys[p] && <b title={t("settings.apiKeySaved")}>●</b>}
            </button>
          );
        })}
      </div>

      <h3 className="subhead">{t(`settings.provider.${provider}` as MessageKey)}</h3>

      {provider === "ollama" && (
        <Row label={t("settings.ollamaUrl")} hint={t("settings.ollamaHint")}>
          <CommitInput type="url" value={settings.ollamaUrl} onCommit={(ollamaUrl) => update({ ollamaUrl })} />
        </Row>
      )}
      {provider === "lmstudio" && (
        <Row label={t("settings.lmstudioUrl")} hint={t("settings.lmstudioHint")}>
          <CommitInput type="url" value={settings.lmstudioUrl} onCommit={(lmstudioUrl) => update({ lmstudioUrl })} />
        </Row>
      )}
      {provider === "custom" && (
        <Row label={t("settings.customUrl")} hint={t("settings.customHint")}>
          <CommitInput
            type="url"
            value={settings.customUrl}
            placeholder="https://…/v1"
            onCommit={(customUrl) => update({ customUrl })}
          />
        </Row>
      )}
      {provider === "demo" && <p className="hint">{t("settings.demoHint")}</p>}

      {info.acceptsKey && (
        <Row label={t("settings.apiKey")} hint={t("settings.apiKeyHint")}>
          <div className="stack">
            <div className="inline">
              <span className={`badge ${hasKey ? "ok" : ""}`}>
                {hasKey ? t("settings.apiKeySaved") : t("settings.apiKeyMissing")}
              </span>
              {info.keyUrl && (
                <button type="button" className="link-button" onClick={() => void api.openUrl(info.keyUrl ?? "").catch(console.error)}>
                  {t("settings.getKey")} ↗
                </button>
              )}
            </div>
            <div className="inline">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("settings.apiKeyPlaceholder")}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && keyDraft.trim()) void saveKey();
                }}
              />
              <button type="button" className="button primary" disabled={!keyDraft.trim()} onClick={() => void saveKey()}>
                {t("settings.apiKeySave")}
              </button>
              {hasKey && (
                <button type="button" className="button" onClick={() => void deleteKey()}>
                  {t("settings.apiKeyDelete")}
                </button>
              )}
            </div>
            {wrongKey && (
              <p className="warn-text">
                {t("settings.keyLooksLike", { provider: PROVIDER_INFO[wrongKey].label })}{" "}
                <button type="button" className="link-button" onClick={() => changeProvider(wrongKey)}>
                  {t("settings.switchTo", { provider: PROVIDER_INFO[wrongKey].label })}
                </button>
              </p>
            )}
            {keyError && <p className="error-text">{t(errorKey(keyError), errorVars(keyError))}</p>}
          </div>
        </Row>
      )}

      {provider !== "demo" && (
        <Row label={t("settings.model")}>
          <div className="stack">
            <CommitInput
              list="tico-models"
              value={settings.models[provider]}
              onCommit={(model) => update({ models: { ...settings.models, [provider]: model } })}
            />
            <datalist id="tico-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="inline">
              <button type="button" className="button" disabled={test.kind === "testing"} onClick={() => void runTest()}>
                {test.kind === "testing" ? t("settings.testing") : t("settings.test")}
              </button>
              {test.kind === "ok" && (
                <span className="ok-text">
                  {t("settings.testOk", { count: test.count })}
                  {test.changedTo && ` · ${t("settings.testModelChanged", { model: test.changedTo })}`}
                </span>
              )}
              {test.kind === "error" && <span className="error-text">{t(errorKey(test.error), errorVars(test.error))}</span>}
            </div>
          </div>
        </Row>
      )}

      <Row label={t("settings.answerLength")}>
        <Segmented
          value={settings.answerLength}
          onChange={(answerLength) => update({ answerLength })}
          options={[
            { value: "short", label: t("settings.answerLength.short") },
            { value: "normal", label: t("settings.answerLength.normal") },
            { value: "long", label: t("settings.answerLength.long") },
          ]}
        />
      </Row>
    </Section>
  );
}
