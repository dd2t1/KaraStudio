import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { registerCastSync } from '../castSync.mjs'
import { castTime } from './castClock.mjs'

test('receiver clock follows playback rate and stops on pause, seek, and stale updates', () => {
  const state = { time: 12, playing: true, rate: 2, updatedAt: 1000, serverTime: 1100 }
  assert.equal(castTime(state, 200, 0).time, 12.6)
  assert.equal(castTime({ ...state, playing: false }, 200).time, 12)
  assert.equal(castTime({ ...state, time: 2, playing: false }, 0).time, 2)
  assert.equal(castTime(state, 3000).stale, true)
})

test('relay isolates sessions, protects write access and rejects reordered snapshots', async t => {
  const app = express()
  registerCastSync(app)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}/api/cast/`
  const room = 'a'.repeat(32), key = 'b'.repeat(32)
  const lyrics = [{ start: 0, end: 4, text: 'Première phrase' }]
  const state = { sequence: 1, time: 0, rate: 1, playing: true, answers: [], lyrics }
  const put = (data, secret = key) => fetch(base + room, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Karaoke-Presenter': secret }, body: JSON.stringify(data) })
  assert.equal((await put(state)).status, 200)
  assert.equal((await put({ ...state, sequence: 2 }, 'c'.repeat(32))).status, 403)
  const update = { ...state, sequence: 3, time: 2, playing: false }; delete update.lyrics
  assert.equal((await put(update)).status, 200)
  assert.equal((await put(state)).status, 409)
  const received = await (await fetch(base + room)).json()
  assert.deepEqual(received.lyrics, lyrics)
  assert.equal(received.time, 2)
  assert.equal(received.playing, false)
  assert.equal('writeKey' in received, false)
  assert.equal((await fetch(base + 'd'.repeat(32))).status, 404)
  assert.equal((await put({ ...state, sequence: 4, time: -1 })).status, 400)
})

test('a TV device code links one phone and keeps the write key out of the QR payload', async t => {
  const app = express()
  registerCastSync(app)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}/api/cast`
  const created = await (await fetch(`${base}/pair`, { method: 'POST' })).json()
  assert.match(created.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  assert.match(created.room, /^[a-f0-9]{32}$/)
  assert.equal('presenter' in created, false)
  const status = await (await fetch(`${base}/pair/${created.code}`)).json()
  assert.equal(status.claimed, false)
  const claim = await (await fetch(`${base}/pair/${created.code.toLowerCase()}/claim`, { method: 'POST' })).json()
  assert.equal(claim.room, created.room)
  assert.match(claim.presenter, /^[a-f0-9]{32}$/)
  assert.equal((await fetch(`${base}/pair/${created.code}/claim`, { method: 'POST' })).status, 409)
  const put = await fetch(`${base}/${claim.room}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Karaoke-Presenter': claim.presenter },
    body: JSON.stringify({ sequence: 1, time: 1, rate: 1, playing: true, answers: [], lyrics: [{ start: 0, end: 2, text: 'Lié' }] }),
  })
  assert.equal(put.status, 200)
  assert.equal((await fetch(`${base}/pair/ZZZZZZ`)).status, 404)
})
