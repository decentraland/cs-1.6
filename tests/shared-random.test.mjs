import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shotRandom, newRoundSeed } from '../src/shared-random.ts'

test('the same seed and shot id replay the same random sequence on both sides', () => {
  const server = shotRandom(123456, 7)
  const client = shotRandom(123456, 7)
  for (let index = 0; index < 5; index++) assert.equal(client(), server())
})

test('different shots and rounds draw different sequences within [0, 1)', () => {
  const draws = [shotRandom(1, 1), shotRandom(1, 2), shotRandom(2, 1)].map((random) =>
    Array.from({ length: 4 }, random)
  )
  for (const sequence of draws) for (const value of sequence) assert.ok(value >= 0 && value < 1)
  assert.notDeepEqual(draws[0], draws[1])
  assert.notDeepEqual(draws[0], draws[2])
})

test('round seeds are positive 31-bit integers', () => {
  assert.equal(
    newRoundSeed(() => 0),
    0
  )
  assert.ok(newRoundSeed(() => 0.999999999) < 0x7fffffff)
  const seed = newRoundSeed()
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 0x7fffffff)
})
