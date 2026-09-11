import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readTextEntities } from './read-scoreboard.mjs'
const runBrowser = promisify(execFile)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function captureScoreboardViewports(client, browserSession, directory) {
  await mkdir(directory, { recursive: true })
  const checks = []
  for (const [width, height] of [[1280, 720], [1024, 768], [1920, 1080]]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await pause(1000)
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 })
    try {
      await pause(300)
      const state = await client.snapshot(), text = readTextEntities(state).map(value => value.UiText.value)
      for (const heading of ['Score', 'Deaths', 'Latency']) assert.ok(text.includes(heading), `${heading} rendered at ${width}x${height}`)
      const scale = Math.min(width / 640, height / 480)
      const panel = Object.values(state).find(value => Math.abs((value.UiTransform?.width ?? 0) - 520 * scale) < 1 && Math.abs((value.UiTransform?.height ?? 0) - 340 * scale) < 1)
      assert.ok(panel, 'reference panel dimensions')
      assert.equal(panel.UiTransform.borderTopLeftRadius, 4 * scale, 'rounded frame scales with the panel')
      await runBrowser('agent-browser', ['--session', browserSession, 'screenshot', join(directory, `scoreboard-${width}x${height}.png`)], { timeout: 45000 })
      checks.push({ width, height, panelWidth: panel.UiTransform.width, panelHeight: panel.UiTransform.height, columns: ['Score', 'Deaths', 'Latency'] })
    } finally {
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 })
    }
  }
  return checks
}
