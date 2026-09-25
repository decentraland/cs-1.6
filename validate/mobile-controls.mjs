import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/mobile-controls.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(endpoint, 'realm=', 'CS16')
const dir = process.argv[3] ?? 'validate/game/mobile-controls'
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
async function capture(name) {
  const [width, height] = await c.evaluate('[innerWidth, innerHeight]')
  await c.evaluate('document.exitPointerLock()')
  await c.click(width - 55, height * 0.95 - 10)
  await pause(250)
  const s = await c.snapshot(),
    { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  await writeFile(
    `${dir}/${name}.json`,
    JSON.stringify({ hud: readHud(s), labels: labels(s), locomotion: s['1']?.AvatarLocomotionSettings }, null, 2)
  )
  return s
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
  await c.until((s) => readHud(s)?.health === 100 && !labels(s).includes('CT FORCES'), 'joined CT', 15000)
  await tap(await icon(16))
  await c.until((s) => labels(s).includes('RIFLES'), 'buy menu')
  await tap(await pointForLabel('RIFLES'))
  await tap(await pointForLabel('M4A1'))
  assert.equal(readHud(await c.snapshot()).money, 16000, 'selecting a row cannot spend money')
  await tap(await icon(16))
  await c.until((s) => readHud(s)?.money === 12900, 'bought M4')
  await tap(await icon(22))
  await pause(8000)
  let s = await c.snapshot()
  assert.equal(readHud(s).clip, 30, 'menu and icon taps never fire')
  assert.ok(
    Object.values(s).every((value) => !value.UiInputBinding?.actions?.length),
    'Use the fixture with --no-native-bindings'
  )
  const fire = await icon(0)
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fire.x, y: fire.y })
  await c.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: fire.x,
    y: fire.y,
    button: 'left',
    clickCount: 1
  })
  await pause(650)
  await c.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: fire.x,
    y: fire.y,
    button: 'left',
    clickCount: 1
  })
  await pause(1500)
  const after = readHud(await c.snapshot()).clip
  assert.ok(after < 30 && after >= 20, 'held UI FIRE consumes finite ammo: ' + after)
  await pause(700)
  assert.equal(readHud(await c.snapshot()).clip, after, 'release stops firing')
  console.log('PASS direct FIRE with native bindings disabled: 30 -> ' + after + '; release stopped fire')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false })
  await pause(1200)
  await tap(await icon(4))
  s = await c.until((s) => s['1']?.AvatarLocomotionSettings?.jogSpeed < 4, 'walk speed latched')
  const walking = s['1'].AvatarLocomotionSettings.jogSpeed
  await pause(700)
  assert.equal((await c.snapshot())['1'].AvatarLocomotionSettings.jogSpeed, walking)
  await capture('landscape-walking')
  await tap(await icon(3))
  s = await c.until((s) => s['1']?.AvatarLocomotionSettings?.jogSpeed > 4, 'run restored')
  console.log('PASS walk/run toggle: ' + walking + ' -> ' + s['1'].AvatarLocomotionSettings.jogSpeed + ' m/s')
  await capture('landscape-running')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await pause(1200)
  await capture('portrait')
  await writeFile(
    `${dir}/checks.json`,
    JSON.stringify(
      {
        nativeBindings: false,
        clipBefore: 30,
        clipAfter: after,
        walkingSpeed: walking,
        releaseStopped: true,
        viewports: [
          [844, 390],
          [390, 844]
        ]
      },
      null,
      2
    )
  )
  console.log('PASS icon controls rendered in both orientations; saved ' + dir)
} finally {
  c.socket.close()
}
