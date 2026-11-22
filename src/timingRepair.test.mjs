import test from 'node:test'
import assert from 'node:assert/strict'
import { repairEndMarkers } from './timingRepair.mjs'
import { getPlayerLines } from './playerLines.mjs'

test('end taps map to the sung line while keeping its metadata', () => {
  const source = [
    { start: 12.355164, end: 17.556855, text: 'Première', section: 'Couplet 1' },
    { start: 17.556855, end: 22.072659, text: 'Deuxième' },
    { start: 22.072659, end: 26.539877, text: 'Troisième' },
  ]
  const fixed = repairEndMarkers(source, 7.72)
  assert.equal(fixed[0].section, source[0].section)
  assert.equal(fixed[0].start, 7.72)
  assert.equal(fixed[2].end, 22.072659)
  assert.equal(getPlayerLines(fixed, 13).current, 1)
  assert.equal(getPlayerLines(fixed, 18).current, 2)
  assert.equal(source[0].start, 12.355164)
  assert.throws(() => repairEndMarkers(source, 13))
})
