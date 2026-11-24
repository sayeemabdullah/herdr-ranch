"""Draws the animal sounds in code, like the pictures: tiny chiptune WAVs (22.05 kHz, 16-bit, mono).

Run `python3 tools/sounds.py` to regenerate mods/flock/sounds/<animal>.wav.
"""
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
SOUNDS = os.path.join(HERE, "..", "mods", "flock", "sounds")
RATE = 22050
PEAK = 0.55


def osc(kind, phase):
    p = phase % 1.0
    if kind == "sine":
        return math.sin(2 * math.pi * p)
    if kind == "square":
        return 1.0 if p < 0.5 else -1.0
    if kind == "saw":
        return 2.0 * p - 1.0
    if kind == "tri":
        return 4.0 * abs(p - 0.5) - 1.0
    raise ValueError(kind)


def tone(kind, f0, f1, dur, vib_hz=0.0, vib_depth=0.0, attack=0.02, release=0.08, gain=1.0):
    """One note gliding from f0 to f1 Hz, with vibrato and a short attack and release."""
    n = int(dur * RATE)
    out, phase = [], 0.0
    for i in range(n):
        t = i / RATE
        f = f0 + (f1 - f0) * (i / max(1, n - 1))
        f *= 1.0 + vib_depth * math.sin(2 * math.pi * vib_hz * t)
        phase += f / RATE
        env = min(1.0, t / attack, (dur - t) / release)
        out.append(osc(kind, phase) * max(0.0, env) * gain)
    return out


def silence(dur):
    return [0.0] * int(dur * RATE)


def noise(dur, smooth=8, gain=1.0, seed=3):
    rnd = random.Random(seed)
    n = int(dur * RATE)
    raw = [rnd.uniform(-1, 1) for _ in range(n)]
    out, acc = [], [0.0] * smooth
    for i, v in enumerate(raw):
        acc[i % smooth] = v
        out.append(sum(acc) / smooth * gain)
    return out


def mix(*parts):
    n = max(len(p) for p in parts)
    return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]


def cat(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


SOUNDS_DEF = {
    "sheep": lambda: tone("saw", 300, 250, 0.55, 28, 0.07, 0.03, 0.15),
    "goat": lambda: tone("square", 400, 320, 0.45, 15, 0.12, 0.02, 0.1, 0.8),
    "rabbit": lambda: cat(tone("sine", 1400, 1900, 0.1), silence(0.05), tone("sine", 1500, 2000, 0.1)),
    "chicken": lambda: cat(*[cat(tone("square", f, f - 40, 0.07, gain=0.8), silence(0.04)) for f in (520, 600, 700)]),
    "cow": lambda: tone("saw", 135, 105, 0.8, 5, 0.03, 0.06, 0.25),
    "horse": lambda: cat(tone("saw", 650, 1150, 0.25, 22, 0.04, 0.02, 0.03), tone("saw", 1150, 420, 0.5, 20, 0.05, 0.01, 0.2)),
    "duck": lambda: cat(tone("square", 520, 380, 0.11, gain=0.8), silence(0.05), tone("square", 500, 360, 0.12, gain=0.8)),
    "llama": lambda: mix(tone("sine", 220, 215, 0.65, 4, 0.02, 0.08, 0.2), tone("sine", 330, 322, 0.65, 4, 0.02, 0.08, 0.2, 0.6)),
    "fox": lambda: cat(tone("tri", 900, 1500, 0.16), silence(0.06), tone("tri", 950, 1600, 0.18)),
    "owl": lambda: cat(tone("sine", 340, 330, 0.22, 0, 0, 0.04, 0.1), silence(0.12), tone("sine", 310, 280, 0.45, 5, 0.02, 0.05, 0.2)),
    "dragon": lambda: mix(tone("saw", 75, 55, 0.95, 9, 0.05, 0.05, 0.3), noise(0.95, 6, 0.5)),
}


def render(samples):
    peak = max(abs(s) for s in samples) or 1.0
    return [s / peak * PEAK for s in samples]


def write(name, samples):
    os.makedirs(SOUNDS, exist_ok=True)
    path = os.path.join(SOUNDS, f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in render(samples)))
    return path


def main():
    for name, make in SOUNDS_DEF.items():
        write(name, make())


if __name__ == "__main__":
    main()
