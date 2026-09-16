import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, labels, pause } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/movement')
const evidence = { date: new Date().toISOString(), muted: true, samples: [] }
const read = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix) ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )
const manifest = JSON.parse(readFileSync(new URL('../asset-sources/movement/sounds.json', import.meta.url)))
const expected = manifest.files.map((entry) => {
  const data = readFileSync(new URL('../' + entry.file, import.meta.url))
  let offset = 12
  while (data.toString('ascii', offset, offset + 4) !== 'data')
    offset += 8 + data.readUInt32LE(offset + 4) + (data.readUInt32LE(offset + 4) % 2)
  assert.equal(entry.sampleWidth, 1)
  return { ...entry, head: Array.from(data.subarray(offset + 8, offset + 72), (sample) => (sample - 128) / 128) }
})
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  await c.evaluate(`(() => {
    const original=AudioBufferSourceNode.prototype.start
    window.__csAudioStarts=[]
    AudioBufferSourceNode.prototype.start=function(...args) {
      if(this.buffer) { const b=this.buffer; window.__csAudioStarts.push({at:Date.now()/1000,frames:b.length,sampleRate:b.sampleRate,channels:b.numberOfChannels,head:Array.from(b.getChannelData(0).subarray(0,64))}) }
      return original.apply(this,args)
    }
  })()`)
  const initial = await c.until((s) => read(s, 'review-move-state-')[0]?.health, 'scene state', 60000)
  if (labels(initial).includes('Select a team')) await c.join(2)
  await c.until((s) => read(s, 'review-move-state-')[0]?.match.phase === 'live', 'live', 20000)
  for (let i = 0; i < 30; i++) {
    const s = await c.snapshot()
    evidence.samples.push({
      at: Date.now() / 1000,
      bots: read(s, 'review-movement-').filter((v) => v.address.startsWith('bot:')),
      audio: Object.values(s).filter((v) => v.AudioSource?.audioClipUrl.startsWith('assets/sounds/movement/'))
    })
    await pause(250)
  }
  assert.ok(
    evidence.samples.some((s) => s.bots.some((b) => b.total >= 3)),
    'moving bots emit footsteps'
  )
  const positions = evidence.samples
    .flatMap((s) => s.bots)
    .filter((b) => b.address === 'bot:0')
    .map((b) => b.position)
  assert.ok(
    positions.some((p) => Math.hypot(p.x - positions[0].x, p.z - positions[0].z) > 1),
    'bot moves in the map'
  )
  const started = await c.evaluate('window.__csAudioStarts')
  evidence.audioBuffers = started.map((buffer) => ({
    ...buffer,
    matchingOriginalClips: expected
      .filter((e) => {
        if (e.frames !== buffer.frames || e.sampleRate !== buffer.sampleRate || e.channels !== buffer.channels)
          return false
        const first = e.head.findIndex((v) => v !== 0)
        if (first < 0) return false
        const gain = buffer.head[first] / e.head[first]
        return Math.abs(gain - 1) < 0.001 && e.head.every((v, i) => Math.abs(v * gain - buffer.head[i]) < 0.000001)
      })
      .map((e) => e.file)
  }))
  assert.ok(
    evidence.audioBuffers.some((b) => b.matchingOriginalClips.length),
    'browser started a decoded original CS footstep buffer'
  )
  assert.ok(
    evidence.samples.some((s) => s.audio.some((a) => a.Transform.parent === 0)),
    'bot footsteps use positional world emitters'
  )
  writeFileSync(`${dir}/bots.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: moving bots emit world footsteps; WebAudio buffer matches original CS PCM')
} catch (error) {
  evidence.failure = String(error)
  writeFileSync(`${dir}/bots-failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  c.socket.close()
}
