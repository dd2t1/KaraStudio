import { loadLaunchSong } from '../songLaunch.mjs'
import { followSpotifyTrack } from '../followSpotify.mjs'
import FileImport from './FileImport'
import LyricsLab from './LyricsLab'
import LabAnnotatedText from './LabAnnotatedText'
import useLyricsLabPreference from '../lyricsLabPreference'
import PresentationControls from './PresentationControls'
import { lyricPresentation } from '../lyricPresentation.mjs'
import { useState, useRef, useEffect, useMemo } from 'react'
import '../index.css'
import Player from './Player'
import LyricText from './LyricText'
import AnnotatedLyrics from './AnnotatedLyrics'
import LyricTextEditor from './LyricTextEditor'
import { plainLyrics } from '../lyricMarkup.mjs'
import { compileSectionPattern, parseLyricsStructure, prepareReferenceLyrics, SECTION_OPTIONS } from '../lyricsStructure.mjs'
import RawLyricsInput from './RawLyricsInput'
import LrclibSearch from './LrclibSearch'
import SpotifyRemote from './SpotifyRemote'
import { spotifyTrackId, spotifyTime } from '../spotifyRemote.mjs'
import { stampSegment, rewindSegment, syncAction } from '../syncTiming.mjs'

import useTvMode from '../tvMode.js'
import { publicKaraokeUrl } from '../publicKaraokeUrl.mjs'
import LocalQrCode from './LocalQrCode'
import { repairEndMarkers } from '../timingRepair.mjs'
import { parsePlayLevel } from '../playLevel.mjs'
import AudioControls from './AudioControls'
import LyricsDiff from './LyricsDiff'
import useAudioClock from '../useAudioClock'
import { quizAtTime, lineQuestions } from '../quizState.mjs'
import { lineAnimationStyle } from '../animationPresets.mjs'
import useQuizPauses from '../useQuizPauses'
import MissingWordEditor from './MissingWordEditor'
import { updateHiddenText } from '../missingWords.mjs'
import useMotionPreference from '../useMotionPreference'
import useCastPresenter from '../useCastPresenter'
import { createProject, projectArchive, downloadBlob, MAX_AUDIO_BYTES } from '../projectExport.mjs'
import useAiPreference from '../aiPreference'
import useAiSuggestions from '../useAiSuggestions'
import AiSuggestionPanel from './AiSuggestionPanel'
import AiActivityPanel from './AiActivityPanel'
import { AI_CATEGORIES, applySuggestion, lineFingerprint } from '../aiSuggestions.mjs'
import { applyWordSignature } from '../wordSignatures.mjs'
import '../studio.css'

