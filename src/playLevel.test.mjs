import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlayLevel } from './playLevel.mjs'

test('loads the existing editor export with its timings and effects', () => {
  const source = JSON.stringify({ timingConvention: 'line-start', lyrics: [
    { start: 1, end: 4, text: '**Bonjour** *saut@1.20:monde*', effect: 'wave', color: '#55ffff' },
    { start: 4, end: 7, text: 'La suite', effect: 'none' },
  ] })
  const exported = JSON.parse(source).lyrics
  const loaded = parsePlayLevel(source)
  assert.equal(loaded.length, exported.length)
  assert.equal(loaded[0].start, exported[0].start)
  assert.equal(loaded[0].text, exported[0].text)
  assert.equal(loaded[0].effect, exported[0].effect)
})

test('rejects invalid exports and unusable or unordered timestamps', () => {
  for (const source of ['bad json', 'null', '{}', '{"lyrics":[]}']) {
    assert.throws(() => parsePlayLevel(source))
  }
  const line = { text: 'Bonjour', start: 1, end: 2 }
  for (const bad of [null, { ...line, text: null }, { ...line, start: '1' },
    { ...line, start: -1 }, { ...line, end: 1 }]) {
    assert.throws(() => parsePlayLevel(JSON.stringify({ lyrics: [bad] })))
  }
  assert.throws(() => parsePlayLevel(JSON.stringify({ lyrics: [line, { ...line, start: 0 }] })))
})

test('supports older levels with missing quiz settings without crashing playback', () => {
  const lines = parsePlayLevel(JSON.stringify({ lyrics: [
    { text: 'Bonjour', start: 0, end: 1 },
    { text: 'Le dernier mot', start: 1, end: 3, gameModes: { isMissingWord: true } },
  ] }))
  assert.equal(lines[0].gameModes.isMissingWord, false)
  assert.deepEqual(lines[1].gameModes.multipleChoices, [])
  assert.equal(lines[1].gameModes.muteDuration, 2)
})
