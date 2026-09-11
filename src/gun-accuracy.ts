import { AccuracyState, akSpread, freshAccuracy, kickBack, recoverAccuracy } from './accuracy'
import { GunId, GUNS } from './weapon-profiles'

export function freshGunAccuracy(id: GunId): AccuracyState { return {...freshAccuracy(),accuracy:GUNS[id].accuracy} }
export function gunSpread(state: AccuracyState, id: GunId, now: number, speed: number, grounded: boolean): number {
  if (id === 'ak47') return akSpread(state,now,speed,grounded)
  recoverAccuracy(state,now)
  const moving = speed > .001
  const spread = id === 'm4a1'
    ? !grounded ? .035+.4*state.accuracy : speed>3.5 ? .035+.07*state.accuracy : .02*state.accuracy
    : (!grounded ? id==='usp'?1.2:1 : moving ? id==='usp'?.225:.165 : .1)*(1-state.accuracy)
  state.shots++
  if (id === 'm4a1') state.accuracy = Math.min(1,state.shots**3/220+.3)
  else if (state.lastFire) state.accuracy = Math.max(.6,Math.min(GUNS[id].accuracy,state.accuracy-((id==='usp'?.3:.325)-(now-state.lastFire))*.275))
  state.lastFire=now;state.held=true
  return spread
}
export function gunKick(state: AccuracyState, id: GunId, speed: number, grounded: boolean, random = Math.random) {
  if (id === 'ak47') { kickBack(state,speed,grounded,false,random); return }
  if (id === 'glock18') return
  if (id === 'usp') { state.pitch+=2; return }
  const [up,side,upStep,sideStep,maxUp,maxSide,change] = speed>.001
    ? [1,.45,.28,.045,3.75,3,7] : !grounded ? [1.2,.5,.23,.15,5.5,3.5,6] : [.65,.35,.25,.015,3.5,2.25,7]
  const extra=state.shots===1?0:state.shots
  state.pitch=Math.min(maxUp,state.pitch+up+extra*upStep)
  state.yaw=Math.max(-maxSide,Math.min(maxSide,state.yaw+(side+extra*sideStep)*(state.right?1:-1)))
  if(Math.floor(random()*(change+1))===0)state.right=!state.right
}
