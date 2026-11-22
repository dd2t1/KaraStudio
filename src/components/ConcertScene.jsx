import { useEffect, useRef } from 'react'
import { concertTheme as theme } from '../concertTheme.mjs'
import { getConcertAnalyser, retainConcertAudio } from '../concertAudio.mjs'

export default function ConcertScene({ audioRef, reducedMotion }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const audio = audioRef.current
    const canvas = canvasRef.current
    if (!audio || !canvas) return
    const release = retainConcertAudio(audio)
    if (reducedMotion) return release
    const context = canvas.getContext('2d')
    if (!context) return release
    let frame = 0, lastFrame = 0, bass = 0, energy = 0
    let width = 1, height = 1
    const bins = new Uint8Array(128)
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width; height = rect.height
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1920 / Math.max(1, width))
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    const draw = timestamp => {
      if (audio.paused || audio.ended || document.hidden) return
      frame = requestAnimationFrame(draw)
      if (timestamp - lastFrame < 1000 / 30) return
      lastFrame = timestamp
      const analyser = getConcertAnalyser(audio)
      if (!analyser) return
      analyser.getByteFrequencyData(bins)
      const low = bins.slice(0, 8).reduce((sum, value) => sum + value, 0) / (8 * 255)
      const total = bins.reduce((sum, value) => sum + value, 0) / (bins.length * 255)
      bass += (low - bass) * 0.15
      energy += (total - energy) * 0.12
      context.clearRect(0, 0, width, height)
      const time = audio.currentTime
      ;[theme.cyan, theme.magenta].forEach((color, index) => {
        const x = width * (index ? 0.85 : 0.15)
        const radius = width * (0.32 + bass * 0.18)
        const glow = context.createRadialGradient(x, height * 0.15, 0, x, height * 0.15, radius)
        glow.addColorStop(0, color + '66'); glow.addColorStop(1, color + '00')
        context.globalAlpha = theme.intensity
        context.fillStyle = glow; context.fillRect(0, 0, width, height)
        context.globalAlpha = 0.04 + bass * 0.09
        context.fillStyle = color
        context.beginPath(); context.moveTo(x, 0)
        const target = width * (0.5 + Math.sin(time * 0.22 + index * 3) * 0.3)
        context.lineTo(target - width * 0.12, height)
        context.lineTo(target + width * 0.12, height); context.fill()
      })
      const count = width < 700 ? 24 : 60
      for (let index = 0; index < count; index++) {
        const x = ((index * 137.5 + Math.sin(time * 0.3 + index) * 18) % width + width) % width
        const y = ((index * 83 - time * 12) % height + height) % height
        context.globalAlpha = (0.15 + energy * 0.55) * theme.intensity
        context.fillStyle = index % 2 ? theme.cyan : theme.magenta
        context.beginPath(); context.arc(x, y, 1 + energy * 2, 0, Math.PI * 2); context.fill()
      }
      context.globalAlpha = 1
    }
    const start = () => {
      cancelAnimationFrame(frame)
      if (!audio.paused && !audio.ended && !document.hidden) frame = requestAnimationFrame(draw)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    ;['play', 'pause', 'ended', 'seeked'].forEach(event => audio.addEventListener(event, start))
    document.addEventListener('visibilitychange', start)
    start()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      ;['play', 'pause', 'ended', 'seeked'].forEach(event => audio.removeEventListener(event, start))
      document.removeEventListener('visibilitychange', start)
      context.clearRect(0, 0, width, height)
      release()
    }
  }, [audioRef, reducedMotion])
  return <canvas ref={canvasRef} className="concert-canvas" aria-hidden="true" />
}
