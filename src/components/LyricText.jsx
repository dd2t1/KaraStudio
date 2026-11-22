import { useMemo } from 'react'
import { sampleEffect } from '../animationPresets.mjs'
import { lyricQuizzes, parseLyricMarkup } from '../lyricMarkup.mjs'
import { profileStyle, validateProfileLibrary } from '../animationProfiles.mjs'
import useMotionPreference from '../useMotionPreference'

export default function LyricText({ text, hideAnswer = false, time = null, hiddenGroups = null, animationProfiles }) {
  const reducedMotion = useMotionPreference()
  const profiles = useMemo(() => {
    try { return validateProfileLibrary(animationProfiles) } catch { return {} }
  }, [animationProfiles])
  const tokens = useMemo(() => parseLyricMarkup(text), [text])
  const quizzes = useMemo(() => lyricQuizzes(text).filter(quiz => hiddenGroups ? hiddenGroups.includes(quiz.group) : hideAnswer), [text, hideAnswer, hiddenGroups])
  return <span className="lyric-rich">{tokens.map((token, index) => {
    const start = tokens.slice(0, index).reduce((offset, part) => offset + part.text.length, 0)
    const end = start + token.text.length
    let content = token.text
    const quiz = quizzes.find(quiz => start < quiz.end && end > quiz.start)
    if (quiz) {
      content = token.text.slice(0, Math.max(0, quiz.start - start)) +
        (start <= quiz.start ? '________' : '') + token.text.slice(Math.max(0, quiz.end - start))
    }
    const { active, duration, position } = sampleEffect(token, time)
    const profile = profiles[token.effect]
    const animation = token.effect && active && !profile ? `word-${token.effect}` : ''
    const customStyle = profile && active && !reducedMotion ? profileStyle(profile, position, duration) : null
    return <span key={index} style={{ color: token.color, fontWeight: token.bold ? 900 : undefined,
      fontStyle: token.italic ? 'italic' : undefined,
      textDecoration: [token.underline && 'underline', token.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
      textShadow: token.color ? '0 0 16px currentColor' : undefined,
    }}>{content.split(/(\s+)/u).map((part, word) => /^\s+$/u.test(part) ? part :
      <span key={word} className={`lyric-word ${animation}${profile ? ' word-custom-profile' : ''}`} style={customStyle || (active && !profile ? {
        animationDuration: `${duration}s`, animationIterationCount: 1, animationDelay: `-${position}s`, animationPlayState: 'paused',
      } : undefined)}>{part}</span>)}</span>
  })}</span>
}
