import test from 'node:test'
import assert from 'node:assert/strict'
import { publicKaraokeUrl } from './publicKaraokeUrl.mjs'

test('QR links use the public karaoke domain and app path', () => {
  const origin = 'https://karaoke.example.com'
  assert.equal(publicKaraokeUrl('edit', '/dev/', {}, origin), 'https://karaoke.example.com/dev/?action=edit')
  assert.equal(publicKaraokeUrl('settings', '/dev/', {}, origin), 'https://karaoke.example.com/dev/?action=settings')
  assert.equal(publicKaraokeUrl('spotify-auth', '/dev/', {}, origin), 'https://karaoke.example.com/dev/?action=spotify-auth')
  assert.equal(publicKaraokeUrl('control', '/dev/', { code: 'K7M3PQ' }, origin), 'https://karaoke.example.com/dev/?action=control&code=K7M3PQ')
})
