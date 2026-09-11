import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-navigation-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/bot-navigation.ts', 'src/team-spawns.ts', '--target', 'es2020', '--module', 'commonjs', '--outDir', output, '--skipLibCheck', '--resolveJsonModule', '--esModuleInterop'])
const { dust2Navigation: graph, navPoint, nearestNavNode, findNavPath, navDistance } = require(join(output, 'navigation.js'))
const { createBotNavigation, moveBot } = require(join(output, 'bot-navigation.js'))
const { teamSpawn } = require(join(output, 'team-spawns.js'))
const { mapDistance } = require(join(output, 'world-query.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const point = (x, y, z) => ({ x, y, z })
const route = (a, b) => {
 const start = nearestNavNode(graph, a), end = nearestNavNode(graph, b)
 assert.notEqual(start, undefined); assert.notEqual(end, undefined)
 const path = findNavPath(graph, start, end)
 assert.ok(path.length > 1); assert.equal(path[0], start); assert.equal(path.at(-1), end)
 return path.map(node => navPoint(graph, node))
}
test('all original human spawns and both bomb sites connect to the Dust2 walkable graph', () => {
 const sites = [point(33,12.5861,46.5), point(104.5,10.026,40.5)]
 for (const team of [1,2]) for(let slot=0;slot<20;slot++) {
  const position=teamSpawn(team,slot).position
  const node=nearestNavNode(graph,position)
  assert.notEqual(node,undefined,`team ${team} slot ${slot}`)
  assert.ok(navDistance(navPoint(graph,node),position)<.65)
 }
 for (const site of sites) route(teamSpawn(1,0).position,site)
 route(teamSpawn(2,0).position,sites[1])
})
test('the route around the measured east wall stays on supported ground with standing clearance', () => {
 const start=point(95,10.026,52), end=point(104.5,10.026,40.5)
 const direct=navDistance(start,end), direction=point((end.x-start.x)/direct,0,(end.z-start.z)/direct)
 assert.ok(mapDistance({...start,y:start.y+1.6},direction,direct)<direct-1,'straight shortcut is obstructed')
 const path=route(start,end)
 let length=0
 for(let i=0;i<path.length;i++) {
  const p=path[i]
  assert.ok(mapDistance({...p,y:p.y+.08},point(0,-1,0),.2)<.1,'waypoint lies on actual collision floor')
  assert.equal(mapDistance({...p,y:p.y+.49},point(0,1,0),1.31),1.31,'standing headroom')
  if(!i)continue
  const before=path[i-1],distance=navDistance(before,p)
  length+=distance
  assert.ok(Math.abs(p.y-before.y)<=.481,'stairs respect step height')
  const direction=point((p.x-before.x)/distance,(p.y-before.y)/distance,(p.z-before.z)/distance)
  for(const height of [.49,1.2,1.75]) assert.ok(mapDistance({...before,y:before.y+height},direction,distance)>=distance-.001,'path segment does not cross a wall')
 }
 assert.ok(length>direct+2,'path takes a detour')
})
test('routing cannot jump between disconnected platforms and rejects invalid endpoints', () => {
 const disconnected={positions:[[0,0,0],[0,4,0]],links:[[],[]]}
 assert.deepEqual(findNavPath(disconnected,0,1),[])
 assert.deepEqual(findNavPath(disconnected,0,8),[])
 assert.equal(nearestNavNode(disconnected,point(0,2,0)),undefined)
 assert.equal(nearestNavNode(disconnected,point(0,4,0)),1)
})
test('bot remembers only observed targets, follows graph edges, and resumes patrol after losing contact', () => {
 const line={positions:Array.from({length:41},(_,i)=>[i,0,0]),links:Array.from({length:41},(_,i)=>[i-1,i+1].filter(n=>n>=0&&n<=40))}
 const patrol=[point(40,0,0)], bot=createBotNavigation(point(0,0,0),0,line)
 moveBot(bot,point(20,0,0),0,.1,5,line,patrol)
 assert.deepEqual(bot.lastSeen,point(20,0,0))
 assert.ok(bot.position.x>0 && bot.position.x<=.5)
 moveBot(bot,undefined,1,.1,5,line,patrol)
 assert.deepEqual(bot.lastSeen,point(20,0,0),'hidden motion never updates last seen position')
 moveBot(bot,undefined,10,.1,5,line,patrol)
 assert.equal(bot.lastSeen,undefined);assert.equal(bot.goal,40)
 const before={...bot.position}
 moveBot(bot,point(bot.position.x+2,0,0),11,.1,5,line,patrol)
 assert.deepEqual(bot.position,before,'nearby visible target stops pursuit for shooting')
 const objectiveBot=createBotNavigation(point(0,0,0),0,line)
 moveBot(objectiveBot,point(2,0,0),11,.1,5,line,patrol,point(20,0,0))
 assert.ok(objectiveBot.position.x>0,'a bomb objective overrides the nearby combat stopping distance')
 const fresh=createBotNavigation(point(0,0,0),0,line)
 moveBot(fresh,undefined,12,100,5,line,patrol)
 assert.ok(fresh.position.x<=1,'delayed ticks cannot teleport bots through the route')
})

test('solo encounter bots spawn on the sloping floor instead of the former fixed height', () => {
 for(const [index,start] of [point(88,10.026,50),point(85,10.026,54),point(90,10.026,48)].entries()) {
  const probe={...start,y:start.y+.1},floor=mapDistance(probe,point(0,-1,0),6)
  const grounded={...start,y:probe.y-floor}
  const bot=createBotNavigation(grounded,index)
  assert.ok(navDistance(bot.position,grounded)<.5)
  assert.ok(mapDistance({...bot.position,y:bot.position.y+.05},point(0,-1,0),.1)<.06)
 }
})
