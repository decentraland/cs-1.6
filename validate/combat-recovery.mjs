import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const output = resolve(process.argv[3] ?? 'validate/game/combat-recovery')
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-c4-') ? [JSON.parse(v.TextShape.text.slice(10))] : []
  )[0]
const evidence = { samples: [] }
async function sample(label) {
  const s = await c.snapshot(),
    data = state(s)
  assert.ok(data, 'run the combat recovery fixture')
  evidence.samples.push({ label, ...data })
  return { s, data }
}
async function shot() {
  const before = (await sample('before shot')).data
  await c.shoot(90)
  const after = state(
    await c.until((s) => state(s)?.weapon.lastFiredShotId > before.weapon.lastFiredShotId, 'accepted shot', 3500)
  )
  assert.equal(after.weapon.ammoClip, before.weapon.ammoClip - 1)
  await pause(420)
  return after
}
try {
  await mkdir(output, { recursive: true })
  await c.connect()
  const initial = await c.until((s) => state(s)?.health, 'fixture loaded', 45000)
  if (labels(initial).includes('Select a team')) await c.join(2)
  await c.until((s) => state(s)?.match.phase === 'live' && state(s)?.pose?.valid, 'live match with server position')
  await c.capture()
  const { data } = await sample('start')
  assert.equal(data.weapon.name, 'AWP')
  const bot = data.bots.find(({ bot }) => bot.alive),
    p = bot.position
  await c.command(`/move_player_to ${p.x + 3} ${p.y} ${p.z}`)
  await pause(750)
  await c.aimAt({ x: p.x, y: p.y + 1.05, z: p.z })
  const view = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(output, 'aim.png'), Buffer.from(view.data, 'base64'))
  for (let i = 0; i < 3; i++) {
    await shot()
    if (!(await sample('bot hit')).data.bots.find(({ bot: b }) => b.index === bot.bot.index).bot.alive) break
    await pause(1100)
    await c.aimAt({ x: p.x, y: p.y + 1.05, z: p.z })
  }
  const dead = (await sample('bot dead')).data.bots.find(({ bot: b }) => b.index === bot.bot.index)
  assert.equal(dead.bot.alive, false, 'real bullets kill the visible original-model bot')
  assert.equal(dead.bot.health, 0)
  await c.key('keyDown', '2', 'Digit2', 50)
  await c.key('keyUp', '2', 'Digit2', 50)
  await c.until((s) => state(s)?.weapon.name === 'USP', 'switch to USP')
  await pause(1100)
  await c.aimAt({ x: p.x + 3, y: p.y + 8, z: p.z + 10 })
  const usp = (await sample('USP initial')).data.weapon
  assert.deepEqual([usp.ammoClip, usp.ammoReserve], [12, 24])
  for (let magazine = 0; magazine < 3; magazine++) {
    for (let i = 0; i < 12; i++) await shot()
    const empty = (await sample(`USP magazine ${magazine + 1} empty`)).data.weapon
    assert.equal(empty.ammoClip, 0)
    if (magazine < 2) {
      const reloaded = state(
        await c.until(
          (s) => state(s)?.weapon.ammoClip === 12 && !state(s)?.weapon.isReloading,
          'finite automatic reload',
          5000
        )
      ).weapon
      assert.equal(reloaded.ammoReserve, 12 - magazine * 12)
    }
  }
  const exhausted = (await sample('USP exhausted')).data.weapon
  await c.shoot(90)
  await pause(700)
  const final = (await sample('extra empty click')).data.weapon
  assert.deepEqual([final.ammoClip, final.ammoReserve], [0, 0])
  assert.equal(final.lastFiredShotId, exhausted.lastFiredShotId)
  evidence.passed = true
  console.log('PASS: real bot kill; USP fires exactly 36 rounds, reloads finite reserve, then stays empty')
} finally {
  await writeFile(resolve(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n')
  c.socket?.close()
}
