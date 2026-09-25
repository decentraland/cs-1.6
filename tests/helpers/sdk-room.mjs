import assert from 'node:assert/strict'
import { build, buildSync } from 'esbuild'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Schemas } from '@dcl/ecs/dist-cjs/schemas/index.js'

export const AUTH_SERVER = 'authoritative-server'
const source = (
  await build({
    stdin: {
      contents: `
      export { Room, getEventRegistry } from './node_modules/@dcl/sdk/src/network/events/implementation'
      export { BinaryMessageBus, craftCommsMessage, CommsMessage } from './node_modules/@dcl/sdk/src/network/binary-message-bus'
      export { encodeEvent } from './node_modules/@dcl/sdk/src/network/events/protocol'
      export { Atom } from './node_modules/@dcl/sdk/src/atom'
    `,
      resolveDir: process.cwd()
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['../message-bus-sync'],
    plugins: [
      {
        name: 'ecs-schemas',
        setup(build) {
          build.onResolve({ filter: /^@dcl\/ecs$/ }, (args) => ({ path: args.path, external: true }))
        }
      }
    ]
  })
).outputFiles[0].text
const schemaSource = buildSync({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: [...readFileSync('src/index.ts', 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1])
}).outputFiles[0].text

const settled = () => new Promise((resolve) => setImmediate(resolve))

export function sdkRooms() {
  const module = { exports: {} }
  runInNewContext(source, {
    module,
    console,
    require: (name) => {
      if (name === '@dcl/ecs') return { Schemas }
      if (name === '../message-bus-sync') return { AUTH_SERVER_PEER_ID: AUTH_SERVER }
      throw Error('Unexpected Room dependency: ' + name)
    }
  })
  const sdk = module.exports,
    registry = sdk.getEventRegistry()
  runInNewContext(schemaSource, {
    module: { exports: {} },
    require: (name) => {
      if (name === '@dcl/sdk/ecs') return { Schemas }
      if (name === '@dcl/sdk/network') return { registerMessages: (schemas) => Object.assign(registry, schemas) }
      return {}
    }
  })
  const peers = new Map(),
    packets = []
  function receive(address, sender, packet) {
    const peer = peers.get(address)
    assert.ok(peer, address)
    const name = new TextEncoder().encode(sender)
    const bytes = new Uint8Array(1 + name.length + packet.length)
    bytes[0] = name.length
    bytes.set(name, 1)
    bytes.set(packet, 1 + name.length)
    peer.bus.__processMessages([bytes])
  }
  return {
    add(address) {
      const bus = sdk.BinaryMessageBus((data, to) => packets.push({ from: address, data, to }))
      const room = new sdk.Room({}, bus, sdk.Atom(address === AUTH_SERVER), sdk.Atom(true))
      peers.set(address, { bus, room })
      return room
    },
    async deliverFrom(sender) {
      await settled()
      const outgoing = packets.filter((packet) => packet.from === sender)
      for (const packet of outgoing) {
        packets.splice(packets.indexOf(packet), 1)
        const recipients =
          packet.to ?? (sender === AUTH_SERVER ? [...peers.keys()].filter((a) => a !== sender) : [AUTH_SERVER])
        for (const address of recipients) if (peers.has(address)) receive(address, sender, packet.data)
      }
      await settled()
    },
    async inject(address, sender, type, data) {
      receive(
        address,
        sender,
        sdk.craftCommsMessage(sdk.CommsMessage.CUSTOM_EVENT, sdk.encodeEvent(type, data, registry))
      )
      await settled()
    }
  }
}
