import { effectDuration } from './animationPresets.mjs'
const colors = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#ffaa00', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff']
export const normalizeBreaks = text => text.replace(/\\n|\/n/g, '\n')

// Fixed effects and bounded custom-profile identifiers only; never executable code.
// Find the closing delimiter while skipping nested effects and bold spans.
// This keeps a hidden word intact when an animation surrounds or splits it.
export function effectMatch(text, depth = 0) {
  const head = /^\*(saut|vague|flash|pulse|elastic|swing|cache|anim-[a-f0-9]{16})(?:@(\d+(?:\.\d+)?))?(?:\/(\d+(?:\.\d+)?))?:/.exec(text)
  if (!head || depth >= 12) return null
  let i = head[0].length
  while (i < text.length) {
    const rest = text.slice(i)
    const nested = effectMatch(rest, depth + 1)
    const bold = !nested && !/^\*\*(?:saut|vague|flash|pulse|elastic|swing|cache|anim-[a-f0-9]{16})(?:@|\/|:)/.test(rest) && /^\*\*[^*]+\*\*/.exec(rest)
    if (nested || bold) { i += (nested || bold)[0].length; continue }
    if (text[i] === '*') return [text.slice(0, i + 1), head[1], head[2], head[3], text.slice(head[0].length, i)]
    i++
  }
  return null
}

export function parseLyricMarkup(source) {
  const tokens = []
  let group = 0
  const walk = (text, inherited = {}, depth = 0) => {
    let style = { ...inherited }
    let buffer = ''
    const flush = () => {
      if (buffer) tokens.push({ text: buffer, ...style })
      buffer = ''
    }
    for (let i = 0; i < text.length;) {
      const rest = text.slice(i)
      const code = rest.match(/^[&§](#[\da-f]{6}|[\da-fklmnor])/i)
      if (code && code[1].toLowerCase() !== 'k') {
        flush()
        const value = code[1].toLowerCase()
        if (value === 'r') style = { ...inherited }
        else if (value.startsWith('#')) style.color = value
        else if (/^[\da-f]$/.test(value)) style.color = colors[parseInt(value, 16)]
        else style[{ l: 'bold', o: 'italic', n: 'underline', m: 'strike' }[value]] = true
        i += code[0].length
        continue
      }
      const effect = effectMatch(rest)
      const bold = !effect && rest.match(/^\*\*([^*]+)\*\*/)
      const italic = !effect && !bold && rest.match(/^\*([^*\n]+)\*/)
      const match = effect || bold || italic
      if (match && depth < 12) {
        flush()
        const extra = effect
          ? effect[1] === 'cache' ? { quiz: ++group, quizCue: effect[2] === undefined ? null : Number(effect[2]), quizDuration: effect[3] === undefined ? null : Number(effect[3]) } : { effect: effect[1], cue: effect[2] === undefined ? null : Number(effect[2]), duration: effectDuration(effect[3] === undefined ? undefined : Number(effect[3])) }
          : bold ? { bold: true } : { italic: true }
        walk(effect ? effect[4] : match[1], { ...style, ...extra }, depth + 1)
        i += match[0].length
      } else { buffer += text[i]; i++ }
    }
    flush()
  }
  walk(normalizeBreaks(source || ''))
  return tokens
}

export function plainLyrics(source) {
  return parseLyricMarkup(source).map(token => token.text).join('')
}

export function lyricQuizzes(source, fallback = true) {
  const tokens = parseLyricMarkup(source)
  const text = tokens.map(token => token.text).join('')
  const groups = new Map()
  let offset = 0
  for (const token of tokens) {
    if (token.quiz) {
      const previous = groups.get(token.quiz)
      groups.set(token.quiz, { group: token.quiz, start: previous?.start ?? offset,
        end: offset + token.text.length, cue: token.quizCue, duration: token.quizDuration })
    }
    offset += token.text.length
  }
  if (!groups.size && fallback) {
    const last = /\S+(?=\s*$)/u.exec(text)
    if (last) groups.set(0, { group: 0, start: last.index, end: last.index + last[0].length, cue: null, duration: null })
  }
  return [...groups.values()].map(quiz => ({ ...quiz,
    answer: text.slice(quiz.start, quiz.end).trim().replace(/^[.,?!;:]+|[.,?!;:]+$/gu, ''),
  }))
}

// Compatibility helper: callers that need one answer still receive the first.
export function lyricQuiz(source) {
  const first = lyricQuizzes(source)[0]
  return first ? { start: first.start, end: first.end, answer: first.answer } : { start: -1, end: -1, answer: '' }
}
