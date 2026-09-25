import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'

const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/mobile-buy-selection.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(endpoint, 'realm=', 'CS16')
const dir = process.argv[3] ?? 'validate/game/mobile-buy-selection'
await mkdir(dir, { recursive: true })
function rect(s, id) {
  const t = s[id].UiTransform
  let x = 0,
    y = 0
  const seen = new Set()
  while (id && !seen.has(id)) {
    seen.add(id)
    const transform = s[id]?.UiTransform
    if (!transform) break
    x += transform.positionLeft ?? 0
    y += transform.positionTop ?? 0
    id = transform.parent
  }
  return { x, y, width: t.width, height: t.height }
}
async function tapRect(r) {
  await c.click(r.x + r.width / 2, r.y + r.height / 2)
  await pause(350)
}
async function tapLabel(value) {
  const s = await c.snapshot()
  const item = Object.values(s).find((v) => v.UiText?.value === value && s[v.UiTransform?.parent]?.PointerEvents)
  assert.ok(item, value)
  await tapRect(rect(s, item.UiTransform.parent))
}
function icon(s, index) {
  const u = (index % 8) / 8,
    v = 1 - Math.floor(index / 8) / 3
  const item = Object.values(s).find(
    (x) =>
      JSON.stringify(x.UiBackground?.texture ?? {}).includes('assets/ui/touch-controls.png') &&
      Math.abs(x.UiBackground?.uvs?.[0] - u) < 1e-5 &&
      Math.abs(x.UiBackground?.uvs?.[3] - v) < 1e-5
  )
  assert.ok(item, 'icon ' + index)
  return rect(s, item.UiTransform.parent)
}
async function tapIcon(index) {
  await tapRect(icon(await c.snapshot(), index))
}
async function record(name) {
  const s = await c.snapshot()
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  await writeFile(
    `${dir}/${name}.json`,
    JSON.stringify({ hud: readHud(s), labels: labels(s), cart: icon(s, 16) }, null, 2)
  )
}
try {
  await c.connect()
  await c.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false })
  await pause(1000)
  const initial = readHud(await c.snapshot()).money
  await tapIcon(16)
  await tapLabel('RIFLES')
  await tapLabel('AUG')
  await tapLabel('SCOUT')
  assert.equal(readHud(await c.snapshot()).money, initial, 'touching gun rows does not spend money')
  await record('landscape-selected')
  await tapIcon(16)
  await c.until((s) => readHud(s).money === initial - 2750, 'cart buys Scout once')
  await tapIcon(16)
  assert.equal(readHud(await c.snapshot()).money, initial - 2750, 'owned item cannot buy twice')
  await record('landscape-purchased')
  await tapIcon(22)
  await tapIcon(16)
  assert.ok(labels(await c.snapshot()).includes('SELECT AN ITEM'), 'reopening clears selected item')
  await tapIcon(16)
  assert.equal(readHud(await c.snapshot()).money, initial - 2750, 'empty cart spends nothing')
  await tapLabel('RIFLES')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await pause(1200)
  await tapLabel('AUG')
  await record('portrait-selected')
  const s = await c.snapshot(),
    cart = icon(s, 16)
  assert.ok(cart.width >= 44 && cart.height >= 44 && cart.x >= 0 && cart.x + cart.width <= 390)
  assert.ok(cart.y + cart.height <= 844)
  assert.equal(readHud(s).money, initial - 2750)
  await tapIcon(22)
  console.log(
    'PASS row selection spends nothing; cart buys Scout for $2750 once; close clears selection; landscape and portrait captured'
  )
} finally {
  c.socket.close()
}
