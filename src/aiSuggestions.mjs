import { plainLyrics, lyricQuizzes } from './lyricMarkup.mjs'
import { lyricUnits, markLyrics, serializeLyrics } from './visualLyrics.mjs'
import { updateHiddenText } from './missingWords.mjs'
import { animationPresets } from './animationPresets.mjs'

export const AI_CATEGORIES = { qcm: 'QCM', animation: 'Animation', style: 'Style', review: 'À vérifier' }
export const normalizeWord = text => text.trim().normalize('NFC').toLocaleLowerCase('fr').replaceAll('’', "'").replace(/^[.,?!;:]+|[.,?!;:]+$/gu, '')
export const lineFingerprint = line => JSON.stringify(line)
export function wordCandidates(text) {
  return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu)].map(match => ({ text: match[0], start: match.index, end: match.index + match[0].length }))
}
export function targetTiming(line, target) {
  const text = plainLyrics(line.text)
  const candidates = wordCandidates(text)
  const words = line.words || []
  const aligned = words.length === candidates.length && words.every((word, i) => word &&
    normalizeWord(word.word ?? word.text ?? '') === normalizeWord(candidates[i].text) &&
    Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= line.start && word.end > word.start && word.end <= line.end && (!i || word.start >= words[i - 1].end))
  const first = candidates.findIndex(word => word.start === target.start)
  const last = candidates.findIndex(word => word.end === target.end)
  if (aligned && first >= 0 && last >= first) return { cue: Math.floor((words[first].start - line.start + 1e-8) * 100) / 100, duration: words[last].end - words[first].start, timingSource: 'words' }
  const length = line.end - line.start
  const cue = Math.floor(Math.min(Math.max(0, length - 0.02), length * target.start / Math.max(1, text.length)) * 100) / 100
  return { cue, duration: Math.min(length - cue, Math.max(0.2, length * (target.end - target.start) / Math.max(1, text.length))), timingSource: 'estimated' }
}
export function validateSuggestions(line, proposals = []) {
  const text = plainLyrics(line.text)
  const result = []
  for (const raw of Array.isArray(proposals) ? proposals.slice(0, 12) : []) {
    if (!raw || !Object.hasOwn(AI_CATEGORIES, raw.category)) continue
    const suggestion = { ...raw, explanation: String(raw.explanation || 'Suggestion expérimentale.').slice(0, 350) }
    if (raw.category === 'review') {
      result.push({ ...suggestion, id: `review-${result.length}` }); continue
    }
    const target = raw.target
    if (!target || !Number.isInteger(target.start) || !Number.isInteger(target.end) || target.start < 0 || target.end <= target.start || target.end > text.length || text.slice(target.start, target.end) !== target.text || !target.text.trim()) continue
    if (raw.category === 'qcm') {
      const choices = [...new Map((Array.isArray(raw.choices) ? raw.choices : []).filter(choice => typeof choice === 'string' && choice.trim() && choice.length <= 80 && normalizeWord(choice) !== normalizeWord(target.text)).map(choice => [normalizeWord(choice), choice.trim()])).values()]
      if (choices.length !== 3) continue
      suggestion.choices = choices
      suggestion.difficulty = ['facile', 'moyenne', 'difficile'].includes(raw.difficulty) ? raw.difficulty : 'moyenne'
    }
    if (raw.category === 'animation' && !animationPresets.some(preset => preset.id === raw.effect)) continue
    if (raw.category === 'style') {
      const color = /^#[\da-f]{6}$/i.test(raw.color || '') ? raw.color : null
      const channels = color ? color.slice(1).match(/../g).map(value => parseInt(value, 16)) : []
      const readable = channels.length && (channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114) >= 90
      if (!readable) delete suggestion.color
      if (!readable && raw.bold !== true) continue
    }
    const timing = targetTiming(line, target)
    if ((raw.category === 'qcm' || raw.category === 'animation') && line.end - line.start < 0.1) continue
    if (raw.category === 'animation') timing.duration = Math.min(3, Math.max(0.2, timing.duration), line.end - line.start - timing.cue)
    if (raw.category === 'animation' && timing.duration < 0.2) continue
    result.push({ ...suggestion, ...timing, id: `${raw.category}-${result.length}` })
  }
  return result
}
export function suggestionConflict(line, suggestion) {
  if (!suggestion.target) return false
  const units = lyricUnits(line.text).slice(suggestion.target.start, suggestion.target.end)
  return units.some(unit => unit.quiz || unit.effect || unit.color || unit.bold || unit.italic || unit.underline || unit.strike)
}
export function applySuggestion(line, suggestion, replace = false) {
  const valid = validateSuggestions(line, [suggestion])[0]
  if (!valid || valid.category === 'review') throw new Error('Cette suggestion n’est plus applicable.')
  if (suggestionConflict(line, valid) && !replace) throw new Error('Confirmez le remplacement des annotations existantes.')
  const { start, end } = valid.target
  let source = line.text
  if (valid.category === 'qcm') {
    // Remove complete overlapping quiz groups, never leave fragments of an old answer.
    const groups = new Set(lyricUnits(source).slice(start, end).map(unit => unit.quiz).filter(Boolean))
    source = serializeLyrics(lyricUnits(source).map(unit => groups.has(unit.quiz) ? { ...unit, quiz: undefined, quizCue: undefined, quizDuration: undefined } : unit))
    const group = Math.max(0, ...lyricUnits(source).map(unit => unit.quiz || 0)) + 1
    const updated = updateHiddenText(line, markLyrics(source, start, end, { quiz: group, quizCue: valid.cue, quizDuration: valid.duration }))
    const index = lyricQuizzes(updated.text, false).findIndex(target => target.start === start && target.end === end)
    updated.gameModes.wordChoices[index] = valid.choices
    return { ...updated, words: line.words || [] }
  }
  const marks = valid.category === 'animation' ? { effect: valid.effect, cue: valid.cue, duration: valid.duration }
    : { ...(valid.color && /^#[\da-f]{6}$/i.test(valid.color) ? { color: valid.color } : {}), ...(valid.bold ? { bold: true } : {}) }
  return { ...line, text: markLyrics(source, start, end, marks) }
}
