import { followSpotifyTrack } from '../followSpotify.mjs'
import { songLaunchUrl } from '../songLaunch.mjs'
import { lyricPresentation, lyricTransition } from '../lyricPresentation.mjs'
import '../lyricPresentation.css'
import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Confetti from 'react-confetti'
import { Maximize, Minimize, ArrowLeft } from 'lucide-react'
import AudioControls from './AudioControls'
import LyricText from './LyricText'
import ConcertScene from './ConcertScene'
import { getPlayerLines } from '../playerLines.mjs'
import { quizAtTime, shuffledChoices, recordAnswer, lineQuestions } from '../quizState.mjs'
import { prepareConcertAudio } from '../concertAudio.mjs'
import { concertTheme as theme } from '../concertTheme.mjs'
import { lineAnimationStyle } from '../animationPresets.mjs'
import useMotionPreference from '../useMotionPreference'
import useQuizPauses from '../useQuizPauses'
import useAudioClock from '../useAudioClock'
import useCastPresenter from '../useCastPresenter'
import SpotifyRemote from './SpotifyRemote'
import { spotifyTime } from '../spotifyRemote.mjs'
import useGamePointer from '../useGamePointer'
import '../concert.css'

export default function Player({ audioSrc, spotifyTrackId: initialTrackId = null, syncData: initialSyncData, followLive = false, onExit, exitLabel = "Retour à l’Éditeur" }) {
  const [followed, setFollowed] = useState(null)
  const [followNotice, setFollowNotice] = useState('')
  const [followRetry, setFollowRetry] = useState(0)
  const spotifyTrackId = initialTrackId || followLive
  const audioRef = useRef(null)
  const [spotifyState, setSpotifyState] = useState(null)
  const activeId = spotifyState?.item?.id
  const trackRef = useRef(null)
  useEffect(() => { trackRef.current = spotifyState?.item }, [spotifyState])
  useEffect(() => {
    if ((!initialTrackId && !followLive) || !activeId || activeId === initialTrackId) return
    const controller = new AbortController()
    const track = trackRef.current
    const timer = setTimeout(() => {
      setFollowNotice(`Recherche des paroles : ${track.name}…`)
      followSpotifyTrack(track, controller.signal).then(song => {
        if (controller.signal.aborted) return
        setFollowed({ ...song, id: activeId })
        setFollowNotice(song.lyrics.length ? `Paroles synchronisées : ${track.name}` : `Pas de paroles synchronisées pour ${track.name}. Voulez-vous éditer ?`)
      }).catch(error => { if (!controller.signal.aborted) setFollowNotice(error.message) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [activeId, initialTrackId, followLive, followRetry])
  const syncData = useMemo(() => !initialTrackId && !followLive ? initialSyncData : activeId === initialTrackId ? initialSyncData : followed && followed.id === activeId ? followed.lyrics : [], [initialTrackId, initialSyncData, activeId, followed, followLive])
  const [remoteTick, setRemoteTick] = useState(() => performance.now())
  const remoteMatches = spotifyTrackId && (activeId === initialTrackId || (Boolean(activeId) && activeId === followed?.id))
  useEffect(() => {
    if (!spotifyTrackId) return
    const interval = setInterval(() => setRemoteTick(performance.now()), 100)
    return () => clearInterval(interval)
  }, [spotifyTrackId])
  const stageRef = useRef(null)
  const { enabled: pointerEnabled, cursorRef, toggle: togglePointer } = useGamePointer(stageRef, audioRef)
  const answered = useRef(new Set())
  const feedbackTimer = useRef(null)
  const [answers, setAnswers] = useState(new Set())
  useCastPresenter(audioRef, syncData, { answers, external: Boolean(spotifyTrackId), remote: remoteMatches ? spotifyState : null })
  const [score, setScore] = useState(0)
  const [showScore, setShowScore] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [zenMode, setZenMode] = useState(false)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const questions = useMemo(() => syncData.flatMap((line, index) => lineQuestions(line, index)), [syncData])
  const [choices] = useState(() => Object.fromEntries(syncData.flatMap((line, index) => lineQuestions(line, index).map(question => [question.key, shuffledChoices(line, Math.random, question)]))))
  const pausedQuestion = useQuizPauses(audioRef, questions, answered, !spotifyTrackId && !showScore)
  const reducedMotion = useMotionPreference()
  const localTime = useAudioClock(audioRef, !spotifyTrackId)
  const time = spotifyTrackId ? remoteMatches ? spotifyTime(spotifyState, remoteTick) : 0 : localTime
  const displayed = getPlayerLines(syncData, time)
  const current = syncData[displayed.current]
  const next = syncData[displayed.next]
  const quiz = quizAtTime(syncData, time, answers)
  const total = questions.length

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === stageRef.current)
    window.addEventListener('resize', resize)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('fullscreenchange', updateFullscreen)
      clearTimeout(feedbackTimer.current)
    }
  }, [])

  useEffect(() => {
    let timer
    const showControls = event => {
      if (event?.type.startsWith('pointer') && stageRef.current?.classList.contains('magnetic-pointer-active')) return
      if (event?.type === 'concertpointermove' && event.detail.zen) {
        clearTimeout(timer)
        setZenMode(true)
        return
      }
      if (event?.target instanceof Element && event.target.closest('.concert-zen-zone') && event.type.startsWith('pointer')) {
        clearTimeout(timer)
        setZenMode(true)
        return
      }
      setZenMode(false)
      setControlsVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setControlsVisible(false), 3000)
    }
    showControls()
    window.addEventListener('pointermove', showControls)
    window.addEventListener('pointerdown', showControls)
    window.addEventListener('keydown', showControls)
    window.addEventListener('concertpointermove', showControls)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', showControls)
      window.removeEventListener('pointerdown', showControls)
      window.removeEventListener('keydown', showControls)
      window.removeEventListener('concertpointermove', showControls)
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stageRef.current.requestFullscreen()
    } catch { setError('Le plein écran est indisponible dans ce navigateur.') }
  }
  const exit = async () => {
    audioRef.current?.pause()
    if (document.fullscreenElement === stageRef.current) await document.exitFullscreen().catch(() => {})
    onExit()
  }
  const answer = choice => {
    // Read the actual clock again: a click at a phrase boundary must not answer the next question.
    const actual = quizAtTime(syncData, spotifyTrackId ? time : audioRef.current.currentTime, answered.current)
    if (!actual || actual.key !== quiz?.key) return
    const correct = recordAnswer(answered.current, actual, choice)
    if (correct === null) return
    setAnswers(new Set(answered.current))
    if (correct) setScore(value => value + 1)
    setFeedback({ correct, answer: actual.answer, index: actual.key })
    clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setFeedback(null), 1400)
  }
  const renderText = (line, index) => <LyricText text={line.text} time={time - line.start} animationProfiles={line.animationProfiles}
    hiddenGroups={lineQuestions(line, index).filter(question => !answers.has(question.key)).map(question => question.group)} />

  return <div ref={stageRef} className={`concert-player${reducedMotion ? ' reduced-motion' : ''}${!controlsVisible && !showScore ? ' controls-idle' : ''}${zenMode && !showScore ? ' concert-zen' : ''}`}
    style={{ '--concert-bg': theme.background, '--concert-cyan': theme.cyan, '--concert-magenta': theme.magenta, '--concert-text': theme.text, fontFamily: theme.font }}>
    {!spotifyTrackId && <audio ref={audioRef} src={audioSrc} onEnded={() => setShowScore(true)}
      onPlay={() => setZenMode(true)}
      onPause={() => { setZenMode(false); setControlsVisible(true) }}
      onError={() => setError('Impossible de lire cette musique. Choisissez un fichier audio compatible.')} />}
    {!spotifyTrackId && <ConcertScene audioRef={audioRef} reducedMotion={reducedMotion} />}
    <div className="concert-shade" aria-hidden="true" />
    <div ref={cursorRef} className={`concert-game-cursor${pointerEnabled ? ' is-active' : ''}`} aria-hidden="true" />
    {!showScore && <div className="concert-zen-zone" aria-hidden="true"
      onPointerEnter={() => setZenMode(true)}
      onPointerLeave={() => { setZenMode(false); setControlsVisible(true) }}>
      <svg viewBox="0 0 42 140" fill="none"><path d="M 41 18 A 58 58 0 0 0 41 122" /></svg>
    </div>}
    <header className="concert-toolbar">
      <button className="concert-button" onClick={exit}><ArrowLeft size={18} />Quitter</button>
      <span className="concert-brand">NEON <span>LIVE</span></span>
      <button className="concert-button concert-game-toggle" onClick={togglePointer} aria-pressed={pointerEnabled}
        title="Curseur magnétique · Échap pour retrouver la souris normale">{pointerEnabled ? 'Souris normale' : 'Souris magnétique'}</button>
      {total > 0 && <span className="concert-score">{score} / {total} <small>points</small></span>}
      <button className="concert-button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}>
        {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}<span>Plein écran</span>
      </button>
    </header>
    {error && <p className="concert-error" role="alert">{error}</p>}
    {showScore ? <main className="concert-results">
      {!reducedMotion && <Confetti width={size.width} height={size.height} recycle={false} numberOfPieces={180} />}
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="concert-result-card">

        <p className="concert-eyebrow">MERCI POUR LE SHOW</p>
        <h1>Chanson terminée !</h1>
        {total > 0 && <p className="concert-final-score">{score}<span> / {total}</span><small>bonnes réponses</small></p>}
        <button className="concert-button concert-primary" onClick={exit}>{exitLabel}</button>
      </motion.div>
    </main> : <>
      <main className="concert-stage">

        <p className="concert-eyebrow">{current?.section || 'À VOUS DE CHANTER'}</p>
        {current ? <div className="concert-lyrics" key={displayed.current}>
          <p className="concert-line-label">{displayed.current === displayed.active ? 'En cours' : 'À venir'}</p>
          <div className={lyricTransition(current, time - current.start).className} style={reducedMotion ? {} : lyricTransition(current, time - current.start).style}><h1 className={`effect-${current.effect || 'none'}`} style={{ color: current.color || theme.text, ...lyricPresentation(current), ...lineAnimationStyle(current.effect, time - current.start) }}>
            {renderText(current, displayed.current)}
          </h1></div>
        </div> : <div className="concert-instrumental"><span>♫</span><p>Place à la musique</p></div>}
        {next && <div className="concert-next">
          <p className="concert-line-label">Ensuite</p>
          <p style={{ color: next.color || theme.text, ...lyricPresentation(next, 0.5) }}>{renderText(next, displayed.next)}</p>
        </div>}
        <div className="concert-quiz-space">
          <AnimatePresence initial={false}>
            {quiz && <motion.section key={quiz.key} className="concert-quiz" aria-label="Trouver le mot manquant"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p>Mot caché {quiz.targetIndex + 1} · À vous de trouver !</p>
              <div>{(choices[quiz.key] || []).map(choice => <motion.button key={choice} className="concert-button"
                whileHover={reducedMotion ? undefined : { scale: 1.03 }} whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                onClick={event => { answer(choice); event.currentTarget.blur() }}>{choice}</motion.button>)}</div>
            </motion.section>}
          </AnimatePresence>
          <div className="concert-feedback" role="status" aria-live="polite">
            {feedback && <motion.p key={feedback.index} className={feedback.correct ? 'correct' : 'incorrect'}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
              {feedback.correct ? '✓ Bien joué !' : `La réponse était : ${feedback.answer}`}
            </motion.p>}
          </div>
        </div>
      </main>
      <footer className={`concert-footer${pausedQuestion ? ' has-pause-notice' : ''}`}>
        {spotifyTrackId && <SpotifyRemote trackId={activeId || initialTrackId} onState={setSpotifyState} />}
        {spotifyTrackId && activeId !== spotifyTrackId && <div className="spotify-follow-notice" role="status">
          <p>{followNotice}</p>
          {followed && followed.id === activeId && followed.result && <a className="concert-button" href={songLaunchUrl(followed.result, 'edit')}>Éditer les paroles</a>}
          {!syncData.length && !followed?.result && activeId && <a className="concert-button" href={`${location.pathname}?action=edit&spotify=${encodeURIComponent(activeId)}`}>Créer les paroles dans l’éditeur</a>}
          {!syncData.length && <button className="concert-button" onClick={() => setFollowRetry(value => value + 1)}>Réessayer la recherche</button>}
        </div>}
        {pausedQuestion && <p className="quiz-pause-notice" role="status">Pause au mot caché · Appuyez sur Espace pour reprendre.</p>}
        {!spotifyTrackId && <AudioControls audioRef={audioRef} autoMuted={Boolean(quiz && !quiz.pause)} spaceShortcut manualPause={Boolean(pausedQuestion)} beforePlay={audio => {
          if (pausedQuestion && !answered.current.has(pausedQuestion.key)) {
            answered.current.add(pausedQuestion.key)
            setAnswers(new Set(answered.current))
          }
          return prepareConcertAudio(audio)
        }} />}
        <p>{spotifyTrackId ? 'Lecture et pause depuis Spotify · Les paroles suivent le morceau actif' : pointerEnabled ? 'Souris magnétique · Échap : curseur normal · Espace : lecture / pause' : 'Espace : lecture / pause · Échap pour quitter le plein écran'}</p>
      </footer>
    </>}
  </div>
}
