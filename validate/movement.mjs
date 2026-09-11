import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { practiceButtonPoint } from './menu-layout.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/game.mjs <browser-CDP-websocket>')
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

const labels = (state) => Object.values(state).filter(c=>c.UiText).map(c=>c.UiText.value)
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
async function startGame() {
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
 await stateUntil(s=>s['2'].PointerLock?.isPointerLocked,'engine mouse capture')
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
 await evaluate("window.engine_console_command('/set_scene SDK7')")
 await stateUntil(s=>labels(s).includes('Prepare to fight!'),'next freeze',30000)
 await stateUntil(s=>labels(s).includes('Enemies left: 3')&&!labels(s).includes('Prepare to fight!'),'next live')
 const measure=async(walk)=>{
  if(walk)await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:8})
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87,modifiers:walk?8:0})
  await pause(200)
  const before=await snapshot(),start=Date.now()
  await pause(450)
  const after=await snapshot(),seconds=(Date.now()-start)/1000
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87})
  if(walk)await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16})
  const p=before['1'].Transform.position,q=after['1'].Transform.position
  return {speed:Math.hypot(q.x-p.x,q.z-p.z)/seconds,settings:after['1'].AvatarMovementInfo.activeAvatarLocomotionSettings,velocity:after['1'].AvatarMovementInfo.actualVelocity}
 }
 const run=await measure(false)
 await pause(250)
 const walk=await measure(true)
 assert.ok(Math.abs(run.speed-5.525)<0.85,JSON.stringify(run))
 assert.ok(Math.abs(walk.speed-2.873)<0.5,JSON.stringify(walk))
 assert.ok(walk.speed/run.speed<0.65)
 console.log(JSON.stringify({run,walk},null,2))
 if(process.argv[3])await writeFile(process.argv[3],JSON.stringify({run,walk},null,2)+'\n')
 console.log('PASS: real WASD movement and Shift walking use the configured speeds')
} finally { socket.close() }
