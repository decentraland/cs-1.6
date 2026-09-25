import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/autobuy.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(endpoint, 'realm=', 'CS16')
const dir = process.argv[3] ?? 'validate/game/autobuy'
await mkdir(dir, { recursive: true })
async function pointForLabel(text) {
  const s = await c.snapshot(),
    item = Object.values(s).find((v) => v.UiText?.value === text && s[v.UiTransform.parent]?.PointerEvents)
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

const checks = []
async function save(name) {
  const s = await c.snapshot()
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  checks.push({ name, hud: readHud(s), notices: labels(s).filter((text) => /Auto-bought|Nothing bought/.test(text)) })
}
async function resize(width, height) {
  await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await pause(500)
}
try {
  await c.connect()
  for (let i = 0; i < 40; i++) {
    if (await c.evaluate('typeof window.engine_console_command==="function"')) break
    await pause(1000)
  }
  await c.until(
    (s) => labels(s).includes('CT FORCES') && !labels(s).includes('CONNECTING...'),
    'connected team menu',
    30000,
    500
  )
  await c.evaluate(
    `(()=>{for(const canvas of document.querySelectorAll('canvas')){let el=canvas;while(el.parentElement){for(const sibling of el.parentElement.children)if(sibling!==el&&sibling.tagName!=='STYLE'&&sibling.tagName!=='SCRIPT')sibling.style.visibility='hidden';el=el.parentElement}}})()`
  )
  await c.click(1280 - 55, 720 * 0.95 - 10)
  await tap(await pointForLabel('CT FORCES'))
  await c.until((s) => readHud(s)?.health === 100 && !labels(s).includes('CT FORCES'), 'joined CT')

  await resize(844, 390)
  await tap(await icon(16))
  const auto = await pointForLabel('AUTO BUY'),
    rebuy = await pointForLabel('REBUY'),
    pistols = await pointForLabel('PISTOLS')
  assert.ok(auto.y < pistols.y && rebuy.y < pistols.y, 'quick buys precede the category rows')
  await tap(auto)
  assert.equal(readHud(await c.snapshot()).money, 16000, 'selection does not purchase')
  await save('selected-landscape')
  await tap(await icon(16))
  await c.until(
    (s) => readHud(s)?.money === 11345 && readHud(s)?.armor === 100 && readHud(s)?.reserve === 90,
    'CT default auto-buy'
  )
  await save('purchased-landscape')
  await tap(await icon(16))
  await c.until(
    (s) => labels(s).includes('Nothing bought: equipment is full or funds are insufficient.'),
    'repeat auto-buy'
  )
  assert.equal(readHud(await c.snapshot()).money, 11345, 'full loadout cannot be charged again')
  await resize(320, 568)
  await tap(await pointForLabel('AUTO BUY'))
  await c.until(
    (s) => labels(s).includes('REBUY') && labels(s).filter((v) => v === 'AUTO BUY').length === 2,
    'portrait auto-buy remains selected in root menu'
  )
  const cart = await icon(16)
  assert.ok(
    cart.top >= 0 && cart.top + cart.height <= 568 && cart.left + cart.width <= 320,
    'portrait cart is in bounds'
  )
  await save('selected-small-portrait')
  await tap(cart)
  assert.equal(readHud(await c.snapshot()).money, 11345)
  await tap(await icon(22))
  await c.until((s) => !labels(s).includes('AUTO BUY'), 'return to play')
  await writeFile(
    `${dir}/checks.json`,
    JSON.stringify(
      { checks, autoBuyCost: 4655, selectionCost: 0, repeatedCost: 0, quickBuysFirst: true, nativeMobile: false },
      null,
      2
    )
  )
  console.log(
    'PASS: CT auto-buy costs $4655, selection/repeat spend nothing, quick buys and cart accessible on small screens'
  )
} finally {
  c.socket.close()
}
