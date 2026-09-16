import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination)
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-c4.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function edit(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), file)
  await writeFile(path, text.replace(from, to))
}
await edit(
  'practice.ts',
  '  const random = shotRandom(roundSeed, 0x5000 + index)',
  `  if (index === 0) start = {x:33.2,y:12.6,z:46.5}
  if (index === 1) start = {x:32.6,y:12.6,z:46.5}
  if (index === 0 && getPractice()?.round === 1) account.defuseKit = true
  const random = shotRandom(roundSeed, 0x5000 + index)`
)
await edit('c4-review.ts', 'PlayerAddress, PlayerInventory', 'Bot, PlayerAddress, PlayerInventory')
await edit(
  'c4-review.ts',
  'inventory: PlayerInventory.getOrNull(entity)',
  'bots: [...engine.getEntitiesWith(Bot,Transform)].map(([entity,bot,transform])=>({entity,bot,position:transform.position})), inventory: PlayerInventory.getOrNull(entity)'
)
console.log(
  'Bot kit fixture: bot 0 starts with one kit in round one; bots 0 and 1 stand beside A. Real AWP death, kit handoff, defuse and survivor retention use production code.'
)
