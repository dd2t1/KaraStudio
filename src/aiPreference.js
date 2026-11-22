import { useSyncExternalStore } from 'react'

const key = 'karaoke-ai-assistance-enabled'
let fallback = false
const listeners = new Set()
const snapshot = () => {
  try { return localStorage.getItem(key) === 'true' } catch { return fallback }
}
const subscribe = notify => {
  listeners.add(notify)
  const storage = event => { if (event.key === key || event.key === null) notify() }
  window.addEventListener('storage', storage)
  return () => { listeners.delete(notify); window.removeEventListener('storage', storage) }
}
export function setAiAssistance(enabled) {
  fallback = enabled
  try { localStorage.setItem(key, String(enabled)) } catch { /* Session preference still works. */ }
  listeners.forEach(notify => notify())
}
export default function useAiPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
