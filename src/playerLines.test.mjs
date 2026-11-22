import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlayerLines } from './playerLines.mjs'

const lines = [{ start: 4, end: 8 }, { start: 8, end: 12 }, { start: 15, end: 20 }]
test('first words appear in the center immediately, second line below', () => {
  assert.deepEqual(getPlayerLines(lines, 0), { active: -1, current: 0, next: 1 })
})
test('switches at the exact timestamp, without a one-line delay', () => {
  assert.deepEqual(getPlayerLines(lines, 8), { active: 1, current: 1, next: 2 })
})
test('gaps and seeks show the upcoming line rather than resetting to the first', () => {
  assert.deepEqual(getPlayerLines(lines, 13), { active: -1, current: 2, next: -1 })
  assert.equal(getPlayerLines(lines, 5).current, 0)
  assert.deepEqual(getPlayerLines(lines, 21), { active: -1, current: -1, next: -1 })
})
test('explicit instrumental intervals hide the central lyrics and empty songs are safe', () => {
  assert.deepEqual(getPlayerLines([{ start: 0, end: 4, isInstrumental: true }, ...lines], 2), { active: 0, current: -1, next: 1 })
  assert.deepEqual(getPlayerLines([], 0), { active: -1, current: -1, next: -1 })
})
