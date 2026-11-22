export function spotifyTrackId(value) {
  const input = value.trim()
  if (/^[A-Za-z0-9]{22}$/.test(input)) return input
  try {
    const url = new URL(input)
    if (url.hostname !== 'open.spotify.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0]?.startsWith('intl-')) parts.shift()
    return parts[0] === 'track' && /^[A-Za-z0-9]{22}$/.test(parts[1]) ? parts[1] : null
  } catch { return null }
}

export function spotifyTime(state, now = performance.now()) {
  if (!state || !Number.isFinite(state.progress_ms)) return 0
  const elapsed = state.is_playing ? Math.min(25000, Math.max(0, now - state.observedAt)) : 0
  return Math.min((state.progress_ms + elapsed) / 1000, (state.item?.duration_ms || Infinity) / 1000)
}
