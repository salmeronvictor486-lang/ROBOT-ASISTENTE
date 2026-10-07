import { useEffect, useState } from "react";
import { useT, type MessageKey } from "../i18n";
import { errorKey } from "../island/useChat";
import { api, isTauri, toAppError } from "../lib/tauri";
import { PROVIDERS, type AppErrorPayload, type ProviderKind, type Settings } from "../types";
import { CommitInput, Row, Section } from "./fields";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; count: number }
  | { kind: "error"; error: AppErrorPayload };

/** Proveedor, modelo, clave de API (en el llavero) y "Probar conexión". */
export function ProviderSection({ settings, update }: Props) {
  const t = useT();
  const provider = settings.provider;
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
    setKeyDraft("");
    setKeyError(null);
    update({ provider: p });
  };

  const saveKey = async () => {
    try {
      await api.secretSet(provider, keyDraft);
      setKeyDraft("");
      setKeyError(null);
      refreshKeys();
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
      setTest({ kind: "ok", count: list.length });
    } catch (e) {
      setTest({ kind: "error", error: toAppError(e) });
    }
  };

  const hasKey = keys[provider] ?? false;

  return (
    <Section title={t("settings.section.ai")}>
      <Row label={t("settings.provider")}>
        <select value={provider} onChange={(e) => changeProvider(e.target.value as ProviderKind)}>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {t(`settings.provider.${p}` as MessageKey)}
            </option>
          ))}
        </select>
      </Row>

      {provider === "ollama" ? (
        <Row label={t("settings.ollamaUrl")} hint={t("settings.ollamaHint")}>
          <CommitInput type="url" value={settings.ollamaUrl} onCommit={(ollamaUrl) => update({ ollamaUrl })} />
        </Row>
      ) : (
        <Row label={t("settings.apiKey")} hint={t("settings.apiKeyHint")}>
          <div className="stack">
            <span className={`badge ${hasKey ? "ok" : ""}`}>
              {hasKey ? t("settings.apiKeySaved") : t("settings.apiKeyMissing")}
            </span>
            <div className="inline">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("settings.apiKeyPlaceholder")}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
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
            {keyError && <p className="error-text">{t(errorKey(keyError), { message: keyError.message })}</p>}
          </div>
        </Row>
      )}

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
            {test.kind === "ok" && <span className="ok-text">{t("settings.testOk", { count: test.count })}</span>}
            {test.kind === "error" && (
              <span className="error-text">{t(errorKey(test.error), { message: test.error.message })}</span>
            )}
          </div>
        </div>
      </Row>
    </Section>
  );
}
