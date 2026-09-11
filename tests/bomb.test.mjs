import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freshBomb, stepBomb, dropBomb, bombBlastDamage, bombFragAward, canDefuseBomb, bombBeepWave } from '../src/bomb-rules.ts'
import { teamRoundWinner } from '../src/team-rules.ts'
const t = (overrides={}) => ({address:'t',team:1,alive:true,position:{x:0,y:0,z:0},grounded:true,holding:true,selected:true,canDefuse:false,hasKit:false,...overrides})
const ct = (overrides={}) => t({address:'ct',team:2,selected:false,canDefuse:true,...overrides})
function planted() { const state=freshBomb(1,'t');stepBomb(state,[t()],10,true,()=> 'A');assert.equal(stepBomb(state,[t()],13,true,()=> 'A'),'planted');return state }

test('planting requires a live carrier, bomb selected, ground, site, and three uninterrupted seconds', () => {
 for(const player of [t({holding:false}),t({grounded:false}),t({selected:false})]) {
  const state=freshBomb(1,'t');stepBomb(state,[player],10,true,()=> 'A');assert.equal(state.phase,'carried')
 }
 const state=freshBomb(1,'t')
 stepBomb(state,[t()],10,false,()=> 'A');assert.equal(state.phase,'carried')
 stepBomb(state,[t()],10,true,()=> '');assert.equal(state.phase,'carried')
 stepBomb(state,[t()],10,true,()=> 'A');assert.equal(state.phase,'planting')
 assert.equal(stepBomb(state,[t()],12.999,true,()=> 'A'),undefined)
 assert.equal(stepBomb(state,[t()],13,true,()=> 'A'),'planted')
 assert.equal(state.explodeAt,58);assert.equal(state.carrier,'');assert.equal(state.planter,'t')
})

test('release, movement, weapon switch, leaving site, and jumping cancel planting progress', () => {
 for(const [player,site] of [[t({holding:false}),'A'],[t({selected:false}),'A'],[t({grounded:false}),'A'],[t({position:{x:.5,y:0,z:0}}),'A'],[t(),'B']]) {
  const state=freshBomb(1,'t');stepBomb(state,[t()],10,true,()=> 'A');stepBomb(state,[player],12.9,true,()=>site)
  assert.equal(state.phase,'carried');assert.equal(state.progress,0)
  stepBomb(state,[t()],13,true,()=> 'A');assert.equal(state.actionEnds,16)
 }
})

test('carrier death drops the C4; only living Terrorists can pick it up', () => {
 const state=freshBomb(1,'t');stepBomb(state,[t({alive:false}),ct()],10,true,()=> 'A')
 assert.equal(state.phase,'dropped');assert.equal(state.carrier,'')
 stepBomb(state,[t({address:'far',position:{x:3,y:0,z:0}})],11,true,()=> 'A');assert.equal(state.phase,'dropped')
 stepBomb(state,[t({address:'replacement'})],12,true,()=> 'A');assert.equal(state.carrier,'replacement')
 assert.equal(dropBomb(state,'ct',{x:0,y:0,z:0}),false)
 assert.equal(dropBomb(state,'replacement',{x:1,y:0,z:0}),true)
})

test('defuse duration is ten seconds without a kit and five with a kit', () => {
 for(const [hasKit,duration] of [[false,10],[true,5]]) {
  const state=planted();stepBomb(state,[ct({hasKit})],20,true,()=> 'A')
  assert.equal(state.actionEnds,20+duration)
  assert.equal(stepBomb(state,[ct({hasKit})],20+duration-.001,true,()=> 'A'),undefined)
  assert.equal(stepBomb(state,[ct({hasKit})],20+duration,true,()=> 'A'),'defused')
  assert.equal(stepBomb(state,[ct({hasKit})],70,true,()=> 'A'),undefined,'resolved bombs cannot explode later')
 }
})

