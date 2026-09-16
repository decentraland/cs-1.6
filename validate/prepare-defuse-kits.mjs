import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination)
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-c4.mjs', import.meta.url)), destination, 'defuse'], {
  stdio: 'inherit'
})
async function edit(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), file + ': fixture anchor')
  await writeFile(path, text.replace(from, to))
}
await edit(
  'practice.ts',
  'if (isLobbyPhase(state.phase) && hasBothTeams(state)) startTeamRound()',
  'if (isLobbyPhase(state.phase) && hasBothTeams(state) && state.roster.filter(s=>s.connected && !isBotAddress(s.address)).length >= 2) startTeamRound()'
)
await edit(
  'practice.ts',
  "bomb.carrier === address && !!bombSiteAt(position) && (bomb.phase === 'planting' || (busy && stopped))",
  "bomb.carrier === address && !!bombSiteAt(position) && (bomb.phase === 'planting' || (busy && stopped)) && [...engine.getEntitiesWith(Weapon,PlayerHealth)].some(([,weapon,health])=>weapon.name === 'Knife' && health.current > 0)"
)
await edit('c4-review.ts', 'PlayerAddress, PlayerInventory', 'PlayerMoney, PlayerAddress, PlayerInventory')
await edit(
  'c4-review.ts',
  'inventory: PlayerInventory.getOrNull(entity)',
  'money: PlayerMoney.getOrNull(entity), inventory: PlayerInventory.getOrNull(entity)'
)
await edit(
  'practice.ts',
  'if (hasBothTeams(Practice.get(roundEntity))) startTeamRound()',
  'if (hasBothTeams(Practice.get(roundEntity)) && state.roster.filter(s=>s.connected && !isBotAddress(s.address)).length >= 2) startTeamRound()'
)
console.log(
  'Kit fixture: waits for two CT humans; parked T carrier plants when a living human selects knife. Purchases, fatal falls, kit pickup and defusing use production code.'
)
