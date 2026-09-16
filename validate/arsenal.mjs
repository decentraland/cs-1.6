import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { Client, pause, labels, readHud } from './team-client.mjs'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
const endpoint = process.argv[2]
const team = Number(process.argv[3] ?? 2)
const dir = resolve(process.argv[4] ?? 'validate/game/arsenal')
const browserSession = process.argv[5] ?? 'cs16-arsenal-review'
const resume = process.argv.includes('--resume')
assert.ok(
  endpoint,
  'Usage: node validate/arsenal.mjs <browser-CDP-websocket> [team=2] [output-dir] [agent-browser-session] [--resume]'
)
mkdirSync(dir, { recursive: true })
const c = new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16')
const rows =
  team === 2
    ? [
        ['glock18', 'usp', 'p228', 'deagle', 'fiveseven'],
        ['m3', 'xm1014'],
        ['tmp', 'mp5', 'ump45', 'p90'],
        ['famas', 'scout', 'm4a1', 'aug', 'sg550', 'awp'],
        ['m249']
      ]
    : [['elite'], ['mac10'], ['galil', 'ak47', 'sg552', 'g3sg1']]
const categories = team === 2 ? [0, 1, 2, 3, 4] : [0, 2, 3]
const menuRows =
  team === 2
    ? rows
    : [
        ['glock18', 'usp', 'p228', 'deagle', 'elite'],
        ['mac10', 'mp5', 'ump45', 'p90'],
        ['galil', 'ak47', 'scout', 'sg552', 'awp', 'g3sg1']
      ]
const results = resume ? JSON.parse(readFileSync(`${dir}/team-${team}-weapons.json`)) : []
function model(s, id) {
  return Object.values(s).find(
    (v) => v.GltfContainer?.src.endsWith('/' + id + '-view.glb') && v.VisibilityComponent?.visible
  )
}
const clips = (s, id) =>
  model(s, id)
    ?.Animator?.states.filter((a) => a.playing)
    .map((a) => a.clip) ?? []
async function tap(key, code, vk) {
  await c.key('keyDown', key, code, vk)
  await pause(60)
  await c.key('keyUp', key, code, vk)
}
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]')
  const scale = Math.min(w / 640, h / 480)
  await c.click((w - 640 * scale) / 2 + 150 * scale, (h - 480 * scale) / 2 + (126 + index * 28) * scale)
  await pause(170)
}
async function open() {
  await c.evaluate('document.exitPointerLock()')
  await pause(250)
  const s = await c.snapshot()
  if (labels(s).includes('0 BACK')) await row(labels(s).filter((v) => /^[1-8] /.test(v)).length)
  await c.until((s) => labels(s).includes('0 CANCEL'), 'buy menu')
}
async function close() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await row(8)
    await pause(700)
    if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) return
  }
  throw new Error('Buy cancel did not capture pointer')
}
async function save(name) {
  await run('agent-browser', ['--session', browserSession, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
}
try {
  await c.connect()
  let s = resume ? await c.snapshot() : await c.until((s) => labels(s).includes('Select a team'), 'fresh match', 60000)
  if (labels(s).includes('Select a team')) await c.join(team)
  await c.until((s) => readHud(s)?.health === 100 && !labels(s).includes('Prepare to fight!'), 'live round', 20000)
  for (let cat = 0; cat < rows.length; cat++)
    for (const id of rows[cat]) {
      if (results.some((r) => r.id === id)) continue
      await open()
      await row(categories[cat])
      await row(menuRows[cat].indexOf(id))
      await c.until((s) => !!model(s, id), id + ' equipped')
      await row(menuRows[cat].length)
      await row(categories[cat] === 0 ? 6 : 5)
      await close()
      s = await c.until((s) => model(s, id)?.GltfContainerLoadingState?.currentState === 4, id + ' GLB loaded', 30000)
      await pause(2100)
      if (['usp', 'deagle', 'm4a1', 'awp', 'ak47'].includes(id)) await save(id + '-view')
      const before = readHud(await c.snapshot()).clip
      await c.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: c.mx,
        y: c.my,
        button: 'left',
        clickCount: 1
      })
      await pause(25)
      const predicted = await c.snapshot()
      await c.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: c.mx,
        y: c.my,
        button: 'left',
        clickCount: 1
      })
      const shot = await c.until((s) => readHud(s)?.clip < before, id + ' consumes ammo')
      const firing = [...new Set([...clips(predicted, id), ...clips(shot, id)])]
      assert.ok(
        firing.some((v) => v.includes('shoot')),
        id + ' original firing clip: ' + firing
      )
      await pause(1600)
      await tap('f', 'KeyF', 70)
      const reload = await c.until(
        (s) => clips(s, id).some((v) => v.includes('reload') || v.includes('insert')),
        id + ' reload clip'
      )
      const finished = await c.until((s) => readHud(s)?.clip >= before, id + ' magazine replenished', 9000)
      const entry = {
        id,
        loaded: true,
        clipBefore: before,
        clipAfter: readHud(shot).clip,
        firing,
        reload: clips(reload, id),
        reloaded: readHud(finished).clip
      }
      if (['m4a1', 'usp', 'famas', 'glock18'].includes(id)) {
        await pause(500)
        await tap('e', 'KeyE', 69)
        await pause(id === 'usp' ? 3400 : id === 'm4a1' ? 2400 : 600)
        await c.shoot(45)
        const alt = await c.until((s) => readHud(s)?.clip < before, id + ' alternate fire')
        await pause(400)
        const end = await c.snapshot()
        entry.alternateClip = readHud(end).clip
        if (id === 'famas' || id === 'glock18')
          assert.equal(entry.alternateClip, before - 3, id + ' complete released-trigger burst')
        else
          assert.ok(
            clips(alt, id).every((v) => !v.includes('unsil')),
            id + ' silenced firing animation'
          )
      }
      results.push(entry)
      writeFileSync(`${dir}/team-${team}-weapons.json`, JSON.stringify(results, null, 2))
      console.log(JSON.stringify(entry))
    }
  await tap('3', 'Digit3', 51)
  await c.until((s) => model(s, 'knife')?.GltfContainerLoadingState?.currentState === 4, 'knife loaded')
  await pause(1500)
  await save('knife-view')
  await c.shoot(45)
  s = await c.snapshot()
  assert.ok(clips(s, 'knife').some((v) => v.includes('midslash')))
  await pause(1400)
  await tap('f', 'KeyF', 70)
  s = await c.snapshot()
  assert.ok(clips(s, 'knife').some((v) => v.includes('stab')))
  results.push({ id: 'knife', loaded: true, slash: true, stab: true })
  writeFileSync(`${dir}/team-${team}-weapons.json`, JSON.stringify(results, null, 2))
  console.log('PASS: team ' + team + ' weapons ' + results.length)
} finally {
  c.socket.close()
}
