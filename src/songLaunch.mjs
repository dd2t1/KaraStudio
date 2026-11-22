import { parsePlayLevel } from './playLevel.mjs'

export function songLaunchUrl(result, mode, base = location.href) {
  const url = new URL(base)
  for (const key of ['project', 'lyrics', 'spotify', 'action']) url.searchParams.delete(key)
  if (/^[a-f0-9]{32}$/.test(result.project_id || '')) url.searchParams.set('project', result.project_id)
  else {
    if (!Number.isSafeInteger(result.lyrics_id)) throw new Error('Aucune parole disponible pour ce morceau.')
    url.searchParams.set('lyrics', result.lyrics_id)
    if (/^[A-Za-z0-9]{22}$/.test(result.spotify_id || '')) url.searchParams.set('spotify', result.spotify_id)
  }
  url.searchParams.set('action', mode)
  return url.href
}

export async function loadLaunchSong(params, signal, base = '/dev/') {
  const get = async url => {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Impossible de charger le morceau ou ses paroles.')
    return response
  }
  const id = params.get('project')
  if (id) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Projet invalide.')
    const endpoint = `${base}api/home-assistant/projects/${id}`
    const project = await (await get(`${endpoint}/project`)).json()
    const lyrics = parsePlayLevel(JSON.stringify(project))
    const trackId = project.songInfo?.spotifyTrackId || null
    const audio = trackId ? null : await (await get(`${endpoint}/audio`)).blob()
    return { lyrics, trackId, audio, title: project.songInfo?.title || 'Projet', audioName: project.songInfo?.audioFile || 'musique.mp3' }
  }
  if (!params.has('lyrics') && params.get('action') === 'edit' && /^[A-Za-z0-9]{22}$/.test(params.get('spotify') || '')) return { lyrics: [], rawLyrics: '', trackId: params.get('spotify'), audio: null, title: 'Nouveau morceau Spotify' }
  const lyricsId = params.get('lyrics')
  if (!/^\d+$/.test(lyricsId || '')) throw new Error('Identifiant de paroles invalide.')
  const record = await (await get(`https://lrclib.net/api/get/${lyricsId}`)).json()
  const lines = []
  for (const line of (record.syncedLyrics || '').split('\n')) {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const text = line.replace(/\[[^\]]*\]/g, '').trim()
    for (const match of times) if (text) lines.push({ start: Number(match[1]) * 60 + Number(match[2]), text })
  }
  lines.sort((a, b) => a.start - b.start)
  const grouped = lines.filter((line, i) => !i || line.start !== lines[i - 1].start)
  const lyrics = grouped.map((line, i) => ({ ...line, end: grouped[i + 1]?.start ?? Math.max(Number(record.duration) || 0, line.start + 2), gameModes: { isMissingWord: false } }))
  const trackId = /^[A-Za-z0-9]{22}$/.test(params.get('spotify') || '') ? params.get('spotify') : null
  return { lyrics: lyrics.length ? parsePlayLevel(JSON.stringify({ lyrics })) : [], rawLyrics: record.plainLyrics || '', trackId, audio: null, title: record.trackName || 'Paroles LRCLIB' }
}
