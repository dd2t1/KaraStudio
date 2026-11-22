import { useEffect, useRef } from 'react'
import { spotifyTime } from './spotifyRemote.mjs'

let sequence = Date.now()
const parameters = new URLSearchParams(window.location.search)
const room = parameters.get('room')
const presenter = new URLSearchParams(window.location.hash.slice(1)).get('presenter')

export default function useCastPresenter(audioRef, lyrics, { enabled = true, answers = [], mode = 'player', external = false, remote = null } = {}) {
  const latest = useRef({ lyrics, answers, mode, remote })
  useEffect(() => { latest.current = { lyrics, answers, mode, remote } }, [lyrics, answers, mode, remote])
  useEffect(() => {
    const audio = audioRef.current
    if (!enabled || (!audio && !external) || !room || !presenter || parameters.get('cast') === '1') return
    let stopped = false
    let busy = false
    let sentLyrics = null
    let stalled = false
    const send = async () => {
      if (stopped || busy) return
      busy = true
      const current = latest.current
      const fresh = current.remote && performance.now() - current.remote.observedAt < 25000
      const includeLyrics = sentLyrics !== current.lyrics
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/cast/${encodeURIComponent(room)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Karaoke-Presenter': presenter },
          body: JSON.stringify({ sequence: ++sequence, time: external ? spotifyTime(current.remote) : audio.currentTime || 0, rate: external ? 1 : audio.playbackRate,
            playing: external ? Boolean(fresh && current.remote.is_playing) : !audio.paused && !audio.ended && !stalled && audio.readyState >= 2,
            ended: external ? false : audio.ended, answers: [...current.answers], mode: current.mode,
            ...(includeLyrics ? { lyrics: current.lyrics } : {}) }), signal: AbortSignal.timeout(3000),
        })
        if (response.ok) sentLyrics = current.lyrics
        else if (response.status === 409) sentLyrics = null
      } catch { /* Retry automatically; the receiver freezes when updates stop. */ }
      finally { busy = false }
    }
    const update = event => { if (event.type === 'waiting') stalled = true; if (event.type === 'playing' || event.type === 'seeked') stalled = false; void send() }
    const events = ['play', 'playing', 'pause', 'seeking', 'seeked', 'ratechange', 'ended', 'waiting', 'loadedmetadata']
    if (!external) events.forEach(name => audio.addEventListener(name, update))
    const interval = setInterval(send, 200)
    void send()
    return () => { stopped = true; clearInterval(interval); if (!external) events.forEach(name => audio.removeEventListener(name, update)) }
  }, [audioRef, enabled, external])
}
