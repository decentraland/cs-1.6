import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a new isolated review directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-hit-response.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function replace(file, from, to) {
  const path = resolve(destination, 'src', file),
    source = await readFile(path, 'utf8')
  assert.ok(source.includes(from), file + ': fixture patch matches')
  await writeFile(path, source.replace(from, to))
}
const practice = await readFile(resolve(destination, 'src/practice.ts'), 'utf8')
const result = practice.match(/const RESULT_SECONDS = \d+/)?.[0]
assert.ok(result)
await replace('practice.ts', result, 'const RESULT_SECONDS = 60')
await replace('hit-review.ts', 'let step=0', 'let step=9')
await replace(
  'hit-review.ts',
  'import { getPractice,',
  "import { getSpectatorTarget, isSpectating, isDeathTransitioning } from './spectator'\nimport { isTeamMenuOpen } from './menu-state'\nimport { getPractice,"
)
await replace(
  'hit-review.ts',
  'match:getPractice(),health:',
  'observer:{active:isSpectating(),transition:isDeathTransitioning(),target:getSpectatorTarget(),menu:isTeamMenuOpen()},match:getPractice(),health:'
)
console.log(
  'Spectator fixture: E applies one lethal server hit; result lasts 60 seconds. Observer controls and HUD use production code.'
)
