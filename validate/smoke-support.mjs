import { readFile, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export function sceneCommand(title) {
  const prefix = title.trim().split(/\s+/)[0]
  if (!prefix) throw new Error('Scene title is empty')
  return '/set_scene ' + prefix
}

export async function preflight(project, checkBundle = true) {
  const json = async (path) => JSON.parse(await readFile(join(project, path), 'utf8'))
  const manifest = await json('package.json')
  const scene = await json('scene.json')
  const sdk = await json('node_modules/@dcl/sdk/package.json')
  const runtime = await json('node_modules/@dcl/js-runtime/package.json')
  if (sdk.version !== runtime.version)
    throw new Error(
      `Dependency mismatch: SDK ${sdk.version}, runtime ${runtime.version}. Align the installed dependencies first.`
    )
  const requested = manifest.devDependencies?.['@dcl/js-runtime']
  if (requested !== runtime.version)
    throw new Error(
      `Installed runtime ${runtime.version} differs from package.json (${requested}). Install the selected dependencies first.`
    )
  if (!checkBundle) return { sdk: sdk.version, runtime: runtime.version, title: scene.display.title }
  const bundle = join(project, scene.main)
  const built = await stat(bundle)
  async function newest(directory) {
    let latest = 0
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.env')) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) latest = Math.max(latest, await newest(path))
      else if (entry.isFile()) latest = Math.max(latest, (await stat(path)).mtimeMs)
    }
    return latest
  }
  if ((await newest(join(project, 'src'))) > built.mtimeMs)
    throw new Error('The scene bundle is older than src/. Run npm run build before the browser check.')
  return {
    sdk: sdk.version,
    runtime: runtime.version,
    title: scene.display.title,
    bundleSha256: createHash('sha256')
      .update(await readFile(bundle))
      .digest('hex'),
    bundleBuiltAt: built.mtime.toISOString()
  }
}

export function summarize(snapshot) {
  const entities = Object.values(snapshot)
  const labels = entities.flatMap((e) => (e.UiText?.value ? [e.UiText.value] : []))
  const canvas = snapshot['0']?.UiCanvasInformation
  return {
    entities: entities.length,
    frame: snapshot['0']?.EngineInfo?.frameNumber,
    canvas: canvas && { width: canvas.width, height: canvas.height },
    models: entities.filter((e) => e.GltfContainer?.src?.startsWith('assets/')).length,
    teamMenu: labels.includes('Select a team') || labels.includes('CT FORCES'),
    connecting: labels.some((label) => /connecting/i.test(label)),
    labels: labels.slice(0, 60)
  }
}

export class Cdp {
  pending = new Map()
  nextId = 0
  sessionId
  constructor(endpoint, signal, log) {
    this.signal = signal
    this.log = log
    this.socket = new WebSocket(endpoint)
    this.socket.addEventListener('message', ({ data }) => {
      const response = JSON.parse(data)
      const entry = this.pending.get(response.id)
      if (entry) {
        if (response.error) entry.reject(new Error(JSON.stringify(response.error)))
        else entry.resolve(response.result)
      } else if (response.method === 'Runtime.exceptionThrown' || response.method === 'Log.entryAdded') {
        log(JSON.stringify(response))
      } else if (response.method === 'Runtime.consoleAPICalled') {
        log(JSON.stringify({ type: response.params.type, args: response.params.args }))
      }
    })
    this.socket.addEventListener('close', () => this.rejectPending(new Error('Browser CDP connection closed')))
    this.socket.addEventListener('error', () => this.rejectPending(new Error('Browser CDP connection failed')))
    this.abort = () => this.rejectPending(signal.reason)
    signal.addEventListener('abort', this.abort, { once: true })
  }
  async connect() {
    this.signal.throwIfAborted()
    if (this.socket.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer)
        this.socket.removeEventListener('open', opened)
        this.socket.removeEventListener('error', failed)
        this.signal.removeEventListener('abort', aborted)
        if (error) reject(error)
        else resolve()
      }
      const opened = () => finish()
      const failed = () => finish(new Error('Cannot connect to the browser CDP endpoint'))
      const aborted = () => finish(this.signal.reason)
      const timer = setTimeout(() => finish(new Error('Browser CDP connection timed out')), 5000)
      this.socket.addEventListener('open', opened, { once: true })
      this.socket.addEventListener('error', failed, { once: true })
      this.signal.addEventListener('abort', aborted, { once: true })
    })
  }
  rejectPending(error) {
    for (const entry of this.pending.values()) entry.reject(error)
  }
  send(method, params = {}, sessionId = this.sessionId, cleanup = false) {
    if (!cleanup) this.signal.throwIfAborted()
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Browser CDP is not open'))
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const finish = (error, result) => {
        clearTimeout(timer)
        this.pending.delete(id)
        if (error) reject(error)
        else resolve(result)
      }
      const timer = setTimeout(() => finish(new Error(`${method} timed out`)), cleanup ? 1000 : 5000)
      this.pending.set(id, { resolve: (value) => finish(null, value), reject: finish })
      this.socket.send(JSON.stringify({ id, method, params, sessionId: sessionId ?? undefined }))
    })
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  command(command) {
    return this.evaluate(`window.engine_console_command(${JSON.stringify(command)})`)
  }
  close() {
    this.signal.removeEventListener('abort', this.abort)
    this.rejectPending(new Error('CDP disposed'))
    this.socket.close()
  }
}
