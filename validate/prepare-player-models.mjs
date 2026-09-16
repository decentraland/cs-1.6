import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination)
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-arsenal.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
const client = resolve(destination, 'src/client.ts')
let text = await readFile(client, 'utf8')
text = "import { initializePlayerModelReview } from './player-model-review'\n" + text
text = text.replace(
  '  engine.addSystem(worldWeaponSystem)',
  '  initializePlayerModelReview()\n  engine.addSystem(worldWeaponSystem)'
)
await writeFile(client, text)
await writeFile(
  resolve(destination, 'src/player-model-review.ts'),
  `
import { Animator, GltfContainer, GltfContainerLoadingState, engine, TextShape, Transform } from '@dcl/sdk/ecs'
import { Bot } from './components'
import { GltfNode, GltfNodeState } from './bevy-gltf-node'
export function initializePlayerModelReview() {
 const marker=engine.addEntity()
 Transform.create(marker)
 let elapsed=0
 engine.addSystem(dt=>{
  elapsed+=dt
  if(elapsed<.2)return
  elapsed=0
  TextShape.createOrReplace(marker,{fontSize:.001,text:'review-player-models-'+JSON.stringify({
   bots:[...engine.getEntitiesWith(Bot,Transform)].map(([entity,bot,transform])=>({entity,bot,transform,model:GltfContainer.getOrNull(entity),loading:GltfContainerLoadingState.getOrNull(entity),animator:Animator.getOrNull(entity)})),
   hands:[...engine.getEntitiesWith(GltfNode,Transform)].map(([entity,node,transform])=>({entity,node,transform,state:GltfNodeState.getOrNull(entity)}))
  })})
 })
}
`
)
console.log(
  'Player model fixture: stationary bots and AWP; production body/hitbox/death/hand-attachment code. Read-only render diagnostics.'
)

const practice = resolve(destination, 'src/practice.ts')
const practiceSource = await readFile(practice, 'utf8')
assert.ok(practiceSource.includes('  if (now > 0) return'))
await writeFile(practice, practiceSource.replace('  if (now > 0) return', `  if (now - roundStarted > 10) {
    const first = botEntities[0]
    if (first !== undefined && Bot.get(first).alive) hurtBot(first, 1000, { name: 'Render fixture', weapon: 'AWP', team: 2 }, 'head')
  }
  if (now > 0) return`))
console.log('Ten seconds into live play, the fixture applies one scripted lethal head hit through hurtBot. This checks the death presentation, not shooting input.')
