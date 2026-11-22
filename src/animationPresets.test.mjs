import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEffectMarkup, sampleEffect, animationPresets } from './animationPresets.mjs'
import { parseLyricMarkup, plainLyrics } from './lyricMarkup.mjs'
import { parsePlayLevel } from './playLevel.mjs'

test('all presets survive export/import with cue and duration', () => {
  for (const preset of animationPresets) {
    const text = applyEffectMarkup('**bonjour**', preset.id, 1.4, 0.75)
    const [line] = parsePlayLevel(JSON.stringify({ lyrics: [{ text, start: 1, end: 5 }] }))
    const [token] = parseLyricMarkup(line.text)
    assert.equal(token.effect, preset.id)
    assert.equal(token.duration, 1.4)
    assert.equal(token.cue, 0.75)
    assert.equal(token.bold, true)
    assert.equal(plainLyrics(text), 'bonjour')
  }
})

test('legacy effects retain their duration and looping semantics', () => {
  const [loop, timed] = parseLyricMarkup('*vague:bonjour**saut@1.20:monde*')
  assert.equal(loop.duration, 0.8)
  assert.equal(loop.cue, null)
  assert.equal(timed.cue, 1.2)
  assert.equal(timed.duration, 0.8)
})

test('audio sampling is deterministic across pause, seek and exact boundaries', () => {
  const token = { effect: 'pulse', cue: 1, duration: 2 }
  assert.equal(sampleEffect(token, 0.99).active, false)
  assert.equal(sampleEffect(token, 1).position, 0)
  assert.equal(sampleEffect(token, 2).position, 1)
  assert.deepEqual(sampleEffect(token, 2), sampleEffect(token, 2))
  assert.equal(sampleEffect(token, 3).active, false)
  assert.equal(sampleEffect(token, 1.5).position, 0.5)
  assert.equal(sampleEffect({ effect: 'pulse', duration: 2 }, 4.5).position, 0.5)
  assert.equal(sampleEffect({ effect: 'pulse' }, -1).active, false)
})

test('durations are bounded and replacing an effect does not nest markup', () => {
  assert.equal(parseLyricMarkup('*saut/0.01:mot*')[0].duration, 0.2)
  assert.equal(parseLyricMarkup('*saut/9:mot*')[0].duration, 3)
  assert.equal(applyEffectMarkup('*saut@1.20:mot*', 'pulse', 1), '*pulse/1.00:mot*')
  assert.throws(() => applyEffectMarkup('mot', 'unknown', 1))
  assert.throws(() => applyEffectMarkup('mot', 'saut', 1, -1))
})
