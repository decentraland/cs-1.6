import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels } from './team-client.mjs'
const endpoint = process.argv[2],
  dir = resolve(process.argv[3] ?? 'validate/game/c4'),
  session = process.argv[4] ?? 'cs16-c4-review'
const c = new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16'),
  run = promisify(execFile),
  evidence = { date: new Date().toISOString(), rounds: [] }
mkdirSync(dir, { recursive: true })
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-c4-') ? [JSON.parse(v.TextShape.text.slice(10))] : []
  )[0]
const model = (s, name) =>
  Object.values(s).find(
    (v) => v.GltfContainer?.src.endsWith('/c4-' + name + '.glb') && v.VisibilityComponent?.visible !== false
  )
async function save(name) {
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
}
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(200)
}
async function move(p) {
  await c.command(`/move_player_to ${p.x} ${p.y + 0.15} ${p.z}`)
  await pause(750)
}
async function use(type) {
  await c.key(type, 'e', 'KeyE', 69)
}
try {
  await c.connect()
  const deadline = Date.now() + 120000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < deadline)
    await pause(500)
  }
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(2)
  for (const kit of [false, true]) {
    await c.until((s) => state(s)?.health?.current === 100 && state(s).match.phase === 'freeze', 'round freeze', 20000)
    await c.evaluate('document.exitPointerLock()')
    await pause(200)
    if (kit) {
      await row(7)
      await c.until((s) => labels(s).includes('7 DEFUSAL KIT'), 'equipment menu')
      await row(6)
      await c.until((s) => state(s).equipment.defuseKit, 'kit purchased')
      await row(8)
    }
    await row(8)
    await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture')
    await move({ x: 31.8, y: 12.61, z: 47 })
    await c.aimAt({ x: 32.8375, y: 13.5, z: 47 })
    let s = await c.until(
      (s) => state(s).bomb.phase === 'planting' && model(s, 'world')?.GltfContainerLoadingState?.currentState === 4,
      'bot holds loaded original C4',
      10000
    )
    await save(kit ? 'bot-c4-kit-round' : 'bot-c4')
    s = await c.until((s) => state(s).bomb.phase === 'planted' && model(s, 'planted'), 'bot plants original C4', 5000)
    const position = state(s).bomb.position,
      near = { ...position, x: position.x - 0.9 }
    await move(near)
    await c.aimAt(position)
    if (!kit) {
      await use('keyDown')
      await c.until((s) => state(s).bomb.defuser, 'defuse begins')
      await pause(500)
      await use('keyUp')
      await c.until((s) => !state(s).bomb.defuser, 'release cancels defuse')
    }
    await use('keyDown')
    s = await c.until((s) => state(s).bomb.defuser, 'defuse begins')
    assert.equal(state(s).bomb.actionEnds - state(s).bomb.actionStarted, kit ? 5 : 10)
    assert.equal(state(s).weapon.zoom, 90, 'use does not scope while defusing')
    const record = {
      kit,
      started: state(s).bomb.actionStarted,
      ends: state(s).bomb.actionEnds,
      heldModel: true,
      plantedModel: true
    }
    await save(kit ? 'defuse-kit' : 'defuse-no-kit')
    s = await c.until((s) => state(s).bomb.phase === 'defused', 'defuse completes', 12000)
    await use('keyUp')
    assert.equal(model(s, 'planted'), undefined, 'defused C4 is removed')
    record.final = state(s)
    evidence.rounds.push(record)
    writeFileSync(`${dir}/defuse.json`, JSON.stringify(evidence, null, 2) + '\n')
    await save(kit ? 'defused-kit' : 'defused-no-kit')
  }
  writeFileSync(`${dir}/defuse.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: bot holds/plants original C4, CT release cancels defuse, 10s without kit, 5s with kit, use avoids zoom, defused model disappears'
  )
} catch (error) {
  await save('defuse-failure').catch((e) => console.warn(e.message))
  writeFileSync(`${dir}/defuse-failure.json`, JSON.stringify(await c.snapshot().catch(() => ({})), null, 2))
  throw error
} finally {
  c.socket.close()
}
