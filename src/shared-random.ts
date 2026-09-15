// Deterministic per-shot random stream shared by server and client, like GoldSrc's UTIL_SharedRandomFloat.
// The server picks the round seed; each shot id derives its own sequence: kick first, then four spread samples.
function mix(value: number) {
  let hash = value >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
  return (hash ^ (hash >>> 16)) >>> 0
}

export function shotRandom(seed: number, shotId: number): () => number {
  let state = mix(mix(seed) ^ Math.imul(shotId + 1, 0x9e3779b1))
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function newRoundSeed(random = Math.random) {
  return Math.floor(random() * 0x7fffffff)
}
