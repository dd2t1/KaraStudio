import { loadLaunchSong } from './songLaunch.mjs'

const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export function matchingLyrics(records, track) {
  const artists = new Set((track.artists || []).map(artist => normalize(artist.name)))
  return records.filter(item => normalize(item.trackName) === normalize(track.name) && artists.has(normalize(item.artistName)) && Number.isFinite(Number(item.duration)) && Math.abs(Number(item.duration) - track.duration_ms / 1000) <= 2)
    .sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics)) || Math.abs(a.duration - track.duration_ms / 1000) - Math.abs(b.duration - track.duration_ms / 1000))[0] || null
}

export async function followSpotifyTrack(track, signal) {
  const query = new URLSearchParams({ track_name: track.name, artist_name: track.artists?.[0]?.name || '' })
  const response = await fetch(`https://lrclib.net/api/search?${query}`, { signal })
  if (!response.ok) throw new Error(response.status === 429 ? 'Recherche limitée par LRCLIB. Réessayez plus tard.' : 'Recherche de paroles indisponible.')
  const records = await response.json()
  if (!Array.isArray(records)) throw new Error('Réponse de paroles invalide.')
  const match = matchingLyrics(records, track)
  if (!match) return { lyrics: [], result: null }
  const result = { spotify_id: track.id, lyrics_id: match.id }
  if (!match.syncedLyrics) return { lyrics: [], result }
  const song = await loadLaunchSong(new URLSearchParams({ spotify: track.id, lyrics: String(match.id) }), signal)
  return { lyrics: song.lyrics, result }
}
