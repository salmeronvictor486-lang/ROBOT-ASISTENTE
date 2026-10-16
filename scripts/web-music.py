"""
Música de fondo de la web de Tico: un bucle tranquilo de 72 s compuesto y sintetizado aquí
con numpy (nada de muestras ni de música de otros, así que no tiene derechos de terceros).

80 BPM, en Re mayor: Sol maj9 · Fa# m9 · Mi m9 · La sus. 24 compases en tres partes:
  A (0-7)   piano eléctrico, pad y crujido de vinilo
  B (8-15)  entran el bajo y una batería suave con swing
  C (16-23) melodía de campanitas; la batería se va al final para volver a A sin salto
Todo se mezcla "en círculo" (lo que sobra por el final entra por el principio) y el filtro y
la reverb se aplican con FFT, que también es circular: el bucle empalma sin costura.

Uso: python3 scripts/web-music.py salida.wav   (luego ffmpeg lo pasa a MP3)
"""

import sys
import wave

import numpy as np

SR = 44100
BPM = 80
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 24
N = int(round(BARS * BAR * SR))

rng = np.random.default_rng(2026)

# Pistas que van a la reverb (wet) y pistas secas (dry), en estéreo.
wet = np.zeros((2, N))
dry = np.zeros((2, N))

CHORDS = [
    # (bajo, voces) en notas MIDI
    (43, [59, 62, 66, 69]),  # Sol maj9
    (42, [57, 61, 64, 68]),  # Fa# m9
    (40, [55, 59, 62, 66]),  # Mi m9
    (45, [59, 62, 64, 67]),  # La sus (13)
]
# Re mayor pentatónica, dos octavas, para la melodía.
SCALE = [74, 76, 78, 81, 83, 86, 88]


