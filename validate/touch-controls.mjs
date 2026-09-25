import assert from 'node:assert/strict'
import { Client, pause, labels, readHud } from './team-client.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const endpoint = process.argv[2]
assert.ok(endpoint, 'Usage: node validate/touch-controls.mjs <browser-CDP-websocket> <output-directory>')
const c = new Client(endpoint, 'realm=', 'CS16')
const dir = process.argv[3] ?? 'validate/game/touch-controls'
await mkdir(dir, { recursive: true })
const checks = []
const record = async (name) => {
  const s = await c.snapshot()
  await writeFile(
    `${dir}/${name}.json`,
    JSON.stringify({ canvas: s['0']?.UiCanvasInformation, hud: readHud(s), labels: labels(s) }, null, 2)
  )
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
  return s
}
const clickLabel = async (label) => {
  const s = await c.snapshot()
  const row = Object.entries(s).find(([id, v]) => v.UiText?.value === label)
  assert.ok(row, `label exists: ${label}`)
  let id = row[1].UiTransform.parent,
    t = s[id].UiTransform
  const w = t.width,
    h = t.height
  let x = 0,
    y = 0
  const seen = new Set()
  while (id && !seen.has(id)) {
    seen.add(id)
    t = s[id]?.UiTransform
    if (!t) break
    x += t.positionLeft ?? 0
    y += t.positionTop ?? 0
    id = t.parent
  }
  await c.click(x + w / 2, y + h / 2)
  await pause(400)
}
try {
  await c.connect()
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await pause(900)
  // Hide the hosted web shell for the mobile scene layout check.
  await c.evaluate(
    `(()=>{for(const canvas of document.querySelectorAll('canvas')){let el=canvas;while(el.parentElement){for(const sibling of el.parentElement.children)if(sibling!==el&&sibling.tagName!=='STYLE'&&sibling.tagName!=='SCRIPT')sibling.style.visibility='hidden';el=el.parentElement}}})()`
  )
  await c.until(
    (s) => labels(s).includes('CT FORCES') && !labels(s).includes('CONNECTING...'),
    'connected team menu',
    20000
  )
  await c.click(1280 - 55, 720 * 0.95 - 10)
  await record('team-landscape')
  await clickLabel('CT FORCES')
  await c.until((s) => readHud(s)?.health === 100 && labels(s).includes('BUY'), 'joined CT', 20000)
  await record('controls-landscape')
  await clickLabel('BUY')
  await c.until((s) => labels(s).some((v) => v.startsWith('BUY   $')), 'buy root')
  await clickLabel('RIFLES')
  await c.until((s) => labels(s).includes('M4A1'), 'rifles')
  await record('rifles-landscape')
  await clickLabel('M4A1')
  await c.until((s) => readHud(s)?.money === 12900, 'M4A1 purchase')
  const purchased = await record('m4a1-owned')
  assert.equal(readHud(purchased).clip, 30)
  const notices = Object.values(purchased).filter((v) => v.UiText?.value === 'Bought M4A1.')
  assert.equal(notices.length, 1, 'purchase notice appears once')
  assert.ok(notices[0].UiTransform.positionTop > 600, 'purchase notice stays below menu buttons')
  await clickLabel('M4A1')
  const disabled = await c.snapshot()
  assert.ok(labels(disabled).includes('M4A1'))
  assert.equal(readHud(disabled).money, 12900)
  assert.equal(readHud(disabled).clip, 30)
  checks.push('Bought M4A1 for $3100; owned item tap kept menu open and did not spend money or fire')
  await clickLabel('BACK')
  await c.until((s) => labels(s).includes('PRIMARY AMMO') && labels(s).includes('$180'), 'ammo fill quote')
  await record('ammo-price')
  await clickLabel('PRIMARY AMMO')
  await c.until((s) => readHud(s).money === 12720 && readHud(s).reserve === 90, 'M4 reserve filled for $180')
  await clickLabel('PRIMARY AMMO')
  assert.equal(readHud(await c.snapshot()).money, 12720, 'full primary reserve ignores another tap')
  assert.ok(labels(await c.snapshot()).includes('$175'), 'USP quote buys seven packs from 24 to 100')
  await clickLabel('SECONDARY AMMO')
  await c.until((s) => readHud(s).money === 12545, 'USP reserve filled for $175')
  await record('ammo-filled')
  await clickLabel('CLOSE')
  await c.until((s) => labels(s).includes('RELOAD'), 'closed menu')
  await clickLabel('PISTOL')
  await c.until((s) => readHud(s).clip === 12 && readHud(s).reserve === 100, 'USP magazine unchanged; reserve full')
  await clickLabel('PRIMARY')
  await c.until((s) => readHud(s).clip === 30 && readHud(s).reserve === 90, 'M4 magazine unchanged; reserve full')
  checks.push('Ammo menu filled M4 reserve 0→90 for $180 and USP 24→100 for $175; full-reserve tap spent nothing')
  await clickLabel('KNIFE')
  await c.until((s) => labels(s).includes('SLASH') && labels(s).includes('STAB'), 'knife selected')
  await clickLabel('PRIMARY')
  await c.until((s) => labels(s).includes('UNSILENCE') || labels(s).includes('SILENCER'), 'primary selected')
  const s = await c.snapshot()
  const alternate = labels(s).includes('SILENCER') ? 'SILENCER' : 'UNSILENCE'
  await clickLabel(alternate)
  await c.until(
    (s) => labels(s).includes(alternate === 'SILENCER' ? 'UNSILENCE' : 'SILENCER'),
    'alternate toggled',
    6000
  )
  checks.push('Slot buttons selected knife and M4A1; dedicated alternate toggled silencer')
  await clickLabel('BUY')
  await c.until((s) => labels(s).includes('RIFLES'), 'buy root before FAMAS')
  await clickLabel('RIFLES')
  await c.until((s) => labels(s).includes('FAMAS'), 'FAMAS row')
  await clickLabel('FAMAS')
  await c.until((s) => readHud(s).money === 10295, 'FAMAS purchased')
  await clickLabel('CLOSE')
  await c.until((s) => labels(s).includes('BURST'), 'FAMAS full-auto controls')
  await pause(900)
  await clickLabel('BURST')
  await c.until((s) => labels(s).includes('AUTO'), 'FAMAS burst mode offers AUTO')
  await record('famas-burst')
  await clickLabel('AUTO')
  await c.until((s) => labels(s).includes('BURST'), 'FAMAS returned to full-auto')
  assert.ok(!labels(await c.snapshot()).includes('SEMI'), 'FAMAS never offers semi-auto')
  checks.push('Purchase notice stays below menu buttons; FAMAS switches BURST/AUTO with correct labels')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false })
  await pause(800)
  const phone = await record('controls-phone-landscape')
  assert.ok(
    !labels(phone).some((v) => v.includes('1: Primary') || v.includes('Shift+3')),
    'mobile must hide desktop keyboard hints'
  )
  for (const name of ['PRIMARY', 'GRENADE']) {
    const label = Object.values(phone).find((v) => v.UiText?.value === name)
    assert.equal(label?.UiText.textWrap, 1, `${name} must stay on one line`)
  }
  await clickLabel('BUY')
  await c.until((s) => labels(s).includes('RIFLES'), 'phone buy root')
  await record('buy-phone-landscape')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await pause(800)
  await record('buy-phone-portrait')
  await clickLabel('CLOSE')
  await c.until((s) => labels(s).includes('RELOAD'), 'portrait close')
  await record('controls-phone-portrait')
  checks.push('Rendered controls and buy menu at 1280x720, 844x390 and 390x844')
  await writeFile(
    `${dir}/checks.json`,
    JSON.stringify(
      {
        checks,
        limitations: [
          'forced mobile layout in Bevy; native held/multitouch not tested',
          'fixture $16000, 1h round/buy window, bots paused'
        ]
      },
      null,
      2
    )
  )
  console.log(checks)
} catch (error) {
  await record('failure').catch((captureError) => console.error('Failure capture:', captureError))
  console.error(error)
  process.exitCode = 1
} finally {
  c.socket.close()
}
