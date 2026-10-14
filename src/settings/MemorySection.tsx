import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import { api, isTauri } from "../lib/tauri";
import type { Memory, Settings } from "../types";
import { CommitInput, Row, Section, Toggle } from "./fields";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

/** Tu nombre, lo que Tico recuerda de ti y cómo conversa contigo. */
export function MemorySection({ settings, update }: Props) {
  const t = useT();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(() => {
    if (isTauri()) api.memoryList().then(setMemories).catch(console.error);
  }, []);
  useEffect(refresh, [refresh]);

  const add = () => {
    const text = draft.trim();
    if (!text || !isTauri()) return;
    api
      .memoryAdd(text)
      .then(() => {
        setDraft("");
        refresh();
      })
      .catch(console.error);
  };

  return (
    <Section id="memory" title={t("settings.section.memory")}>
      <Row label={t("settings.userName")} hint={t("settings.userNameHint")}>
        <CommitInput value={settings.userName} placeholder="Victor" onCommit={(userName) => update({ userName: userName.trim() })} />
      </Row>
      <Row label={t("settings.useMemory")} hint={t("settings.useMemoryHint")}>
        <Toggle label={t("settings.useMemory")} checked={settings.useMemory} onChange={(useMemory) => update({ useMemory })} />
      </Row>
      <Row label={t("settings.memories")} wide>
        <div className="memory-box">
          {memories.length === 0 ? (
            <p className="hint">{t("settings.memoriesEmpty")}</p>
          ) : (
            <ul className="memory-list">
              {memories.map((m) => (
                <li key={m.id}>
                  <span>{m.text}</span>
                  <button
                    type="button"
                    className="icon-x"
                    title={t("settings.forget")}
                    onClick={() => void api.memoryDelete(m.id).then(refresh).catch(console.error)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="inline">
            <input
              type="text"
              value={draft}
              placeholder={t("settings.memoryPlaceholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <button type="button" className="button primary" disabled={!draft.trim() || !isTauri()} onClick={add}>
              {t("settings.remember")}
            </button>
            {memories.length > 0 && (
              <button type="button" className="button" onClick={() => void api.memoryClear().then(refresh).catch(console.error)}>
                {t("settings.forgetAll")}
              </button>
            )}
          </div>
        </div>
      </Row>
      <Row label={t("settings.shareActiveApp")} hint={t("settings.shareActiveAppHint")}>
        <Toggle label={t("settings.shareActiveApp")} checked={settings.shareActiveApp} onChange={(shareActiveApp) => update({ shareActiveApp })} />
      </Row>
      <Row label={t("settings.followUps")} hint={t("settings.followUpsHint")}>
        <Toggle label={t("settings.followUps")} checked={settings.followUps} onChange={(followUps) => update({ followUps })} />
      </Row>
    </Section>
  );
}
