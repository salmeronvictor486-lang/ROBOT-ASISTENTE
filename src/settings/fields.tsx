import { useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { acceleratorFromEvent, formatAccelerator } from "./shortcut";

export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>
        {value} {unit}
      </output>
    </div>
  );
}

/** Campo que graba un atajo: haz clic y pulsa la combinación. */
export function ShortcutInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  return (
    <button
      type="button"
      className={`shortcut${recording ? " recording" : ""}`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        if (e.key === "Escape") {
          setRecording(false);
          return;
        }
        const accelerator = acceleratorFromEvent(e, isMac);
        if (accelerator) {
          onChange(accelerator);
          setRecording(false);
        }
      }}
    >
      {recording ? t("settings.shortcutRecord") : formatAccelerator(value, isMac)}
    </button>
  );
}

/**
 * Campo de texto que guarda al salir del campo (o con Intro), no con cada tecla:
 * así Rust no "corrige" un valor a medio escribir (una URL incompleta, por ejemplo).
 */
export function CommitInput({
  value,
  onCommit,
  multiline = false,
  ...rest
}: {
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  list?: string;
  type?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : value;
  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: shown,
    spellCheck: false,
    onFocus: () => {
      setDraft(value);
      setEditing(true);
    },
    onBlur: commit,
  };
  if (multiline) {
    return <textarea {...common} rows={rest.rows} onChange={(e) => setDraft(e.target.value)} />;
  }
  return (
    <input
      {...common}
      type={rest.type}
      list={rest.list}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
