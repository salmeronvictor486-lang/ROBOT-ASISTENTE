import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "../types";
import { EXPRESSIONS, type Expression } from "./expressions";
import { setGaze } from "./gaze";
import { Tico } from "./Tico";
import "./playground.css";

const LABELS: Record<Expression, string> = {
  idle: "Reposo",
  curious: "Curioso",
  watching: "Mirando",
  thinking: "Pensando",
  talking: "Hablando",
  happy: "Contento",
  error: "Error",
  sleeping: "Durmiendo",
};

/** Página de pruebas de Tico: cambia de expresión con botones. */
export function Playground() {
  const [expression, setExpression] = useState<Expression>("idle");
  const [baseColor, setBaseColor] = useState(DEFAULT_SETTINGS.robotBaseColor);
  const [accentColor, setAccentColor] = useState(DEFAULT_SETTINGS.robotAccentColor);
  const [size, setSize] = useState(220);
  const [bounce, setBounce] = useState(0);
  const [shake, setShake] = useState(0);

  // Los ojos siguen al ratón.
  useEffect(() => {
    const onMove = (e: MouseEvent) => setGaze(e.clientX, e.clientY);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Hablando: simulamos tokens que llegan a ritmo irregular.
  useEffect(() => {
    if (expression !== "talking") return;
    let id = 0;
    const tick = () => {
      setBounce((b) => b + 1);
      id = window.setTimeout(tick, 90 + Math.random() * 160);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [expression]);

  return (
    <main className="playground">
      <h1>Tico · página de pruebas</h1>
      <div className="stage">
        <Tico
          size={size}
          baseColor={baseColor}
          accentColor={accentColor}
          expression={expression}
          bounce={bounce}
          shake={shake}
        />
      </div>
      <div className="buttons">
        {EXPRESSIONS.map((e) => (
          <button
            key={e}
            type="button"
            className={e === expression ? "active" : ""}
            onClick={() => setExpression(e)}
          >
            {LABELS[e]}
          </button>
        ))}
        <button type="button" onClick={() => setShake((s) => s + 1)}>
          Sacudir
        </button>
      </div>
      <div className="controls">
        <label>
          Color base <input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} />
        </label>
        <label>
          Acento{" "}
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        </label>
        <label>
          Tamaño{" "}
          <input
            type="range"
            min={32}
            max={320}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="capsule-demo">
        <Tico size={36} baseColor={baseColor} accentColor={accentColor} expression={expression} bounce={bounce} shake={shake} />
        <span>Así se ve en la isla</span>
      </div>
    </main>
  );
}
