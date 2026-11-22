import test from 'node:test'
import assert from 'node:assert/strict'
import { syncAction, stampSegment } from './syncTiming.mjs'

const end = { cursor: 2, count: 2, time: 20, duration: 20, paused: true, ended: true, completed: false }
test('finishes at audio end without a playback action', () => {
  assert.equal(syncAction(end), 'finish')
  assert.equal(syncAction({ ...end, ended: false }), 'finish')
  assert.equal(syncAction({ ...end, time: 18, ended: false }), 'finish')
})
test('never restarts music when lines remain at the end', () => {
  assert.equal(syncAction({ ...end, cursor: 1 }), 'incomplete')
  assert.equal(syncAction({ ...end, cursor: 1, ended: false }), 'incomplete')
})
test('extra Space is ignored after completion and pause requires explicit playback', () => {
  assert.equal(syncAction({ ...end, completed: true }), 'ignore')
  assert.equal(syncAction({ ...end, cursor: 1, time: 10, ended: false }), 'paused')
})
test('next start closes the previous line; final stamp only closes the last', () => {
  const lines = [{ start: 2, end: 0 }, { start: 0, end: 0 }]
  const next = stampSegment(lines, 1, 8)
  assert.deepEqual(next, [{ start: 2, end: 8 }, { start: 8, end: 0, words: [] }])
  assert.equal(stampSegment(next, 2, 20)[1].end, 20)
  assert.equal(lines[0].end, 0)
})

test('first vocal cue is retained and the second cue starts the second phrase', () => {
  const first = stampSegment([{ text: 'Première', start: 0, end: 0 }, { text: 'Deuxième', start: 0, end: 0 }], 0, 16.82)
  const second = stampSegment(first, 1, 20.135785)
  const finished = stampSegment(second, 2, 23.534824)
  assert.deepEqual(finished.map(({ start, end }) => ({ start, end })), [
    { start: 16.82, end: 20.135785 },
    { start: 20.135785, end: 23.534824 },
  ])
})
