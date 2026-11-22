import { useState } from 'react'
import { createPortal } from 'react-dom'
import { parseLyricMarkup } from '../lyricMarkup.mjs'
import { tokenCode } from '../visualLyrics.mjs'
import { animationPresets } from '../animationPresets.mjs'
import LyricText from './LyricText'

export default function AnnotatedLyrics({ text, time = null, onSelect, mirror = false, animationProfiles }) {
  const [hint, setHint] = useState(null)
  const tokens = parseLyricMarkup(text)
  return <><span className={`annotated-lyrics${mirror ? ' annotation-mirror' : ''}`}>{tokens.map((token, index) => {
    const start = tokens.slice(0, index).reduce((sum, item) => sum + item.text.length, 0)
    const marked = token.effect || token.quiz || token.color || token.bold || token.italic || token.underline || token.strike
    const marker = [token.effect && 'C', token.quiz && 'V'].filter(Boolean).join(' · ')
    const label = [
      token.effect && `C · ${animationProfiles?.[token.effect]?.name || animationPresets.find(preset => preset.id === token.effect)?.label || 'Animation personnalisée'} · ${Number.isFinite(token.cue) ? `+${token.cue.toFixed(2)} s` : 'En boucle'} · ${token.duration} s`,
      token.quiz && `V · Mot caché · ${Number.isFinite(token.quizCue) ? `+${token.quizCue.toFixed(2)} s` : 'À caler'} · ${token.quizDuration === 0 ? 'Pause manuelle' : token.quizDuration === null ? 'Durée de la phrase' : `${token.quizDuration} s de coupure`}`,
      !marker && 'Mise en forme',
    ].filter(Boolean).join('\n')
    const select = () => onSelect?.({ start, end: start + token.text.length, token })
    return <span key={index} className={marked ? `annotated-run ${token.quiz ? 'annotation-quiz' : token.effect ? `annotation-${token.effect}` : 'annotation-style'}` : undefined}
      data-marker={marker || undefined} data-code={marked ? `${label}\n${tokenCode(token)}` : undefined}
      onMouseEnter={!mirror && marked ? event => { const rect = event.currentTarget.getBoundingClientRect(); setHint({ code: `${label}\n${tokenCode(token)}`, left: Math.max(12, Math.min(window.innerWidth - 332, rect.left)), top: Math.max(120, rect.top - 8) }) } : undefined}
      onMouseLeave={() => setHint(null)}
      onFocus={!mirror && marked ? event => { const rect = event.currentTarget.getBoundingClientRect(); setHint({ code: `${label}\n${tokenCode(token)}`, left: Math.max(12, Math.min(window.innerWidth - 332, rect.left)), top: Math.max(120, rect.top - 8) }) } : undefined}
      onBlur={() => setHint(null)}
      tabIndex={marked && !mirror ? 0 : undefined} role={marked && onSelect ? 'button' : undefined}
      aria-label={marked && !mirror ? `${token.text} — ${marker} ${label}` : undefined}
      onClick={onSelect ? select : undefined} onKeyDown={onSelect ? event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select() }
      } : undefined}
      style={mirror ? { color: token.color, fontWeight: token.bold ? 900 : undefined, fontStyle: token.italic ? 'italic' : undefined } : undefined}>
      {mirror ? token.text : <LyricText text={tokenCode(token)} time={time} animationProfiles={animationProfiles} />}
    </span>
  })}</span>{hint && createPortal(<div className="lyric-code-hint" role="tooltip" style={{ left: hint.left, top: hint.top }}>{hint.code}</div>, document.body)}</>
}
