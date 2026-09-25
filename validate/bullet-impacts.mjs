import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/bullet-impacts.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(endpoint, 'realm=', 'CS16')
const dir = process.argv[3] ?? 'validate/game/bullet-impacts'
await mkdir(dir, { recursive: true })
async function pointForLabel(text) {
  const s = await c.snapshot(),
    item = Object.values(s).find((v) => v.UiText?.value === text)
  assert.ok(item, 'label ' + text)
  return point(s, item.UiTransform.parent)
}
function point(s, id) {
  const button = s[id].UiTransform,
    width = button.width,
    height = button.height
  let x = 0,
    y = 0
  const seen = new Set()
  while (id && !seen.has(id)) {
    seen.add(id)
    const t = s[id]?.UiTransform
    if (!t) break
    x += t.positionLeft ?? 0
    y += t.positionTop ?? 0
    id = t.parent
  }
  return { x: x + width / 2, y: y + height / 2, left: x, top: y, width, height }
}
async function icon(index, rightmost = true) {
  const s = await c.snapshot(),
    u = (index % 8) / 8,
    top = 1 - Math.floor(index / 8) / 3,
    bottom = top - 1 / 3
  const items = Object.values(s).filter(
    (v) =>
      JSON.stringify(v.UiBackground?.texture ?? {}).includes('assets/ui/touch-controls.png') &&
      v.UiBackground?.uvs?.length === 8 &&
      Math.abs(v.UiBackground.uvs[0] - u) < 1e-5 &&
      Math.abs(v.UiBackground.uvs[3] - top) < 1e-5 &&
      Math.abs(v.UiBackground.uvs[1] - bottom) < 1e-5
  )
  assert.ok(items.length, 'icon ' + index)
  const points = items.map((v) => point(s, v.UiTransform.parent)).sort((a, b) => a.x - b.x)
  return rightmost ? points.at(-1) : points[0]
}
async function tap(p) {
  await c.click(p.x, p.y)
  await pause(350)
}

const decals = (s) =>
  Object.entries(s).filter(
    ([, v]) =>
      v.VisibilityComponent?.visible && JSON.stringify(v.Material ?? {}).includes('assets/ui/bullet-decals.png')
  )
async function capture(name, before, after) {
  const s = await c.snapshot()
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  await writeFile(
    `${dir}/${name}.json`,
    JSON.stringify(
      { before, after, hud: readHud(s), decals: decals(s), camera: s['2'].Transform, player: s['1'].Transform },
      null,
      2
    )
  )
}
async function buy(category, gun) {
  await tap(await icon(16))
  await c.until((s) => labels(s).includes(category), 'buy category')
  await tap(await pointForLabel(category))
  await tap(await pointForLabel(gun))
  await tap(await icon(16))
  await tap(await icon(22))
  await pause(1500)
}
async function fireOnce() {
  await tap(await icon(0))
  await pause(1000)
}
try {
  await c.connect()
  const resume = process.argv.includes('--resume')
  if (!resume) {
    await c.until(
      (s) => labels(s).includes('CT FORCES') && !labels(s).includes('CONNECTING...'),
      'fresh team menu',
      30000,
      500
    )
    await c.evaluate(
      `(()=>{for(const canvas of document.querySelectorAll('canvas')){let el=canvas;while(el.parentElement){for(const sibling of el.parentElement.children)if(sibling!==el&&sibling.tagName!=='STYLE'&&sibling.tagName!=='SCRIPT')sibling.style.visibility='hidden';el=el.parentElement}}})()`
    )
    await c.click(1225, 674)
    await tap(await pointForLabel('CT FORCES'))
    await c.until((s) => readHud(s)?.health === 100 && !labels(s).includes('CT FORCES'), 'joined CT')
    await buy('SHOTGUNS', 'M3')
    await pause(8000)
  }
  await c.command('/move_player_to 95 10.526 52')
  await pause(1800)
  await c.evaluate('document.exitPointerLock()')
  await pause(500)
  const before = readHud(await c.snapshot()).clip
  await fireOnce()
  const shot = await c.snapshot(),
    after = readHud(shot).clip
  console.log('SHOT', before, after, 'decals', decals(shot).length)
  assert.equal(before - after, 1)
  assert.equal(decals(shot).length, 9)
  await pause(2000)
  assert.equal(decals(await c.snapshot()).length, 9, 'confirmation retained nine holes without duplicating them')
  await capture('m3-wall', before, after)
  await c.command('/move_player_to 51.61083 8.26 46.70173')
  await pause(1200)
  await buy('RIFLES', 'M4A1')
  await c.command('/move_player_to 95 10.526 52')
  await pause(1600)
  await c.evaluate('document.exitPointerLock()')
  await pause(400)
  const rifleBefore = readHud(await c.snapshot()).clip
  await fireOnce()
  const rifleAfter = readHud(await c.snapshot()).clip
  assert.equal(rifleBefore - rifleAfter, 1)
  assert.ok(decals(await c.snapshot()).length > 9)
  await capture('m4-wall', rifleBefore, rifleAfter)
  await writeFile(
    `${dir}/checks.json`,
    JSON.stringify(
      {
        shotgun: { before, after, holes: 9 },
        rifle: { before: rifleBefore, after: rifleAfter },
        nativeBindings: false,
        phoneTouchVerified: false
      },
      null,
      2
    )
  )
  console.log('PASS: M3 nine holes, M4 wall impact, finite clip and direct FIRE callbacks')
} finally {
  c.socket.close()
}
