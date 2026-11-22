import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { readAiResponse } from './aiProgress.mjs'
import { createAiService, registerAi } from '../aiService.mjs'

function streamed(text) {
  const bytes = new TextEncoder().encode(text)
  return new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
    controller.close()
  } }), { headers: { 'content-type': 'text/event-stream' } })
}

test('live progress handles fragmented UTF-8, heartbeat, CRLF and final result', async () => {
  const updates = []
  const result = await readAiResponse(streamed(': heartbeat\r\n\r\nevent: progress\r\ndata: {"stage":"laya","elapsedMs":12}\r\n\r\nevent: result\ndata: {"suggestions":[],"note":"écartée"}\n\n'), update => updates.push(update))
  assert.equal(result.note, 'écartée')
  assert.deepEqual(updates, [{ stage: 'laya', elapsedMs: 12 }])
})

test('live failures and truncated streams are actionable; JSON remains compatible', async () => {
  await assert.rejects(readAiResponse(streamed('event: error\ndata: {"error":"Moteur indisponible"}\n\n')), /indisponible/)
  await assert.rejects(readAiResponse(streamed('event: progress\ndata: {"stage":"laya"}\n\n')), /interrompu/)
  const result = await readAiResponse(Response.json({ suggestions: [] }))
  assert.deepEqual(result, { suggestions: [] })
})

test('service reports real phases and cache hits without invoking a model', async () => {
  const updates = []
  const service = createAiService({ cache: { keyFor: () => 'key', get: async () => null, set: async () => {} },
    loadLaya: async () => ({ systemOne: async () => ({ answers: {
      relevance: { choice: 'skip' }, effect: { choice: 'none' }, difficulty: { score: 0 },
    } }) }), fetcher: async () => { throw new Error('must not run') },
  })
  await service.analyze({ line: { text: 'Et puis voilà', start: 0, end: 3 }, onProgress: event => updates.push(event) })
  assert.deepEqual(updates.map(event => event.stage), ['cache-check', 'queued', 'loading-model', 'laya', 'skipped', 'validating', 'complete'])
  assert.ok(updates.every(event => event.elapsedMs >= 0))
  const cachedUpdates = []
  const cached = createAiService({ cache: { keyFor: () => 'key', get: async () => ({ suggestions: [] }), set: async () => {} }, loadLaya: async () => { throw new Error('must not run') } })
  await cached.analyze({ line: {}, onProgress: event => cachedUpdates.push(event.stage) })
  assert.deepEqual(cachedUpdates, ['cache-check', 'cache'])
})

test('API streams progress before the result and keeps ordinary JSON clients supported', async t => {
  const app = express()
  registerAi(app, { analyze: async payload => {
    payload.onProgress?.({ stage: 'laya', elapsedMs: 10 })
    return { suggestions: [], engines: {} }
  } })
  const server = app.listen(0, '127.0.0.1')
  t.after(() => { server.closeAllConnections(); server.close() })
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/ai/suggestions`
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ line: { text: 'Le soleil', start: 0, end: 3 } }) }
  const events = []
  const result = await readAiResponse(await fetch(url, options), event => events.push(event.stage))
  assert.deepEqual(events, ['laya'])
  assert.deepEqual(result.suggestions, [])
  const json = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json' } })
  assert.deepEqual((await json.json()).suggestions, [])
})
