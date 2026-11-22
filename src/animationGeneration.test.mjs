import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { createAiService, registerAi } from '../aiService.mjs'

const rest = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, glow: 0 }
const profile = { name: 'Pulsation légère', duration: .8, easing: 'smooth', frames: [{ at: 0, ...rest }, { at: .5, ...rest, scale: 1.15 }, { at: 1, ...rest }] }
const payload = { word: 'amour', description: 'Doux et lisible', context: 'Je garde ton amour' }
const memoryCache = () => {
  const data = new Map()
  return { keyFor: value => JSON.stringify(value), get: async key => data.get(key), set: async (key, value) => { data.set(key, value) } }
}

test('structured animation generation validates data and reuses one cached profile request', async () => {
  let calls = 0
  const service = createAiService({ cache: memoryCache(), fetcher: async (_url, options) => {
    calls++
    const body = JSON.parse(options.body)
    assert.equal(body.response_format.json_schema.schema.properties.profiles.items.properties.frames.maxItems, 6)
    assert.equal(JSON.parse(body.messages[1].content).word, 'amour')
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ profiles: [profile] }) } }] }) }
  } })
  const first = await service.generateAnimation(payload)
  const second = await service.generateAnimation(payload)
  assert.equal(calls, 1)
  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.deepEqual(second.profiles, [profile])
  assert.deepEqual(second.suggestions, [])
})

test('generated scripts, unsafe profiles and truncated output are never exposed', async () => {
  for (const output of [
    { profiles: [{ ...profile, script: 'fetch("https://example.com")' }] },
    { profiles: [{ ...profile, frames: profile.frames.map(frame => ({ ...frame, opacity: 0 })) }] },
    { profiles: [] },
  ]) {
    const service = createAiService({ cache: memoryCache(), fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) }) })
    await assert.rejects(service.generateAnimation(payload), /valide/)
  }
  const truncated = createAiService({ cache: memoryCache(), fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) }) })
  await assert.rejects(truncated.generateAnimation(payload), /incomplète/)
})

test('manual animation generation shares the serialized inference queue', async () => {
  let active = 0, max = 0
  const wait = async () => { active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 8)); active-- }
  const service = createAiService({ cache: memoryCache(), loadLaya: async () => ({ systemOne: async () => {
    await wait(); return { answers: { relevance: { choice: 'skip' }, difficulty: { score: 0 }, effect: { choice: 'none' } } }
  } }), fetcher: async () => { await wait(); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ profiles: [profile] }) } }] }) } } })
  await Promise.all([service.analyze({ line: { text: 'Je garde ton amour', start: 0, end: 4 } }), service.generateAnimation(payload)])
  assert.equal(max, 1)
})

test('animation API rejects invalid inputs and does not echo engine error details', async t => {
  const app = express()
  registerAi(app, { generateAnimation: async () => { throw new Error('SECRET token') } })
  const server = app.listen(0, '127.0.0.1')
  t.after(() => { server.closeAllConnections(); server.close() })
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/ai/animation`
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  for (const body of [{ word: '<script>' }, { word: 'un deux trois quatre' }, { word: '' }, { word: 'amour', description: 'a'.repeat(181) }]) assert.equal((await post(body)).status, 400)
  const response = await post(payload)
  assert.equal(response.status, 503)
  assert.ok(!(await response.text()).includes('SECRET'))
})
