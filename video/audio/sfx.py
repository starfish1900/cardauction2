"""
Synthesizes the tutorial's sound effects (no sound library needed): soft, short, and quiet
under the voice. Writes public/audio/sfx/*.wav at 48 kHz.
"""
import os
import numpy as np
import soundfile as sf

RATE = 48_000
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "audio", "sfx")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def t(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def env(n, attack, release, curve=3.0):
    a = int(attack * RATE)
    e = np.ones(n)
    if a:
        e[:a] = np.linspace(0, 1, a)
    r = np.linspace(0, 1, n - a)
    e[a:] = (1 - r) ** curve
    return e


def lowpass(x, cutoff):
    # One-pole filter, run twice.
    alpha = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc += alpha * (v - acc)
            y[i] = acc
        x = y
    return x


def bandpass(x, low, high):
    return lowpass(x, high) - lowpass(x, low)


def save(name, x, peak_db=-6.0):
    x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)
    fade = min(len(x), int(0.004 * RATE))
    x[-fade:] *= np.linspace(1, 0, fade)
    sf.write(os.path.join(OUT, f"{name}.wav"), x.astype(np.float32), RATE)


# A card set down on the felt: a soft brush of noise and a low thump.
n = t(0.16)
noise = bandpass(rng.standard_normal(len(n)), 400, 3500) * env(len(n), 0.004, 0.15, 4)
thump = np.sin(2 * np.pi * 110 * n) * env(len(n), 0.002, 0.08, 5) * 0.6
save("card", noise + thump, -8)

# A card sliding across: a longer brush.
n = t(0.28)
save("slide", bandpass(rng.standard_normal(len(n)), 600, 4500) * env(len(n), 0.08, 0.2, 2), -10)

# A whoosh for things arriving: noise swept upward.
n = t(0.5)
x = rng.standard_normal(len(n))
sweep = np.concatenate([bandpass(x[i:i + 2400], 200 + 3000 * i / len(n), 900 + 5000 * i / len(n)) for i in range(0, len(n), 2400)])[: len(n)]
save("whoosh", sweep * env(len(n), 0.2, 0.3, 2), -10)

# A tick for each counted step: a tiny wooden click.
n = t(0.05)
tick = (np.sin(2 * np.pi * 1900 * n) * 0.6 + bandpass(rng.standard_normal(len(n)), 1500, 6000) * 0.4) * env(len(n), 0.001, 0.045, 6)
save("tick", tick, -9)

# A legal bid: a small two-note bell.
n = t(0.9)
def bell(freq, start):
    s = np.zeros(len(n))
    k = int(start * RATE)
    m = n[: len(n) - k]
    tone = sum(a * np.sin(2 * np.pi * freq * r * m) for a, r in [(1, 1), (0.35, 2.0), (0.15, 3.01)])
    s[k:] = tone * np.exp(-m * 5.5)
    return s
save("chime", bell(1046.5, 0) + 0.9 * bell(1568.0, 0.09), -8)

# An illegal bid: a soft, low "bonk", never harsh.
n = t(0.3)
f = 190 * np.exp(-n * 1.2)
phase = 2 * np.pi * np.cumsum(f) / RATE
bonk = (np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.1 * np.sin(3 * phase)) * env(len(n), 0.004, 0.28, 3)
save("buzz", lowpass(bonk, 1200), -8)

# The mileage counter rolling on: a quick ratchet.
n = t(0.36)
roll = np.zeros(len(n))
for k in range(6):
    start = int(k * 0.055 * RATE)
    m = n[: min(len(n) - start, int(0.03 * RATE))]
    roll[start:start + len(m)] += (np.sin(2 * np.pi * 2400 * m) * 0.5 + rng.standard_normal(len(m)) * 0.3) * np.exp(-m * 160)
save("roll", roll, -10)

# A label popping in.
n = t(0.1)
f = np.linspace(620, 940, len(n))
save("pop", np.sin(2 * np.pi * np.cumsum(f) / RATE) * env(len(n), 0.005, 0.09, 3), -12)

# A card turning over.
n = t(0.14)
flip = np.zeros(len(n))
for start in (0, 0.06):
    k = int(start * RATE)
    m = n[: len(n) - k]
    flip[k:] += bandpass(rng.standard_normal(len(m)), 800, 5000) * np.exp(-m * 60)
save("flip", flip, -11)
print("sound effects:", sorted(os.listdir(OUT)))
