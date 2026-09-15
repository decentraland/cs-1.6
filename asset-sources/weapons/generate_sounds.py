"""Generates placeholder weapon sounds with the standard library only (no Counter-Strike audio).

Each gunshot is a low thump, a noise burst and a short high crack, all with fast exponential
decay; rifles are deeper and longer than pistols. Reload and knife sounds are short clicks and
whooshes. Deterministic: the same file is produced on every run.
"""
import math
import random
import wave
from pathlib import Path

SAMPLE_RATE = 44_100
OUTPUT = Path(__file__).parents[2] / "assets" / "sounds" / "weapons"


def write(name: str, samples: list[float]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = bytearray()
    for sample in samples:
        frames.extend(round(max(-1.0, min(1.0, sample)) * 32767).to_bytes(2, "little", signed=True))
    with wave.open(str(OUTPUT / name), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


def noise(seed: int, count: int, smoothing: float) -> list[float]:
    source = random.Random(seed)
    value, out = 0.0, []
    for _ in range(count):
        value = value * smoothing + source.uniform(-1, 1) * (1 - smoothing)
        out.append(value)
    return out


def gunshot(seed: int, duration: float, thump_hz: float, thump_gain: float, body_decay: float, crack_gain: float) -> list[float]:
    count = round(SAMPLE_RATE * duration)
    body = noise(seed, count, 0.55)
    crack = noise(seed + 1, count, 0.05)
    out = []
    for index in range(count):
        t = index / SAMPLE_RATE
        thump = math.sin(2 * math.pi * (thump_hz - thump_hz * 0.6 * t) * t) * thump_gain * math.exp(-t * 28)
        burst = body[index] * 0.9 * math.exp(-t * body_decay)
        snap = crack[index] * crack_gain * math.exp(-t * 220)
        tail = body[index] * 0.12 * math.exp(-t * 9)
        out.append(thump + burst + snap + tail)
    return out


def click(seed: int, at: float, duration: float, gain: float, total: float) -> list[float]:
    count = round(SAMPLE_RATE * total)
    out = [0.0] * count
    start = round(SAMPLE_RATE * at)
    grains = noise(seed, round(SAMPLE_RATE * duration), 0.3)
    for index, value in enumerate(grains):
        if start + index < count:
            out[start + index] += value * gain * math.exp(-index / SAMPLE_RATE * 140)
    return out


def mix(*layers: list[float]) -> list[float]:
    length = max(len(layer) for layer in layers)
    return [sum(layer[index] if index < len(layer) else 0.0 for layer in layers) for index in range(length)]


def whoosh(seed: int, duration: float, gain: float) -> list[float]:
    count = round(SAMPLE_RATE * duration)
    air = noise(seed, count, 0.92)
    out = []
    for index in range(count):
        t = index / SAMPLE_RATE
        envelope = math.sin(math.pi * min(1.0, t / duration)) ** 2
        out.append(air[index] * gain * envelope)
    return out


def main() -> None:
    write("ak47_fire.wav", gunshot(seed=1, duration=0.32, thump_hz=110, thump_gain=0.75, body_decay=22, crack_gain=0.8))
    write("m4a1_fire.wav", gunshot(seed=3, duration=0.28, thump_hz=130, thump_gain=0.6, body_decay=26, crack_gain=0.9))
    write("usp_fire.wav", gunshot(seed=5, duration=0.2, thump_hz=170, thump_gain=0.45, body_decay=40, crack_gain=0.7))
    write("glock18_fire.wav", gunshot(seed=7, duration=0.18, thump_hz=190, thump_gain=0.4, body_decay=44, crack_gain=0.75))
    write("reload.wav", mix(click(9, 0.0, 0.05, 0.7, 1.4), click(10, 0.55, 0.06, 0.6, 1.4), click(11, 1.15, 0.04, 0.9, 1.4)))
    write("knife_swing.wav", whoosh(13, 0.22, 0.5))
    write("knife_hit.wav", mix(whoosh(15, 0.12, 0.3), click(16, 0.03, 0.08, 0.9, 0.2)))
    write("dryfire.wav", click(17, 0.0, 0.03, 0.6, 0.08))


if __name__ == "__main__":
    main()
