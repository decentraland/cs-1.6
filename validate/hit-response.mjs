import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, labels, pause } from './team-client.mjs'
import { identifyPlayerAudio, assertPlayerAudio } from './player-audio.mjs'
import { readHud } from './read-hud.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/hits')
const evidence = { date: new Date().toISOString(), muted: true, hits: [] }
const read = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix + '{') ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )
const state = (s) => read(s, 'review-hit-state-')[0]
const tap = async (key, code, vk) => {
  await c.key('keyDown', key, code, vk)
  await pause(65)
  await c.key('keyUp', key, code, vk)
}
const audio = (s) =>
  Object.entries(s)
    .filter(([, v]) => v.AudioSource?.audioClipUrl.startsWith('assets/sounds/player/original/'))
    .map(([entity, v]) => ({ entity, ...v }))
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(180)
}
async function capture(name) {
  const result = await c.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${dir}/${name}.png`, Buffer.from(result.data, 'base64'))
}
async function incoming(index, health, clip) {
  await pause(1800)
  await tap('e', 'KeyE', 69)
  let s = await c.until((s) => read(s, 'review-hit-').some((v) => v.step === index), 'authoritative hit ' + index)
  const hit = read(s, 'review-hit-').find((v) => v.step === index)
  assert.equal(hit.batches[0]?.group, hit.config.group, hit.config.name + ' correct trace region')
  assert.equal(hit.health.current, health, hit.config.name + ' source health')
  await pause(120)
  s = await c.snapshot()
  const clips = audio(s)
  assert.ok(
    clips.some((v) => clip.test(v.AudioSource.audioClipUrl)),
    hit.config.name + ' original voice'
  )
  if (index < 9) assert.equal(readHud(s).health, health, hit.config.name + ' rendered health digits')
  if (index < 9) {
    assert.equal(clips.length, 1, 'one local voice channel')
    assert.equal(clips[0].Transform.parent, 2, 'local voice follows camera')
    if (index > 0) assert.equal(clips[0].entity, evidence.hits[0].audio[0].entity, 'new hit reuses voice emitter')
  }
  if ([2, 3, 4, 5, 7, 8].includes(index))
    assert.deepEqual(state(s).punch, { pitch: 0, roll: 0 }, 'arm/leg/armor starts no camera kick')
  const entry = { ...hit, client: state(s), hud: readHud(s), audio: clips }
  evidence.hits.push(entry)
  if ([1, 4, 8, 9].includes(index)) await capture(hit.config.name)
  console.log(
    hit.config.name,
    JSON.stringify({ health: hit.health, voice: clips.map((v) => v.AudioSource.audioClipUrl) })
  )
  return entry
}
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  await c.evaluate(
    `(()=>{const original=AudioBufferSourceNode.prototype.start;window.__csAudioStarts=[];AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer){const b=this.buffer;window.__csAudioStarts.push({at:Date.now()/1000,frames:b.length,sampleRate:b.sampleRate,channels:b.numberOfChannels,head:Array.from(b.getChannelData(0).subarray(0,64)),middle:Array.from(b.getChannelData(0).subarray(Math.floor(b.length/2),Math.floor(b.length/2)+64))})}return original.apply(this,args)}})()`
  )
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.health.current === 100, 'spawn')
  await row(8)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked && state(s)?.match.phase === 'live', 'live', 20000)
  await tap('3', 'Digit3', 51)
  await c.command('/move_player_to 88 10.176 52')
  await pause(1200)
  await c.aimAt({ x: 95, y: 11.626, z: 52 })
  await incoming(0, 65, /bhit_flesh-/)
  await incoming(1, 57, /bhit_flesh-/)
  await incoming(2, 65, /bhit_flesh-/)
  await incoming(3, 74, /bhit_flesh-/)
  await incoming(4, 67, /bhit_kevlar-/)
  await incoming(5, 56, /bhit_helmet-/)
  await incoming(6, 16, /headshot/)
  await incoming(7, 18, /headshot/)
  await incoming(8, 33, /bhit_kevlar-/)
  // Real input, shared random spread, server trace and a visible bot; no damage injection for this case.
  await c.command('/move_player_to 95 10.176 52')
  await pause(1000)
  await tap('f', 'KeyF', 70)
  await c.until((s) => state(s)?.bots.some((b) => b.position.x === 88), 'parked bots')
  await tap('2', 'Digit2', 50)
  await pause(1300)
  const before = state(await c.snapshot())
  await c.aimAt({ x: 88, y: 11.226, z: 52 })
  await c.shoot(45)
  let s = await c.until((s) => read(s, 'review-bot-hit-').length > 0, 'real shot hits visible bot')
  const first = read(s, 'review-bot-hit-')[0]
  assert.equal(first.group, 'body')
  assert.ok(state(s).bots[0].health < 100 && state(s).bots[0].health > 0)
  await pause(200)
  s = await c.snapshot()
  evidence.botBody = { before, hit: first, after: state(s), audio: audio(s) }
  assert.ok(
    audio(s).some((v) => v.Transform.parent === 0 && /bhit_flesh-/.test(v.AudioSource.audioClipUrl)),
    'remote bot positional pain'
  )
  await capture('bot-hit')
  await pause(1600)
  await c.aimAt({ x: 88, y: 11.626, z: 52 })
  await c.shoot(45)
  s = await c.until((s) => state(s)?.bots[0]?.alive === false, 'real headshot kills bot')
  await pause(200)
  s = await c.snapshot()
  evidence.botDeath = { hits: read(s, 'review-bot-hit-'), state: state(s), audio: audio(s) }
  assert.ok(
    audio(s).some((v) => v.Transform.parent === 0 && /\/(die[123]|death6)\.wav/.test(v.AudioSource.audioClipUrl)),
    'remote bot death voice'
  )
  await capture('bot-death')
  await tap('3', 'Digit3', 51)
  await c.command('/move_player_to 88 10.176 52')
  await pause(1200)
  await incoming(9, 0, /\/(die[123]|death6)\.wav/)
  const next = await c.until(
    (s) => state(s)?.match.round > 1 && state(s)?.health.current === 100,
    'next round restores player',
    20000
  )
  evidence.nextRound = state(next)
  const started = await c.evaluate('window.__csAudioStarts')
  evidence.audioBuffers = identifyPlayerAudio(started)
  assertPlayerAudio(evidence.audioBuffers)
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: hit groups, armor, shotgun aggregation, real bot shooting, original local/remote voices and next round'
  )
} catch (error) {
  evidence.failure = String(error)
  evidence.snapshot = await c.snapshot().catch(() => undefined)
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  c.socket.close()
}
