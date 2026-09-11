import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output=mkdtempSync(join(tmpdir(),'cs16-knife-'))
const require=createRequire(import.meta.url)
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','src/knife-rules.ts','src/economy-rules.ts','--target','es2020','--module','commonjs','--outDir',output,'--skipLibCheck'])
const { freshKnifeCooldown,isKnifeBackstab,resolveKnifeAttack,traceKnife,KNIFE_SWING_DISTANCE,KNIFE_STAB_DISTANCE,KNIFE_ARMOR_RATIO }=require(join(output,'knife-rules.js'))
const { armorDamage }=require(join(output,'economy-rules.js'))
after(()=>rmSync(output,{recursive:true,force:true}))
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)

test('knife primary uses the original paused and chained damage with hit-dependent cooldowns',()=>{
 const state=freshKnifeCooldown()
 const first=resolveKnifeAttack(state,'swing',100,true)
 assert.equal(first.damage,20);near(state.nextPrimary,100.4);near(state.nextSecondary,100.5)
 assert.equal(resolveKnifeAttack(state,'swing',100.399,true),undefined)
 const chained=resolveKnifeAttack(state,'swing',100.4,true)
 assert.equal(chained.damage,15);near(state.nextPrimary,100.8)
 assert.equal(resolveKnifeAttack(state,'stab',100.89,false),undefined)
 assert.equal(resolveKnifeAttack(state,'swing',101.21,true).damage,20)
 const miss=freshKnifeCooldown();resolveKnifeAttack(miss,'swing',200,false)
 near(miss.nextPrimary,200.35);near(miss.nextSecondary,200.5)
})

test('knife stab uses 65 damage, triples a backstab, and shares its hit or miss lockout',()=>{
 const front=freshKnifeCooldown(),back=freshKnifeCooldown(),miss=freshKnifeCooldown()
 assert.equal(resolveKnifeAttack(front,'stab',300,true,'body',false).damage,65)
 near(front.nextPrimary,301.1);near(front.nextSecondary,301.1)
 assert.equal(resolveKnifeAttack(back,'stab',300,true,'body',true).damage,195)
 assert.equal(resolveKnifeAttack(freshKnifeCooldown(),'stab',300,true,'head',false).damage,260)
 assert.equal(resolveKnifeAttack(miss,'stab',300,false).damage,0)
 near(miss.nextPrimary,301);near(miss.nextSecondary,301)
})

test('knife backstab requires attacker and victim horizontal facing within the source dot threshold',()=>{
 assert.equal(isKnifeBackstab({x:0,y:0,z:1},{x:0,y:0,z:1}),true)
 assert.equal(isKnifeBackstab({x:.7,y:0,z:.7},{x:0,y:0,z:1}),false)
 assert.equal(isKnifeBackstab({x:0,y:0,z:-1},{x:0,y:0,z:1}),false)
})

test('knife reach distinguishes swing and stab, respects walls, and uses the original armor ratio',()=>{
 near(KNIFE_SWING_DISTANCE,1.2);near(KNIFE_STAB_DISTANCE,.8);near(KNIFE_ARMOR_RATIO,.85)
 const origin={x:0,y:1.6,z:0},direction={x:0,y:0,z:1}
 const target={id:'enemy',center:{x:0,y:0,z:1.4},regions:[{group:'body',y:1.6,half:{x:.05,y:.05,z:.05}}]}
 const clear=(_origin,_direction,limit)=>limit
 assert.equal(traceKnife(origin,direction,[target],'stab',clear).hit,undefined)
 assert.equal(traceKnife(origin,direction,[target],'swing',clear).hit.target,'enemy')
 const blocked=traceKnife(origin,direction,[target],'swing',()=>.5)
 assert.equal(blocked.hit,undefined);assert.equal(blocked.contact,true);near(blocked.distance,.5)
 const armored=armorDamage(65,100,true,'body',false,KNIFE_ARMOR_RATIO)
 near(armored.damage,55.25);near(armored.armor,95.125)
})
