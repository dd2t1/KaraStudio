import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { registerHomeAssistant, hassConfig, callHass } from '../homeAssistant.mjs'

test('configuration accepts HASS_TOCKEN and HASS_TOKEN without putting the token in the URL', () => {
  assert.deepEqual(hassConfig({ HASS_URL: 'http://localhost:8123/', HASS_TOCKEN: 'secret' }), { url: 'http://localhost:8123/api/karaoke_storage', token: 'secret' })
  assert.equal(hassConfig({ HASS_URL: 'https://example.test', HASS_TOKEN: 'fallback' }).token, 'fallback')
  assert.throws(() => hassConfig({}), /HASS_URL/)
  assert.throws(() => hassConfig({ HASS_URL: 'file:///tmp', HASS_TOKEN: 'secret' }), /HTTP/)
})

test('saved library loads matching JSON/audio through the server and blocks foreign origins and invalid IDs', async t => {
  const oldUrl = process.env.HASS_URL, oldToken = process.env.HASS_TOCKEN
  const id = 'a'.repeat(32)
  let calls = 0
  const upstream = express()
  upstream.get('/api/karaoke_storage/projects', (req, res) => {
    calls++
    assert.equal(req.headers.authorization, 'Bearer library-test-token')
    res.json({ projects: [{ id, title: 'Chanson' }] })
  })
  upstream.get(`/api/karaoke_storage/projects/${id}/:kind`, (req, res) => {
    calls++
    assert.equal(req.headers.authorization, 'Bearer library-test-token')
    if (req.params.kind === 'audio') res.type('audio/mpeg').send(Buffer.from('original-mp3'))
    else res.json({ lyrics: [{ start: 0, end: 2, text: 'Chanson' }] })
  })
  const remote = upstream.listen(0, '127.0.0.1')
  await once(remote, 'listening')
  process.env.HASS_URL = `http://127.0.0.1:${remote.address().port}`
  process.env.HASS_TOCKEN = 'library-test-token'
  const app = express()
  registerHomeAssistant(app)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections(); server.close()
    remote.closeAllConnections(); remote.close()
    if (oldUrl === undefined) delete process.env.HASS_URL; else process.env.HASS_URL = oldUrl
    if (oldToken === undefined) delete process.env.HASS_TOCKEN; else process.env.HASS_TOCKEN = oldToken
  })
  const base = `http://127.0.0.1:${server.address().port}/api/home-assistant/projects`
  const list = await fetch(base)
  assert.deepEqual(await list.json(), { projects: [{ id, title: 'Chanson' }] })
  const json = await fetch(`${base}/${id}/project`)
  assert.equal((await json.json()).lyrics[0].text, 'Chanson')
  const audio = await fetch(`${base}/${id}/audio`)
  assert.match(audio.headers.get('content-type'), /audio\/mpeg/)
  assert.equal(await audio.text(), 'original-mp3')
  assert.equal(audio.headers.get('cache-control'), 'no-store')
  assert.equal((await fetch(`${base}/invalid/audio`)).status, 400)
  assert.equal((await fetch(`${base}/${id}/secret`)).status, 400)
  assert.equal((await fetch(base, { headers: { Origin: 'https://foreign.example' } })).status, 403)
  assert.equal(calls, 3)
})

test('Home Assistant errors are actionable and never echo upstream credentials or bodies', async () => {
  for (const [status, expected] of [[401, /token/], [403, /administrateur/], [404, /Installez/], [413, /limite/]]) {
    await assert.rejects(callHass({ url: 'https://example.test', token: 'secret' }, {}, async () => new Response('secret upstream details', { status })), expected)
  }
  await assert.rejects(callHass({ url: 'https://example.test', token: 'secret' }, {}, async () => { throw new Error('secret') }), /injoignable/)
})

test('multipart save forwards audio and validated JSON, rejects invalid requests before contacting HA', async t => {
  const oldUrl = process.env.HASS_URL, oldToken = process.env.HASS_TOCKEN
  let upstreamCalls = 0
  const upstream = express()
  upstream.post('/api/karaoke_storage', async (req, res) => {
    upstreamCalls++
    assert.equal(req.headers.authorization, 'Bearer test-only-token')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers['content-type'] } }).formData()
    const project = JSON.parse(form.get('project'))
    assert.equal(project.songInfo.audioFile, 'musique.mp3')
    assert.equal(project.lyrics[0].text, 'Bonjour')
    assert.equal(await form.get('audio').text(), 'audio-bytes')
    res.status(201).json({ media_content_id: 'media-source://media_source/local/karaoke/test/musique.mp3' })
  })
  const upstreamServer = upstream.listen(0, '127.0.0.1')
  await once(upstreamServer, 'listening')
  process.env.HASS_URL = `http://127.0.0.1:${upstreamServer.address().port}`
  process.env.HASS_TOCKEN = 'test-only-token'
  const app = express()
  registerHomeAssistant(app)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections(); server.close()
    upstreamServer.closeAllConnections(); upstreamServer.close()
    if (oldUrl === undefined) delete process.env.HASS_URL; else process.env.HASS_URL = oldUrl
    if (oldToken === undefined) delete process.env.HASS_TOCKEN; else process.env.HASS_TOCKEN = oldToken
  })
  const url = `http://127.0.0.1:${server.address().port}/api/home-assistant/projects`
  const send = (lyrics, headers = { 'X-Karaoke-Request': '1' }) => {
    const body = new FormData()
    body.append('project', JSON.stringify({ lyrics }))
    body.append('audio', new Blob(['audio-bytes'], { type: 'audio/mpeg' }), 'original.mp3')
    return fetch(url, { method: 'POST', body, headers })
  }
  const lyrics = [{ start: 0, end: 2, text: 'Bonjour' }]
  let response = await send(lyrics)
  assert.equal(response.status, 201)
  assert.equal((await response.json()).saved, true)
  response = await send([{ start: 2, end: 0, text: 'Bad' }])
  assert.equal(response.status, 400)
  response = await send(lyrics, { 'X-Karaoke-Request': '1', Origin: 'https://untrusted.example' })
  assert.equal(response.status, 403)
  response = await send(lyrics, {})
  assert.equal(response.status, 403)
  response = await fetch(url, { method: 'POST', headers: { 'X-Karaoke-Request': '1', 'Content-Type': 'text/plain' }, body: 'invalid' })
  assert.equal(response.status, 400)
  assert.equal(upstreamCalls, 1)
})
