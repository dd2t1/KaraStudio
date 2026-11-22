import { parseLyricMarkup, plainLyrics } from './lyricMarkup.mjs'

export function lyricUnits(source) {
  return parseLyricMarkup(source).flatMap(({ text, ...marks }) => text.split('').map(text => ({ text, ...marks })))
}

const timing = (cue, duration) => `${Number.isFinite(cue) ? `@${cue.toFixed(2)}` : ''}${Number.isFinite(duration) ? `/${duration.toFixed(2)}` : ''}`
const signature = ({ text: _text, ...marks }) => JSON.stringify(marks)

export function serializeLyrics(units) {
  const render = items => {
    const runs = []
    for (const item of items) {
      const last = runs.at(-1)
      if (last && signature(last) === signature(item)) last.text += item.text
      else runs.push({ ...item })
    }
    return runs.map(item => {
      const codes = `${item.color ? `&${item.color}` : ''}${item.bold ? '&l' : ''}${item.italic ? '&o' : ''}${item.underline ? '&n' : ''}${item.strike ? '&m' : ''}`
      const text = codes + item.text + (codes ? '&r' : '')
      return item.effect ? `*${item.effect}${timing(item.cue, item.duration)}:${text}*` : text
    }).join('')
  }
  let result = ''
  for (let i = 0; i < units.length;) {
    const first = units[i]
    let end = i + 1
    while (end < units.length && units[end].quiz === first.quiz) end++
    const text = render(units.slice(i, end))
    result += first.quiz ? `*cache${timing(first.quizCue, first.quizDuration)}:${text}*` : text
    i = end
  }
  return result
}

export function markLyrics(source, start, end, marks) {
  return serializeLyrics(lyricUnits(source).map((unit, i) => i >= start && i < end ? { ...unit, ...marks } : unit))
}

// A plain-text edit changes only the edited range; formatting outside it survives.
export function editLyrics(source, nextText) {
  const previous = plainLyrics(source)
  if (previous === nextText) return source
  let start = 0
  while (start < previous.length && start < nextText.length && previous[start] === nextText[start]) start++
  let end = previous.length, nextEnd = nextText.length
  while (end > start && nextEnd > start && previous[end - 1] === nextText[nextEnd - 1]) { end--; nextEnd-- }
  const units = lyricUnits(source)
  // At a boundary, prefer the character being replaced, then the preceding one.
  let inherited = units[start] ?? units[start - 1] ?? {}
  if (start === end && units[start - 1]?.quiz !== units[start]?.quiz) {
    // Inserting beside a hidden word must not silently extend its answer.
    inherited = { ...inherited, quiz: undefined, quizCue: undefined, quizDuration: undefined }
  }
  return serializeLyrics([...units.slice(0, start), ...nextText.slice(start, nextEnd).split('').map(text => ({ ...inherited, text })), ...units.slice(end)])
}

export function tokenCode(token) {
  return serializeLyrics([{ ...token }])
}
