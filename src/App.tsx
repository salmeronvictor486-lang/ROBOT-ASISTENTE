import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Pantalla de la Fase 0: solo comprueba que React y Rust se hablan. */
export function App() {
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ping() {
    try {
      setReply(await invoke<string>("ping"));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="hello">
      <img src="/tico.svg" alt="Tico" width={96} height={96} />
      <h1>Hola, soy Tico</h1>
      <p>Fase 0 lista: la ventana de Tauri funciona.</p>
      <button type="button" onClick={() => void ping()}>
        Hablar con Rust
      </button>
      {reply && <p className="reply">{reply}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
