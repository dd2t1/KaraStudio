import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LyricText from './LyricText'
import useAiPreference from '../aiPreference'
import useMotionPreference from '../useMotionPreference'
import { animationPresets } from '../animationPresets.mjs'
import { animationProfileId, validateAnimationProfile } from '../animationProfiles.mjs'
import { repeatedAnimationWords, signatureTargets, animationSignatureLibrary } from '../wordSignatures.mjs'
import { plainLyrics } from '../lyricMarkup.mjs'
import { wordCandidates } from '../aiSuggestions.mjs'
import { reportBrowserDiagnostic } from '../browserDiagnosticsClient.mjs'

export default function AnimationGallery({ lines, lineIndex, initialWord, onApply, onClose, onUndo, canUndo }) {
  const line = lines[lineIndex]
  const aiEnabled = useAiPreference()
  const reducedMotion = useMotionPreference()
  const [word, setWord] = useState(initialWord || '')
  const [scope, setScope] = useState('phrase')
  const [selected, setSelected] = useState('pulse')
  const [description, setDescription] = useState('')
  const [generated, setGenerated] = useState([])
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [replace, setReplace] = useState(false)
  const [excluded, setExcluded] = useState(new Set())
  const [playing, setPlaying] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const closeButton = useRef(null)
  const modal = useRef(null)
  const generation = useRef({ id: 0, controller: null })
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  const repeated = useMemo(() => repeatedAnimationWords(lines), [lines])
  const library = useMemo(() => animationSignatureLibrary(lines).slice(0, 12), [lines])
  const cards = [...animationPresets, ...library, ...generated].filter((item, i, items) => items.findIndex(other => other.id === item.id) === i)
  const choice = cards.find(item => item.id === selected)
  const targets = useMemo(() => signatureTargets(lines, { word, scope, lineIndex }), [lines, word, scope, lineIndex])
  const picked = targets.filter(target => !excluded.has(target.key))
  const conflicts = picked.filter(target => target.conflict).length

  useEffect(() => {
    const previous = document.activeElement
    const job = generation.current
    closeButton.current?.focus()
    const handle = event => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const focusable = [...modal.current.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length)
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', handle)
    return () => { window.removeEventListener('keydown', handle); previous?.focus(); job.id++; job.controller?.abort() }
  }, [])

  useEffect(() => {
    if (!playing || reducedMotion) return
    const started = performance.now()
    let frame, previous = 0
    const tick = now => {
      if (now - previous >= 40) { previous = now; setPreviewTime((now - started) / 1000) }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, reducedMotion])

  const cancelGeneration = () => {
    generation.current.id++
    generation.current.controller?.abort()
    setGenerating(false)
  }
  const changeWord = value => {
    cancelGeneration(); setWord(value); setGenerated([]); setExcluded(new Set()); setReplace(false); setNotice('')
    if (selected.startsWith('anim-')) setSelected('pulse')
  }
  const generate = async () => {
    if (!aiEnabled || !word.trim() || generating) return
    const id = ++generation.current.id
    const controller = new AbortController()
    generation.current.controller = controller
    setGenerating(true); setNotice('LM Studio crée des variantes pour ce mot. Rien ne sera appliqué.')
    const timeout = setTimeout(() => controller.abort(), 150000)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/ai/animation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ word: word.trim(), description, context: plainLyrics(line.text).slice(0, 500) }),
      })
      if (response.status === 404) throw new Error('Redémarrez le serveur avec le choix 1 du lanceur pour activer les animations personnalisées.')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Les variantes IA sont indisponibles.')
      const proposals = (result.profiles || []).map(validateAnimationProfile).map(profile => ({ id: animationProfileId(profile), profile, label: profile.name }))
      if (!proposals.length) throw new Error('Aucune variante valide. Essayez une idée plus simple.')
      if (id !== generation.current.id) return
      setGenerated(proposals)
      setNotice(result.cached ? 'Variantes retrouvées dans le cache. Choisissez et prévisualisez avant d’appliquer.' : 'Variantes prêtes. Choisissez et prévisualisez avant d’appliquer.')
    } catch (error) {
      if (id !== generation.current.id) return
      reportBrowserDiagnostic({ type: 'ai-error', errorName: error.name })
      setNotice(error.name === 'AbortError' ? 'Création interrompue ou trop longue. Les effets existants restent disponibles.' : error.message)
    } finally { clearTimeout(timeout); if (id === generation.current.id) setGenerating(false) }
  }
  const apply = () => {
    try {
      const result = onApply({ word, scope, lineIndex, effect: selected, profile: choice?.profile, replace, keys: picked.map(target => target.key) })
      setNotice(`${result.count} occurrence${result.count > 1 ? 's' : ''} animée${result.count > 1 ? 's' : ''}.${result.estimated ? ` ${result.estimated} placement(s) estimé(s) : à caler avec C.` : ''}${result.skipped ? ` ${result.skipped} passage(s) trop court(s) ignoré(s).` : ''} Pensez à exporter le JSON.`)
      setReplace(false)
    } catch (error) { setNotice(error.message) }
  }
  return createPortal(<div className="animation-gallery-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={modal} className="animation-gallery glass-panel" role="dialog" aria-modal="true" aria-labelledby="animation-gallery-title">
      <header className="animation-gallery-heading"><div><p>Atelier visuel · aucune application automatique</p><h2 id="animation-gallery-title">Galerie et signatures de mots</h2></div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Fermer la galerie d’animations">×</button>
      </header>
      <div className="animation-gallery-target">
        <label>Mot ou courte expression<input value={word} maxLength={60} onChange={event => changeWord(event.target.value)} /></label>
        <label>Mots répétés<select aria-label="Choisir un mot répété" value="" onChange={event => changeWord(event.target.value)}>
          <option value="">Choisir dans la chanson…</option>{repeated.map(item => <option key={item.word} value={item.word}>{item.word} · {item.count} occurrences</option>)}
        </select></label>
        <label>Portée<select aria-label="Portée de la signature" value={scope} onChange={event => { setScope(event.target.value); setExcluded(new Set()); setReplace(false) }}>
          <option value="phrase">Phrase actuelle</option><option value="section" disabled={!line.section}>Même section ({line.section || 'non définie'})</option><option value="song">Toute la chanson</option>
        </select></label>
      </div>
      <div className="animation-gallery-play"><button type="button" disabled={reducedMotion} onClick={() => { setPreviewTime(0); setPlaying(value => !value) }}>{playing ? 'Arrêter les aperçus' : 'Jouer tous les aperçus'}</button>
        <small>{reducedMotion ? 'Animations réduites selon votre préférence système.' : 'Les aperçus utilisent le même mot pour comparer facilement les mouvements.'}</small></div>
      <div className="animation-gallery-cards" aria-label="Animations disponibles">
        {cards.map(card => {
          const duration = card.profile?.duration || card.duration
          const time = playing && !reducedMotion ? previewTime % (duration + 0.4) : 0
          const profiles = card.profile ? { [card.id]: card.profile } : undefined
          return <button type="button" key={card.id} className="animation-gallery-card" aria-label={`Choisir ${card.label}`} aria-pressed={selected === card.id} onClick={() => setSelected(card.id)}>
            <span className="animation-gallery-sample" aria-hidden="true"><LyricText text={`*${card.id}@0/${duration}:${wordCandidates(word)[0]?.text || 'Mot'}*`} time={time} animationProfiles={profiles} /></span>
            <strong>{card.label}</strong><small>{card.profile ? 'Signature personnalisée' : 'Effet existant'} · {duration} s</small>
          </button>
        })}
      </div>
      <fieldset className="animation-gallery-ai"><legend>Créer une signature personnalisée · facultatif</legend>
        <label>Idée visuelle<input value={description} maxLength={180} placeholder="Ex. une pulsation douce, puis un léger envol" onChange={event => { cancelGeneration(); setDescription(event.target.value); setGenerated([]); setNotice('') }} /></label>
        <button type="button" disabled={!aiEnabled || !word.trim() || generating} onClick={generate}>{generating ? 'Création des variantes…' : 'Proposer des variantes avec LM Studio'}</button>
        {generating && <button type="button" onClick={() => { cancelGeneration(); setNotice('Demande annulée. Vous pouvez continuer avec la galerie.') }}>Annuler la demande</button>}
        <small>{aiEnabled ? 'Un seul profil est créé pour le mot, pas une demande par occurrence. Données vérifiées uniquement : aucun script ou CSS arbitraire.' : 'Activez l’aide IA dans les paramètres pour créer des variantes. La galerie fonctionne sans IA.'}</small>
      </fieldset>
      <details className="animation-gallery-occurrences"><summary>{picked.length} / {targets.length} occurrences sélectionnées · {picked.filter(target => target.timingSource === 'estimated').length} à caler</summary>
        <div>{targets.slice(0, 200).map(target => <label key={target.key}>
          <input type="checkbox" checked={!excluded.has(target.key)} onChange={event => setExcluded(previous => { const next = new Set(previous); if (event.target.checked) next.delete(target.key); else next.add(target.key); return next })} />
          <span>Phrase {target.lineIndex + 1} · +{target.cue.toFixed(2)} s · {target.timingSource === 'estimated' ? 'À caler' : target.timingSource === 'existing' ? 'Repère conservé' : 'Repère par mot'}{target.conflict ? ' · Animation existante' : ''}<small>{target.excerpt.slice(0, 180)}</small></span>
        </label>)}</div>{targets.length > 200 && <small>Les 200 premières occurrences sont détaillées ; utilisez une portée plus courte pour affiner les suivantes.</small>}
      </details>
      {conflicts > 0 && <label className="animation-gallery-confirm"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />Je confirme le remplacement des animations sur {conflicts} occurrence(s). Les QCM et styles seront conservés.</label>}
      <footer className="animation-gallery-footer"><button type="button" disabled={!choice || !picked.length || conflicts > 0 && !replace} onClick={apply}>Appliquer à {picked.length} occurrence(s)</button>
        <button type="button" disabled={!canUndo} onClick={() => { try { onUndo(); setNotice('Dernière signature annulée.') } catch (error) { setNotice(error.message) } }}>Annuler la dernière signature</button>
      </footer>
      {notice && <p className="animation-gallery-notice" role="status">{notice}</p>}
      <small>Les paroles restent inchangées. Seuls les effets appliqués sont inclus dans le morceau exporté. Les placements estimés se vérifient à l’écoute.</small>
    </section>
  </div>, document.body)
}
