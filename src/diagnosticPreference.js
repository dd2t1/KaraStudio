import { useSyncExternalStore } from 'react'
import { DIAGNOSTIC_PREFERENCE, installBrowserDiagnostics } from './browserDiagnosticsClient.mjs'

let fallback = false
const listeners = new Set()
const snapshot = () => {
  try { return localStorage.getItem(DIAGNOSTIC_PREFERENCE) === 'true' } catch { return fallback }
}
const subscribe = notify => {
  listeners.add(notify)
  const storage = event => { if (event.key === DIAGNOSTIC_PREFERENCE || event.key === null) notify() }
  window.addEventListener('storage', storage)
  return () => { listeners.delete(notify); window.removeEventListener('storage', storage) }
}
export function setLocalDiagnostics(enabled) {
  fallback = enabled
  try { localStorage.setItem(DIAGNOSTIC_PREFERENCE, String(enabled)) } catch { /* Keep session preference. */ }
  listeners.forEach(notify => notify())
}
const cleanup = installBrowserDiagnostics({ baseUrl: import.meta.env.BASE_URL, isEnabled: snapshot })
if (import.meta.hot) import.meta.hot.dispose(cleanup)
export default function useDiagnosticPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
