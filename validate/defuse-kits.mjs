import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'
const [owner, recipient] = process.argv
  .slice(2, 4)
  .map((endpoint) => new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16'))
assert.ok(owner && recipient, 'Pass two owned browser CDP endpoints')
const dir = resolve(process.argv[4] ?? 'validate/game/defuse-kits'),
  evidence = { date: new Date().toISOString(), muted: true, rounds: [] }
mkdirSync(dir, { recursive: true })
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-c4-') ? [JSON.parse(v.TextShape.text.slice(10))] : []
  )[0]
const kits = (s) => Object.entries(s).filter(([, v]) => v.GltfContainer?.src.endsWith('/thighpack-drop.glb'))
const icon = (s) =>
  Object.values(s).filter(
    (v) =>
      v.UiBackground?.color?.r === 0 &&
      Math.abs(v.UiBackground.color.g - 160 / 255) < 0.001 &&
      v.UiBackground.color.b === 0
  )
async function key(c, value) {
  await c.key('keyDown', value, 'Digit' + value, 48 + Number(value))
  await pause(60)
  await c.key('keyUp', value, 'Digit' + value, 48 + Number(value))
}
async function row(c, index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(250)
}
async function capture(c) {
  for (let i = 0; i < 3; i++) {
    if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) break
    await row(c, 8)
    await pause(700)
  }
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture')
  await c.shoot(60)
}
async function move(c, p) {
  await c.command(`/move_player_to ${p.x} ${p.y + 0.15} ${p.z}`)
  await pause(750)
}
async function picture(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
}
try {
  await Promise.all([owner.connect(), recipient.connect()])
  for (const c of [owner, recipient]) {
    const deadline = Date.now() + 120000
    while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
      assert.ok(Date.now() < deadline)
      await pause(500)
    }
    await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
    await c.join(2)
  }
  await recipient.until((s) => state(s)?.health.current === 100, 'two CT spawn')
  await capture(recipient)
  for (let round = 1; round <= 2; round++) {
    let s = await recipient.until(
      (s) => state(s)?.match.round === round && state(s).health.current === 100,
      'shared round',
      20000
    )
    const record = { round, recipientBefore: state(s) }
    evidence.rounds.push(record)
    assert.equal(state(s).equipment.defuseKit, round === 2, 'surviving recipient keeps recovered kit')
    await key(recipient, '1')
    await owner.until((s) => state(s)?.health.current === 100 && state(s).match.round === round, 'owner respawn')
    await owner.evaluate('document.exitPointerLock()')
    await pause(350)
    await owner.until((s) => labels(s).includes('8 EQUIPMENT'), 'buy categories')
    const before = state(await owner.snapshot()).money.amount
    await row(owner, 7)
    await owner.until((s) => labels(s).includes('7 DEFUSAL KIT'), 'equipment')
    await row(owner, 6)
    s = await owner.until((s) => state(s).equipment.defuseKit, 'real $200 purchase')
    assert.equal(state(s).money.amount, before - 200)
    assert.equal(icon(s).length, 1)
    record.purchase = state(s)
    await row(owner, 8)
    await capture(owner)
    await move(recipient, { x: 21, y: 10.43, z: 57 })
    await move(owner, { x: 21, y: 10.43, z: 60 })
    await owner.command('/move_player_to 21 45 60')
    s = await owner.until((s) => state(s).health.current === 0, 'real fatal fall', 10000)
    assert.equal(state(s).equipment.defuseKit, false)
    assert.equal(icon(s).length, 0)
    record.death = state(s)
    s = await recipient.until(
      (s) => kits(s).length === 1 && kits(s)[0][1].GltfContainerLoadingState?.currentState === 4,
      'teammate sees loaded dropped kit',
      10000
    )
    const [id, model] = kits(s)[0],
      position = model.Transform.position
    record.drop = { id, model, position }
    await recipient.aimAt(position)
    await picture(recipient, round === 1 ? 'dropped-kit' : 'unclaimed-kit')
    const money = state(s).money.amount
    await move(recipient, position)
    if (round === 1) {
      s = await recipient.until((s) => state(s).equipment.defuseKit && kits(s).length === 0, 'teammate recovers kit')
      assert.equal(state(s).money.amount, money, 'pickup is free')
      assert.equal(icon(s).length, 1)
      assert.ok(labels(s).includes('You picked up a defuser kit!'))
      record.pickup = state(s)
      record.voice = Object.values(s).filter((v) => v.AudioSource?.audioClipUrl?.endsWith('/kit-pickup.wav'))
      assert.ok(record.voice.length, 'original pickup voice is scheduled')
      await picture(recipient, 'recovered-kit')
    } else {
      await pause(700)
      s = await recipient.snapshot()
      assert.equal(kits(s).length, 1, 'an equipped CT cannot consume another kit')
      record.duplicateRejected = state(s)
    }
    await key(recipient, '3')
    s = await recipient.until((s) => state(s).bomb.phase === 'planted', 'bot plants C4 after fixture gate', 10000)
    const bomb = state(s).bomb.position
    await move(recipient, { ...bomb, x: bomb.x - 0.9 })
    await recipient.aimAt(bomb)
    await recipient.key('keyDown', 'e', 'KeyE', 69)
    s = await recipient.until((s) => state(s).bomb.defuser, 'defuse starts')
    assert.equal(state(s).bomb.actionEnds - state(s).bomb.actionStarted, 5)
    record.defuse = state(s)
    await picture(recipient, `defusing-${round}`)
    s = await recipient.until((s) => state(s).bomb.phase === 'defused', 'five-second defuse', 8000)
    await recipient.key('keyUp', 'e', 'KeyE', 69)
    record.result = state(s)
    s = await recipient.until(
      (s) => state(s).match.round === round + 1 && state(s).health.current === 100,
      'next round',
      15000
    )
    assert.equal(kits(s).length, 0, 'round clears unclaimed kits')
    assert.equal(state(s).equipment.defuseKit, true)
    record.next = state(s)
  }
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: two CT clients, $200 purchase, real death drop, original model, free recovery/sound/icon, five-second defuse, survivor retention, duplicate rejection and round cleanup'
  )
} catch (error) {
  evidence.failure = String(error)
  for (const [name, c] of [
    ['owner', owner],
    ['recipient', recipient]
  ]) {
    try {
      evidence[name] = await c.snapshot()
      await picture(c, `failure-${name}`)
    } catch (e) {
      console.warn(e.message)
    }
  }
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  owner.socket.close()
  recipient.socket.close()
}
