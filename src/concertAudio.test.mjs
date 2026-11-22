import test from 'node:test'
import assert from 'node:assert/strict'
import { retainConcertAudio, prepareConcertAudio, getConcertAnalyser } from './concertAudio.mjs'

test('one source and one audible path survive repeat play and StrictMode remount', async () => {
  const original = globalThis.AudioContext
  const stats = { sources: 0, audible: 0, closed: 0 }
  class FakeContext {
    state = 'suspended'
    destination = {}
    createAnalyser() { return { disconnect() {} } }
    createMediaElementSource() {
      stats.sources++
      return { connect: target => { if (target === this.destination) stats.audible++ }, disconnect() {} }
    }
    async resume() { this.state = 'running' }
    async close() { this.state = 'closed'; stats.closed++ }
  }
  globalThis.AudioContext = FakeContext
  try {
    const audio = {}
    const releaseFirst = retainConcertAudio(audio)
    await prepareConcertAudio(audio)
    releaseFirst()
    const releaseSecond = retainConcertAudio(audio)
    await prepareConcertAudio(audio)
    await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(stats.sources, 1)
    assert.equal(stats.audible, 1)
    assert.equal(stats.closed, 0)
    assert.ok(getConcertAnalyser(audio))
    releaseSecond()
    await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(stats.closed, 1)
    assert.equal(getConcertAnalyser(audio), null)
  } finally { globalThis.AudioContext = original }
})

test('missing Web Audio leaves playback preparation usable', async () => {
  const original = globalThis.AudioContext
  globalThis.AudioContext = undefined
  try {
    const audio = {}
    const release = retainConcertAudio(audio)
    await prepareConcertAudio(audio)
    assert.equal(getConcertAnalyser(audio), null)
    release()
  } finally { globalThis.AudioContext = original }
})
