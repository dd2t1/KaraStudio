import { useSyncExternalStore } from 'react'
import { detectTvDevice } from './detectTv.mjs'

export { detectTvDevice }

const key = 'karaoke.tvMode'
let fallback = false
const listeners = new Set()

const snapshot = () => {
  try {
    const saved = localStorage.getItem(key)
    if (saved === 'true' || saved === 'false') return saved === 'true'
  } catch { /* Storage can be blocked; keep the session choice. */ }
  return fallback || detectTvDevice(navigator.userAgent)
}

const subscribe = notify => {
  listeners.add(notify)
  const storage = event => { if (event.key === key || event.key === null) notify() }
  window.addEventListener('storage', storage)
  return () => { listeners.delete(notify); window.removeEventListener('storage', storage) }
}

export function setTvMode(enabled) {
  fallback = enabled
  try { localStorage.setItem(key, String(enabled)) } catch { /* Session preference still works. */ }
  listeners.forEach(notify => notify())
}

export default function useTvMode() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
