import { useEffect, useRef, useState } from 'react'
import AnnotatedLyrics from './AnnotatedLyrics'
import { lyricQuizzes, plainLyrics, parseLyricMarkup } from '../lyricMarkup.mjs'
import { animationPresets } from '../animationPresets.mjs'

import { editLyrics, markLyrics } from '../visualLyrics.mjs'
import AnimationGallery from './AnimationGallery'
import { wordCandidates } from '../aiSuggestions.mjs'

export default function LyricTextEditor({ line, onChange, audioRef, playbackTime, onSelectGroup, selectedGroup, onCuePlayback, lines, lineIndex, onApplySignature, onUndoSignature, canUndoSignature }) {
  const input = useRef(null)
  const selection = useRef({ start: 0, end: 0 })
  const [color, setColor] = useState('#55ffff')
  const [notice, setNotice] = useState('')
  const [effect, setEffect] = useState('saut')
  const [duration, setDuration] = useState('0.8')
  const [mode, setMode] = useState('loop')
  const [cue, setCue] = useState('0')
  const [scope, setScope] = useState('selection')
  const [galleryWord, setGalleryWord] = useState(null)
  const plain = plainLyrics(line.text)
  const mirror = useRef(null)
  const applyMarks = marks => {
    const { start, end } = selection.current
    if (start === end) { setNotice('Sélectionnez un mot ou plusieurs mots dans le texte.'); return }
    const next = markLyrics(line.text, start, end, marks)
    const group = marks.quiz ? lyricQuizzes(next, false).find(item => item.start <= start && item.end > start)?.group : null
    onChange(next, group)
    setNotice('Modification enregistrée dans la phrase. Pensez à exporter le JSON.')
  }
  const selectMark = ({ start, end, token }) => {
    selection.current = { start, end }
    input.current?.setSelectionRange(start, end)
    setScope('selection')
    if (token.effect) {
      setEffect(token.effect); setDuration(String(token.duration)); setMode(token.cue === null ? 'loop' : 'timed'); setCue(String(token.cue ?? 0))
    }
    if (token.quiz) onSelectGroup?.(token.quiz)
    setNotice(`« ${plain.slice(start, end)} » sélectionné. C cale l’animation ; V cale le mot caché choisi.`)
  }
  const prepareCue = kind => {
    const audio = audioRef.current
    if (!audio) { setNotice('Chargez la musique pour écouter le passage.'); return }
    const selected = selection.current
    let target
    if (kind === 'animation') {
      let offset = 0
      const effects = parseLyricMarkup(line.text).map(token => {
        const mark = { start: offset, end: offset + token.text.length, token }
        offset = mark.end
        return mark
      }).filter(mark => mark.token.effect)
      target = effects.find(mark => selected.end > selected.start && mark.start < selected.end && mark.end > selected.start) || effects[0]
      if (!target && selected.end > selected.start) target = { ...selected, token: { cue: mode === 'timed' ? Number(cue) : null } }
    } else {
      const targets = lyricQuizzes(line.text, false)
      const quiz = targets.find(item => item.group === selectedGroup) || targets[0]
      if (quiz) target = { start: quiz.start, end: quiz.end, token: { quiz: quiz.group, quizCue: quiz.cue } }
    }
    if (!target) { setNotice(kind === 'animation' ? 'Sélectionnez un mot ou appliquez une animation avant de lancer le calage.' : 'Choisissez un mot caché avant de lancer le calage.'); return }
    selectMark(target)
    const offset = kind === 'animation' ? target.token.cue : target.token.quizCue
    const from = Math.max(0, line.start + (Number.isFinite(offset) ? offset : 0) - 2)
    audio.pause()
    onCuePlayback?.(line.end)
    audio.currentTime = from
    audio.play().then(() => setNotice(`Écoute ciblée de « ${plain.slice(target.start, target.end)} ». Appuyez sur ${kind === 'animation' ? 'C' : 'V'} au bon moment. Arrêt à la fin de la phrase.`)).catch(() => {
      onCuePlayback?.(null)
      setNotice('Lecture impossible. Utilisez le bouton Lecture pour réessayer.')
    })
  }
  const applyAnimation = (liveCue = null) => {
    const { start, end } = scope === 'phrase' ? { start: 0, end: plain.length } : selection.current
    if (start === end) { setNotice('Sélectionnez un mot ou choisissez « Toute la phrase ».'); return }
    let seconds = Number(duration)
    const offset = liveCue ?? (mode === 'timed' ? Number(cue) : null)
    if (!duration.trim() || !Number.isFinite(seconds) || seconds < 0.2 || seconds > 3) {
      setNotice('La durée doit être comprise entre 0,2 et 3 secondes.'); return
    }
    if (offset !== null && ((!cue.trim() && liveCue === null) || !Number.isFinite(offset) || offset < 0 || offset >= line.end - line.start)) {
      setNotice('Le décalage doit se situer dans la phrase.'); return
    }
    if (effect.startsWith('anim-') && offset !== null) {
      seconds = Math.min(seconds, Math.floor((line.end - line.start - offset) * 100) / 100)
      if (seconds < 0.2) { setNotice('Il reste moins de 0,2 seconde : choisissez un repère plus tôt.'); return }
      setDuration(String(seconds))
    }
    onChange(markLyrics(line.text, start, end, { effect, duration: seconds, cue: offset }))
    selection.current = { start, end }
    setNotice('Effet appliqué. Pensez à exporter le JSON.')
  }
  const cueEffect = () => {
    const audio = audioRef.current
    if (!audio || audio.currentTime < line.start || audio.currentTime >= line.end) {
      setNotice('Placez la musique pendant cette phrase pour caler l’effet.'); return
    }
    const offset = audio.currentTime - line.start
    setMode('timed')
    setCue(offset.toFixed(2))
    applyAnimation(offset)
  }
  useEffect(() => {
    const handleKey = event => {
      if ((event.code !== 'KeyC' && event.key?.toLowerCase() !== 'c') || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
          event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      event.preventDefault()
      cueEffect()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })
  return <div className="lyric-editor">
    <div className="studio-live-preview">
      <div className="preview-heading"><strong>Aperçu · synchronisation</strong><span className="cue-preview-actions">
        <button type="button" aria-label="Écouter pour caler l’animation · C" title="Écouter avec deux secondes de recul, puis appuyer sur C" onClick={() => prepareCue('animation')} onContextMenu={event => { event.preventDefault(); prepareCue('animation') }}><b>C</b> Animation</button>
        <button type="button" aria-label="Écouter pour caler le mot caché · V" title="Écouter avec deux secondes de recul, puis appuyer sur V" onClick={() => prepareCue('quiz')} onContextMenu={event => { event.preventDefault(); prepareCue('quiz') }}><b>V</b> Mot caché</button>
      </span></div>
      <div className="lyric-preview" style={{ color: line.color || '#ffffff' }}>
        <AnnotatedLyrics text={line.text} time={playbackTime - line.start} onSelect={selectMark} animationProfiles={line.animationProfiles} />
      </div>
      <small>Sélectionnez un passage, puis cliquez sur Animation ou Mot caché (clic droit possible) pour écouter avec deux secondes de recul. Appuyez ensuite sur C ou V pour le caler.</small>
    </div>
    <label htmlFor="lyric-text">Texte de la phrase</label>
    <div className="visual-lyric-input" data-code={line.text}>
      <div className="lyric-input-mirror" ref={mirror} aria-hidden="true"><AnnotatedLyrics text={line.text} mirror />{'\n'}</div>
      <textarea id="lyric-text" ref={input} rows={4} value={plain} spellCheck={false}
        onScroll={event => { if (mirror.current) { mirror.current.scrollTop = event.target.scrollTop; mirror.current.scrollLeft = event.target.scrollLeft } }}
        onSelect={event => { selection.current = { start: event.target.selectionStart, end: event.target.selectionEnd } }}
        onChange={event => onChange(editLyrics(line.text, event.target.value))} />
    </div>
    <small>Éditez les paroles directement. Les couleurs et soulignements signalent les réglages conservés. Entrée ajoute un retour à la ligne.</small>
    <div className="lyric-tools" aria-label="Mettre en forme la sélection">
      <input type="color" aria-label="Couleur des mots sélectionnés" value={color} onChange={event => setColor(event.target.value)} />
      <button onClick={() => applyMarks({ color })}>Colorer</button>
      <button onClick={() => applyMarks({ bold: true })}>Gras</button>
      <button onClick={() => applyMarks({ italic: true })}>Italique</button>
      <button onClick={() => applyMarks({ quiz: Math.max(0, ...lyricQuizzes(line.text, false).map(item => item.group)) + 1, quizCue: null, quizDuration: null })}>Mot manquant</button>
      <button onClick={() => { const { start, end } = selection.current; onChange(editLyrics(line.text, plain.slice(0, start) + '\n' + plain.slice(end))); selection.current = { start: start + 1, end: start + 1 } }}>Retour à la ligne</button>
    </div>
    <fieldset className="effect-settings">
      <legend>Animation texte</legend>
      {onApplySignature && <button type="button" className="outline-btn" onClick={() => {
        const { start, end } = selection.current
        const target = plain.slice(start, end).trim()
        setGalleryWord(target && target.length <= 60 ? target : wordCandidates(plain)[0]?.text || '')
      }}>Ouvrir la galerie et les signatures</button>}
      <label className="animation-scope">Appliquer à
        <select aria-label="Appliquer à" value={scope} onChange={event => setScope(event.target.value)}>
          <option value="selection">Mot ou mots sélectionnés</option><option value="phrase">Toute la phrase</option>
        </select>
      </label>
      <div className="effect-palette">
        {animationPresets.map(preset => <button type="button" key={preset.id} className="effect-preset"
          aria-label={preset.label} aria-pressed={effect === preset.id} onClick={() => setEffect(preset.id)}>
          <span aria-hidden="true" className={`word-${preset.id}`} style={{ animationDuration: `${Number(duration) || preset.duration}s` }}>Aa</span>
          <span>{preset.label}</span>
        </button>)}
      </div>
      <div className="effect-fields">
        <label>Durée de l’effet (secondes)
          <input type="number" min="0.2" max="3" step="0.1" value={duration} onChange={event => setDuration(event.target.value)} />
        </label>
        <label>Déclenchement
          <select value={mode} onChange={event => setMode(event.target.value)}>
            <option value="loop">En boucle</option><option value="timed">Calé sur la musique</option>
          </select>
        </label>
        {mode === 'timed' && <label>Décalage depuis le début de la phrase (secondes)
          <input type="number" min="0" step="0.01" value={cue} onChange={event => setCue(event.target.value)} />
        </label>}
      </div>
      <button className="outline-btn" onClick={() => applyAnimation()}>Appliquer l’effet</button>
      <button className="outline-btn" onClick={cueEffect}>Caler l’effet maintenant · C</button>
      <small>Sélectionnez un mot, lancez la musique puis appuyez sur C hors du champ de texte. Pour modifier un effet existant, cliquez sur son passage souligné dans l’aperçu.</small>
    </fieldset>
    {galleryWord !== null && <AnimationGallery lines={lines} lineIndex={lineIndex} initialWord={galleryWord} onClose={() => setGalleryWord(null)}
      onApply={onApplySignature} onUndo={onUndoSignature} canUndo={canUndoSignature} />}
    {notice && <p role="status">{notice}</p>}
    <details><summary>Code de la phrase · avancé</summary>
      <textarea aria-label="Code de la phrase" value={line.text} rows={4} onChange={event => onChange(event.target.value)} />
    </details>
    <details><summary>Les codes créatifs</summary>
      <ul>
        <li><code>{'&crouge&r'}</code> : rouge. &amp;a = vert, &amp;b = cyan, &amp;e = jaune, &amp;6 = or, &amp;d = rose.</li>
        <li><code>{'&#55ffffcyan&r'}</code> : couleur personnalisée. &amp;r rétablit le style de la phrase.</li>
        <li><code>**fort**</code>, <code>*doux*</code> : gras, italique. &amp;l, &amp;o, &amp;n, &amp;m : gras, italique, souligné, barré. Les codes § fonctionnent aussi.</li>
        <li><code>*saut:mot*</code>, <code>*vague:mot*</code>, <code>*flash:mot*</code> : effets en boucle.</li>
        <li><code>*saut@1.20/0.80:mot*</code> : saut à 1,20 s, durant 0,80 s. Sans durée : 0,80 s. pulse, elastic et swing sont également disponibles.</li>
        <li><code>*cache:secret*</code> : active le mode et ajoute ce mot à la liste des questions. V cale le mot sélectionné dans cette liste. Exemple : *cache@1.20/0:secret* pour une pause manuelle.</li>
      </ul>
    </details>
  </div>
}
