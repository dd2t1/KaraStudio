import { useState, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

export default function AudioControls({ audioRef, autoMuted = false, beforePlay, spaceShortcut = false, manualPause = false }) {
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [userMuted, setUserMuted] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const refresh = () => {
      setPlaying(!audio.paused && !audio.ended)
      setTime(audio.currentTime)
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    const events = ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended', 'seeked', 'emptied']
    events.forEach(event => audio.addEventListener(event, refresh))
    refresh()
    return () => events.forEach(event => audio.removeEventListener(event, refresh))
  }, [audioRef])
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = userMuted || autoMuted
  }, [audioRef, userMuted, autoMuted])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) { audio.pause(); return }
    try {
      setError('')
      await Promise.all([beforePlay?.(audio), audio.play()])
    } catch {
      audio.pause()
      setError('Lecture impossible. Cliquez sur Lecture pour réessayer ou vérifiez le fichier audio.')
    }
  }
  useEffect(() => {
    if (!spaceShortcut) return
    const keydown = event => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
        (!manualPause && event.target.closest?.('button, [role="button"]'))) return
      event.preventDefault()
      togglePlayback()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })
  const format = value => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`
  return <div className="audio-controls-wrap">
    <div className="custom-audio-player glass-panel">
      <button type="button" onClick={togglePlayback} aria-label={playing ? 'Mettre en pause' : 'Lecture'}>
        {playing ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <div className="audio-progress" style={{ '--audio-progress': `${duration ? Math.min(100, time / duration * 100) : 0}%` }}>
        <div className="audio-times"><span>{format(time)}</span><span>{format(duration)}</span></div>
        <input type="range" aria-label="Position dans la musique" min="0" max={duration || 1} step="0.01"
          disabled={!duration} value={Math.min(time, duration)} aria-valuetext={`${format(time)} sur ${format(duration)}`}
          onChange={event => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value) }} />
      </div>
      <button type="button" aria-label={userMuted ? 'Rétablir le son' : 'Couper le son'} aria-pressed={userMuted}
        onClick={() => setUserMuted(value => !value)}>
        {userMuted || autoMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </div>
    {autoMuted && <small className="audio-mute-notice">Son coupé pour le mot manquant</small>}
    {error && <p role="alert">{error}</p>}
  </div>
}
