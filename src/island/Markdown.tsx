import { Fragment, useMemo } from "react";
import { parseMarkdown, type Inline } from "./parseMarkdown";

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
          case "text":
            return <Fragment key={i}>{p.text}</Fragment>;
        }
      })}
    </>
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
            return (
              <pre key={i}>
                <code>{b.text}</code>
              </pre>
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
