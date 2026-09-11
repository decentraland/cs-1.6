import math
import random
import wave
from pathlib import Path

SAMPLE_RATE = 44_100
DURATION = 0.14
OUTPUT = Path(__file__).parents[2] / "assets" / "sounds" / "player" / "damage.wav"


def build_sample(index: int, noise: float) -> float:
    time = index / SAMPLE_RATE
    envelope = math.exp(-time * 30)
    thump = math.sin(2 * math.pi * (92 - 180 * time) * time) * 0.62
    return max(-1, min(1, (thump + noise * 0.34) * envelope))


def main() -> None:
    random_source = random.Random(16)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    filtered_noise = 0.0
    frames = bytearray()
    for index in range(round(SAMPLE_RATE * DURATION)):
        filtered_noise = filtered_noise * 0.72 + random_source.uniform(-1, 1) * 0.28
        sample = round(build_sample(index, filtered_noise) * 32767)
        frames.extend(sample.to_bytes(2, "little", signed=True))
    with wave.open(str(OUTPUT), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


if __name__ == "__main__":
    main()
