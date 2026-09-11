import assert from 'node:assert/strict'
import { readHud } from './read-hud.mjs'
import { readTextEntities, readTeamScore } from './read-scoreboard.mjs'
import { teamButtonPoint } from './menu-layout.mjs'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const labels = state => readTextEntities(state).map(c => c.UiText.value)
const angles = q => ({ yaw: Math.atan2(2*(q.x*q.z+q.w*q.y),1-2*(q.x*q.x+q.y*q.y)), pitch: Math.asin(Math.max(-1,Math.min(1,2*(q.y*q.z-q.w*q.x)))) })
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
class Client {
  socket; sessionId; nextId = 0; pending = new Map(); mx = 400; my = 300
  constructor(endpoint) { this.socket = new WebSocket(endpoint) }
  async connect() {
    assert.ok(this.socket.readyState < WebSocket.CLOSING, 'browser connection is open or connecting')
    if (this.socket.readyState !== WebSocket.OPEN) await new Promise((resolve,reject) => { this.socket.addEventListener('open',resolve,{once:true}); this.socket.addEventListener('error',reject,{once:true}) })
    this.socket.addEventListener('message', ({data}) => {
      const response = JSON.parse(data), entry = this.pending.get(response.id)
      if (!entry) return
      this.pending.delete(response.id); clearTimeout(entry.timer)
      if (response.error) entry.reject(new Error(JSON.stringify(response.error)))
      else entry.resolve(response.result)
    })
    const {targetInfos} = await this.send('Target.getTargets')
    const target = targetInfos.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8123'))
    assert.ok(target, 'owned preview tab exists')
    this.sessionId = (await this.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId
    await this.send('Page.bringToFront')
    await this.send('Emulation.setFocusEmulationEnabled',{enabled:true})
  }
  send(method,params={}) {
    return new Promise((resolve,reject) => {
      const id = ++this.nextId
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`))},15000)
      this.pending.set(id,{resolve,reject,timer})
      this.socket.send(JSON.stringify({id,method,params,sessionId:this.sessionId}))
    })
  }
  async evaluate(expression) {
    const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true})
    if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  command(command) { return this.evaluate(`window.engine_console_command(${JSON.stringify(command)})`) }
  async snapshot() { await this.command('/set_scene SDK7'); return JSON.parse(await this.command('/crdt_snapshot')) }
  async scoreboard() {
    await this.key('keyDown', '1', 'Digit1', 49)
    try { await pause(200); return await this.snapshot() }
    finally { await this.key('keyUp', '1', 'Digit1', 49) }
  }
  async until(predicate,description,timeout=15000,interval=100) {
    const deadline=Date.now()+timeout
    while(Date.now()<deadline) { const s=await this.snapshot(); if(predicate(s))return s; await pause(interval) }
    throw new Error(`Timed out: ${description}`)
  }
  async click(x,y,duration=70) {
    this.mx=x;this.my=y
    await this.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y})
    await pause(100)
    await this.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1})
    await pause(duration)
    await this.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1})
  }
  async join(team,_soloMenu) {
    await this.evaluate('document.exitPointerLock()')
    const [w,h]=await this.evaluate('[innerWidth,innerHeight]')
    const point=teamButtonPoint(w,h,team)
    await this.click(point.x,point.y)
  }
  async capture() {
    const state=await this.snapshot()
    if(labels(state).includes('Buy Equipment')) {
      const rows=labels(state).filter(value=>/^(Kevlar Vest|Defuse Kit    |AK-47    |M4A1    |USP    |Glock-18    |Primary Ammo|Secondary Ammo)/.test(value))
      const h=await this.evaluate('innerHeight')
      await this.click(100,h*.16+(labels(state).includes('Defuse Kit')?25:0)+14+36+16+rows.length*32)
    } else if(!state['2'].PointerLock?.isPointerLocked) {
      const [w,h]=await this.evaluate('[innerWidth,innerHeight]');await this.click(w/2,h/2)
    }
    await this.until(s=>s['2'].PointerLock?.isPointerLocked,'mouse capture')
  }
  async aimAt(target) {
    const state=await this.snapshot(), p=state['1'].Transform.position, a=angles(state['2'].Transform.rotation)
    const yaw=Math.atan2(target.x-p.x,target.z-p.z)
    const pitch=Math.atan2(target.y-(p.y+1.6),Math.hypot(target.x-p.x,target.z-p.z))
    this.mx+=wrap(yaw-a.yaw)/.005236;this.my+=(a.pitch-pitch)/.005236
    await this.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:this.mx,y:this.my})
    await pause(250)
  }
  async shoot(duration=120) {
    await this.send('Input.dispatchMouseEvent',{type:'mousePressed',x:this.mx,y:this.my,button:'left',clickCount:1})
    await pause(duration)
    await this.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:this.mx,y:this.my,button:'left',clickCount:1})
  }
  async key(type,key,code,vk) { await this.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk}) }
}

export { Client, pause, labels, readHud, readTeamScore }
