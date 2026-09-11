import { readHud } from './read-hud.mjs'
import { readTextEntities, readTeamScore, readScoreRows } from './read-scoreboard.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { captureScoreboardViewports } from './scoreboard-screenshots.mjs'
import { practiceButtonPoint } from './menu-layout.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/game.mjs <browser-CDP-websocket> [evidence.json] [--fresh-page]')
const evidencePath=process.argv.slice(3).find(argument=>!argument.startsWith('--'))
const browserSessionIndex=process.argv.indexOf('--browser-session')
const browserSession=browserSessionIndex<0?undefined:process.argv[browserSessionIndex+1]
if(process.argv.includes('--screenshots')&&(!browserSession||browserSession.startsWith('--')))throw new Error('--screenshots requires --browser-session <owned agent-browser session>')
const socket = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
let sessionId
const pending = new Map()
socket.addEventListener('message', ({ data }) => {
  const response = JSON.parse(data)
  const entry = pending.get(response.id)
  if (!entry) return
  pending.delete(response.id)
  clearTimeout(entry.timeout)
  if (response.error) entry.reject(new Error(JSON.stringify(response.error)))
  else entry.resolve(response.result)
})
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} timed out`))
    }, 15000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
}
async function evaluate(expression, userGesture = false) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  return response.result.value
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const snapshot = () => evaluate("window.engine_console_command('/crdt_snapshot').then(JSON.parse)")
async function key(key, code, vk, duration) {
  try {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk })
    await pause(duration)
  } finally {
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk })
  }
}

const labels = (state) => readTextEntities(state).map(c=>c.UiText.value)
const enemies = (state) => Object.entries(state).filter(([id,c])=>c.MeshCollider && c.Transform && !c.AvatarAttach)
let mx=0,my=0
async function stateUntil(predicate, message, timeout=10000) {
 const deadline=Date.now()+timeout
 while(Date.now()<deadline) {
  const state=await snapshot()
  if(predicate(state))return state
  await pause(100)
 }
 throw new Error(`Timed out: ${message}`)
}
async function scoreSnapshot() {
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'1',code:'Digit1',windowsVirtualKeyCode:49})
 try { await pause(200);return await snapshot() }
 finally { await send('Input.dispatchKeyEvent',{type:'keyUp',key:'1',code:'Digit1',windowsVirtualKeyCode:49}) }
}
async function startGame() {
 await stateUntil(s=>labels(s).includes('Start game')||labels(s).includes('Play again'),'start menu',20000)
 await evaluate('document.exitPointerLock()')
 await pause(200)
 const [w,h]=await evaluate('[innerWidth,innerHeight]')
 const point=practiceButtonPoint(w,h);mx=point.x;my=point.y
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mx,y:my})
 await pause(200)
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:mx,y:my,button:'left',clickCount:1})
 await pause(100)
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mx,y:my,button:'left',clickCount:1})
 const frozen = await stateUntil(s=>labels(s).includes('Prepare to fight!'),'freeze phase')
 await key('w','KeyW',87,300)
 const after = await snapshot()
 assert.ok(Math.hypot(after['1'].Transform.position.x-frozen['1'].Transform.position.x,after['1'].Transform.position.z-frozen['1'].Transform.position.z)<0.15, 'freeze blocks movement')
 const live=await stateUntil(s=>labels(s).includes('Enemies left: 3')&&!labels(s).includes('Prepare to fight!'),'live phase')
 if(!(await snapshot())['2'].PointerLock?.isPointerLocked) {
  mx=w/2;my=h/2
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mx,y:my})
  await pause(150)
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:mx,y:my,button:'left',clickCount:1})
  await pause(100)
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mx,y:my,button:'left',clickCount:1})
 }
 await stateUntil(s=>s['2'].PointerLock?.isPointerLocked,'initial mouse capture')
 await evaluate('document.exitPointerLock()')
 await stateUntil(s=>!s['2'].PointerLock?.isPointerLocked,'cursor release')
 const [cw,ch]=await evaluate('[innerWidth,innerHeight]')
 mx=cw/2;my=ch/2
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mx,y:my})
 await pause(150)
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:mx,y:my,button:'left',clickCount:1})
 await pause(100)
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mx,y:my,button:'left',clickCount:1})
 await stateUntil(s=>s['2'].PointerLock?.isPointerLocked,'left click recaptures the mouse')
 console.log('LOCK',JSON.stringify((await snapshot())['2'].PointerLock))
 return live
}
function angles(q) {
 return {yaw:Math.atan2(2*(q.x*q.z+q.w*q.y),1-2*(q.x*q.x+q.y*q.y)),pitch:Math.asin(Math.max(-1,Math.min(1,2*(q.y*q.z-q.w*q.x))))}
}
function wrap(a){return Math.atan2(Math.sin(a),Math.cos(a))}
async function aimAt(id) {
 for(let i=0;i<3;i++){
  const state=await snapshot(),enemy=state[id]
  if(!enemy?.MeshCollider)return false
  const c=state['2'].Transform,p=enemy.Transform.position
  const dx=p.x-c.position.x,dy=p.y+1.05-c.position.y,dz=p.z-c.position.z
  const a=angles(c.rotation)
  const yawError=wrap(Math.atan2(dx,dz)-a.yaw)
  const pitchError=Math.atan2(dy,Math.hypot(dx,dz))-a.pitch
  if(Math.abs(yawError)<0.015&&Math.abs(pitchError)<0.015)return true
  mx+=yawError/0.005236;my-=pitchError/0.005236
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mx,y:my})
  await pause(150)
 }
 return true
}
try {
 const {targetInfos}=await send('Target.getTargets')
 const target=targetInfos.find(t=>t.type==='page'&&t.url.includes('127.0.0.1:8123'))
 sessionId=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId
 await send('Page.bringToFront')
 await send('Emulation.setFocusEmulationEnabled',{enabled:true})
 await evaluate("window.engine_console_command('/set_scene SDK7')")
 if(!process.argv.includes('--fresh-page')) {
  await evaluate("window.engine_console_command('/reload')")
  await pause(4000)
 }
 await evaluate("window.engine_console_command('/set_scene SDK7')")
 const initial=await startGame()
 console.log('LIVE',labels(initial))
 const starts=[[88,50],[85,54],[90,48]]
 const targets=enemies(initial)
 const ids=starts.map(([x,z])=>targets.reduce((best,entry)=>Math.hypot(entry[1].Transform.position.x-x,entry[1].Transform.position.z-z)<Math.hypot(best[1].Transform.position.x-x,best[1].Transform.position.z-z)?entry:best)[0])
 assert.equal(new Set(ids).size,3,'encounter spawn order maps to distinct bots')
 assert.equal(ids.length,3)
 for(const id of ids) {
  for(let attempt=0;attempt<6;attempt++) {
   if(!await aimAt(id))break
   await key('e','KeyE',69,340)
   await pause(120)
   const state=await snapshot()
   console.log('SHOT',id,labels(state).filter(text=>text.startsWith('Enemies left:')||text.includes('Win!')))
   if(!state[id]?.MeshCollider)break
  }
 }
 const won=await stateUntil(s=>labels(s).includes('Counter-Terrorists Win!'),'victory')
 assert.equal(enemies(won).length,0)
 console.log('VICTORY',labels(won))
 assert.equal(readTeamScore(won,2),undefined,'round result does not open scoreboard automatically')
 const wonScores=await scoreSnapshot()
 assert.equal(readTeamScore(wonScores,2),1)
 await stateUntil(s=>labels(s).includes('Prepare to fight!'),'automatic next freeze',8000)
 const restarted=await stateUntil(s=>labels(s).includes('Enemies left: 3')&&!labels(s).includes('Prepare to fight!'),'automatic next live')
 assert.equal(enemies(restarted).length,3)
 assert.equal(readHud(restarted)?.clip,30)
 assert.equal(readHud(restarted)?.reserve,90)
 assert.equal(readHud(restarted)?.health,100,'restart restores health')
 await stateUntil(s=>labels(s).includes('Terrorists Win!'),'defeat while idle',25000)
 const lost=await scoreSnapshot()
 assert.equal(readTeamScore(lost,1),1)
 assert.equal(readTeamScore(lost,2),1)
 const rows = new Map()
 for (const value of readTextEntities(lost)) {
  if (!value.UiText || !value.UiTransform) continue
  const parent = value.UiTransform.parent
  rows.set(parent, [...(rows.get(parent) ?? []), value.UiText.value])
 }
 assert.ok([...rows.values()].some(row=>row.includes('3')&&row.includes('1')&&row.includes('Dead')), 'kills and deaths survive round reset')
 const botScores=readScoreRows(lost).filter(row=>row.values.includes('BOT')).map(row=>Number(row.values.filter(value=>/^\d+$/.test(value))[0]))
 assert.equal(botScores.length,3)
 assert.deepEqual(botScores,[...botScores].sort((a,b)=>b-a),'visible scoreboard orders bots by kills')
 console.log('DEFEAT',labels(lost))
 if(evidencePath) await writeFile(evidencePath,JSON.stringify({date:new Date().toISOString(),hud:{initial:readHud(initial),victory:readHud(won),restart:readHud(restarted),defeat:readHud(lost)},initial:labels(initial),victory:labels(wonScores),restart:labels(restarted),defeat:labels(lost),scene:await evaluate("window.engine_console_command('/scene_stats')")},null,2)+'\n')
 if(process.argv.includes('--screenshots')&&evidencePath) {
  await captureScoreboardViewports({send,snapshot},browserSession,dirname(evidencePath))
  console.log('PASS: scoreboard columns and proportions at 1280x720, 1024x768, 1920x1080')
 }
 console.log('PASS: start → frozen movement → three bot kills → scored victory → automatic round → scored defeat')
} finally {
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'1',code:'Digit1',windowsVirtualKeyCode:49}).catch(e=>console.warn(e.message))
 await evaluate('document.exitPointerLock()').catch(e=>console.warn(e.message))
 socket.close()
}
