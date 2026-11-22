import { lyricPresentation, lyricTransition } from '../lyricPresentation.mjs'
import '../lyricPresentation.css'
import { useEffect, useState } from 'react'
import LyricText from './LyricText'
import { getPlayerLines } from '../playerLines.mjs'
import { lineQuestions } from '../quizState.mjs'
import { lineAnimationStyle } from '../animationPresets.mjs'
import { castTime } from '../castClock.mjs'
import '../castScreen.css'

export default function CastScreen() {
  const [sample, setSample] = useState(null)
  const [now, setNow] = useState(0)
  const room = new URLSearchParams(location.search).get('room')
  useEffect(() => {
    if (!room) return
    let stopped = false, timer
    const poll = async () => {
      const start = performance.now()
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/cast/${encodeURIComponent(room)}`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
        if (response.ok) {
          const snapshot = await response.json()
          if (!stopped) setSample({ snapshot, received: performance.now(), latency: (performance.now() - start) / 2 })
        }
      } catch { /* The last state stays visible; stale playback is never advanced. */ }
      if (!stopped) timer = setTimeout(poll, 150)
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [room])
  useEffect(() => {
    let frame
    const tick = () => { setNow(performance.now()); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  if (!sample) return <main className="cast-screen"><p className="cast-notice">{room ? 'En attente des paroles… Lancez la musique dans Home Assistant.' : 'Lancez le Cast depuis le panneau Karaoké de Home Assistant.'}</p></main>
  const { snapshot } = sample
  const { time, stale } = castTime(snapshot, Math.max(0, now - sample.received), sample.latency)
  const lines = getPlayerLines(snapshot.lyrics, time)
  const render = index => {
    const line = snapshot.lyrics[index]
    if (!line) return null
    const hidden = lineQuestions(line, index).filter(question => !snapshot.answers.includes(question.key)).map(question => question.group)
    return <div key={index} className={index === lines.current ? lyricTransition(line, time - line.start).className : undefined} style={index === lines.current ? lyricTransition(line, time - line.start).style : undefined}><div className={`cast-line effect-${line.effect || 'none'}`} style={{ color: line.color || '#fff', ...lyricPresentation(line, index === lines.current ? 1 : 0.5), ...lineAnimationStyle(line.effect, time - line.start) }}>
      <LyricText text={line.text} time={time - line.start} hiddenGroups={hidden} animationProfiles={line.animationProfiles} />
    </div></div>
  }
  return <main className="cast-screen">
    {stale ? <p className="cast-notice">Synchronisation interrompue — reprenez l’aperçu dans Home Assistant.</p> : snapshot.ended ? null : <>
      <section className="cast-current">{render(lines.current)}</section>
      <section className="cast-next">{render(lines.next)}</section>
    </>}
  </main>
}
