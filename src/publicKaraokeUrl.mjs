function resolveDefaultOrigin() {
  if (typeof process !== 'undefined' && process.env?.VITE_PUBLIC_ORIGIN) {
    return process.env.VITE_PUBLIC_ORIGIN
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'http://localhost:5173'
}

export function publicKaraokeUrl(action, base = '/dev/', params = {}, origin) {
  const targetOrigin = origin || resolveDefaultOrigin()
  const url = new URL(base || '/', targetOrigin)
  if (action) url.searchParams.set('action', action)
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value)
  return url.href
}
