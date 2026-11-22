import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAiCache } from '../aiCache.mjs'
import { createAiService } from '../aiService.mjs'

test('server cache survives a new instance and invalidates edited lyrics, timing, context and model', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'karaoke-ai-cache-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const first = createAiCache(directory, 'model-a')
  const payload = { line: { text: 'Le soleil', start: 0, end: 3 }, context: [{ text: 'La lune' }] }
  const result = { suggestions: [], warnings: [], engines: { lmStudio: true } }
  const key = first.keyFor(payload)
  await first.set(key, result)
  const second = createAiCache(directory, 'model-a')
  assert.deepEqual(await second.get(second.keyFor(payload)), result)
  for (const changed of [
    { ...payload, line: { ...payload.line, text: 'Le vent' } },
    { ...payload, line: { ...payload.line, end: 4 } },
    { ...payload, context: [{ text: 'Le nuage' }] },
    { ...payload, lineIndex: 1 },
  ]) assert.equal(await second.get(second.keyFor(changed)), null)
  assert.equal(await second.get(createAiCache(directory, 'model-b').keyFor(payload)), null)
})

test('bounded cache evicts old entries and cached requests skip both inference engines', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'karaoke-ai-cache-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const cache = createAiCache(directory, 'test', { maxEntries: 2 })
  const result = { suggestions: [], warnings: [], engines: { lmStudio: true } }
  await cache.set('old', result)
  await cache.set('middle', result)
  const payload = { line: { text: 'Le soleil', start: 0, end: 3 } }
  await cache.set(cache.keyFor(payload), result)
  assert.equal(await cache.get('old'), null)
  const service = createAiService({ cache, loadLaya: async () => { throw new Error('must not run') }, fetcher: async () => { throw new Error('must not run') } })
  assert.equal((await service.analyze(payload)).cached, true)
  const refreshed = await service.analyze({ ...payload, force: true })
  assert.equal(refreshed.cached, false)
  assert.ok(refreshed.warnings.length)
})
