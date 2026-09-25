import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/rebuy.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(endpoint, 'realm=', 'CS16')
const dir = process.argv[3] ?? 'validate/game/rebuy'
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
  const snapshot = await c.snapshot()
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  checks.push({
    name,
    hud: readHud(snapshot),
    notices: labels(snapshot).filter((text) => /Rebought|saved equipment/.test(text))
  })
}
async function selectBuy(text) {
  await tap(await pointForLabel(text))
  await tap(await icon(16))
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

  await tap(await icon(16))
  await tap(await pointForLabel('RIFLES'))
  await selectBuy('M4A1')
  await tap(await pointForLabel('BACK'))
  await selectBuy('PRIMARY AMMO')
  await tap(await icon(22))
  await c.until((s) => readHud(s)?.clip === 30 && readHud(s)?.reserve === 90, 'M4 ready with ammo')
  await pause(1800)
  const fire = await icon(0)
  await c.click(fire.x, fire.y, 550)
  await pause(500)
  let hud = readHud(await c.snapshot())
  assert.ok(hud.clip < 30 && hud.clip > 0, 'touch FIRE spends ammo')
  const roundsFired = 30 - hud.clip
  await tap(await icon(1))
  await c.until((s) => readHud(s)?.clip === 30 && readHud(s)?.reserve === 90 - roundsFired, 'reload transfers reserve')
  await tap(await icon(16))
  const funds = readHud(await c.snapshot()).money
  await tap(await pointForLabel('REBUY'))
  assert.equal(readHud(await c.snapshot()).money, funds, 'selecting REBUY spends nothing')
  await save('selected-landscape')
  await tap(await icon(16))
  await c.until(
    (s) => readHud(s)?.money === funds - 60 && readHud(s)?.reserve === 90,
    'rebuy restores reserve for one pack'
  )
  await save('purchased-landscape')
  await tap(await icon(16))
  await c.until((s) => labels(s).includes('You already have the saved equipment.'), 'repeat rebuy does not spend')
  assert.equal(readHud(await c.snapshot()).money, funds - 60)
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await pause(500)
  await tap(await pointForLabel('REBUY'))
  await save('selected-portrait')
  await tap(await icon(16))
  assert.equal(readHud(await c.snapshot()).money, funds - 60)
  await tap(await icon(22))
  await c.until((s) => !labels(s).includes('REBUY'), 'cart closes back to play')
  await writeFile(
    `${dir}/checks.json`,
    JSON.stringify(
      { checks, roundsFired, rebuyCost: 60, selectionCost: 0, repeatedCost: 0, nativeMobile: false },
      null,
      2
    )
  )
  console.log('PASS: touch FIRE/reload, rebuy selection/cart, ammo charge, duplicate rebuy and portrait layout')
} finally {
  c.socket.close()
}
