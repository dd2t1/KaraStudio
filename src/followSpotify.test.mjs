import test from 'node:test'
import assert from 'node:assert/strict'
import { matchingLyrics } from './followSpotify.mjs'

test('follow matches recording and favors synced closest duration', () => {
  const track = { name: 'Première fois', artists: [{ name: 'Artiste' }], duration_ms: 180000 }
  const base = { trackName: 'Premiere fois', artistName: 'Artiste', duration: 180 }
  const records = [{ ...base, id: 1, plainLyrics: 'a' }, { ...base, id: 2, duration: 181, syncedLyrics: 'a' }, { ...base, id: 3, duration: 180.1, syncedLyrics: 'a' }]
  assert.equal(matchingLyrics(records, track).id, 3)
  assert.equal(matchingLyrics([{ ...base, trackName: 'Première fois live' }], track), null)
  assert.equal(matchingLyrics([{ ...base, artistName: 'Autre' }], track), null)
  assert.equal(matchingLyrics([{ ...base, duration: 190 }], track), null)
})
