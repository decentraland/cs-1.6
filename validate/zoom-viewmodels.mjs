import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/zoom-viewmodels.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(endpoint, 'realm=', 'CS16')
const dir = process.argv[3] ?? 'validate/game/rifle-zoom'
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
function model(s, id) {
  return Object.values(s).find((value) => value.GltfContainer?.src.endsWith('/' + id + '-view.glb'))
}
function zoomSelected(s) {
  const icon = Object.values(s).find(
    (value) =>
      JSON.stringify(value.UiBackground?.texture ?? {}).includes('assets/ui/touch-controls.png') &&
      Math.abs((value.UiBackground?.uvs?.[0] ?? -1) - 5 / 8) < 1e-5 &&
      Math.abs((value.UiBackground?.uvs?.[3] ?? -1) - 1) < 1e-5
  )
  const color = icon && s[icon.UiTransform.parent]?.UiBackground?.color
  return !!color && color.r > 0.9 && color.g < 0.9
}
const results = []
async function save(name, id) {
  const s = await c.snapshot()
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  results.push({
    name,
    visible: model(s, id)?.VisibilityComponent?.visible,
    zoomSelected: zoomSelected(s),
    hud: readHud(s)
  })
}
async function buy(name, id) {
  await tap(await icon(16))
  await c.until((s) => labels(s).includes('RIFLES'), 'buy menu')
  await tap(await pointForLabel('RIFLES'))
  await tap(await pointForLabel(name))
  await tap(await icon(16))
  await tap(await icon(22))
  await c.until(
    (s) => model(s, id)?.GltfContainerLoadingState?.currentState === 4 && model(s, id)?.VisibilityComponent?.visible,
    id + ' loaded',
    30000
  )
  await pause(1800)
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
  await buy('AUG', 'aug')
  await save('aug-unzoomed', 'aug')
  await tap(await icon(5))
  let s = await c.until(zoomSelected, 'AUG zoom selected')
  assert.equal(model(s, 'aug').VisibilityComponent.visible, true, 'AUG visible while zoomed')
  assert.ok(!Object.values(s).some((v) => JSON.stringify(v.UiBackground?.texture ?? {}).includes('sniper-scope.png')))
  await save('aug-zoomed', 'aug')
  const before = readHud(s).clip
  await tap(await icon(0))
  await c.until(
    (s) => readHud(s).clip < before && model(s, 'aug').VisibilityComponent.visible && zoomSelected(s),
    'zoomed AUG fires with model visible'
  )
  await tap(await icon(5))
  await c.until((s) => !zoomSelected(s) && model(s, 'aug').VisibilityComponent.visible, 'AUG unzoomed')
  await buy('AWP', 'awp')
  await tap(await icon(5))
  await c.until(
    (s) =>
      zoomSelected(s) &&
      model(s, 'awp').VisibilityComponent.visible === false &&
      Object.values(s).some((v) => JSON.stringify(v.UiBackground?.texture ?? {}).includes('sniper-scope.png')),
    'AWP scope hides only the sniper model'
  )
  await save('awp-scoped', 'awp')
  await tap(await icon(5))
  await pause(400)
  await tap(await icon(5))
  await c.until(
    (s) => !zoomSelected(s) && model(s, 'awp').VisibilityComponent.visible,
    'AWP manual unzoom restores model'
  )
  await writeFile(
    `${dir}/checks.json`,
    JSON.stringify(
      { results, augZoomedFire: true, awpUnzoomRestored: true, nativeMobile: false, magnificationVerified: false },
      null,
      2
    )
  )
  console.log('PASS: AUG zoom icon keeps model visible while firing; AWP scope hides it and unzoom restores it')
} finally {
  c.socket.close()
}
