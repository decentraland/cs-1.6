import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { open, readFile, writeFile, mkdtemp, rm, access, mkdir, cp, symlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { Cdp, preflight, summarize, sceneCommand } from './smoke-support.mjs'

const { values } = parseArgs({
  options: {
    project: { type: 'string', default: fileURLToPath(new URL('../', import.meta.url)) },
    realm: { type: 'string' },
    'bevy-url': { type: 'string', default: 'https://decentraland.org/bevy-web/' },
    browser: { type: 'string' },
    cdp: { type: 'string' },
    scenario: { type: 'string', default: 'ready' },
    timeout: { type: 'string', default: '90' },
    out: { type: 'string' },
    'preflight-only': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' }
  }
})
if (values.help) {
  console.log(`Usage: npm run test:smoke -- [options]
  --realm URL          Reuse an existing local preview instead of starting npm start
  --scenario ready|game  Ready checks boot/menu/frames; game runs the longer encounter regression
  --timeout SECONDS    Total deadline, including setup (default 90; game needs about 240)
  --project PATH       Scene served by that preview (default this repo)
  --browser PATH       Chromium/Brave executable; otherwise discover a local installation
  --cdp ws://...       Reuse a dedicated HEADLESS test browser; create/dispose an isolated context
  --bevy-url URL       Bevy web build (default official hosted build)
  --out PATH          Parent for a unique evidence directory (default OS temp directory)
  --preflight-only    Check dependencies/bundle/server without opening a browser
Default: npm start -- --web --no-browser --no-client --skip-install on a free port; hosted Bevy in muted headless Chromium.
Owned server/browser are closed afterward. No Unity, dependency install, or visible browser is launched.`)
  process.exit(0)
}

const project = resolve(values.project)
const outputParent = resolve(values.out ?? tmpdir())
await mkdir(outputParent, { recursive: true })
const output = await mkdtemp(join(outputParent, 'cs16-smoke-'))
const log = await open(join(output, 'run.log'), 'w')
const writeLog = (message) =>
  log.write(`${new Date().toISOString()} ${message}\n`).catch((error) => {
    console.error(`Cannot write smoke log: ${error.message}`)
  })
const started = Date.now()
const controller = new AbortController()
const { signal } = controller
const result = { status: 'FAIL', scenario: values.scenario, checks: [], artifacts: output }
let step = 'options',
  server,
  previewProject,
  browser,
  profile,
  cdp,
  context,
  regression,
  lock,
  lockPath,
  lastSnapshot
let timer
const interrupt = () => controller.abort(new Error('Interrupted; owned test resources are being closed'))
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
const pause = (ms) => delay(ms, undefined, { signal })
function checked(name, detail) {
  result.checks.push({ name, status: 'PASS', detail })
}
async function until(check, description) {
  for (;;) {
    signal.throwIfAborted()
    if (await check()) return
    await pause(500)
    step = description
  }
}
async function stop(child) {
  if (!child?.pid) return
  const kill = (name) => {
    try {
      if (process.platform === 'win32') child.kill(name)
      else process.kill(-child.pid, name)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  kill('SIGTERM')
  if (child.exitCode === null && child.signalCode === null)
    await Promise.race([new Promise((done) => child.once('exit', done)), delay(1000)])
  if (child.exitCode === null && child.signalCode === null) kill('SIGKILL')
}
async function previewReady(realm) {
  const response = await fetch(new URL('/about', realm), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(1000)])
  })
  if (!response.ok) {
    await response.body?.cancel()
    return false
  }
  const about = await response.json()
  return about.healthy === true && about.comms?.healthy === true
}
function launch(executable, args, cwd = project) {
  const child = spawn(executable, args, {
    cwd,
    detached: process.platform !== 'win32',
    stdio: ['ignore', log.fd, log.fd]
  })
  child.on('error', (error) => controller.abort(error))
  return child
}
try {
  const seconds = Number(values.timeout)
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) throw new Error('--timeout must be 1–600 seconds')
  timer = setTimeout(
    () => controller.abort(new Error(`Deadline exceeded (${seconds}s); no automatic retry`)),
    seconds * 1000
  )
  if (!['ready', 'game'].includes(values.scenario)) throw new Error('--scenario must be ready or game')
  step = 'preflight'
  await preflight(project, false)
  if (values.scenario === 'game' && values.realm) {
    const currentScene = JSON.parse(await readFile(new URL('../scene.json', import.meta.url), 'utf8'))
    const testedScene = JSON.parse(await readFile(join(project, 'scene.json'), 'utf8'))
    if (!testedScene.multiplayerId || testedScene.multiplayerId === currentScene.multiplayerId)
      throw new Error(
        'The game scenario needs --project pointing to a fixture with a different multiplayerId. Ports alone do not isolate matches.'
      )
  }
  if (!values['preflight-only'] || !values.realm) {
    step = 'exclusive browser lease'
    const key = createHash('sha256').update(project).digest('hex').slice(0, 16)
    lockPath = join(tmpdir(), `cs16-smoke-${key}.lock`)
    try {
      lock = await open(lockPath, 'wx')
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      throw new Error(`A runner already owns ${lockPath}. Check its PID before removing a stale lock.`)
    }
    await lock.writeFile(String(process.pid))
  }
  let realmUrl = values.realm
  if (!realmUrl) {
    step = 'prepare isolated preview'
    previewProject = await mkdtemp(join(tmpdir(), 'cs16-smoke-scene-'))
    for (const name of ['src', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'main.crdt']) {
      const source = join(project, name)
      try {
        await cp(source, join(previewProject, name), {
          recursive: true,
          filter: (path) => !basename(path).startsWith('.env')
        })
      } catch (error) {
        if (error.code !== 'ENOENT' || ['src', 'scripts', 'package.json'].includes(name)) throw error
      }
    }
    for (const name of ['assets', 'images']) {
      try {
        await cp(join(project, name), join(previewProject, name), {
          recursive: true,
          mode: constants.COPYFILE_FICLONE,
          filter: (path) => !basename(path).startsWith('.env')
        })
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    for (const name of ['node_modules']) {
      try {
        await access(join(project, name))
        await symlink(
          join(project, name),
          join(previewProject, name),
          process.platform === 'win32' ? 'junction' : 'dir'
        )
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    const scene = JSON.parse(await readFile(join(project, 'scene.json'), 'utf8'))
    scene.multiplayerId = `cs16-smoke-${randomUUID()}`
    scene.worldConfiguration = { ...scene.worldConfiguration, name: `${scene.multiplayerId}.dcl.eth` }
    await writeFile(join(previewProject, 'scene.json'), JSON.stringify(scene, null, 2))
    step = 'npm start'
    const portProbe = createServer()
    await new Promise((resolve, reject) => {
      portProbe.once('error', reject)
      portProbe.listen(0, '127.0.0.1', resolve)
    })
    const port = portProbe.address().port
    await new Promise((resolve) => portProbe.close(resolve))
    server = launch(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['start', '--', '--web', '--no-browser', '--no-client', '--port', String(port), '--skip-install'],
      previewProject
    )
    realmUrl = `http://127.0.0.1:${port}`
    result.server = { owned: true, port, pid: server.pid, project: previewProject, multiplayerId: scene.multiplayerId }
    await until(async () => {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('npm start exited; see run.log')
      try {
        return await previewReady(realmUrl)
      } catch (error) {
        signal.throwIfAborted()
        if (error.cause?.code !== 'ECONNREFUSED' && error.name !== 'TimeoutError') throw error
      }
    }, step)
  } else result.server = { owned: false }
  const realm = new URL(realmUrl)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(realm.hostname) || realm.protocol !== 'http:')
    throw new Error('--realm must be a local HTTP preview')
  if (realm.username || realm.password) throw new Error('Credentials are not accepted in preview URLs')
  const page = new URL(values['bevy-url'])
  page.searchParams.set('preview', 'true')
  page.searchParams.set('realm', realm.origin)
  page.searchParams.set('position', '5,8')
  result.preview = page.href
  step = 'preflight'
  result.environment = await preflight(previewProject ?? project)
  if (!(await previewReady(realm))) throw new Error('Preview /about does not report a healthy realm and comms')
  checked('preflight', result.environment)
  if (!values['preflight-only']) {
    step = 'headless browser'
    let endpoint = values.cdp
    if (!endpoint) {
      const candidates = values.browser
        ? [values.browser]
        : [
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            join(homedir(), 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser'),
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome'
          ]
      let executable
      for (const candidate of candidates) {
        try {
          await access(candidate, constants.X_OK)
          executable = candidate
          break
        } catch (error) {
          if (!['ENOENT', 'EACCES'].includes(error.code)) throw error
        }
      }
      if (!executable) throw new Error('No local Chromium/Brave executable found; supply --browser PATH')
      profile = await mkdtemp(join(tmpdir(), 'cs16-smoke-browser-'))
      browser = launch(executable, [
        '--headless=new',
        '--mute-audio',
        '--enable-unsafe-webgpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1',
        `--user-data-dir=${profile}`,
        'about:blank'
      ])
      await until(async () => {
        if (browser.exitCode !== null || browser.signalCode !== null)
          throw new Error('Headless browser exited during startup')
        try {
          const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n')
          endpoint = `ws://127.0.0.1:${port}${path}`
          return true
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }, step)
    }
    const address = new URL(endpoint)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) || address.protocol !== 'ws:')
      throw new Error('--cdp must be a local dedicated headless browser websocket')
    cdp = new Cdp(endpoint, signal, writeLog)
    await cdp.connect()
    const version = await cdp.send('Browser.getVersion')
    if (!version.userAgent?.includes('HeadlessChrome')) throw new Error('Refusing to automate a non-headless browser')
    result.browser = { product: version.product, revision: version.revision }
    context = (await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })).browserContextId
    await cdp.send('Browser.setPermission', {
      permission: { name: 'loopback-network' },
      setting: 'granted',
      origin: page.origin,
      browserContextId: context
    })
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: context })
    cdp.sessionId = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId
    await cdp.send('Runtime.enable')
    await cdp.send('Log.enable')
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false
    })
    await cdp.send('Page.navigate', { url: page.href })
    checked('headless browser', result.browser)
    step = 'Bevy console / guest login'
    await until(async () => {
      await cdp.evaluate(
        "[...document.querySelectorAll('button')].find(b => b.textContent?.includes('EXPLORE AS GUEST'))?.click()"
      )
      return cdp.evaluate("typeof window.engine_console_command === 'function'")
    }, step)
    checked('Bevy console')
    step = 'scene and connected team menu'
    await until(async () => {
      try {
        await cdp.command(sceneCommand(result.environment.title))
        lastSnapshot = JSON.parse(await cdp.command('/crdt_snapshot'))
        result.state = summarize(lastSnapshot)
        const s = result.state
        return s.canvas?.width > 0 && s.models > 0 && s.teamMenu && !s.connecting && Number.isFinite(s.frame)
      } catch (error) {
        if (!/no scene matching|scene has no thread handle/.test(error.message)) throw error
        await writeLog(error.message)
      }
    }, step)
    checked('scene and connected team menu', result.state)
    step = 'scene frames advance'
    const frame = result.state.frame
    await pause(1000)
    lastSnapshot = JSON.parse(await cdp.command('/crdt_snapshot'))
    result.state = summarize(lastSnapshot)
    if (!(result.state.frame > frame)) throw new Error(`Scene frames stopped at ${frame}`)
    checked('scene frames advance', { before: frame, after: result.state.frame })
    if (values.scenario === 'game') {
      step = 'game encounter regression'
      regression = launch(process.execPath, [
        fileURLToPath(new URL('./game.mjs', import.meta.url)),
        endpoint,
        join(output, 'game.json'),
        '--fresh-page',
        '--target-id',
        targetId,
        '--scene-title',
        result.environment.title
      ])
      await new Promise((resolve, reject) => {
        const aborted = () => reject(signal.reason)
        signal.addEventListener('abort', aborted, { once: true })
        regression.once('exit', (code, killed) => {
          signal.removeEventListener('abort', aborted)
          if (code === 0) resolve()
          else reject(new Error(`Encounter regression exited ${code ?? killed}; see run.log`))
        })
      })
      checked('game encounter regression')
    }
  }
  signal.throwIfAborted()
  result.status = 'PASS'
} catch (error) {
  result.failure = { step, message: signal.aborted ? signal.reason.message : error.message }
  await writeLog(error.stack ?? String(error))
  if (lastSnapshot) await writeFile(join(output, 'snapshot.json'), JSON.stringify(lastSnapshot))
  if (cdp?.sessionId) {
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, cdp.sessionId, true)
      await writeFile(join(output, 'failure.png'), Buffer.from(shot.data, 'base64'))
    } catch (captureError) {
      await writeLog(`Screenshot unavailable: ${captureError.message}`)
    }
  }
} finally {
  clearTimeout(timer)
  const cleanupErrors = []
  for (const cleanup of [
    () => stop(regression),
    async () => {
      if (context) await cdp.send('Target.disposeBrowserContext', { browserContextId: context }, null, true)
    },
    async () => cdp?.close(),
    () => stop(browser),
    () => stop(server),
    async () => {
      if (previewProject) await rm(previewProject, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    },
    async () => {
      if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    },
    async () => {
      if (lock) {
        await lock.close()
        await rm(lockPath)
      }
    }
  ]) {
    try {
      await cleanup()
    } catch (error) {
      cleanupErrors.push(error.message)
    }
  }
  if (cleanupErrors.length) {
    result.status = 'FAIL'
    result.cleanupErrors = cleanupErrors
    result.failure ??= { step: 'cleanup', message: cleanupErrors.join('; ') }
  }
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', interrupt)
  result.durationSeconds = Math.round((Date.now() - started) / 100) / 10
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  await log.close()
  console.log(
    `${result.status} ${result.scenario} (${result.durationSeconds}s) — ${result.checks.length} checks passed`
  )
  if (result.failure) console.log(`${result.failure.step}: ${result.failure.message.slice(0, 700)}`)
  console.log(`Evidence: ${output}`)
  process.exitCode = result.status === 'PASS' ? 0 : 1
}
