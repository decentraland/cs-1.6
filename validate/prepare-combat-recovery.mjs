import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a new review directory outside the scene repo')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-c4.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
await writeFile(
  resolve(destination, 'src/c4-review.ts'),
  "import { getLocalPlayerEntity, isFireInputReady, isSyncStale } from './client'\nimport { isTeamMenuOpen } from './menu-state'\nimport { isBuyMenuVisible } from './buy-client'\nimport { Bot } from './components'\nimport { engine, TextShape, Transform, inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'\nimport { myProfile } from '@dcl/sdk/network'\nimport { PlayerPose, PlayerAddress, PlayerInventory, PlayerHealth, PlayerEquipment, Weapon } from './components'\nimport { getPractice } from './practice'\nimport { getBomb } from './bomb'\nimport { getC4Animation } from './bomb-client'\nexport function initializeC4Review() {\n let down=0,up=0\n const marker = engine.addEntity()\n Transform.create(marker)\n engine.addSystem(() => {\n  if(inputSystem.isTriggered(InputAction.IA_POINTER,PointerEventType.PET_DOWN))down++\n  if(inputSystem.isTriggered(InputAction.IA_POINTER,PointerEventType.PET_UP))up++\n  const address = myProfile.userId?.toLowerCase()\n  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) if (player.address === address) {\n   TextShape.createOrReplace(marker, { fontSize: 0.001, text: 'review-c4-' + JSON.stringify({ input:{down,up,pressed:inputSystem.isPressed(InputAction.IA_POINTER),ready:isFireInputReady(),stale:isSyncStale(),teamMenu:isTeamMenuOpen(),buy:isBuyMenuVisible()}, bots:[...engine.getEntitiesWith(Bot,Transform)].map(([entity,bot,t])=>({entity,bot,position:t.position})), pose: PlayerPose.getOrNull(entity), inventory: PlayerInventory.getOrNull(entity), weapon: Weapon.getOrNull(entity), health: PlayerHealth.getOrNull(entity), equipment: PlayerEquipment.getOrNull(entity), match: getPractice(), bomb: getBomb(), animation: getC4Animation() }) })\n  }\n })\n}\n"
)
console.log(
  'Combat recovery fixture: source bot models, actual shooting/ammo, read-only state marker. No scripted damage.'
)
