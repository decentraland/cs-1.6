import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh isolated fixture directory')
execFileSync(
  process.execPath,
  [fileURLToPath(new URL('./prepare-movement.mjs', import.meta.url)), destination, 'bots'],
  { stdio: 'inherit' }
)
async function edit(name, from, to) {
  const p = resolve(destination, 'src', name),
    s = await readFile(p, 'utf8')
  assert.ok(s.includes(from), name + ': fixture anchor')
  await writeFile(p, s.replace(from, to))
}
await edit(
  'index.ts',
  '  playerFlinch: Schemas.Map',
  '  reviewBotMode: Schemas.Map({mode:Schemas.Int}),\n  playerFlinch: Schemas.Map'
)
await edit('inventory.ts', "SPAWN_PRIMARY: GunId | undefined = 'awp'", "SPAWN_PRIMARY: GunId | undefined = 'm4a1'")
await edit(
  'movement-review.ts',
  'import { engine, TextShape, Transform, Entity }',
  "import { room } from './index'\nimport { engine, TextShape, Transform, Entity, inputSystem, InputAction, PointerEventType }"
)
await edit(
  'movement-review.ts',
  'export function initializeMovementReview() {',
  `export function initializeMovementReview() {
 let mode=0
 engine.addSystem(()=>{if(inputSystem.isTriggered(InputAction.IA_ACTION_6,PointerEventType.PET_DOWN)){mode=(mode+1)%5;room.send('reviewBotMode',{mode})}})`
)
await edit('practice.ts', 'import { AvatarShape, engine,', 'import { TextShape, AvatarShape, engine,')
await edit(
  'practice.ts',
  'let roundEntity: Entity',
  `let reviewMode=0
let reviewTarget=68
let roundEntity: Entity`
)
await edit(
  'practice.ts',
  'export function initializePractice() {',
  `export function initializePractice() {
 room.onMessage('reviewBotMode',(data,context)=>{
  if(!context||data.mode<0||data.mode>4||getPractice()?.phase!=='live')return
  reviewMode=data.mode;reviewTarget=68
  const bot=botEntities[0],nav=botNavigation.get(bot)
  if(nav&&Bot.getOrNull(bot)?.alive){
   nav.position=createBotNavigation({x:21,y:10.44,z:60}).position;nav.path=[];nav.goal=undefined;nav.smoothed=false;nav.lastSeen=undefined;nav.mode='hold';nav.holdUntil=0;nav.destination=undefined
   botMovements.get(bot)?.reset();Bot.getMutable(bot).health=100;Transform.getMutable(bot).position=nav.position
  }
 })
 const reviewProbe=engine.addEntity();Transform.create(reviewProbe);syncEntity(reviewProbe,[TextShape.componentId])
 const recent:number[][]=[]
 engine.addSystem(()=>{
  const entity=botEntities[0],bot=Bot.getOrNull(entity),nav=botNavigation.get(entity),movement=botMovements.get(entity)
  if(!bot||!nav||!movement)return
  const p=nav.position,v=movement.velocity,at=Date.now()/1000
  recent.push([at,p.x,p.y,p.z,v.x,v.y,v.z,movement.modifier,bot.health].map(value=>Math.round(value*10000)/10000));if(recent.length>24)recent.shift()
  TextShape.createOrReplace(reviewProbe,{fontSize:.0001,text:'review-bot-state-'+JSON.stringify({at,mode:reviewMode,bot,position:p,velocity:v,modifier:movement.modifier,recent})})
 })`
)
await edit(
  'practice.ts',
  'createBotNavigation(start, dust2Navigation',
  'createBotNavigation(index===0?{x:21,y:10.44,z:60}:start, dust2Navigation'
)
await edit(
  'practice.ts',
  '  for (const entity of aliveBots()) {\n    const bot = Bot.get(entity)\n    const navigation',
  '  for (const entity of aliveBots()) {\n    const bot = Bot.get(entity)\n    if(bot.index!==0)continue\n    const navigation'
)
await edit(
  'practice.ts',
  '      const previous = navigation.position',
  `      navigation.lastSeen=undefined
      if(Math.abs(navigation.position.z-reviewTarget)<1) {reviewTarget=reviewTarget===68?56:68;navigation.destination=undefined;navigation.goal=undefined;navigation.path=[]}
      const reviewGoal={x:21,y:10.44,z:reviewTarget}
      if(reviewMode===3){navigation.mode='roam';navigation.pace='walk';navigation.destination=reviewGoal;navigation.holdUntil=0}
      else if(reviewMode!==1){navigation.mode='hold';navigation.holdUntil=now+60}
      const previous = navigation.position`
)
await edit('practice.ts', 'observed: enemy?.position,', 'observed: undefined,')
await edit(
  'practice.ts',
  'reported: enemy ? undefined : teammateSighting(entity, bot.team, navigation.position, sightings),',
  'reported: undefined,'
)
await edit(
  'practice.ts',
  'objective: objectives.get(botAddress(bot.index)),',
  'objective: reviewMode===1?reviewGoal:undefined,'
)
await edit(
  'practice.ts',
  'target: enemy && !isBombBusy(botAddress(bot.index)) ? enemy.aim : undefined,',
  'target: undefined,'
)
console.log(
  'Bot movement fixture: one visible bot on a repeatable route, original damage/motor rules, M4A1/USP start. 4 cycles hold/run/hold/walk/hold and resets the live bot for independent shots. Other bots stay at spawn and do not shoot.'
)
