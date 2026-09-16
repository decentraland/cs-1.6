import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// Keep the preview authority on the movement protocol verified with hosted Bevy web.
const serverPackage = '@dcl-regenesislabs/bevy-headless-server@0.1.0-34588802161.commit-3926f33'
const child = spawn(
  process.execPath,
  [require.resolve('@dcl/sdk-commands/dist/index.js'), 'start', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(process.env.DCL_SERVER_ENGINE === 'hammurabi'
        ? {}
        : { DCL_SERVER_PACKAGE: process.env.DCL_SERVER_PACKAGE || serverPackage })
    }
  }
)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', (error) => {
  console.error('Preview failed to start:', error.message)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1)
})
