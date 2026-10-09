"""
Banda sonora original del anuncio de Tico (35 s), sintetizada con numpy.

Música: 100 BPM, Fa maj7 - Sol - Mi m7 - La m (alegre y cálida): pad, bajo, arpegio
"pluck" y batería suave que entra cuando aparece el escritorio. Efectos sincronizados
con el vídeo: tecleo, clics, "pop" de la isla, campanitas al terminar, golpes de
transición y un riser hacia el logo final.

Uso: python3 scripts/promo-music.py promo/tico-anuncio.wav
"""

import sys
import wave

import numpy as np

SR = 48000
DUR = 35.0
N = int(SR * DUR)
BPM = 100
BEAT = 60 / BPM
DROP = 3.0  # entra la batería (coincide con el escritorio)

rng = np.random.default_rng(7)
left = np.zeros(N)
right = np.zeros(N)


def note_freq(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(sig: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mezcla `sig` en el instante `at` (s) con paneo -1..1."""
    i = int(at * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:  # empieza antes del segundo 0: recortamos el principio
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    l_gain = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    r_gain = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    left[i : i + len(sig)] += sig * l_gain
    right[i : i + len(sig)] += sig * r_gain


def env(n: int, attack: float, release: float) -> np.ndarray:
    e = np.ones(n)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def tone(freq: float, dur: float, harmonics=(1.0, 0.35, 0.15), detune: float = 0.0) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for k, amp in enumerate(harmonics, start=1):
        out += amp * np.sin(2 * np.pi * freq * k * t)
        if detune:
            out += amp * 0.6 * np.sin(2 * np.pi * freq * k * (1 + detune) * t)
    return out


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    """Filtro paso bajo de un polo (suficiente para suavizar)."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def noise(dur: float) -> np.ndarray:
    return rng.uniform(-1, 1, int(dur * SR))


# ---------------- Música ----------------

# Acordes (MIDI) por compás de 4 tiempos: Fmaj7, G6, Em7, Am7.
CHORDS = [
    [53, 57, 60, 64],
    [55, 59, 62, 64],
    [52, 55, 59, 62],
    [57, 60, 64, 67],
]
BAR = BEAT * 4
END_MUSIC = 34.2

bar_start = DROP - 2 * BAR  # el pad empieza antes del drop, desde el principio
k = 0
while bar_start < END_MUSIC:
    chord = CHORDS[k % 4]
    start = max(bar_start, 0.0)
    dur = BAR + 0.3
    # Pad: notas largas con ataque lento y un poco de desafinado (coro).
    for m in chord:
        sig = tone(note_freq(m), dur, (1.0, 0.25, 0.08), detune=0.004) * env(int(dur * SR), 0.6, 0.6)
        add(sig, start, 0.05, pan=rng.uniform(-0.4, 0.4))
    if bar_start >= DROP - 0.01:
        # Bajo en corcheas.
        for b in range(8):
            at = bar_start + b * BEAT / 2
            m = chord[0] - 12
            sig = tone(note_freq(m), BEAT / 2 * 0.9, (1.0, 0.4, 0.1))
            sig *= np.exp(-np.arange(len(sig)) / SR * 5)
            add(sig, at, 0.16)
        # Arpegio "pluck" en semicorcheas.
        pattern = [0, 2, 1, 3, 2, 1, 3, 2]
        for b in range(16):
            at = bar_start + b * BEAT / 4
            m = chord[pattern[b % 8]] + 12
            sig = tone(note_freq(m), 0.35, (1.0, 0.5, 0.2, 0.1))
            sig *= np.exp(-np.arange(len(sig)) / SR * 14)
            add(sig, at, 0.045, pan=-0.5 if b % 2 else 0.5)
    bar_start += BAR
    k += 1


def kick(at: float, gain: float = 0.5) -> None:
    dur = 0.35
    t = np.arange(int(dur * SR)) / SR
    freq = 45 + 85 * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    add(np.sin(phase) * np.exp(-t * 9), at, gain)


def snare(at: float, gain: float = 0.18) -> None:
    n = noise(0.22)
    n = n - lowpass(n, 1200)
    t = np.arange(len(n)) / SR
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    add((n * 0.8 + body * 0.4) * np.exp(-t * 18), at, gain)


def hat(at: float, gain: float = 0.05) -> None:
    n = noise(0.06)
    n = n - lowpass(n, 6000)
    add(n * np.exp(-np.arange(len(n)) / SR * 70), at, gain, pan=0.3)


# Batería desde el drop hasta el final (con un hueco antes del logo).
beat_t = DROP
while beat_t < 30.4:
    idx = round((beat_t - DROP) / BEAT)
    kick(beat_t, 0.42 if idx % 2 == 0 else 0.3)
    if idx % 2 == 1:
        snare(beat_t)
    hat(beat_t + BEAT / 2)
    hat(beat_t + BEAT / 4, 0.025)
    hat(beat_t + 3 * BEAT / 4, 0.025)
    beat_t += BEAT

# ---------------- Efectos sincronizados ----------------


def whoosh(at: float, dur: float = 0.7, gain: float = 0.16) -> None:
    n = noise(dur)
    t = np.linspace(0, 1, len(n))
    sweep = lowpass(lowpass(n, 1800), 2200) * np.sin(np.pi * t) ** 2 * 1.6
    add(sweep, at - dur * 0.6, gain)


def blip(at: float, f1: float, f2: float, gain: float = 0.12, pan: float = 0.0) -> None:
    for i, f in enumerate((f1, f2)):
        sig = tone(f, 0.12, (1.0, 0.2)) * np.exp(-np.arange(int(0.12 * SR)) / SR * 25)
        add(sig, at + i * 0.07, gain, pan)


def click(at: float, gain: float = 0.12) -> None:
    n = noise(0.012)
    add(n * np.linspace(1, 0, len(n)), at, gain)


def chime(at: float, gain: float = 0.1) -> None:
    for i, m in enumerate((84, 88, 91)):
        sig = tone(note_freq(m), 0.6, (1.0, 0.3)) * np.exp(-np.arange(int(0.6 * SR)) / SR * 7)
        add(sig, at + i * 0.06, gain, pan=(i - 1) * 0.4)


def impact(at: float, gain: float = 0.5) -> None:
    kick(at, gain)
    n = noise(2.2)
    t = np.arange(len(n)) / SR
    add(lowpass(n, 5000) * np.exp(-t * 2.2), at, 0.12)


def riser(start: float, end: float, gain: float = 0.12) -> None:
    dur = end - start
    n = noise(dur)
    t = np.linspace(0, 1, len(n))
    add(lowpass(n, 1500) * t**2 + lowpass(n, 6000) * t**4 * 0.5, start, gain)


# Gancho
whoosh(0.4, 0.8, 0.10)
whoosh(1.2, 0.8, 0.12)
blip(1.95, 1320, 1760, 0.06)
impact(DROP, 0.35)
whoosh(DROP, 0.9, 0.14)
# La isla asoma, Tico saluda, clic y se expande
blip(4.9, 880, 1320, 0.12)
click(7.5, 0.18)
whoosh(7.9, 0.6, 0.12)
# Tecleo de la primera pregunta
q1 = "¿Cómo paso este documento a PDF?"
for i in range(len(q1)):
    click(8.3 + i * (1.3 / len(q1)) + rng.uniform(0, 0.01), 0.05)
blip(9.8, 990, 1480, 0.1)
chime(13.5)
# Atajo ⌘⇧S y captura
for i in range(3):
    click(15.15 + i * 0.12, 0.14)
whoosh(15.9, 0.6, 0.1)
blip(17.3, 990, 1480, 0.1)
chime(20.0)
# Transiciones
whoosh(21.4, 0.8, 0.16)
impact(21.5, 0.25)
for at in (22.4, 23.1, 23.8, 24.5, 25.2, 25.9):
    blip(at, 1175, 1568, 0.05, pan=rng.uniform(-0.5, 0.5))
whoosh(26.7, 0.8, 0.14)
for i in range(4):
    blip(27.1 + i * 0.18, 1320, 1760, 0.04)
riser(28.9, 31.0, 0.14)
impact(31.0, 0.55)
chime(32.3, 0.08)

# ---------------- Mezcla final ----------------

mix = np.stack([left, right], axis=1)
fade_in = int(0.3 * SR)
fade_out = int(2.0 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
mix = np.tanh(mix * 1.6) / np.tanh(1.6)  # limitador suave
mix *= 0.89 / np.max(np.abs(mix))

out = sys.argv[1] if len(sys.argv) > 1 else "tico-anuncio.wav"
with wave.open(out, "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"Música: {out} ({DUR:.0f} s)")
