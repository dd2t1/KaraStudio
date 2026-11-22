import { loadLaunchSong } from '../songLaunch.mjs'
import { useEffect, useRef, useState } from 'react'
import Player from './Player'
import SongSearch from './SongSearch'
import { parsePlayLevel } from '../playLevel.mjs'
import { spotifyTrackId as parseSpotifyTrackId } from '../spotifyRemote.mjs'

export default function PlaySetup({ onBack }) {
  const [audioSrc, setAudioSrc] = useState('')
  const [lyrics, setLyrics] = useState([])
  const [levelName, setLevelName] = useState('')
  const [spotifyTrackId, setSpotifyTrackId] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [followLive, setFollowLive] = useState(() => new URLSearchParams(location.search).get('action') === 'join')
  const [isPlaying, setIsPlaying] = useState(() => new URLSearchParams(location.search).get('action') === 'join')
  const importVersion = useRef(0)
  const [songs, setSongs] = useState([])
  const [libraryError, setLibraryError] = useState('')
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryVersion, setLibraryVersion] = useState(0)
  const [selectedSong, setSelectedSong] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLibraryLoading(true)
      setLibraryError('')
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/home-assistant/projects`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Impossible de charger la bibliothèque Home Assistant.')
        if (!Array.isArray(data.projects)) throw new Error('Réponse de la bibliothèque invalide.')
        setSongs(data.projects)
      } catch (error) {
        if (!controller.signal.aborted) setLibraryError(error.message)
      } finally { if (!controller.signal.aborted) setLibraryLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [libraryVersion])

  useEffect(() => () => { importVersion.current += 1 }, [])

  const selectSong = async (song, launch = false) => {
    const version = ++importVersion.current
    setIsLoading(true)
    setError('')
    setAudioSrc('')
    setLyrics([])
    setLevelName('')
    setSpotifyTrackId(null)
    setSelectedSong(song.id)
    try {
      const base = `${import.meta.env.BASE_URL}api/home-assistant/projects/${encodeURIComponent(song.id)}`
      const projectResponse = await fetch(`${base}/project`)
      if (!projectResponse.ok) throw new Error('Ce morceau est inaccessible. Actualisez la bibliothèque.')
      const projectText = await projectResponse.text()
      const parsed = parsePlayLevel(projectText, { requireQuizCues: true })
      const project = JSON.parse(projectText)
      const trackId = parseSpotifyTrackId(project.songInfo?.spotifyTrackId || '')
      const audioResponse = trackId ? null : await fetch(`${base}/audio`)
      if (audioResponse && !audioResponse.ok) throw new Error('La musique de ce projet est inaccessible.')
      const audio = audioResponse ? await audioResponse.blob() : null
      if (version !== importVersion.current) return
      if (audio) setAudioSrc(URL.createObjectURL(audio))
      setSpotifyTrackId(trackId)
      setLyrics(parsed)
      setLevelName(song.title)
      if (launch) setIsPlaying(true)
    } catch (error) {
      if (version === importVersion.current) setError(error.message)
    } finally { if (version === importVersion.current) setIsLoading(false) }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has('project') && !params.has('lyrics')) return
    const controller = new AbortController()
    loadLaunchSong(params, controller.signal, import.meta.env.BASE_URL).then(song => {
      if (controller.signal.aborted) return
      setLyrics(song.lyrics)
      setSpotifyTrackId(song.trackId)
      setLevelName(song.title)
      if (song.audio) setAudioSrc(URL.createObjectURL(song.audio))
      if (params.get('action') === 'play' && song.lyrics.length && (song.audio || song.trackId)) setIsPlaying(true)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    return () => { if (audioSrc) URL.revokeObjectURL(audioSrc) }
  }, [audioSrc])

  const importLevel = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    const version = ++importVersion.current
    setSelectedSong('')
    setLyrics([])
    setLevelName('')
    setSpotifyTrackId(null)
    setError('')
    setIsLoading(true)
    try {
      const source = await file.text()
      const parsed = parsePlayLevel(source, { requireQuizCues: true })
      const trackId = parseSpotifyTrackId(JSON.parse(source).songInfo?.spotifyTrackId || '')
      if (version !== importVersion.current) return
      setLyrics(parsed)
      setSpotifyTrackId(trackId)
      setLevelName(file.name)
    } catch (error) {
      if (version === importVersion.current) setError(error.message)
    } finally {
      if (version === importVersion.current) setIsLoading(false)
    }
  }

  if (isPlaying) {
    return <Player followLive={followLive} audioSrc={audioSrc} spotifyTrackId={spotifyTrackId} syncData={lyrics} onExit={() => { setIsPlaying(false); setFollowLive(false) }} exitLabel="Retour aux chansons" />
  }

  return (
    <div className="main-menu-container play-setup-page">
      <div className="bg-glow" />
      <div className="scanlines" />
      <section className="menu-content glass-panel play-setup">
        <h1>Jouer au karaoké</h1>
        <p>Choisissez un morceau enregistré dans Home Assistant ou importez votre musique et ses paroles.</p>
        <SongSearch onJoin={() => {
          const url = new URL(location.href)
          for (const key of ['project', 'lyrics', 'spotify']) url.searchParams.delete(key)
          url.searchParams.set('action', 'join')
          history.replaceState(null, '', url.href)
          setFollowLive(true)
          setSpotifyTrackId(null)
          setLyrics([])
          setIsPlaying(true)
        }} busy={isLoading} onLaunch={result => selectSong({ id: result.project_id, title: result.title }, true)} />
        <section className="saved-song-library" aria-labelledby="saved-songs-title">
          <div className="saved-song-heading"><h2 id="saved-songs-title">Musiques Home Assistant</h2>
            <button className="neon-btn outline-btn" disabled={libraryLoading} onClick={() => setLibraryVersion(value => value + 1)}>Actualiser</button>
          </div>
          {libraryLoading ? <p role="status">Chargement des musiques…</p> : libraryError ? <p role="alert">{libraryError}</p> : !songs.length ? <p>Aucune musique enregistrée. Envoyez un morceau depuis « Créer / Éditer » vers Home Assistant.</p> :
            <ul className="saved-song-list">{songs.map(song => <li key={song.id}>
              <span>{song.title}</span>
              <button className="neon-btn outline-btn" aria-pressed={selectedSong === song.id} onClick={() => selectSong(song)}>
                {selectedSong === song.id ? (isLoading ? 'Chargement…' : 'Sélectionné') : 'Choisir'}
              </button>
            </li>)}</ul>}
        </section>
        <h2>Importer depuis cet appareil</h2>
        <div className="input-group">
          <label htmlFor="play-audio">Musique</label>
          <input id="play-audio" type="file" accept="audio/*" disabled={isLoading} onChange={event => {
            const file = event.target.files[0]
            if (file) { setSelectedSong(''); setAudioSrc(URL.createObjectURL(file)) }
          }} />
        </div>
        <div className="input-group">
          <label htmlFor="play-level">Paroles synchronisées (.json)</label>
          <input id="play-level" type="file" accept=".json,application/json" disabled={isLoading} onChange={importLevel} />
        </div>
        {isLoading && <p role="status">Chargement du morceau…</p>}
        {levelName && <p role="status">{levelName} — {lyrics.length} séquences chargées</p>}
        {spotifyTrackId && <p>Source Spotify Connect : ouvrez le morceau sur votre appareil Spotify, puis lancez le karaoké.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="button-group">
          <button className="neon-btn primary-btn" disabled={!(audioSrc || spotifyTrackId) || !lyrics.length || isLoading} onClick={() => {
            if (spotifyTrackId) {
              window.open(`https://open.spotify.com/track/${spotifyTrackId}`, '_blank', 'noopener,noreferrer')
            }
            setIsPlaying(true)
          }}>Lancer le karaoké{spotifyTrackId ? ' avec Spotify' : ''}</button>
          <button className="neon-btn outline-btn" onClick={onBack}>Retour au menu</button>
        </div>
      </section>
    </div>
  )
}
