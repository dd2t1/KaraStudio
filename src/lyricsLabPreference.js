import { useSyncExternalStore } from 'react'

const key = 'karaoke-lyrics-lab-enabled'
const listeners = new Set()
let fallback = false
const snapshot = () => { try { return localStorage.getItem(key) === 'true' } catch { return fallback } }
const subscribe = notify => {
  listeners.add(notify)
  const changed = event => { if (event.key === key || event.key === null) notify() }
  window.addEventListener('storage', changed)
  return () => { listeners.delete(notify); window.removeEventListener('storage', changed) }
}
export function setLyricsLab(enabled) {
  fallback = enabled
  try { localStorage.setItem(key, String(enabled)) } catch { /* Session-only setting. */ }
  listeners.forEach(notify => notify())
}
export default function useLyricsLabPreference() { return useSyncExternalStore(subscribe, snapshot, () => false) }