def freq(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(bus: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mezcla `sig` en `at` segundos. Lo que pasa del final vuelve al principio (bucle)."""
    start = int(round(at * SR)) % N
    idx = (start + np.arange(len(sig))) % N
    lg = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    rg = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    np.add.at(bus[0], idx, sig * lg)
    np.add.at(bus[1], idx, sig * rg)


def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def keys(midi: float, dur: float, vel: float) -> np.ndarray:
    """Piano eléctrico: seno con un poco de 2.º armónico y trémolo, caída exponencial."""
    t = t_axis(dur)
    f = freq(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3)
    tone += 0.08 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 8)
    tremolo = 1 + 0.06 * np.sin(2 * np.pi * 4.2 * t)
    env = np.exp(-t * 1.1) * np.minimum(1, t / 0.006)
    env *= np.minimum(1, (dur - t) / 0.08)
    return tone * tremolo * env * vel


def pad(midi: float, dur: float) -> np.ndarray:
    """Pad: dos osciladores un pelín desafinados con armónicos suaves y ataque lento."""
    t = t_axis(dur)
    f = freq(midi)
    out = np.zeros_like(t)
    for detune in (-0.004, 0.004):
        for k, amp in ((1, 1.0), (2, 0.3), (3, 0.12)):
            out += amp * np.sin(2 * np.pi * f * (1 + detune) * k * t + rng.uniform(0, 6.28))
    env = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 1.2)
    return out * env * 0.18


def bass(midi: float, dur: float, vel: float) -> np.ndarray:
    t = t_axis(dur)
    f = freq(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    env = np.minimum(1, t / 0.01) * np.exp(-t * 1.6) * np.minimum(1, (dur - t) / 0.05)
    return tone * env * vel


def bell(midi: float, vel: float) -> np.ndarray:
    """Campanita: seno con un armónico inarmónico que se apaga rápido."""
    t = t_axis(1.6)
    f = freq(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 9)
    env = np.minimum(1, t / 0.003) * np.exp(-t * 2.6)
    return tone * env * vel


def kick(vel: float) -> np.ndarray:
    t = t_axis(0.45)
    pitch = 52 + 70 * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(pitch) / SR
    return np.sin(phase) * np.exp(-t * 9) * vel


def rim(vel: float) -> np.ndarray:
    t = t_axis(0.14)
    noise = rng.uniform(-1, 1, len(t))
    tone = np.sin(2 * np.pi * 820 * t)
    return (0.6 * noise + 0.5 * tone) * np.exp(-t * 38) * vel


def hat(vel: float) -> np.ndarray:
    t = t_axis(0.07)
    noise = rng.uniform(-1, 1, len(t))
    noise = np.diff(noise, prepend=0)  # quita graves: suena más "metálico"
    return noise * np.exp(-t * 70) * vel


def bar_time(bar: int, beat: float = 0.0) -> float:
    return bar * BAR + beat * BEAT


def human(x: float = 0.012) -> float:
    return float(rng.uniform(-x, x))


# --- Composición -----------------------------------------------------------------------

melody_prev = 3
for bar in range(BARS):
    root, voices = CHORDS[bar % 4]
    section = bar // 8

    # Pad en todo el tema, un compás por acorde (con cola que se solapa con el siguiente).
    for v in voices[:3]:
        add(wet, pad(v - 12, BAR + 1.4), bar_time(bar), 0.55, pan=-0.3 + 0.3 * voices.index(v))

    # Piano: acorde en la 1 y en el "y" del 2, como rasgueado.
    for hit, (beat, vel) in enumerate(((0.0, 0.32), (1.5, 0.2), (3.0, 0.14))):
        if section == 0 and hit == 2:
            continue
        for i, v in enumerate(voices):
            add(wet, keys(v, 2.6, vel * rng.uniform(0.85, 1.05)), bar_time(bar, beat) + i * 0.014 + human(), pan=-0.35 + i * 0.23)

    # Bajo (partes B y C): fundamental en la 1 y la quinta o la octava en el 3 y medio.
    if section >= 1:
        add(dry, bass(root, BEAT * 2.2, 0.42), bar_time(bar) + human(0.006))
        second = root + (7 if bar % 2 == 0 else 12)
        add(dry, bass(second, BEAT * 1.3, 0.3), bar_time(bar, 2.5) + human(0.006))

    # Batería con swing (B y C, salvo los dos últimos compases para empalmar con A).
    if section >= 1 and bar < BARS - 2:
        swing = 0.58
        add(dry, kick(0.55), bar_time(bar, 0) + human(0.004))
        add(dry, kick(0.38), bar_time(bar, 2 + swing) + human(0.004))
        add(wet, rim(0.17), bar_time(bar, 1) + human(0.006), pan=0.15)
        add(wet, rim(0.19), bar_time(bar, 3) + human(0.006), pan=0.15)
        for b in range(4):
            for off in (0.0, swing):
                add(dry, hat(0.07 if off else 0.1), bar_time(bar, b + off) + human(0.006), pan=0.35)

    # Melodía (parte C): pocas notas, por grados, con silencios.
    if section == 2 and bar < BARS - 1:
        slots = [0.0, 1.0, 1.5, 2.5, 3.0]
        for slot in slots:
            if rng.random() < 0.45:
                continue
            step = int(rng.choice([-2, -1, -1, 1, 1, 2]))
            melody_prev = int(np.clip(melody_prev + step, 0, len(SCALE) - 1))
            add(wet, bell(SCALE[melody_prev], 0.16 * rng.uniform(0.8, 1.1)), bar_time(bar, slot) + human(), pan=0.25)

# Crujido de vinilo durante todo el bucle (seco, muy bajito).
pops = rng.integers(0, N, size=int(N / SR * 7))
for p in pops:
    add(dry, rng.uniform(-1, 1, 24) * np.exp(-np.arange(24) / 5) * rng.uniform(0.02, 0.07), p / SR, pan=float(rng.uniform(-0.6, 0.6)))
hiss = rng.normal(0, 0.002, (2, N))
dry += hiss

# --- Mezcla: reverb, filtro "lo-fi" y volumen (todo circular con FFT) ---------------------

freqs = np.fft.rfftfreq(N, 1 / SR)


def circular_reverb(x: np.ndarray, seconds: float = 2.4) -> np.ndarray:
    ir_len = int(seconds * SR)
    out = np.empty_like(x)
    for ch in range(2):
        ir = np.zeros(N)
        tail = rng.normal(0, 1, ir_len) * np.exp(-np.arange(ir_len) / (SR * seconds / 6.9))
        ir[:ir_len] = tail / np.sqrt(np.sum(tail**2))
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch]) * np.fft.rfft(ir), n=N)
    return out


def tilt_lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    """Paso bajo suave (pendiente de 12 dB/oct) y quita lo que está por debajo de 35 Hz."""
    response = 1 / (1 + (freqs / cutoff) ** 4) ** 0.5
    response *= 1 / (1 + (35 / np.maximum(freqs, 1)) ** 4) ** 0.5
    return np.fft.irfft(np.fft.rfft(x, axis=1) * response, n=N, axis=1)


mix = wet * 0.75 + circular_reverb(wet) * 0.42 + dry
mix = tilt_lowpass(mix, 5200)
# Compresión suave para que no haya picos.
mix = np.tanh(mix * 1.3) / 1.3
mix *= 10 ** (-1.5 / 20) / np.max(np.abs(mix))

out = sys.argv[1] if len(sys.argv) > 1 else "web-music.wav"
pcm = (mix.T * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"{out}: {N / SR:.1f} s, {N} muestras, {BPM} BPM")
