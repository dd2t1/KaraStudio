import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export function createAiCache(directory, identity, { maxEntries = 1000, ttl = 7 * 24 * 60 * 60 * 1000 } = {}) {
  const file = join(directory, 'suggestions.json')
  const entries = new Map()
  let loaded
  const load = () => loaded ||= fs.readFile(file, 'utf8').then(source => {
    const stored = JSON.parse(source)
    if (stored.version !== 1 || !Array.isArray(stored.entries)) return
    for (const [key, entry] of stored.entries.slice(-maxEntries)) {
      if (typeof key === 'string' && entry?.result && Array.isArray(entry.result.suggestions) && Date.now() - entry.savedAt < ttl) entries.set(key, entry)
    }
  }).catch(() => undefined)
  const keyFor = payload => createHash('sha256').update(JSON.stringify({ identity, kind: payload.kind || 'suggestions', line: payload.line, context: payload.context || [], repetitions: payload.repetitions || 1, lineIndex: payload.lineIndex ?? 0 })).digest('hex')
  return {
    keyFor,
    async get(key) {
      await load()
      const entry = entries.get(key)
      if (!entry || Date.now() - entry.savedAt >= ttl) return null
      return entry.result
    },
    async set(key, result) {
      await load()
      entries.delete(key)
      entries.set(key, { savedAt: Date.now(), result })
      for (const [oldKey, entry] of entries) if (Date.now() - entry.savedAt >= ttl) entries.delete(oldKey)
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
      try {
        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(`${file}.tmp`, JSON.stringify({ version: 1, entries: [...entries] }), 'utf8')
        await fs.rename(`${file}.tmp`, file)
      } catch { /* Analysis remains available when disk storage is unavailable. */ }
    },
  }
}
