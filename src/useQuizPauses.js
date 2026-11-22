import { useEffect, useRef, useState } from 'react'
import { nextPause } from './quizState.mjs'

export default function useQuizPauses(audioRef, questions, answeredRef, enabled = true) {
  const [pausedQuestion, setPausedQuestion] = useState(null)
  const fired = useRef(new Set())
  const signatures = useRef(new Map())
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !enabled) return
    for (const question of questions) {
      const signature = `${question.start}:${question.duration}`
      if (signatures.current.get(question.key) !== signature) fired.current.delete(question.key)
      signatures.current.set(question.key, signature)
    }
    let frame = 0
    let previous = audio.currentTime
    let internalSeek = false
    const check = () => {
      cancelAnimationFrame(frame)
      if (audio.paused || audio.ended || audio.seeking) return
      const time = audio.currentTime
      const question = nextPause(questions, previous, time, fired.current, answeredRef.current)
      previous = time
      if (question) {
        fired.current.add(question.key)
        audio.pause()
        internalSeek = true
        audio.currentTime = question.start
        previous = question.start
        setPausedQuestion(question)
        return
      }
      frame = requestAnimationFrame(check)
    }
    const play = () => {
      setPausedQuestion(null)
      check()
    }
    const stop = () => { cancelAnimationFrame(frame); previous = audio.currentTime }
    const seek = () => {
      if (internalSeek) { internalSeek = false; check(); return }
      previous = audio.currentTime
      setPausedQuestion(null)
      // Rewind re-arms unanswered markers; explicit forward seeks skip earlier markers.
      for (const question of questions) if (question.start >= previous) fired.current.delete(question.key)
      check()
    }
    audio.addEventListener('play', play)
    audio.addEventListener('pause', stop)
    audio.addEventListener('seeked', seek)
    audio.addEventListener('timeupdate', check)
    if (!audio.paused) check()
    return () => {
      cancelAnimationFrame(frame)
      audio.removeEventListener('play', play)
      audio.removeEventListener('pause', stop)
      audio.removeEventListener('seeked', seek)
      audio.removeEventListener('timeupdate', check)
    }
  }, [audioRef, questions, answeredRef, enabled])
  return enabled && questions.some(question => question.key === pausedQuestion?.key && question.start === pausedQuestion.start && question.pause) ? pausedQuestion : null
}
