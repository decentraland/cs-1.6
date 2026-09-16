import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'
const client = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const dir = resolve(process.argv[3] ?? 'validate/game/player-models/browser')
mkdirSync(dir, { recursive: true })
const evidence = { date: new Date().toISOString(), muted: true }
const state = (snapshot) =>
  Object.values(snapshot).flatMap((v) =>
    v.TextShape?.text.startsWith('review-player-models-') ? [JSON.parse(v.TextShape.text.slice(21))] : []
  )[0]
async function picture(name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
}
try {
  await client.connect()
  await client.until((s) => state(s) && labels(s).includes('Select a team'), 'lobby', 60000)
  await client.join(2)
  const loaded = await client.until(
    (s) =>
      state(s)?.bots.length === 3 && state(s).hands.length >= 3 && state(s).hands.every((h) => h.state?.state === 2),
    'bodies and animated hand attachments',
    60000
  )
  evidence.loaded = state(loaded)
  const bot = evidence.loaded.bots[0]
  await client.command(
    `/move_player_to ${bot.transform.position.x} ${bot.transform.position.y + 0.15} ${bot.transform.position.z + 4}`
  )
  await pause(750)
  await client.aimAt({ ...bot.transform.position, y: bot.transform.position.y + 1.35 })
  await picture('standing')
  console.log('PASS: three original bodies and hand-node bindings loaded; standing capture saved')
  const dead = await client.until(s => state(s)?.bots.some(b => b.bot.index === 0 && !b.bot.alive), 'scripted server death', 20000)
  evidence.scriptedDeath = state(dead)
  assert.equal(evidence.scriptedDeath.bots.find(b => b.bot.index === 0).animator.states[0].clip, 'head')
  await pause(2200)
  await picture('corpse')
  evidence.status = 'rendered; scripted death verified; shooting input unverified'
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
} catch (error) {
  evidence.failure = String(error)
  evidence.status = 'incomplete'
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  client.socket?.close()
}
