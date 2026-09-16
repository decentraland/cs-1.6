import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const reference = ['player-hits', 'player-falling']
  .flatMap(
    (folder) => JSON.parse(readFileSync(new URL('../asset-sources/' + folder + '/sounds.json', import.meta.url))).files
  )
  .map((entry) => {
    const bytes = readFileSync(new URL('../' + entry.file, import.meta.url))
    let offset = 12
    while (bytes.toString('ascii', offset, offset + 4) !== 'data')
      offset += 8 + bytes.readUInt32LE(offset + 4) + (bytes.readUInt32LE(offset + 4) % 2)
    assert.equal(entry.sampleWidth, 1)
    const samples = (start) =>
      Array.from(bytes.subarray(offset + 8 + start, offset + 72 + start), (v) => (v - 128) / 128)
    return { ...entry, head: samples(0), middle: samples(Math.floor(entry.frames / 2)) }
  })
function windowMatches(expected, actual) {
  if (!actual || actual.length !== expected.length) return false
  const first = expected.findIndex((v) => v !== 0)
  if (first < 0) return actual.every((v) => Math.abs(v) < 1e-7)
  const gain = actual[first] / expected[first]
  return Math.abs(gain - 1) < 0.001 && expected.every((v, i) => Math.abs(v * gain - actual[i]) < 1e-6)
}
export function identifyPlayerAudio(buffers) {
  return buffers.map((buffer) => ({
    ...buffer,
    matchingOriginalClips: reference
      .filter(
        (entry) =>
          entry.frames === buffer.frames &&
          entry.sampleRate === buffer.sampleRate &&
          entry.channels === buffer.channels &&
          [...entry.head, ...entry.middle].some((v) => v !== 0) &&
          windowMatches(entry.head, buffer.head) &&
          windowMatches(entry.middle, buffer.middle)
      )
      .map((entry) => entry.file)
  }))
}
export function assertPlayerAudio(buffers) {
  for (const pattern of [/bhit_flesh-/, /bhit_helmet-/, /bhit_kevlar-/, /headshot/, /\/(die[123]|death6)\.wav/])
    assert.ok(
      buffers.some((b) => b.matchingOriginalClips.some((path) => pattern.test(path))),
      'decoded original PCM ' + pattern
    )
}
