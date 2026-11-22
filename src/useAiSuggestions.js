import { useEffect, useMemo, useRef, useState } from 'react'
import { plainLyrics } from './lyricMarkup.mjs'
import { AI_CATEGORIES, lineFingerprint } from './aiSuggestions.mjs'
import { readAiResponse } from './aiProgress.mjs'
import { reportBrowserDiagnostic } from './browserDiagnosticsClient.mjs'

export default function useAiSuggestions(lines, enabled) {
  const [results, setResults] = useState({})
  const [retry, setRetry] = useState(0)
  const cache = useRef(new Map())
  const serial = useRef(Promise.resolve())
  const serialized = JSON.stringify(lines)
  const requests = useMemo(() => {
    const data = JSON.parse(serialized)
    return data.map((line, index) => {
      const context = [data[index - 1], data[index + 1]].filter(Boolean)
      const repetitions = data.filter(item => plainLyrics(item.text).trim().toLocaleLowerCase('fr') === plainLyrics(line.text).trim().toLocaleLowerCase('fr')).length
      const payload = { line, context, repetitions, lineIndex: index, policyVersion: 5 }
      return { key: JSON.stringify(payload), payload, fingerprint: lineFingerprint(line) }
    })
  }, [serialized])
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const timer = setTimeout(() => {
      const run = async () => {
        for (const request of requests) {
          if (stopped) return
          const line = request.payload.line
          if (line.isInstrumental || !line.text.trim()) continue
          if (cache.current.has(request.key)) {
            setResults(previous => ({ ...previous, [request.key]: cache.current.get(request.key) }))
            continue
          }
          const startedAt = Date.now()
          let history = []
          setResults(previous => ({ ...previous, [request.key]: { state: 'loading', startedAt, history } }))
          let result
          let responseStatus
          try {
            const response = await fetch(`${import.meta.env.BASE_URL}api/ai/suggestions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ ...request.payload, force: retry > 0 }), signal: AbortSignal.timeout(240000),
            })
            responseStatus = response.status
            const payload = await readAiResponse(response, progress => {
              history = [...history, progress].slice(-12)
              if (!stopped) setResults(previous => ({ ...previous, [request.key]: { state: 'loading', startedAt, progress, history } }))
            })
            result = { state: 'done', ...payload, history, elapsedMs: Date.now() - startedAt }
          } catch (error) {
            reportBrowserDiagnostic({ type: 'ai-error', errorName: error.name, status: responseStatus })
            result = { state: 'error', error: error.message || 'Analyse indisponible. Vérifiez le serveur local.', history, elapsedMs: Date.now() - startedAt }
          }
          cache.current.set(request.key, result)
          if (!stopped) setResults(previous => ({ ...previous, [request.key]: result }))
        }
      }
      serial.current = serial.current.then(run).catch(() => undefined)
    }, 1000)
    return () => { stopped = true; clearTimeout(timer) }
  }, [enabled, requests, retry])
  // Ignore retired categories even when an older API or cached response returns them.
  const entries = requests.map(request => {
    const result = results[request.key] || { state: 'waiting' }
    return { ...request, ...result, suggestions: result.suggestions?.filter(item => Object.hasOwn(AI_CATEGORIES, item.category)) }
  })
  const retryErrors = () => {
    for (const [key, value] of cache.current) if (value.state === 'error' || value.warnings?.length) cache.current.delete(key)
    setResults(previous => Object.fromEntries(Object.entries(previous).filter(([, value]) => value.state !== 'error' && !value.warnings?.length)))
    setRetry(value => value + 1)
  }
  return { entries, retryErrors }
}
