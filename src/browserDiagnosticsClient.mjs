import { sanitizeDiagnostic } from './browserDiagnosticData.mjs'

export const DIAGNOSTIC_PREFERENCE = 'karaoke-local-diagnostics-enabled'
let activeReporter = () => {}
export const reportBrowserDiagnostic = value => activeReporter(value)

export function installBrowserDiagnostics({ win = window, baseUrl = '/dev/', fetcher = fetch,
  isEnabled = () => { try { return win.localStorage.getItem(DIAGNOSTIC_PREFERENCE) === 'true' } catch { return false } },
  clock = Date.now,
} = {}) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(win.location.hostname)
  let windowStart = clock(), count = 0
  const recent = new Map()
  const send = value => {
    if (!local || !isEnabled()) return
    const data = sanitizeDiagnostic(value)
    if (!data) return
    const now = clock()
    if (now - windowStart >= 60000) { windowStart = now; count = 0; recent.clear() }
    const key = JSON.stringify(data)
    if (count >= 10 || recent.has(key) && now - recent.get(key) < 5000) return
    count++; recent.set(key, now)
    try {
      Promise.resolve(fetcher(`${baseUrl}api/browser-errors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        credentials: 'same-origin', signal: AbortSignal.timeout(5000),
      })).catch(() => {})
    } catch { /* Diagnostics must never interfere with the application. */ }
  }
  const onError = event => {
    let source
    try {
      const url = new URL(event.filename, win.location.href)
      if (url.origin === win.location.origin) source = url.pathname
    } catch { /* No source details for unknown resources. */ }
    send({ type: event.target && event.target !== win ? 'resource-error' : 'javascript-error',
      errorName: event.error?.name, source, line: event.lineno, column: event.colno })
  }
  const onRejection = event => send({ type: 'promise-rejection', errorName: event.reason?.name })
  win.addEventListener('error', onError, true)
  win.addEventListener('unhandledrejection', onRejection)
  activeReporter = send
  return () => {
    win.removeEventListener('error', onError, true)
    win.removeEventListener('unhandledrejection', onRejection)
    if (activeReporter === send) activeReporter = () => {}
  }
}