function Editor({ onBack }) {
  const tvMode = useTvMode()
  const [audioSrc, setAudioSrc] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [externalSource, setExternalSource] = useState(() => sessionStorage.getItem('karaoke.spotify.external') === 'true')
  const [spotifyUrl, setSpotifyUrl] = useState(() => sessionStorage.getItem('karaoke.spotify.url') || '')
  const [spotifyState, setSpotifyState] = useState(null)
  const [remoteTick, setRemoteTick] = useState(() => performance.now())
  const trackId = spotifyTrackId(spotifyUrl)
  const remoteMatches = externalSource && spotifyState?.item?.id === trackId
  const remoteTime = remoteMatches ? spotifyTime(spotifyState, remoteTick) : 0
  useEffect(() => {
    sessionStorage.setItem('karaoke.spotify.external', String(externalSource))
    sessionStorage.setItem('karaoke.spotify.url', spotifyUrl)
  }, [externalSource, spotifyUrl])
  const [saveDestination, setSaveDestination] = useState('pc')
  const [isSaving, setIsSaving] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const savingRef = useRef(false)
  const [rawLyrics, setRawLyrics] = useState(() => sessionStorage.getItem('karaoke.spotify.draftLyrics') || '')
  const [lyricsFilename, setLyricsFilename] = useState('')
  useEffect(() => {
    if (externalSource) sessionStorage.setItem('karaoke.spotify.draftLyrics', rawLyrics)
  }, [externalSource, rawLyrics])
  const [sectionRegex, setSectionRegex] = useState('')
  const { pattern: sectionPattern, error: sectionPatternError } = useMemo(() => compileSectionPattern(sectionRegex), [sectionRegex])
  const [jsonInput, setJsonInput] = useState(false)
  const [syncData, setSyncData] = useState([])
  const [showSetup, setShowSetup] = useState(true)
  const [spotifyLyricsNotice, setSpotifyLyricsNotice] = useState('')

  // Recherche automatique des paroles dès qu'un track Spotify est renseigné ou détecté
  const lastFetchedTrackIdRef = useRef(null)
  useEffect(() => {
    if (!externalSource || !trackId) return
    if (lastFetchedTrackIdRef.current === trackId) return
    // Si on a déjà des paroles chargées et valides, ne pas écraser automatiquement
    if (rawLyrics.trim() && syncData.length > 0) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSpotifyLyricsNotice('Recherche automatique des paroles synchronisées…')
      const searchTrackLyrics = async () => {
        try {
          let trackInfo = spotifyState?.item?.id === trackId ? spotifyState.item : null
          // Si trackInfo n'est pas encore disponible dans l'état Spotify, interroger oEmbed Spotify pour le titre/artiste
          if (!trackInfo) {
            try {
              const oembedRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`, { signal: controller.signal })
              if (oembedRes.ok) {
                const oembed = await oembedRes.json()
                const title = oembed.title || ''
                trackInfo = { id: trackId, name: title, artists: [{ name: '' }] }
              }
            } catch { /* OEmbed optionnel */ }
          }

          if (trackInfo?.name) {
            const song = await followSpotifyTrack(trackInfo, controller.signal)
            if (controller.signal.aborted) return
            if (song?.lyrics?.length) {
              lastFetchedTrackIdRef.current = trackId
              setSyncData(song.lyrics)
              setLyricsFilename(`Paroles synchronisées (${trackInfo.name})`)
              setJsonInput(false)
              setSpotifyLyricsNotice(`✓ Paroles trouvées et chargées (${song.lyrics.length} phrases)`)
              return
            }
          }

          // Essayer aussi via loadLaunchSong avec paramètre spotify direct
          const songDirect = await loadLaunchSong(new URLSearchParams({ spotify: trackId, action: 'edit' }), controller.signal, import.meta.env.BASE_URL)
          if (controller.signal.aborted) return
          if (songDirect?.lyrics?.length) {
            lastFetchedTrackIdRef.current = trackId
            setSyncData(songDirect.lyrics)
            setRawLyrics(songDirect.rawLyrics || '')
            setLyricsFilename(songDirect.title)
            setJsonInput(false)
            setSpotifyLyricsNotice(`✓ Paroles trouvées (${songDirect.lyrics.length} phrases)`)
          } else {
            setSpotifyLyricsNotice('Aucune parole synchronisée trouvée automatiquement. Vous pouvez coller le texte ou chercher sur LRCLIB ci-dessous.')
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            setSpotifyLyricsNotice(err.message || 'Recherche de paroles indisponible.')
          }
        }
      }
      void searchTrackLyrics()
    }, 400)

    return () => { clearTimeout(timer); controller.abort() }
  }, [externalSource, trackId, spotifyState, rawLyrics, syncData.length])
  
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('action') !== 'edit') return
    const controller = new AbortController()
    loadLaunchSong(params, controller.signal, import.meta.env.BASE_URL).then(song => {
      if (controller.signal.aborted) return
      setExternalSource(Boolean(song.trackId))
      setSpotifyUrl(song.trackId || '')
      setLyricsFilename(song.title)
      setSyncData(song.lyrics)
      setRawLyrics(song.rawLyrics || '')
      setJsonInput(false)
      if (song.audio) {
        setAudioFile(new File([song.audio], song.audioName, { type: song.audio.type }))
        setAudioSrc(URL.createObjectURL(song.audio))
      }
      setShowSetup(!song.lyrics.length || (!song.trackId && !song.audio))
    }).catch(error => { if (!controller.signal.aborted) setSaveError(error.message) })
    return () => controller.abort()
  }, [])

  // Setup & Game state
  const [showPlayer, setShowPlayer] = useState(false)
  const lyricsLabEnabled = useLyricsLabPreference()
  const [showLyricsLab, setShowLyricsLab] = useState(false)
  const [labAnalysis, setLabAnalysis] = useState(null)
  const [labMarks, setLabMarks] = useState(false)
  const aiEnabled = useAiPreference()
  const [aiCategory, setAiCategory] = useState(null)
  const [showAiActivity, setShowAiActivity] = useState(false)
  const [inspectorTab, setInspectorTab] = useState('design')
  const [ignoredAi, setIgnoredAi] = useState(new Set())
  const [aiUndo, setAiUndo] = useState(null)
  const [aiNotice, setAiNotice] = useState('')
  const [signatureUndo, setSignatureUndo] = useState(null)

  // Syncing state
  const [isSyncing, setIsSyncing] = useState(false)
  const [cuePlaybackEnd, setCuePlaybackEnd] = useState(null)
  const [currentSyncIndex, setCurrentSyncIndex] = useState(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState('')
  const [referenceSource, setReferenceSource] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const { text: referenceLyrics, ignoredHeaders } = useMemo(() => prepareReferenceLyrics(referenceSource, sectionPattern), [referenceSource, sectionPattern])
  const [referenceError, setReferenceError] = useState('')
  const [showLyricsDiff, setShowLyricsDiff] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const [syncCompleted, setSyncCompleted] = useState(false)
  const [firstVocalStart, setFirstVocalStart] = useState('')
  const [timingError, setTimingError] = useState('')
  const aiReady = aiEnabled && !showSetup && !showPlayer && !isSyncing && syncData.length > 0 && syncData.every(line => Number.isFinite(line.start) && Number.isFinite(line.end) && line.start >= 0 && line.end > line.start)
  const ai = useAiSuggestions(syncData, aiReady)
  const applyAi = (suggestion, replace) => {
    const index = selectedLineIndex
    const line = syncData[index]
    if (ai.entries[index]?.fingerprint !== lineFingerprint(line)) return
    try {
      const updated = applySuggestion(line, suggestion, replace)
      setAiUndo({ index, before: line, after: lineFingerprint(updated) })
      setSyncData(lines => lines.map((item, i) => i === index ? updated : item))
      setAiNotice('Suggestion appliquée. Vous pouvez annuler cette modification.')
    } catch (error) { setAiNotice(error.message) }
  }
  const undoAi = () => {
    if (!aiUndo || lineFingerprint(syncData[aiUndo.index]) !== aiUndo.after) { setAiNotice('Cette phrase a été modifiée depuis : annulation indisponible.'); return }
    setSyncData(lines => lines.map((line, index) => index === aiUndo.index ? aiUndo.before : line))
    setAiUndo(null)
    setAiNotice('Suggestion annulée.')
  }
  const audioRef = useRef(null)
  const applySignature = request => {
    const result = applyWordSignature(syncData, request)
    const changes = result.lines.flatMap((line, index) => line === syncData[index] ? [] : [{ index, before: syncData[index], after: lineFingerprint(line) }])
    setSignatureUndo(changes)
    setSyncData(result.lines)
    return result
  }
  const undoSignature = () => {
    if (!signatureUndo || signatureUndo.some(change => lineFingerprint(syncData[change.index]) !== change.after)) throw new Error('Une phrase concernée a changé depuis : annulation indisponible pour préserver vos modifications.')
    setSyncData(lines => lines.map((line, index) => signatureUndo.find(change => change.index === index)?.before || line))
    setSignatureUndo(null)
  }
  useCastPresenter(audioRef, syncData, { enabled: !showSetup && !showPlayer && !isSyncing, mode: 'editor', external: externalSource, remote: remoteMatches ? spotifyState : null })

  useEffect(() => () => { if (audioSrc) URL.revokeObjectURL(audioSrc) }, [audioSrc])

  // Preview / Editor state
  const [presentationScope, setPresentationScope] = useState('line')
  const [selectedLineIndex, setSelectedLineIndex] = useState(null)
  const [selectedHiddenGroup, setSelectedHiddenGroup] = useState(1)
  const reducedMotion = useMotionPreference()
  const [previewHighlight, setPreviewHighlight] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('karaoke.previewHighlight'))
      if (['background', 'text', 'outline'].includes(saved?.mode) && /^#[0-9a-f]{6}$/i.test(saved?.color)) return saved
    } catch { /* Use readable defaults when storage is unavailable. */ }
    return { mode: 'background', color: '#55e6ff' }
  })
  const updatePreviewHighlight = changes => {
    const next = { ...previewHighlight, ...changes }
    setPreviewHighlight(next)
    try { localStorage.setItem('karaoke.previewHighlight', JSON.stringify(next)) } catch { /* Settings still work for this session. */ }
  }
  const previewTime = useAudioClock(audioRef, !showSetup && !showPlayer)
  const displayTime = externalSource ? remoteTime : previewTime
  const previewIndex = isSyncing ? -1 : syncData.findIndex(line => displayTime >= line.start && displayTime < line.end)
  const previewQuiz = !isSyncing ? quizAtTime(syncData, displayTime, new Set()) : null
  const previewMuted = cuePlaybackEnd === null && Boolean(previewQuiz && !previewQuiz.pause)
  const previewAnswers = useRef(new Set())
  const previewQuestions = useMemo(() => syncData.flatMap((line, index) => lineQuestions(line, index)), [syncData])
  const previewPause = useQuizPauses(audioRef, previewQuestions, previewAnswers, !externalSource && !showSetup && !showPlayer && !isSyncing && cuePlaybackEnd === null)
  useEffect(() => {
    if (!externalSource || showSetup || showPlayer) return
    const interval = setInterval(() => setRemoteTick(performance.now()), 100)
    return () => clearInterval(interval)
  }, [externalSource, showSetup, showPlayer])
  const lineRefs = useRef([])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || cuePlaybackEnd === null) return
    let frame
    const stop = () => { cancelAnimationFrame(frame); setCuePlaybackEnd(null) }
    const tick = () => {
      if (showSetup || showPlayer || isSyncing || audio.currentTime >= cuePlaybackEnd) { audio.pause(); stop(); return }
      frame = requestAnimationFrame(tick)
    }
    audio.addEventListener('pause', stop)
    audio.addEventListener('ended', stop)
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); audio.removeEventListener('pause', stop); audio.removeEventListener('ended', stop) }
  }, [cuePlaybackEnd, showSetup, showPlayer, isSyncing])

  const handleAudioUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      setAudioSrc(URL.createObjectURL(file))
      setAudioFile(file)
      setTranscriptionError('')
    }
  }

  const handleReferenceUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    try {
      const source = await file.text()
      const prepared = prepareReferenceLyrics(source, sectionPattern)
      if (!prepared.text) throw new Error('Le fichier ne contient aucune parole après les titres de section.')
      setReferenceSource(source)
      setReferenceName(file.name)
      setReferenceError('')
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : 'Impossible de lire ce fichier de paroles.')
    }
  }

  const makeLyricSegment = (segment) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text.trim(),
    words: segment.words ?? [],
    color: '#ffffff',
    effect: 'none',
    gameModes: { isMissingWord: false, multipleChoices: ['', '', ''], muteDuration: 2 },
  })

  const transcribeAudio = async () => {
    if (!audioFile) return
    setIsTranscribing(true)
    setTranscriptionError('')
    const formData = new FormData()
    formData.append('audio', audioFile)

    try {
      const result = await fetch(`${import.meta.env.BASE_URL}api/transcribe`, { method: 'POST', body: formData })
      const payload = await result.json()
      if (!result.ok) throw new Error(payload.error || 'La transcription a échoué.')
      const segments = (payload.segments ?? []).filter((segment) => segment.text?.trim()).map(segment => makeLyricSegment({
        ...segment,
        words: segment.words ?? (payload.words || []).filter(word => word.start >= segment.start && word.end <= segment.end),
      }))
      if (!segments.length) throw new Error('Aucun segment chanté n’a été détecté.')
      setSyncData(segments)
      setRawLyrics(segments.map((segment) => segment.text).join('\n'))
      setShowSetup(false)
      setShowLyricsDiff(Boolean(referenceLyrics.trim()))
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : 'La transcription a échoué.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const parseTSV = (text) => {
    const lines = text.split('\n')
    const parsedData = []
    for (let line of lines) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      if (parts.length === 3 && !isNaN(parseFloat(parts[0]))) {
        parsedData.push({
          start: parseFloat(parts[0]),
          end: parseFloat(parts[1]),
          text: parts[2].trim(),
          color: '#ffffff',
          effect: 'none',
          gameModes: { isMissingWord: false, multipleChoices: ['', '', ''], muteDuration: 2 }
        })
      }
    }
    return parsedData
  }

  const parseLRC = (text) => {
    const lines = text.split('\n')
    const parsedData = []
    const lrcRegex = /\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/
    for (let line of lines) {
      if (!line.trim()) continue
      const match = line.match(lrcRegex)
      if (match) {
        const minutes = parseInt(match[1])
        const seconds = parseFloat(match[2])
        const time = minutes * 60 + seconds
        const textContent = match[3].trim()
        parsedData.push({
          start: time,
          end: time + 2,
          text: textContent,
          color: '#ffffff',
          effect: 'none',
          gameModes: { isMissingWord: false, multipleChoices: ['', '', ''], muteDuration: 2 }
        })
      }
    }
    return parsedData
  }

  const startSync = () => {
    const text = rawLyrics.trim()
    if (!text) return
    setSyncCompleted(false)
    setSyncNotice('')

    setShowSetup(false)

    // JSON imports use the same validation and defaults as the player.
    let validJson = false
    try { JSON.parse(text); validJson = true } catch { /* Plain lyrics and LRC are also accepted. */ }
    if (jsonInput || validJson || /^\s*\{/.test(text)) {
      try {
        setSyncData(parsePlayLevel(text))
        setSelectedLineIndex(null)
        setTranscriptionError('')
        setIsSyncing(false)
      } catch (error) {
        setTranscriptionError(error.message)
        setShowSetup(true)
      }
      return
    }

    // 2. Essayer de parser l'ancien format Kivy (TSV : start \t end \t texte)
    const tsvData = parseTSV(text)
    if (tsvData.length > 0) {
      setSyncData(tsvData)
      setIsSyncing(false)
      return
    }

    // 3. Essayer de parser le format LRC classique ([01:23.45] texte)
    const lrcData = parseLRC(text)
    if (lrcData.length > 0) {
      // Ajuster le "end" en fonction du "start" suivant
      for (let i = 0; i < lrcData.length - 1; i++) {
        lrcData[i].end = lrcData[i+1].start
      }
      setSyncData(lrcData)
      setIsSyncing(false)
      return
    }

    // 4. Si c'est du texte brut -> Démarrer la synchro manuelle
    const { lines } = parseLyricsStructure(text, sectionPattern)
    if (!lines.length) { setShowSetup(true); return }
    const initialSyncData = lines.map(line => ({
      start: 0,
      end: 0,
      ...line,
      color: '#ffffff',
      effect: 'none',
      gameModes: {
        isMissingWord: false,
        multipleChoices: ['', '', ''],
        muteDuration: 2
      }
    }))
    setSyncData(initialSyncData)
    setCurrentSyncIndex(0)
    setIsSyncing(true)
    if (!externalSource && audioRef.current) {
      audioRef.current.currentTime = 0
      playSyncAudio()
    }
  }

  const playSyncAudio = () => {
    if (externalSource) { setSyncNotice('Lancez la lecture depuis Spotify. Le calage suivra sa position.'); return }
    const audio = audioRef.current
    if (!audio) return
    audio.play().catch(() => setSyncNotice('Cliquez sur Lecture pour démarrer la musique.'))
  }

  const advanceSync = () => {
    const audio = audioRef.current
    if (externalSource && !remoteMatches) { setSyncNotice('Lancez le morceau Spotify indiqué avant de caler les paroles.'); return }
    if (!externalSource && !audio) return
    const clock = externalSource ? { currentTime: spotifyTime(spotifyState), duration: spotifyState.item.duration_ms / 1000,
      paused: !spotifyState.is_playing, ended: false, pause: () => {} } : audio
    const action = syncAction({ cursor: currentSyncIndex, count: syncData.length,
      time: clock.currentTime, duration: clock.duration, paused: clock.paused,
      ended: clock.ended, completed: syncCompleted })
    if (action === 'ignore') return
    if (action === 'incomplete') {
      setSyncNotice('Musique terminée. Il reste des lignes à caler : utilisez ← pour reprendre. Espace ne relance pas la musique.')
      return
    }
    if (action === 'paused') {
      setSyncNotice('Musique en pause. Appuyez sur P ou Lecture pour reprendre, puis Espace pour caler.')
      return
    }
    const updated = stampSegment(syncData, currentSyncIndex, clock.currentTime)
    if (!updated) {
      setSyncNotice('Ce repère précède le précédent. Utilisez ← pour reprendre la synchronisation.')
      return
    }
    setSyncData(updated)
    setSyncNotice('')
    if (currentSyncIndex === syncData.length) {
      setIsSyncing(false)
      setSyncCompleted(true)
      setSyncNotice('Synchronisation terminée. Vous pouvez exporter ou corriger une ligne.')
      clock.pause()
    } else setCurrentSyncIndex(currentSyncIndex + 1)
  }

  const resumeSync = (index) => {
    if ((!externalSource && !audioRef.current) || !syncData[index]) return
    const reset = rewindSegment(syncData, index)
    setSyncData(reset.lines)
    setSyncCompleted(false)
    setCurrentSyncIndex(index)
    setIsSyncing(true)
    if (!externalSource) { audioRef.current.currentTime = reset.time; playSyncAudio() }
    setSyncNotice(externalSource ? 'Revenez à ce passage dans Spotify, puis recalez avec Espace.' : 'Reprise avec 2 secondes de recul si possible. Recalez cette séquence et les suivantes avec Espace.')
  }

  const cycleSection = () => {
    if (currentSyncIndex >= syncData.length) return
    const sections = ['', ...SECTION_OPTIONS]
    setSyncData(lines => lines.map((line, index) => index === currentSyncIndex
      ? { ...line, section: sections[(sections.indexOf(line.section || '') + 1) % sections.length] }
      : line))
  }

  const joinNextLine = () => {
    if (currentSyncIndex + 1 >= syncData.length) return
    if (syncData[currentSyncIndex].sectionId !== syncData[currentSyncIndex + 1].sectionId || syncData[currentSyncIndex].isInstrumental !== syncData[currentSyncIndex + 1].isInstrumental) {
      setSyncNotice('Ces lignes appartiennent à des sections différentes ou à un passage sans paroles. Elles restent séparées.')
      return
    }
    setSyncData(lines => lines.flatMap((line, index) => {
      if (index === currentSyncIndex) return [{ ...line, text: `${line.text}\n${lines[index + 1].text}`, words: [] }]
      return index === currentSyncIndex + 1 ? [] : [line]
    }))
  }

  const toggleNonLyrics = () => {
    setSyncData(lines => lines.map((line, index) => index === currentSyncIndex
      ? { ...line, isInstrumental: !line.isInstrumental } : line))
  }

  useEffect(() => {
    if ((!isSyncing && !syncCompleted) || showSetup || showPlayer || showLyricsDiff) return
    const handleKeyDown = (event) => {
      if (syncCompleted) {
        return
      }
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (event.target.closest?.('input, textarea, select, button, [contenteditable="true"], [role="dialog"]')) return
      if (!['Space', 'ArrowLeft', 'KeyG', 'KeyN', 'KeyP'].includes(event.code)) return
      event.preventDefault()
      if (event.code === 'Space') advanceSync()
      if (event.code === 'ArrowLeft' && currentSyncIndex > 0) resumeSync(currentSyncIndex - 1)
      if (event.code === 'KeyG') joinNextLine()
      if (event.code === 'KeyN') toggleNonLyrics()
      if (event.code === 'KeyP' && audioRef.current) {
        if (audioRef.current.paused) playSyncAudio()
        else audioRef.current.pause()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    if (isSyncing) lineRefs.current[currentSyncIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [isSyncing, currentSyncIndex])
  useEffect(() => {
    if (isSyncing || showSetup || showPlayer || previewIndex < 0) return
    lineRefs.current[previewIndex]?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' })
  }, [previewIndex, isSyncing, showSetup, showPlayer, reducedMotion])

  const exportJSON = async (jsonOnly = false) => {
    if (savingRef.current) return
    setSaveNotice('')
    setSaveError('')
    let project
    try {
      project = createProject(syncData, externalSource ? null : audioFile?.name, externalSource ? trackId : null)
      setTimingError('')
    } catch (error) {
      setTimingError(error.message)
      return
    }
    savingRef.current = true
    setIsSaving(true)
    try {
      const name = audioFile?.name.replace(/\.[^.]+$/, '') || (externalSource ? `spotify-${trackId}` : 'karaoke_level')
      if (jsonOnly || (externalSource && saveDestination === 'pc')) {
        downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${name}.json`)
        setSaveNotice('Téléchargement du JSON lancé.')
      } else {
        if (!externalSource && !audioFile) throw new Error('Chargez la musique pour enregistrer le projet complet, ou choisissez « JSON seul ».')
        if (saveDestination === 'pc') {
          const bytes = new Uint8Array(await audioFile.arrayBuffer())
          downloadBlob(new Blob([projectArchive(project, audioFile.name, bytes)], { type: 'application/zip' }), `${name}.zip`)
          setSaveNotice('Téléchargement lancé : le ZIP contient la musique et le JSON. Extrayez-les pour les ouvrir dans Jouer.')
        } else {
          if (!externalSource && audioFile.size > MAX_AUDIO_BYTES) throw new Error('Home Assistant accepte ici une musique de 20 Mio maximum. Le téléchargement PC reste disponible.')
          const status = await fetch(`${import.meta.env.BASE_URL}api/home-assistant/status`, { signal: AbortSignal.timeout(15000) })
          const health = await status.json()
          if (!status.ok || !health.ready) throw new Error(health.error || 'Home Assistant n’est pas prêt.')
          const body = new FormData()
          body.append('project', JSON.stringify(project))
          if (!externalSource) body.append('audio', audioFile)
          const response = await fetch(`${import.meta.env.BASE_URL}api/home-assistant/projects`, { method: 'POST', headers: { 'X-Karaoke-Request': '1' }, body, signal: AbortSignal.timeout(150000) })
          const result = await response.json()
          if (!response.ok || !result.saved) throw new Error(result.error || 'L’enregistrement a échoué.')
          setSaveNotice(`Musique et JSON enregistrés sur Home Assistant. Média : ${result.mediaContentId}`)
        }
      }
    } catch (error) {
      setSaveError(error.name === 'TimeoutError' ? 'Délai dépassé. Vérifiez Home Assistant avant de réessayer ; le projet peut avoir été enregistré.' : error instanceof SyntaxError || error instanceof TypeError ? 'API indisponible. Vérifiez que le serveur est démarré avec npm run dev.' : error.message)
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  const correctEndMarkers = () => {
    try {
      if (!firstVocalStart.trim()) throw new Error('Indiquez le début réel de la première phrase en secondes.')
      const corrected = repairEndMarkers(syncData, Number(firstVocalStart))
      setSyncData(corrected)
      setTimingError('')
      setSyncNotice('Décalage corrigé. Vérifiez avec Tester le Jeu, puis exportez le JSON.')
      setSyncCompleted(true)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    } catch (error) { setTimingError(error.message) }
  }

  const updateLineMeta = (index, field, value) => {
    setSyncData(prev => {
      const newData = [...prev]
      newData[index] = { ...newData[index], [field]: value }
      return newData
    })
  }

  const applyPresentation = (field, value) => {
    const selected = syncData[selectedLineIndex]
    if (!selected) return
    setSyncData(lines => lines.map((line, index) => {
      const matches = presentationScope === 'all' || index === selectedLineIndex ||
        (presentationScope === 'section' && selected.sectionId != null && line.sectionId === selected.sectionId)
      return matches ? { ...line, [field]: value } : line
    }))
  }

  const updateGameModeField = (index, field, value) => {
    setSyncData(prev => {
      const newData = [...prev]
      newData[index] = { ...newData[index], gameModes: { ...newData[index].gameModes, [field]: value } }
      return newData
    })
  }

  const preparedLyrics = useMemo(() => parseLyricsStructure(rawLyrics, sectionPattern), [rawLyrics, sectionPattern])
  const isPlainLyrics = !jsonInput && !/^\s*(?:\{|\[\s*\{|\[\d{2}:|\d+(?:\.\d+)?\t)/u.test(rawLyrics)

  if (showPlayer) {
    return <Player audioSrc={audioSrc} spotifyTrackId={externalSource ? trackId : null} syncData={syncData} onExit={() => setShowPlayer(false)} />
  }

  if (tvMode) {
    const editUrl = publicKaraokeUrl('edit', import.meta.env.BASE_URL)
    return (
      <div className="editor-tv-message">
        <p>Le mode TV est activé. Éditez les paroles depuis un autre appareil :</p>
        <LocalQrCode value={editUrl} label="Adresse pour éditer les paroles" />
        <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Ou ouvrez <a href={editUrl}>{editUrl}</a>.</p>
        <button type="button" className="neon-btn outline-btn" onClick={onBack}>Retour au menu</button>
      </div>
    )
  }

  return (
    <div className={`studio-container studio-v2 animate-fade-in${showSetup ? ' is-setup' : ''}${isSyncing ? ' is-syncing' : ''}`}>
      <header className="studio-header">
        <button className="btn-back" onClick={onBack}>← Menu</button>
        <h1>Studio <span>V2</span></h1>
        {lyricsLabEnabled && !showSetup && !isSyncing && syncData.length > 0 && <button className="outline-btn" onClick={() => setShowLyricsLab(true)}>Laboratoire · expérimental</button>}
        {syncData.length > 0 && !isSyncing && (
          <>
            {referenceLyrics.trim() && (
              <button className="outline-btn diff-open-btn" onClick={() => setShowLyricsDiff(true)}>
                ± Comparer les paroles
              </button>
            )}
            <button className="studio-preview-button" onClick={() => {
              try { parsePlayLevel(JSON.stringify({ lyrics: syncData }), { requireQuizCues: true }); setTimingError(''); setShowPlayer(true) }
              catch (error) { setTimingError(error.message) }
            }}>
              ▷ Visualiser
            </button>
          </>
        )}
      </header>

      <nav className="studio-steps" aria-label="Étapes du projet">
        <div className={`studio-step${showSetup || isSyncing ? ' active' : ' complete'}`} aria-current={showSetup || isSyncing ? 'step' : undefined}><span>1</span><div><strong>Synchroniser</strong><small>Musique et paroles</small></div></div>
        <div className={`studio-step${!showSetup && !isSyncing ? ' active' : ''}`} aria-current={!showSetup && !isSyncing ? 'step' : undefined}><span>2</span><div><strong>Éditer les paroles</strong><small>Styles et interactions</small></div></div>
        <div className="studio-step"><span>3</span><div><strong>Visualiser</strong><small>Tester le karaoké</small></div></div>
      </nav>
      {timingError && <p className="studio-alert" role="alert">{timingError}</p>}
      <div className="studio-layout">
        
        {showSetup ? (
          <div className="left-panel setup-panel">
            <div className="setup-heading"><span className="setup-eyebrow">VOTRE PROCHAIN KARAOKÉ</span><h2>Tout commence par un morceau.</h2><p className="studio-intro">Ajoutez votre musique, puis ses paroles. Un fichier déjà synchronisé vous emmène directement à l’édition.</p></div>
            <section className="setup-block">
              <div className="setup-block-heading"><span>01</span><h3>La musique</h3><small>{audioFile ? 'Prête' : 'À ajouter'}</small></div>
              <label><input type="checkbox" checked={externalSource} onChange={event => setExternalSource(event.target.checked)} /> Source externe Spotify Connect</label>
              {externalSource ? <>
                <label htmlFor="spotify-track-url">Lien du morceau Spotify</label>
                <input id="spotify-track-url" type="url" value={spotifyUrl} onChange={event => setSpotifyUrl(event.target.value)} placeholder="https://open.spotify.com/intl-fr/track/…" aria-invalid={Boolean(spotifyUrl && !trackId)} />
                {spotifyUrl && !trackId && <p className="error">Lien de morceau Spotify invalide.</p>}
                {trackId && <div style={{ marginTop: '10px' }}><SpotifyRemote trackId={trackId} onState={setSpotifyState} active={true} /></div>}
                {spotifyLyricsNotice && <p className="setup-help" role="status" style={{ color: spotifyLyricsNotice.startsWith('✓') ? '#7edeee' : '#d5b6ff', marginTop: '8px' }}>{spotifyLyricsNotice}</p>}
              </> : <FileImport kind="audio" accept="audio/*" label="Choisir la musique" hint="MP3, WAV, M4A…" filename={audioFile?.name} onChange={handleAudioUpload} />}
            </section>
            
            <section className="setup-block setup-lyrics">
              <div className="setup-block-heading"><span>02</span><h3>Les paroles</h3><small>{rawLyrics.trim() ? 'Ajoutées' : 'À ajouter'}</small></div>
              <FileImport accept=".json,.txt,.lrc,.tsv" label="Importer les paroles" hint="TXT, LRC, TSV ou projet JSON" filename={lyricsFilename} onChange={async event => {
                const file = event.target.files[0]
                if (!file) return
                try {
                  setRawLyrics(await file.text())
                  setLyricsFilename(file.name)
                  setJsonInput(file.name.toLowerCase().endsWith('.json'))
                  setTranscriptionError('')
                } catch { setTranscriptionError('Impossible de lire le fichier de paroles.') }
              }} />
              <div className="setup-divider"><span>ou collez votre texte</span></div>
              <RawLyricsInput
                value={rawLyrics}
                pattern={sectionPattern}
                highlight={isPlainLyrics}
                onChange={(e) => { setRawLyrics(e.target.value); setJsonInput(false); setLyricsFilename('') }}
              />
              <p className="setup-help">Une phrase par ligne. Les titres de couplets et de refrains sont reconnus automatiquement.</p>
              <details className="setup-advanced"><summary>Reconnaissance des sections <span>Avancé</span></summary>
              <label htmlFor="section-regex">Regex de titres supplémentaires · facultatif</label>
              <input id="section-regex" type="text" value={sectionRegex} onChange={event => setSectionRegex(event.target.value)}
                placeholder={'Ex. : \\*\\*(.+)\\*\\*'} aria-invalid={Boolean(sectionPatternError)} aria-describedby="section-regex-help section-regex-error" spellCheck={false} />
              <small id="section-regex-help">Sans /…/ : appliquée à chaque ligne entière ou titre encadré sur plusieurs lignes, sans distinction de casse. Le point inclut les sauts de ligne. Le premier groupe (…) donne le nom de la partie. Vide = automatique. L’exemple détecte toutes les lignes entre **, y compris le titre de la chanson.</small>
              </details>
              {sectionPatternError && <p id="section-regex-error" className="error" role="alert">{sectionPatternError}</p>}
              {rawLyrics.trim() && isPlainLyrics && (
                <details className="structure-preview">
                  <summary>{preparedLyrics.lines.length} lignes / passages · {preparedLyrics.headers} titres de section détectés</summary>
                  <ol>
                    {preparedLyrics.lines.map((line, index) => (
                      <li key={index}>
                        {(index === 0 || line.sectionId !== preparedLyrics.lines[index - 1].sectionId) && <strong className="section-tag">{line.section || 'Paroles'}</strong>}
                        {line.text}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>

            <LrclibSearch onImport={(lyrics, result) => {
              setRawLyrics(lyrics)
              setJsonInput(false)
              setLyricsFilename(`LRCLIB · ${result.trackName} — ${result.artistName}`)
              setTranscriptionError('')
            }} />

            <details className="reference-input reference-disclosure">
              <summary>Comparer les paroles <span>· facultatif{referenceName ? ' · fichier chargé' : ''}</span></summary>
              <div className="input-group reference-content">
              <label htmlFor="reference-file">Paroles de référence (.txt)</label>
              <input id="reference-file" type="file" accept=".txt,text/plain" onChange={handleReferenceUpload} />
              {referenceName && <>
              <div className="reference-file-status">
                <strong>{referenceName}</strong>
                <span>{ignoredHeaders} titres de section détectés</span>
              </div>
              <button className="outline-btn" disabled={!referenceSource.trim()} onClick={() => { setRawLyrics(referenceSource); setJsonInput(false) }}>
                Utiliser ces paroles ligne par ligne
              </button>
              <button className="reference-clear" onClick={() => {
                setReferenceSource('')
                setReferenceName('')
                setReferenceError('')
                setShowLyricsDiff(false)
                document.getElementById('reference-file').value = ''
              }}>Retirer la référence</button>
              </>}
              {referenceError && <p className="error">{referenceError}</p>}
              </div>
            </details>

            <div className="setup-actions">
             <button
              className="btn-primary" 
              onClick={startSync}
              disabled={!(externalSource ? trackId : audioSrc) || !rawLyrics.trim()}
            >
              Continuer vers le studio →
            </button>
            <button
              className="btn-success"
              onClick={transcribeAudio}
              disabled={externalSource || !audioFile || isTranscribing}
              style={{ width: '100%' }}
            >
              {isTranscribing ? 'Transcription en cours…' : '✦ Générer les paroles depuis la musique'}
            </button>
            <small className="setup-help">La génération automatique propose les paroles et leur calage, à vérifier ensuite.</small>
            </div>
            {transcriptionError && <p className="error">{transcriptionError}</p>}
          </div>
        ) : (
          null
        )}

        <div className="center-panel" style={{ overflowY: 'auto' }}>
          {!showSetup && (
            <div className="studio-transport">
              <div className="track-identity">
                <span aria-hidden="true">{externalSource ? '🟢' : '♫'}</span>
                <div>
                  <strong>{externalSource ? (spotifyState?.item?.name || 'Morceau Spotify') : (audioFile?.name || 'Musique du projet')}</strong>
                  <small>{isSyncing ? 'Calage des paroles' : (externalSource ? (spotifyState?.device?.name || 'Spotify Connect') : 'Lecture et aperçu')}</small>
                </div>
              </div>
              {externalSource && trackId ? (
                <SpotifyRemote
                  trackId={trackId}
                  onState={setSpotifyState}
                  active={!showSetup}
                  spaceShortcut={!isSyncing && !showLyricsDiff}
                />
              ) : (
                audioSrc && (
                  <>
                    <audio 
                      ref={audioRef} 
                      src={audioSrc} 
                      autoPlay={isSyncing}
                      onEnded={() => { if (isSyncing) advanceSync() }}
                      style={{ display: 'none' }}
                    />
                    <AudioControls audioRef={audioRef} autoMuted={previewMuted} spaceShortcut={!isSyncing && !showLyricsDiff} manualPause={Boolean(previewPause)} />
                    {previewPause && <p className="quiz-pause-notice" role="status">Pause au repère · Espace pour reprendre.</p>}
                  </>
                )
              )}
            </div>
          )}
          <div className="canvas-heading"><div><small>ESPACE DE TRAVAIL</small><h2>{isSyncing ? 'Synchronisation' : 'Paroles'}</h2></div><span>{syncData.length} phrases</span></div>
          {lyricsLabEnabled && labAnalysis?.source === syncData && !isSyncing && <label className="studio-lab-toggle"><input type="checkbox" checked={labMarks} onChange={event => setLabMarks(event.target.checked)} /> Repères du laboratoire <small>Vue d’analyse · styles de jeu conservés</small></label>}
          {isSyncing ? (
            <div className="sync-active">
              <p className="sync-shortcuts">Espace · avancer &nbsp; ← · corriger &nbsp; P · pause</p>
              <div className="sync-toolbar" onClick={event => event.target.closest('button')?.blur()}>
                <button className="btn-primary" onClick={advanceSync}>{currentSyncIndex === syncData.length ? 'Terminer · Espace' : currentSyncIndex === 0 ? 'Début de la première phrase · Espace' : 'Début de la suivante · Espace'}</button>
                {currentSyncIndex > 0 && <button className="outline-btn" onClick={() => resumeSync(currentSyncIndex - 1)}>← Corriger la précédente</button>}
              </div>
              {currentSyncIndex < syncData.length && <details className="sync-extra">
                <summary>Organiser les paroles · G / N</summary>
                <div className="sync-toolbar" onClick={event => event.target.closest('button')?.blur()}>
                <button className="outline-btn" disabled={currentSyncIndex + 1 >= syncData.length} onClick={joinNextLine}>G · Ajouter la ligne suivante au bloc</button>
                <button className="outline-btn" disabled={currentSyncIndex >= syncData.length} onClick={cycleSection}>Section : {syncData[currentSyncIndex]?.section || 'Aucune'}</button>
                <button className="outline-btn" aria-pressed={Boolean(syncData[currentSyncIndex]?.isInstrumental)} disabled={currentSyncIndex >= syncData.length} onClick={toggleNonLyrics}>N · {syncData[currentSyncIndex]?.isInstrumental ? 'Rétablir les paroles' : 'Sans paroles'}</button>
                </div>
              </details>}
              <p role="status">{syncNotice || `${currentSyncIndex} / ${syncData.length} débuts calés`}</p>
              <p>Appuyez sur Espace au <strong>premier mot</strong> de chaque phrase. La phrase en cours reste au centre ; celle qui suit apparaît en dessous.</p>
              <div className="sync-focus">
                <small>{currentSyncIndex === 0 ? 'À venir — Espace dès le premier mot' : currentSyncIndex === syncData.length ? 'En cours — Espace à la fin pour terminer' : 'En cours'}</small>
                {syncData[Math.max(0, currentSyncIndex - 1)]?.section && <span className="section-tag">{syncData[Math.max(0, currentSyncIndex - 1)].section}</span>}
                {syncData[Math.max(0, currentSyncIndex - 1)]?.isInstrumental && <span className="section-tag">♫ Sans paroles — texte masqué dans le karaoké</span>}
                <p><LyricText text={syncData[Math.max(0, currentSyncIndex - 1)]?.text} /></p>
                {syncData[Math.max(1, currentSyncIndex)] && <><small>Ensuite — Espace à son premier mot</small><p className="sync-next"><LyricText text={syncData[Math.max(1, currentSyncIndex)].text} /></p></>}
              </div>
              <div className="sync-lines">
                {syncData.map((line, idx) => (
                  <div key={idx} ref={el => lineRefs.current[idx] = el} className={`sync-line ${idx === Math.max(0, currentSyncIndex - 1) ? 'active' : ''} ${idx < currentSyncIndex - 1 ? 'done' : ''}`}>
                    {line.section && <span className="section-tag">{line.section}</span>}
                    {line.isInstrumental && <span className="section-tag">♫ Sans paroles</span>}
                    <LyricText text={line.text} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="sync-results">
              {syncCompleted && <p className="sync-finished" role="status">✓ {syncNotice}</p>}
              {syncData.length > 0 && !isSyncing ? (
                <>
<p className="canvas-hint">Sélectionnez une phrase pour la personnaliser <span>·</span> Espace pour écouter</p>
                  {aiEnabled && <div className="ai-summary">
                    <span role="status">✦ IA · {ai.entries.filter(entry => entry.state === 'done' || entry.payload.line.isInstrumental).length} / {syncData.length} phrases analysées{!aiReady ? ' · Terminez les repères pour démarrer.' : ''}</span>
                    {ai.entries.some(entry => entry.state === 'error') && <button type="button" onClick={ai.retryErrors}>Réessayer</button>}
                    {aiUndo && <button type="button" onClick={undoAi}>Annuler la dernière application</button>}
                    {aiNotice && <p role="status">{aiNotice}</p>}
                  </div>}
                  <ul className="results-list" data-highlight={previewHighlight.mode} style={{ '--preview-highlight': previewHighlight.color }}>
                    {syncData.map((line, idx) => (
                      <li 
                        key={idx} 
                        ref={el => lineRefs.current[idx] = el}
                        className={`${selectedLineIndex === idx ? 'selected' : ''} ${previewIndex === idx ? 'preview-active' : ''} effect-${line.effect || 'none'}`}
                        style={{ color: line.color || '#ffffff', ...lyricPresentation(line, 0.5), ...lineAnimationStyle(line.effect, displayTime - line.start) }}
                        aria-current={previewIndex === idx ? 'true' : undefined}
                        tabIndex={0} role="button" aria-label={`Modifier la phrase ${idx + 1} : ${plainLyrics(line.text)}`}
                        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setInspectorTab('design'); setShowAiActivity(false); setSelectedLineIndex(idx); setSelectedHiddenGroup(1); setAiCategory(null) } }}
                        onClick={() => { setInspectorTab('design'); setShowAiActivity(false); setSelectedLineIndex(idx); setSelectedHiddenGroup(1); setAiCategory(null) }}
                      >
                        {previewIndex === idx && <span className="preview-current-badge">En cours</span>}
                        {line.section && <span className="section-tag">{line.section}</span>}
                        {line.isInstrumental && <span className="section-tag">♫ Sans paroles</span>}
                        <span className="time">[{line.start.toFixed(2)}s]</span> {lyricsLabEnabled && labMarks && labAnalysis?.source === syncData ? <LabAnnotatedText tokens={labAnalysis.report.annotatedLines[idx].tokens} /> : <AnnotatedLyrics text={line.text} time={displayTime - line.start} animationProfiles={line.animationProfiles} />}
                        {aiReady && !line.isInstrumental && <div className="ai-badges" aria-label={`Suggestions IA pour la phrase ${idx + 1}`}>
                          <span aria-hidden="true">✦</span>
                          {ai.entries[idx].state === 'done' ? [...new Set(ai.entries[idx].suggestions.filter(item => !ignoredAi.has(`${ai.entries[idx].key}:${item.id}`)).map(item => item.category))].map(category =>
                            <button type="button" key={category} onClick={event => { event.stopPropagation(); setInspectorTab('design'); setShowAiActivity(false); setSelectedLineIndex(idx); setAiCategory(category) }}>{AI_CATEGORIES[category]}</button>
                          ) : <button type="button" onClick={event => { event.stopPropagation(); setInspectorTab('design'); setShowAiActivity(false); setSelectedLineIndex(idx); setAiCategory(null) }}>{ai.entries[idx].state === 'error' ? 'Erreur IA' : ai.entries[idx].state === 'loading' ? 'Analyse…' : 'En attente'}</button>}
                          {ai.entries[idx].state === 'done' && !ai.entries[idx].suggestions.some(item => !ignoredAi.has(`${ai.entries[idx].key}:${item.id}`)) && <small>Aucune suggestion</small>}
                        </div>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="placeholder">La zone de synchronisation apparaîtra ici.</p>
              )}
            </div>
          )}
        </div>

        <aside className="right-panel" aria-label="Inspecteur du studio">
          <div className="inspector-tabs" role="group" aria-label="Panneau de réglages">
            <button type="button" aria-pressed={inspectorTab === 'design'} onClick={() => setInspectorTab('design')}>Création</button>
            <button type="button" aria-pressed={inspectorTab === 'project'} onClick={() => setInspectorTab('project')}>Projet & export</button>
          </div>
          {inspectorTab === 'project' ? <div className="project-settings">            <h2>Projet & lecture</h2>
            <button className="outline-btn" style={{ width: '100%', marginBottom: '20px' }} onClick={() => setShowSetup(true)}>
              Modifier Fichier / Paroles
            </button>
            
            {syncData.length > 0 && !isSyncing && (
              <>
              <fieldset className="preview-highlight-settings" disabled={isSaving}>
                <legend>{externalSource ? 'Enregistrer le projet Spotify' : 'Enregistrer la musique et le JSON'}</legend>
                <>
                <label htmlFor="save-destination">Destination</label>
                <select id="save-destination" value={saveDestination} onChange={event => { setSaveDestination(event.target.value); setSaveNotice(''); setSaveError('') }}>
                  <option value="pc">Mon PC · ZIP (musique + JSON)</option>
                  <option value="home-assistant">Home Assistant · stockage média</option>
                </select>
                {saveDestination === 'home-assistant' && <small>Musique limitée à 20 Mio. Le composant karaoke_storage doit être installé sur Home Assistant.</small>}
                <button className="btn-success" onClick={() => exportJSON()} style={{ width: '100%', marginTop: '12px' }}>
                  {isSaving ? 'Enregistrement…' : saveDestination === 'pc' ? 'Télécharger sur mon PC' : 'Envoyer sur Home Assistant'}
                </button>
                </>
                <button onClick={() => exportJSON(true)} style={{ width: '100%', marginTop: '8px' }}>Télécharger le JSON seul</button>
              </fieldset>
              {saveNotice && <p role="status" style={{ overflowWrap: 'anywhere' }}>{saveNotice}</p>}
              {saveError && <p role="alert">{saveError}</p>}
              <fieldset className="preview-highlight-settings">
                <legend>Mise en évidence</legend>
                <label htmlFor="preview-highlight-mode">Phrase en cours</label>
                <select id="preview-highlight-mode" value={previewHighlight.mode}
                  onChange={event => updatePreviewHighlight({ mode: event.target.value })}>
                  <option value="background">Fond coloré</option>
                  <option value="text">Texte coloré</option>
                  <option value="outline">Contour lumineux</option>
                </select>
                <label className="preview-highlight-color" htmlFor="preview-highlight-color">
                  Couleur du repère
                  <input id="preview-highlight-color" type="color" value={previewHighlight.color}
                    onChange={event => updatePreviewHighlight({ color: event.target.value })} />
                </label>
                <small>Suit la musique dans l’aperçu. Ce réglage ne change pas les couleurs exportées.</small>
              </fieldset>
              <details className="sync-extra">
                <summary>Les paroles ont une phrase de retard ?</summary>
                <p>Si vous avez appuyé à la fin de chaque phrase, indiquez le début réel du chant. Cette correction décale les repères d’une ligne vers l’avant. Ne l’appliquez qu’une fois.</p>
                <label htmlFor="first-vocal-start">Début du chant (secondes)</label>
                <input id="first-vocal-start" type="number" min="0" step="0.01" value={firstVocalStart} onChange={event => setFirstVocalStart(event.target.value)} />
                <button className="outline-btn" onClick={correctEndMarkers}>Corriger les repères de fin de phrase</button>
              </details>

              </>
            )}
</div> : isSyncing ? <div className="inspector-empty"><span aria-hidden="true">♪</span><h3>Au rythme de la musique</h3><p>Appuyez sur Espace au premier mot de chaque phrase. Les outils de création seront disponibles une fois les repères calés.</p><kbd>Espace</kbd> avancer · <kbd>P</kbd> pause</div> : <>

          <div className="ai-panel-switch"><h2>{aiReady && showAiActivity ? 'Suivi IA' : 'Propriétés'}</h2>
            {aiReady && <button type="button" className="outline-btn" onClick={() => setShowAiActivity(value => !value)}>{showAiActivity ? 'Retour à l’éditeur' : 'Voir le suivi IA'}</button>}
          </div>
          {aiReady && showAiActivity ? <AiActivityPanel entries={ai.entries} onRetry={ai.retryErrors} /> : selectedLineIndex !== null && syncData[selectedLineIndex] ? (
            <div className="editor-panel glass-panel">
              {aiReady && !syncData[selectedLineIndex].isInstrumental && <AiSuggestionPanel
                key={`${ai.entries[selectedLineIndex].key}:${aiCategory}`} line={syncData[selectedLineIndex]} entry={ai.entries[selectedLineIndex]} category={aiCategory}
                onApply={applyAi} ignored={ignoredAi} onRetry={ai.retryErrors}
                onIgnore={suggestion => setIgnoredAi(previous => new Set([...previous, `${ai.entries[selectedLineIndex].key}:${suggestion.id}`]))} />}
              <div className="selection-heading"><small>SÉLECTION</small><h3>Phrase {selectedLineIndex + 1}</h3><span>{syncData[selectedLineIndex].section || 'Sans section'} · {syncData[selectedLineIndex].start.toFixed(1)} s</span></div>
              <PresentationControls line={syncData[selectedLineIndex]} scope={presentationScope} onScopeChange={setPresentationScope} onChange={applyPresentation} />
              <details className="inspector-section"><summary>Texte & animations des mots</summary><div className="inspector-section-body">
              <LyricTextEditor key={selectedLineIndex} line={syncData[selectedLineIndex]} audioRef={audioRef} playbackTime={displayTime} onSelectGroup={setSelectedHiddenGroup} selectedGroup={selectedHiddenGroup} onCuePlayback={setCuePlaybackEnd}
                lines={syncData} lineIndex={selectedLineIndex} onApplySignature={applySignature} onUndoSignature={undoSignature} canUndoSignature={Boolean(signatureUndo)}
                onChange={(text, group) => {
                  if (group !== null && group !== undefined) setSelectedHiddenGroup(group)
                  setSyncData(lines => lines.map((line, index) => index === selectedLineIndex ? updateHiddenText(line, text) : line))
                }} />
              </div></details>
              <details className="line-properties inspector-section"><summary>Réglages de la phrase</summary>
              <h3 style={{ color: 'var(--secondary)' }}>Ligne sélectionnée :</h3>
              {!isSyncing && <button className="outline-btn" onClick={() => resumeSync(selectedLineIndex)}>Resynchroniser à partir d’ici</button>}
              <label className="section-picker">Section
                <select value={syncData[selectedLineIndex].section || ''} onChange={event => updateLineMeta(selectedLineIndex, 'section', event.target.value)}>
                  <option value="">Aucune</option>
                  {[...new Set([...SECTION_OPTIONS, syncData[selectedLineIndex].section].filter(Boolean))].map(section => <option key={section}>{section}</option>)}
                </select>
              </label>
              <label className="section-picker">
                <input type="checkbox" checked={Boolean(syncData[selectedLineIndex].isInstrumental)} onChange={event => updateLineMeta(selectedLineIndex, 'isInstrumental', event.target.checked)} />
                Sans paroles (texte masqué pendant le karaoké)
              </label>
              </details>
              
              <div className="editor-option" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px' }}>Effets Visuels :</label>
                <div className="color-picker-group">
                  <input 
                    type="color" 
                    value={syncData[selectedLineIndex].color || '#ffffff'}
                    onChange={(e) => updateLineMeta(selectedLineIndex, 'color', e.target.value)}
                    title="Couleur du texte"
                  />
                  <select 
                    className="neon-input" 
                    value={syncData[selectedLineIndex].effect || 'none'}
                    onChange={(e) => updateLineMeta(selectedLineIndex, 'effect', e.target.value)}
                  >
                    <option value="none">Aucun effet</option>
                    <option value="shake">Tremblement</option>
                    <option value="wave">Vague</option>
                    <option value="blink">Néon Clignotant</option>
                  </select>
                </div>
              </div>

              <div className="editor-option" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold' }}>
                  <input 
                    type="checkbox" 
                    style={{ transform: 'scale(1.5)' }}
                    checked={syncData[selectedLineIndex].gameModes.isMissingWord}
                    onChange={(e) => updateGameModeField(selectedLineIndex, 'isMissingWord', e.target.checked)}
                  />
                  Phrase avec mot manquant
                </label>
              </div>

              {syncData[selectedLineIndex].gameModes.isMissingWord && (
                <MissingWordEditor key={`missing-${selectedLineIndex}`} line={syncData[selectedLineIndex]} audioRef={audioRef}
                  selectedGroup={selectedHiddenGroup} onSelectGroup={setSelectedHiddenGroup}
                  onChange={updated => setSyncData(lines => lines.map((line, index) => index === selectedLineIndex ? updated : line))} />
              )}
            </div>
          ) : (
            <div className="inspector-empty"><span aria-hidden="true">Aa</span><h3>Donnez du caractère aux paroles</h3><p>Sélectionnez une phrase dans la scène pour choisir sa police, sa transition et ses animations.</p><small>Les réglages peuvent s’appliquer à une phrase, une section ou tout le morceau.</small></div>
          )}
          </>}
        </aside>
      </div>

      {lyricsLabEnabled && showLyricsLab && <LyricsLab lines={syncData} onClose={() => setShowLyricsLab(false)} onShowMarks={(report, source) => { setLabAnalysis({ report, source }); setLabMarks(true); setShowLyricsLab(false) }} />}
      {showLyricsDiff && referenceLyrics.trim() && syncData.length > 0 && (
        <LyricsDiff
          referenceText={referenceLyrics}
          transcriptionText={syncData.map((line) => plainLyrics(line.text)).join('\n')}
          referenceName={referenceName}
          ignoredHeaders={ignoredHeaders}
          onClose={() => setShowLyricsDiff(false)}
        />
      )}
    </div>
  )
}

export default Editor
