import test from 'node:test'
import assert from 'node:assert/strict'
import { detectTvDevice } from './detectTv.mjs'

test('a desktop browser is not treated as a TV', () => {
  assert.equal(detectTvDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'), false)
  assert.equal(detectTvDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'), false)
  assert.equal(detectTvDevice('Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0'), false)
})

test('known television user agents are detected without matching desktop browsers', () => {
  assert.equal(detectTvDevice('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36'), true)
  assert.equal(detectTvDevice('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36'), true)
  assert.equal(detectTvDevice('AppleTV/11.1'), true)
  assert.equal(detectTvDevice('Mozilla/5.0 (CrKey armv7l) AppleWebKit/537.36 Chromecast'), true)
  assert.equal(detectTvDevice('Roku/DVP-12.0'), true)
})
