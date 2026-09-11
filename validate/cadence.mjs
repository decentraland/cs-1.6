import { readHud } from './read-hud.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { practiceButtonPoint } from './menu-layout.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/cadence.mjs <browser-CDP-websocket> [evidence.json]')
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
const snapshot = () => evaluate("window.engine_console_command('/set_scene SDK7').then(()=>window.engine_console_command('/crdt_snapshot')).then(JSON.parse)")
async function key(key, code, vk, duration) {
  try {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk })
    await pause(duration)
  } finally {
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk })
  }
}

const labels = (state) => Object.values(state).filter(c=>c.UiText).map(c=>c.UiText.value)
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
function angles(q) {
 return {yaw:Math.atan2(2*(q.x*q.z+q.w*q.y),1-2*(q.x*q.x+q.y*q.y)),pitch:Math.asin(Math.max(-1,Math.min(1,2*(q.y*q.z-q.w*q.x))))}
}
function wrap(a){return Math.atan2(Math.sin(a),Math.cos(a))}

try {
 const {targetInfos}=await send('Target.getTargets')
 const target=targetInfos.find(t=>t.type==='page'&&t.url.includes('127.0.0.1:8123'))
 assert.ok(target, 'dedicated validation page exists')
 sessionId=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId
 await send('Page.bringToFront')
 await send('Emulation.setFocusEmulationEnabled',{enabled:true})
 await evaluate("window.engine_console_command('/set_scene SDK7')")
 const [w,h]=await evaluate('[innerWidth,innerHeight]')
 const current=labels(await snapshot())
 if(current.includes('Start game')||current.includes('Play again')) {
  await evaluate('document.exitPointerLock()')
  const point=practiceButtonPoint(w,h);mx=point.x;my=point.y
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mx,y:my})
  await pause(200)
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:mx,y:my,button:'left',clickCount:1})
  await pause(100)
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mx,y:my,button:'left',clickCount:1})
 }
 await stateUntil(s=>labels(s).includes('Prepare to fight!'),'fresh round freeze',35000)
 await stateUntil(s=>labels(s).includes('Enemies left: 3')&&!labels(s).includes('Prepare to fight!'),'live')
 if(!(await snapshot())['2'].PointerLock?.isPointerLocked) {
  mx=w/2;my=h/2
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mx,y:my})
  await pause(150)
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:mx,y:my,button:'left',clickCount:1})
  await pause(100)
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mx,y:my,button:'left',clickCount:1})
 }
 await stateUntil(s=>s['2'].PointerLock?.isPointerLocked,'capture')
 const readings=[]
 const start=Date.now()
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:mx,y:my,button:'left',clickCount:1})
 let empty=false
 while(Date.now()-start<6000) {
  const state=await snapshot()
  const hud=readHud(state)
  const ammo=hud?.clip===undefined||hud.reserve===undefined?undefined:`${hud.clip} | ${hud.reserve}`
  readings.push({ms:Date.now()-start,ammo,pitch:angles(state['2'].Transform.rotation).pitch})
  if(ammo==='0 | 90') { empty=true;break }
  await pause(60)
 }
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mx,y:my,button:'left',clickCount:1})
 assert.ok(empty,'holding left mouse consumes the full magazine')
 const first=readings.find(r=>r.ammo&&r.ammo!=='30 | 90')
 const duration=readings.at(-1).ms-first.ms
 console.log('MAGAZINE',JSON.stringify({duration,shots:30}))
 assert.ok(duration>=2400&&duration<=3300,`29 firing intervals took ${duration} ms; expected about 2770 ms`)
 const reloaded=await stateUntil(s=>readHud(s)?.clip===30&&readHud(s)?.reserve===60,'automatic reload conserves ammo',4000)
 assert.ok(Math.abs(angles(reloaded['2'].Transform.rotation).pitch)<.01,'recoil settles after release')
 const evidence={date:new Date().toISOString(),input:'left mouse',durationMs:duration,expectedMs:29*95.5,readings,reloaded:readHud(reloaded)}
 if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(evidence,null,2)+'\n')
 console.log('PASS: full-auto cadence → 30 rounds → release → automatic reload')
} finally {
 if(sessionId) {
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mx,y:my,button:'left',clickCount:1})
  await evaluate('document.exitPointerLock()').catch(error=>console.warn(error.message))
 }
 socket.close()
}
