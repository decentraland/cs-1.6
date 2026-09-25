import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/nightvision.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(endpoint, 'realm=', 'CS16'),
  dir = process.argv[3] ?? 'validate/game/nightvision'
await mkdir(dir, { recursive: true })
function point(s, id) {
  const rect = s[id].UiTransform
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
  return { x: x + rect.width / 2, y: y + rect.height / 2 }
}
async function tapLabel(value) {
  const s = await c.snapshot(),
    el = Object.values(s).find((v) => v.UiText?.value === value)
  assert.ok(el, value)
  await tap(point(s, el.UiTransform.parent))
}
async function tap(p) {
  await c.click(p.x, p.y)
  await pause(350)
}
async function tapIcon(index) {
  const s = await c.snapshot(),
    x = (index % 8) / 8,
    y = 1 - Math.floor(index / 8) / 3
  const el = Object.values(s).find(
    (v) =>
      JSON.stringify(v.UiBackground?.texture ?? {}).includes('assets/ui/touch-controls.png') &&
      v.UiBackground?.uvs &&
      Math.abs(v.UiBackground.uvs[0] - x) < 1e-5 &&
      Math.abs(v.UiBackground.uvs[3] - y) < 1e-5
  )
  assert.ok(el, 'icon ' + index)
  await tap(point(s, el.UiTransform.parent))
}
async function goggles() {
  const s = await c.snapshot(),
    el = Object.values(s).find((v) => JSON.stringify(v.UiBackground ?? {}).includes('nightvision.png'))
  assert.ok(el, 'owned goggles icon')
  return point(s, el.UiTransform.parent)
}
function tint(s) {
  return Object.values(s).find((v) => {
    const color = v.UiBackground?.color
    return color && Math.abs(color.r - 50 / 255) < 1e-5 && Math.abs(color.g - 225 / 255) < 1e-5
  })?.UiBackground.color.a
}
function adjustment(s, up) {
  for (const [id, value] of Object.entries(s)) {
    if (!value.PointerEvents) continue
    const bars = Object.values(s).filter(
      (v) =>
        String(v.UiTransform?.parent) === id &&
        v.UiBackground?.color &&
        !v.UiBackground?.texture &&
        (v.UiTransform.width < 10 || v.UiTransform.height < 10)
    )
    if (bars.length === (up ? 2 : 1)) return point(s, id)
  }
  assert.fail('nightvision adjustment ' + (up ? 'up' : 'down'))
}
const lights = (s) =>
  Object.values(s)
    .filter((v) => v.LightSource)
    .map((v) => ({ light: v.LightSource, transform: v.Transform }))
async function record(name) {
  const s = await c.snapshot(),
    { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  await writeFile(
    `${dir}/${name}.json`,
    JSON.stringify({ hud: readHud(s), lights: lights(s), labels: labels(s), tintAlpha: tint(s) }, null, 2)
  )
  return s
}
try {
  await c.connect()
  for (let i = 0; i < 50; i++) {
    if (await c.evaluate('typeof window.engine_console_command==="function"')) break
    await pause(1000)
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false })
  await c.until((s) => labels(s).includes('CT FORCES') && !labels(s).includes('CONNECTING...'), 'team menu', 30000, 500)
  await c.evaluate(
    `(()=>{for(const canvas of document.querySelectorAll('canvas')){let el=canvas;while(el.parentElement){for(const sibling of el.parentElement.children)if(sibling!==el&&sibling.tagName!=='STYLE'&&sibling.tagName!=='SCRIPT')sibling.style.visibility='hidden';el=el.parentElement}}})()`
  )
  await tapLabel('CT FORCES')
  await c.until((s) => readHud(s)?.health === 100 && !labels(s).includes('CT FORCES'), 'joined')
  await c.evaluate('document.exitPointerLock()')
  await c.click(790, 361)
  await tapIcon(16)
  await tapLabel('EQUIPMENT')
  await tapLabel('NIGHTVISION')
  await tapIcon(16)
  await c.until((s) => readHud(s)?.money === 14750, 'nightvision purchase')
  await tapLabel('NIGHTVISION')
  await tapIcon(16)
  assert.equal(readHud(await c.snapshot()).money, 14750, 'owned cannot rebuy')
  await tapIcon(22)
  await pause(1200)
  const off = await record('off')
  assert.equal(lights(off).length, 0)
  await tap(await goggles())
  await c.until((s) => lights(s).length === 1, 'nightvision point light')
  await pause(500)
  const on = await record('on')
  assert.ok(lights(on)[0].light.range >= 18.75)
  assert.ok(Math.abs(tint(on) - 110 / 255) < 1e-5)
  await tap(adjustment(on, true))
  await c.until((s) => Math.abs(tint(s) - 130 / 255) < 1e-5, 'brightness increases')
  await record('brighter')
  await tap(adjustment(await c.snapshot(), false))
  await c.until((s) => Math.abs(tint(s) - 110 / 255) < 1e-5, 'brightness decreases')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await pause(1200)
  await record('portrait')
  await tap(await goggles())
  await c.until((s) => lights(s).length === 0, 'light removed')
  await record('off-again')
  console.log(
    'PASS nightvision: $16000 -> $14750; duplicate blocked; goggles created one local light; brightness 110 -> 130 -> 110; portrait controls; light removed on toggle off'
  )
} finally {
  c.socket.close()
}
