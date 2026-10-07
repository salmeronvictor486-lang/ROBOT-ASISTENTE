/**
 * Sonidos propios de Tico, generados con Web Audio (sin archivos de terceros).
 * Pitidos cortos y suaves, como de robot pequeño.
 */

export type SoundKind = "open" | "send" | "done" | "error";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    return context;
  } catch {
    return null;
  }
}

function beep(ctx: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.08, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const PATTERNS: Record<SoundKind, [number, number, number, OscillatorType?][]> = {
  // [frecuencia, inicio, duración, forma]
  open: [
    [660, 0, 0.08],
    [990, 0.07, 0.1],
  ],
  send: [[880, 0, 0.06, "triangle"]],
  done: [
    [784, 0, 0.08],
    [1046, 0.09, 0.14],
  ],
  error: [
    [330, 0, 0.12, "square"],
    [247, 0.12, 0.18, "square"],
  ],
};

export function playSound(kind: SoundKind): void {
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime;
  for (const [freq, start, duration, type] of PATTERNS[kind]) {
    beep(ctx, freq, now + start, duration, type);
  }
}
