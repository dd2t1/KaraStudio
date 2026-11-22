import { useEffect, useState } from 'react'

export default function useAudioClock(audioRef, enabled = true) {
  const [time, setTime] = useState(0)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !enabled) return
    let frame = 0
    const update = () => setTime(audio.currentTime)
    const tick = () => {
      update()
      if (!audio.paused && !audio.ended && !document.hidden) frame = requestAnimationFrame(tick)
    }
    const refresh = () => {
      cancelAnimationFrame(frame)
      update()
      if (!audio.paused && !audio.ended && !document.hidden) frame = requestAnimationFrame(tick)
    }
    const events = ['play', 'pause', 'seeking', 'seeked', 'timeupdate', 'ended', 'loadedmetadata']
    events.forEach(event => audio.addEventListener(event, refresh))
    document.addEventListener('visibilitychange', refresh)
    refresh()
    return () => {
      cancelAnimationFrame(frame)
      events.forEach(event => audio.removeEventListener(event, refresh))
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [audioRef, enabled])
  return time
}
