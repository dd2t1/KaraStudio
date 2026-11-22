import { lyricPresentation, lyricTransition } from '../src/lyricPresentation.mjs'
import '../src/lyricPresentation.css'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import LyricText from '../src/components/LyricText'
import { getPlayerLines } from '../src/playerLines.mjs'
import { parsePlayLevel } from '../src/playLevel.mjs'
import { lineAnimationStyle } from '../src/animationPresets.mjs'
import '../src/index.css'
import '../src/castScreen.css'
import './receiver.css'

// This standalone receiver has one entry point and no development refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function SavedSong() {
  const audio = useRef(null)
  const [song, setSong] = useState(null)
  const [time, setTime] = useState(0)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const player = audio.current
    const controller = new AbortController()
    const params = new URLSearchParams(location.hash.slice(1))
    const localPath = kind => {
      const path = params.get(kind) || ''
      if (!new RegExp(`^/api/karaoke_storage/projects/[a-f0-9]{32}/${kind}\\?authSig=`).test(path)) throw new Error('Ouvrez un morceau depuis la bibliothèque Karaoké de Home Assistant.')
      return path
    }
    const load = async () => {
      try {
        const projectPath = localPath('project'), audioPath = localPath('audio')
        const response = await fetch(projectPath, { signal: controller.signal })
        if (!response.ok) throw new Error('Morceau inaccessible. Relancez-le depuis Home Assistant.')
        const text = await response.text()
        const lyrics = parsePlayLevel(text)
        const project = JSON.parse(text)
        setSong({ lyrics, title: project.songInfo?.title || 'Karaoké' })
        if (controller.signal.aborted) return
        player.src = audioPath
        try { await player.play() } catch { if (!controller.signal.aborted) setBlocked(true) }
      } catch (problem) { if (!controller.signal.aborted) setError(problem.message) }
    }
    void load()
    return () => { controller.abort(); player.pause() }
  }, [])
  useEffect(() => {
    let frame
    const tick = () => { if (audio.current) setTime(audio.current.currentTime); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  const lines = getPlayerLines(song?.lyrics || [], time)
  const render = index => {
    const line = song?.lyrics[index]
    return line && <div key={index} className={index === lines.current ? lyricTransition(line, time - line.start).className : undefined} style={index === lines.current ? lyricTransition(line, time - line.start).style : undefined}><div className={`cast-line effect-${line.effect || 'none'}`} style={{ color: line.color || '#fff', ...lyricPresentation(line, index === lines.current ? 1 : 0.5), ...lineAnimationStyle(line.effect, time - line.start) }}>
      <LyricText text={line.text} time={time - line.start} animationProfiles={line.animationProfiles} />
    </div></div>
  }
  return <main className="cast-screen saved-song">
    <header>{song?.title || 'Karaoké'}</header>
    {error ? <p role="alert" className="cast-notice">{error}</p> : !song ? <p className="cast-notice">Chargement du morceau…</p> : <>
      <section className="cast-current">{render(lines.current)}</section>
      <section className="cast-next">{render(lines.next)}</section>
    </>}
    {blocked && <button className="start-song" onClick={async () => { try { await audio.current.play(); setBlocked(false) } catch { setError('La lecture audio est bloquée sur cet appareil.') } }}>Démarrer la musique</button>}
    <audio ref={audio} controls onError={() => setError('Impossible de lire cet audio sur cet appareil.')} onPlay={() => setBlocked(false)} />
  </main>
}

createRoot(document.getElementById('root')).render(<SavedSong />)
