import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const child = spawn(
  process.execPath,
  [require.resolve('@dcl/sdk-commands/dist/index.js'), 'start', ...process.argv.slice(2)],
  {
    stdio: 'inherit'
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
