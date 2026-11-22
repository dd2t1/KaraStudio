import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { receiveProject } from '../homeAssistant.mjs'
import { spotifyTime } from './spotifyRemote.mjs'

function upload(project) {
  const body = `--test-boundary\r\nContent-Disposition: form-data; name="project"\r\n\r\n${JSON.stringify(project)}\r\n--test-boundary--\r\n`
  const request = Readable.from([Buffer.from(body)])
  request.headers = { 'content-type': 'multipart/form-data; boundary=test-boundary' }
  return receiveProject(request)
}

test('Spotify JSON upload preserves track and timings without requiring audio or copying credentials', async () => {
  const project = { songInfo: { spotifyTrackId: '3sHa6NoDxdvS7SYApXJUrC', token: 'must-not-export' }, lyrics: [{ start: 1, end: 3, text: 'Bonjour' }] }
  const result = await upload(project)
  assert.equal(result.audio, undefined)
  assert.equal(result.project.songInfo.spotifyTrackId, project.songInfo.spotifyTrackId)
  assert.equal(result.project.songInfo.audioFile, null)
  assert.equal(result.project.songInfo.token, undefined)
  await assert.rejects(upload({ ...project, songInfo: { spotifyTrackId: '../bad' } }), /Spotify invalide/)
  await assert.rejects(upload({ ...project, songInfo: {} }), /audio est requis/)
})

test('Spotify clock freezes when updates have stopped for 25 seconds', () => {
  const state = { progress_ms: 1000, observedAt: 1000, is_playing: true, item: { duration_ms: 180000 } }
  assert.equal(spotifyTime(state, 27000), 26)
  assert.equal(spotifyTime(state, 90000), 26)
})