test('defuse release, range loss, jumping, and death erase progress; another CT cannot steal an active defuse', () => {
 for(const player of [ct({holding:false}),ct({canDefuse:false}),ct({grounded:false}),ct({alive:false})]) {
  const state=planted();stepBomb(state,[ct()],20,true,()=> 'A');stepBomb(state,[player],25,true,()=> 'A')
  assert.equal(state.defuser,'');assert.equal(state.progress,0)
  stepBomb(state,[ct()],26,true,()=> 'A');assert.equal(state.actionEnds,36)
 }
 const state=planted();stepBomb(state,[ct()],20,true,()=> 'A')
 stepBomb(state,[ct({address:'other',hasKit:true}),ct()],23,true,()=> 'A')
 assert.equal(state.defuser,'ct');assert.equal(state.actionEnds,30)
})

test('the fuse wins ties; an earlier completed defuse survives a delayed server tick', () => {
 const tied=planted();stepBomb(tied,[ct()],48,true,()=> 'A')
 assert.equal(stepBomb(tied,[ct()],58,true,()=> 'A'),'exploded')
 const earlier=planted();stepBomb(earlier,[ct()],47.9,true,()=> 'A')
 assert.equal(stepBomb(earlier,[ct()],58.1,true,()=> 'A'),'defused')
 const late=planted();assert.equal(stepBomb(late,[ct()],58,true,()=> 'A'),'exploded')
})

test('C4 awards three frags only to the defuser or successful explosion planter', () => {
 const defused=planted();stepBomb(defused,[ct()],20,true,()=> 'A')
 const defuseEvent=stepBomb(defused,[ct()],30,true,()=> 'A')
 assert.deepEqual(bombFragAward(defused,defuseEvent),{address:'ct',frags:3})
 const exploded=planted(),explosionEvent=stepBomb(exploded,[],58,true,()=> 'A')
 assert.deepEqual(bombFragAward(exploded,explosionEvent),{address:'t',frags:3})
 assert.equal(bombFragAward(planted(),'planted'),undefined)
 assert.equal(bombFragAward({...planted(),defuser:''},'defused'),undefined)
})

test('plant overrides the round clock and T elimination; explosion and defuse award the proper side', () => {
 const state={phase:'live',round:1,matchOver:false,roster:[{address:'ct',team:2,eligibleRound:1,connected:true},{address:'t',team:1,eligibleRound:1,connected:true}]}
 assert.equal(teamRoundWinner(state,address=>address==='ct',0,'planted'),undefined)
 assert.equal(teamRoundWinner(state,address=>address==='t',50,'planted'),'t')
 assert.equal(teamRoundWinner(state,()=>true,50,'defused'),'ct')
 assert.equal(teamRoundWinner(state,()=>true,50,'exploded'),'t')
 assert.equal(teamRoundWinner(state,address=>address==='ct',50,'carried'),'ct')
})

test('unarmored blast uses the reference 500-damage linear falloff over 1750 map units', () => {
 assert.equal(bombBlastDamage(0),500)
 assert.equal(bombBlastDamage(1750*2/75/2),250)
 assert.equal(bombBlastDamage(1750*2/75),0)
 assert.equal(bombBlastDamage(100),0)
})

test('a drop cooldown blocks only pickup, without marking its living owner dead', () => {
 const state=freshBomb(1,'t');dropBomb(state,'t',{x:0,y:0,z:0})
 const player=t({canPickup:false})
 stepBomb(state,[player],10,true,()=> 'A')
 assert.equal(state.phase,'dropped');assert.equal(player.alive,true)
 stepBomb(state,[player,t({address:'teammate'})],10.1,true,()=> 'A')
 assert.equal(state.carrier,'teammate')
})

test('use radius measures from the standing hull center, while the aim cone starts at the eyes', () => {
 const feet={x:0,y:0,z:0},bomb={x:1.3,y:.08,z:0}
 const length=Math.hypot(1.3,-1.52)
 const aim={x:1.3/length,y:-1.52/length,z:0}
 assert.equal(canDefuseBomb(feet,bomb,aim),true)
 assert.equal(canDefuseBomb(feet,bomb,{x:-1,y:0,z:0}),false)
 assert.equal(canDefuseBomb(feet,{...bomb,x:2},aim),false)
})

test('C4 switches through all five reference beep waves during the fuse', () => {
 assert.equal(bombBeepWave(0),1);assert.equal(bombBeepWave(10.99),1)
 assert.equal(bombBeepWave(11),2);assert.equal(bombBeepWave(20.91),3)
 assert.equal(bombBeepWave(29.82),4);assert.equal(bombBeepWave(37.84),5)
})
