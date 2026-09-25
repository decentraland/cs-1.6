import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { compile } from './compile.mjs'
const load = compile('weapon-fire-animation', 'weapon-models')
const { chooseFire } = load('weapon-fire-animation')
const { WEAPON_MODELS } = load('weapon-models')
const glock = WEAPON_MODELS.glock18
const bytes = readFileSync(new URL('../assets/scene/weapons/glock18-view.glb', import.meta.url))
const jsonLength = bytes.readUInt32LE(12)
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
const binaryStart = 28 + jsonLength
const slide = gltf.nodes.findIndex((node) => node.name === 'USP_Slide-handle')
assert.ok(slide >= 0, 'the original Glock slide bone exists')

function slidePositions(clip) {
  const animation = gltf.animations.find((animation) => animation.name === glock.prefix + clip)
  assert.ok(animation, `${clip} exists in the shipped model`)
  const channel = animation.channels.find(
    (channel) => channel.target.node === slide && channel.target.path === 'translation'
  )
  assert.ok(channel, `${clip} animates the slide`)
  const accessor = gltf.accessors[animation.samplers[channel.sampler].output]
  assert.equal(accessor.componentType, 5126)
  assert.equal(accessor.type, 'VEC3')
  const view = gltf.bufferViews[accessor.bufferView]
  const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  return Array.from({ length: accessor.count }, (_, i) => bytes.readFloatLE(offset + i * (view.byteStride ?? 12) + 4))
}
function slideCycles(clip) {
  const positions = slidePositions(clip)
  let rising = false,
    cycles = 0
  for (let i = 1; i < positions.length; i++) {
    const delta = positions[i] - positions[i - 1]
    if (delta > 1e-6) rising = true
    else if (delta < -1e-6 && rising) {
      cycles++
      rising = false
    }
  }
  return cycles
}

for (const [mode, cycles] of [
  [0, 1],
  [1, 3]
]) {
  test(`Glock mode ${mode} selects baked animations with ${cycles} slide cycles`, () => {
    for (const random of [0, 0.99]) {
      let lastClip = glock.idle
      for (let remaining = 19; remaining >= 1; remaining--) {
        const clip = chooseFire('glock18', glock, mode, remaining, lastClip, () => random)
        assert.equal(slideCycles(clip), cycles, `mode=${mode} selected ${clip}`)
        assert.equal(slideCycles(clip + '__repeat'), cycles, 'repeated shots keep the same animation')
        lastClip = clip
      }
    }
  })
}
test('the last Glock round keeps the slide open in either mode', () => {
  for (const mode of [0, 1]) {
    const clip = chooseFire('glock18', glock, mode, 0, 'shoot3')
    assert.equal(clip, 'shoot_empty')
    const positions = slidePositions(clip)
    assert.ok(positions.at(-1) > positions[0] + 0.01, 'slide stays back after the final round')
  }
})
test('other weapons retain unsilenced, empty-slide and alternating-hand selections', () => {
  for (const id of ['usp', 'm4a1'])
    for (const mode of [0, 1]) {
      const clip = chooseFire(id, WEAPON_MODELS[id], mode, 5, '', () => 0)
      assert.equal(clip.endsWith('_unsil'), mode === 0)
      assert.ok(WEAPON_MODELS[id].clips[clip] > 0)
    }
  assert.equal(chooseFire('deagle', WEAPON_MODELS.deagle, 0, 0, ''), 'shoot_empty')
  assert.equal(
    chooseFire('elite', WEAPON_MODELS.elite, 1, 2, '', () => 0, 0.1),
    'shoot_left1'
  )
  assert.equal(chooseFire('elite', WEAPON_MODELS.elite, 0, 0, ''), 'shoot_rightlast')
})
