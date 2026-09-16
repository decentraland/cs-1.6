import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination)
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-spectator-flow.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
const file = resolve(destination, 'src/hit-review.ts')
let source = await readFile(file, 'utf8')
const anchor = "room.onMessage('reviewHit',(data,context)=> {"
assert.ok(source.includes(anchor))
source = source.replace(
  anchor,
  anchor +
    `
   if(context && data.step===10) {
    room.send('playerKill',{killer:'CT Rifle',victim:'T Target',weapon:'Galil',killerTeam:2,victimTeam:1,headshot:false})
    room.send('playerKill',{killer:'T Pistol',victim:'CT Target',weapon:'Five-Seven',killerTeam:1,victimTeam:2,headshot:true})
    room.send('playerKill',{killer:'',victim:'Fallen Player',weapon:'worldspawn',killerTeam:0,victimTeam:2,suicide:true})
    return
   }
`
)
await writeFile(file, source)
console.log(
  'Kill-feed fixture: first E is a lethal production headshot; second E adds three explicitly staged display notices for the other sprite sheets and world-death layout.'
)
