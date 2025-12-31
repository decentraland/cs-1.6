import { registerMessages, isServer } from '@dcl/sdk/network'
import { Schemas } from '@dcl/sdk/ecs'

const Messages = {
  ping: Schemas.Map({
    timestamp: Schemas.Int64
  }),
  pong: Schemas.Map({
    timestamp: Schemas.Int64
  })
}

const room = registerMessages(Messages)

function setupServer() {
  console.log('[SERVER] Setting up server message handlers')

  room.onMessage('ping', (data, context) => {
    console.log('[SERVER] <<< Received ping from:', context?.from, 'timestamp:', data.timestamp)

    room.send('pong', { timestamp: data.timestamp })
    console.log('[SERVER] >>> Sent pong with timestamp:', data.timestamp)
  })

  console.log('[SERVER] Server ready, waiting for ping messages...')
}

function setupClient() {
  console.log('[CLIENT] Setting up client message handlers')

  // Register pong handler BEFORE sending ping
  room.onMessage('pong', (data) => {
    const roundTripTime = Date.now() - data.timestamp
    console.log('[CLIENT] <<< Received pong! Timestamp:', data.timestamp, 'Round-trip:', roundTripTime, 'ms')
  })

  const pingTimestamp = Date.now()
  console.log('[CLIENT] >>> Sending ping with timestamp:', pingTimestamp)
  room.send('ping', { timestamp: pingTimestamp })

  console.log('[CLIENT] Client ready, waiting for pong response...')
}

export function main() {
  console.log('=== Ping-Pong Test ===')
  console.log('isServer():', isServer())

  if (isServer()) {
    setupServer()
  } else {
    setupClient()
  }
}
