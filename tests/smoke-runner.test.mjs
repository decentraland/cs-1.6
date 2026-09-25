import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm, access, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const runner = fileURLToPath(new URL('../validate/smoke.mjs', import.meta.url))

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cs16-runner-test-'))
  const project = join(root, 'scene')
  for (const directory of ['src', 'scripts', 'assets', 'bin', 'node_modules/@dcl/sdk', 'node_modules/@dcl/js-runtime'])
    await mkdir(join(project, directory), { recursive: true })
  for (const [path, data] of Object.entries({
    'package.json': { devDependencies: { '@dcl/js-runtime': '1.0.0' }, scripts: { start: 'node scripts/preview.mjs' } },
    'scene.json': { display: { title: 'Counter-Strike Test' }, main: 'bin/index.js' },
    'node_modules/@dcl/sdk/package.json': { version: '1.0.0' },
    'node_modules/@dcl/js-runtime/package.json': { version: options.mismatch ? '0.9.0' : '1.0.0' }
  }))
    await writeFile(join(project, path), JSON.stringify(data))
  await writeFile(join(project, 'src/index.ts'), 'export {}')
  await writeFile(join(project, 'bin/index.js'), '/* fixture bundle */')
  await utimes(join(project, 'src/index.ts'), 1, 1)
  await writeFile(
    join(project, 'scripts/preview.mjs'),
    `
import { createServer } from 'node:http'
import { writeFileSync, mkdirSync, lstatSync } from 'node:fs'
const args = process.argv.slice(2)
if (!lstatSync('assets').isDirectory()) throw new Error('SDK asset discovery requires a real directory')
writeFileSync(${JSON.stringify(join(project, 'started.json'))}, JSON.stringify({ args, pid: process.pid }))
mkdirSync('bin', { recursive: true })
writeFileSync('bin/index.js', '/* fixture bundle */')
createServer((req, res) => {
  if (req.url === '/about') res.end(JSON.stringify({healthy:true,comms:{healthy:true}}))
  else { res.statusCode=404; res.end('not found') }
}).listen(Number(args[args.indexOf('--port') + 1]), '127.0.0.1')
`
  )
  const server = createServer((req, res) => {
    if (req.url === '/about') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ healthy: !options.unhealthy, comms: { healthy: true } }))
      return
    }
    res.setHeader('Content-Type', 'text/html')
    res.end(`<script>
window.engine_console_command = async (command) => command.includes('/set_scene') ? 'selected' : JSON.stringify({
  0: { UiCanvasInformation: {width:1280,height:720}, EngineInfo: {frameNumber: Date.now()} },
  10: { GltfContainer: {src:'assets/dust2.glb'} }, 11: { UiText: {value:'Select a team'} }
})
</script>`)
  })
  const wss = new WebSocketServer({ server })
  const methods = []
  let snapshots = 0
  wss.on('connection', (socket) =>
    socket.on('message', (bytes) => {
      const request = JSON.parse(bytes.toString())
      methods.push(request)
      if (request.method === options.hang) return
      let result = {}
      switch (request.method) {
        case 'Browser.getVersion':
          result = { userAgent: options.headed ? 'Chrome' : 'HeadlessChrome', product: 'Test Chromium' }
          break
        case 'Target.createBrowserContext':
          result = { browserContextId: 'owned-context' }
          break
        case 'Target.createTarget':
          result = { targetId: 'owned-target' }
          break
        case 'Target.attachToTarget':
          result = { sessionId: 'owned-session' }
          break
        case 'Runtime.evaluate': {
          const expression = request.params.expression
          let value = null
          if (expression.includes('typeof window.engine_console_command')) value = true
          else if (expression.includes('/set_scene')) {
            const command = JSON.parse(expression.slice(expression.indexOf('(') + 1, -1))
            if (command.split(/\s+/).length !== 2) {
              socket.send(
                JSON.stringify({
                  id: request.id,
                  result: { exceptionDetails: { text: 'unexpected argument; /set_scene accepts one unquoted pattern' } }
                })
              )
              return
            }
            value = 'active scene selected'
          } else if (expression.includes('/crdt_snapshot')) {
            snapshots++
            value = JSON.stringify({
              0: {
                UiCanvasInformation: { width: 1280, height: 720 },
                EngineInfo: { frameNumber: options.stalled ? 1 : snapshots }
              },
              10: { GltfContainer: { src: 'assets/dust2.glb' } },
              11: { UiText: { value: options.connecting ? 'CONNECTING...' : 'Select a team' } }
            })
          }
          result = { result: { value } }
          break
        }
        case 'Page.captureScreenshot':
          result = { data: Buffer.from('test screenshot').toString('base64') }
          break
      }
      socket.send(JSON.stringify({ id: request.id, result }))
    })
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  t.after(async () => {
    for (const client of wss.clients) client.terminate()
    await new Promise((resolve) => wss.close(resolve))
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  async function run(extra = [], startServer = false) {
    const child = spawn(
      process.execPath,
      [
        runner,
        '--project',
        project,
        ...(startServer ? [] : ['--realm', `http://127.0.0.1:${port}`]),
        ...(options.realBrowser
          ? ['--browser', options.realBrowser, '--bevy-url', `http://127.0.0.1:${port}`]
          : ['--cdp', `ws://127.0.0.1:${port}`]),
        '--timeout',
        '5',
        '--out',
        root,
        ...extra
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stdout = '',
      stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    const safety = setTimeout(() => child.kill('SIGKILL'), options.realBrowser ? 35000 : 10000)
    const code = await new Promise((resolve, reject) => {
      child.once('exit', resolve)
      child.once('error', reject)
    })
    clearTimeout(safety)
    assert.equal(stderr, '', stderr)
    const output = stdout.match(/Evidence: (.+)/)?.[1]
    assert.ok(output, `Runner writes a compact result instead of hanging: ${stdout}`)
    return { code, stdout, output, report: JSON.parse(await readFile(join(output, 'result.json'), 'utf8')) }
  }
  return { run, methods, project }
}

test('ready run reports bounded output and disposes only its own context', async (t) => {
  const f = await fixture(t)
  const r = await f.run()
  assert.equal(r.code, 0)
  assert.equal(r.report.status, 'PASS')
  assert.equal(r.report.checks.length, 5)
  assert.ok(r.report.state.frame > 1)
  assert.equal(r.report.environment.bundleSha256.length, 64)
  assert.ok(r.stdout.length < 1000)
  assert.equal(f.methods.filter((m) => m.method === 'Target.createTarget').length, 1)
  assert.deepEqual(f.methods.find((m) => m.method === 'Target.disposeBrowserContext').params, {
    browserContextId: 'owned-context'
  })
  assert.ok(!f.methods.some((m) => ['Browser.close', 'Target.getTargets'].includes(m.method)))
  assert.equal(f.methods.find((m) => m.method === 'Browser.setPermission').params.browserContextId, 'owned-context')
  await assert.rejects(access(join(r.output, 'failure.png')), { code: 'ENOENT' })
  const repeated = await f.run()
  assert.equal(repeated.code, 0, 'lease is released for the next run')
  assert.notEqual(repeated.output, r.output, 'evidence is never overwritten')
})

test('dependency mismatch fails before any browser contact', async (t) => {
  const f = await fixture(t, { mismatch: true })
  const r = await f.run()
  assert.equal(r.code, 1)
  assert.match(r.report.failure.message, /Dependency mismatch/)
  assert.equal(r.report.failure.step, 'preflight')
  assert.equal(f.methods.length, 0)
})

test('stale bundle fails before launching a browser', async (t) => {
  const f = await fixture(t)
  const future = new Date(Date.now() + 10000)
  await utimes(join(f.project, 'src/index.ts'), future, future)
  const r = await f.run()
  assert.equal(r.code, 1)
  assert.match(r.report.failure.message, /older than src/)
  assert.equal(f.methods.length, 0)
})

test('stopped scene frames fail with evidence and cleanup', async (t) => {
  const f = await fixture(t, { stalled: true })
  const r = await f.run()
  assert.equal(r.code, 1)
  assert.equal(r.report.failure.step, 'scene frames advance')
  assert.match(r.report.failure.message, /frames stopped/)
  await access(join(r.output, 'snapshot.json'))
  await access(join(r.output, 'failure.png'))
  assert.ok(f.methods.some((m) => m.method === 'Target.disposeBrowserContext'))
})

test('unresponsive CDP obeys the total deadline and cleans up', async (t) => {
  const f = await fixture(t, { hang: 'Runtime.evaluate' })
  const r = await f.run(['--timeout', '1'])
  assert.equal(r.code, 1)
  assert.match(r.report.failure.message, /Deadline exceeded/)
  assert.ok(r.report.durationSeconds < 4)
  assert.ok(f.methods.some((m) => m.method === 'Target.disposeBrowserContext'))
})

test('a disconnected scene does not pass just because Bevy opened', async (t) => {
  const f = await fixture(t, { connecting: true })
  const r = await f.run(['--timeout', '1'])
  assert.equal(r.code, 1)
  assert.equal(r.report.failure.step, 'scene and connected team menu')
  assert.ok(f.methods.some((m) => m.method === 'Target.disposeBrowserContext'))
})

test('refuses a visible browser without creating or changing any tabs', async (t) => {
  const f = await fixture(t, { headed: true })
  const r = await f.run()
  assert.equal(r.code, 1)
  assert.match(r.report.failure.message, /non-headless/)
  assert.deepEqual(
    f.methods.map((m) => m.method),
    ['Browser.getVersion']
  )
})

test('default starts npm web preview on a free port and stops its process tree', async (t) => {
  const f = await fixture(t)
  const r = await f.run([], true)
  assert.equal(r.code, 0)
  assert.equal(r.report.server.owned, true)
  assert.match(r.report.server.multiplayerId, /^cs16-smoke-/)
  await assert.rejects(access(r.report.server.project), { code: 'ENOENT' })
  const started = JSON.parse(await readFile(join(f.project, 'started.json'), 'utf8'))
  assert.deepEqual(started.args.slice(0, 4), ['--web', '--no-browser', '--no-client', '--port'])
  assert.equal(Number(started.args[4]), r.report.server.port)
  assert.ok(started.args.includes('--skip-install'), 'SDK must reuse the verified dependencies')
  assert.equal(new URL(r.report.preview).origin, 'https://decentraland.org')
  assert.equal(new URL(r.report.preview).searchParams.get('realm'), `http://127.0.0.1:${r.report.server.port}`)
  if (process.platform !== 'win32') assert.throws(() => process.kill(started.pid, 0), { code: 'ESRCH' })
  await assert.rejects(fetch(`http://127.0.0.1:${r.report.server.port}`))
})

test(
  'owned headless Chromium completes the fixture and exits',
  { skip: !process.env.CS16_SMOKE_BROWSER },
  async (t) => {
    const f = await fixture(t, { realBrowser: process.env.CS16_SMOKE_BROWSER })
    const r = await f.run(['--timeout', '20'])
    assert.equal(r.code, 0, JSON.stringify(r.report.failure))
    assert.equal(r.report.status, 'PASS')
    assert.ok(r.report.browser.product.includes('Chrome'))
    assert.equal(f.methods.length, 0, 'real Chromium handled CDP instead of the fixture server')
  }
)

test('unhealthy realm fails preflight before contacting the browser', async (t) => {
  const f = await fixture(t, { unhealthy: true })
  const r = await f.run()
  assert.equal(r.code, 1)
  assert.match(r.report.failure.message, /healthy realm and comms/)
  assert.equal(f.methods.length, 0)
})
