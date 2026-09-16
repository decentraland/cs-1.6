import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { after } from 'node:test'
const require = createRequire(import.meta.url)
export function compile(...files) {
  const output = mkdtempSync(join(tmpdir(), 'cs16-rules-'))
  after(() => rmSync(output, { recursive: true, force: true }))
  execFileSync(process.execPath, [
    'node_modules/typescript/bin/tsc',
    ...files.map((file) => `src/${file}.ts`),
    '--target',
    'es2020',
    '--module',
    'commonjs',
    '--outDir',
    output,
    '--skipLibCheck'
  ])
  return (file) => require(join(output, `${file}.js`))
}
