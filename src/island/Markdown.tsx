import { Fragment, useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { api, isTauri } from "../lib/tauri";
import { parseMarkdown, type Inline } from "./parseMarkdown";

/** Abre un enlace en el navegador (solo https; en el navegador de pruebas, en otra pestaña). */
function openLink(url: string) {
  if (isTauri()) void api.openUrl(url).catch(console.error);
  else window.open(url, "_blank", "noopener");
}

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.type) {
          case "bold":
            return <strong key={i}>{p.text}</strong>;
          case "italic":
            return <em key={i}>{p.text}</em>;
          case "code":
            return <code key={i}>{p.text}</code>;
          case "link":
            return (
              <a
                key={i}
                href={p.url}
                title={p.url}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openLink(p.url);
                }}
              >
                {p.text}
              </a>
            );
          case "text":
            return <Fragment key={i}>{p.text}</Fragment>;
        }
      })}
    </>
  );
}

/** Bloque de código con su lenguaje y un botón para copiarlo. */
function CodeBlock({ text, lang }: { text: string; lang: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang || t("island.code")}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard
              .writeText(text)
              .then(() => setCopied(true))
              .catch(console.error);
          }}
        >
          {copied ? t("island.copied") : t("island.copy")}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

/** Pinta la respuesta de Tico con formato básico. */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "paragraph":
            return (
              <p key={i}>
                <InlineText parts={b.inline} />
              </p>
            );
          case "heading":
            return (
              <p key={i} className="md-heading">
                <InlineText parts={b.inline} />
              </p>
            );
          case "code":
            return <CodeBlock key={i} text={b.text} lang={b.lang} />;
          case "table":
            return (
              <div key={i} className="md-table">
                <table>
                  <thead>
                    <tr>
                      {b.header.map((cell, j) => (
                        <th key={j}>
                          <InlineText parts={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, j) => (
                          <td key={j}>
                            <InlineText parts={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "list": {
            const items = b.items.map((item, j) => (
              <li key={j}>
                <InlineText parts={item} />
              </li>
            ));
            return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }
        }
      })}
    </div>
  );
}
