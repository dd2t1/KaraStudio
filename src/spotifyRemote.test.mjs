import test from 'node:test'
import assert from 'node:assert/strict'
import { spotifyTrackId, spotifyTime } from './spotifyRemote.mjs'

test('Spotify track URLs accept locale and sharing parameters, but reject other hosts and resources', () => {
  const id = '3sHa6NoDxdvS7SYApXJUrC'
  assert.equal(spotifyTrackId(`https://open.spotify.com/intl-fr/track/${id}?si=862fad8b08164abe`), id)
  assert.equal(spotifyTrackId(`https://open.spotify.com/track/${id}`), id)
  assert.equal(spotifyTrackId(`https://example.com/track/${id}`), null)
  assert.equal(spotifyTrackId(`https://open.spotify.com/album/${id}`), null)
})

test('remote clock follows playback and freezes on pause', () => {
  const state = { progress_ms: 12000, observedAt: 1000, is_playing: true, item: { duration_ms: 20000 } }
  assert.equal(spotifyTime(state, 3500), 14.5)
  assert.equal(spotifyTime(state, 20000), 20)
  assert.equal(spotifyTime({ ...state, is_playing: false }, 3500), 12)
})
