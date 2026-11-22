import { lyricQuizzes, effectMatch } from './lyricMarkup.mjs'

export function stampHiddenWord(text, group, cue, duration) {
  if ((cue !== null && (!Number.isFinite(cue) || cue < 0)) || !Number.isFinite(duration) || duration < 0) throw new Error('Repère ou durée invalide.')
  const timing = `${cue === null ? '' : `@${cue.toFixed(2)}`}/${duration.toFixed(2)}`
  if (group === 0) {
    const target = lyricQuizzes(text)[0]
    // Legacy implicit last-word questions need an explicit marker. Preserve formatting
    // by requiring the user to hide their intended text before stamping complex markup.
    if (!target || /[*&§]/u.test(text)) throw new Error('Sélectionnez le mot puis cliquez sur « Mot manquant » avant de le caler.')
    return text.slice(0, target.start) + `*cache${timing}:${text.slice(target.start, target.end)}*` + text.slice(target.end)
  }
  let current = 0
  for (let i = 0; i < text.length; i++) {
    if (!text.startsWith('*cache', i)) continue
    const match = effectMatch(text.slice(i))
    if (!match || ++current !== group) continue
    return text.slice(0, i) + `*cache${timing}:${match[4]}*` + text.slice(i + match[0].length)
  }
  throw new Error('Ce mot caché n’existe plus. Sélectionnez-le à nouveau.')
}

// Keep choices attached to unchanged hidden text when an earlier target is added
// or deleted. New/renamed targets start with empty choices, never another answer's.
export function reconcileWordChoices(oldText, nextText, oldChoices = [], legacyChoices = []) {
  const previous = lyricQuizzes(oldText)
  const used = new Set()
  return lyricQuizzes(nextText).map(target => {
    const index = previous.findIndex((item, i) => item.answer === target.answer && !used.has(i))
    if (index < 0) return []
    used.add(index)
    return oldChoices[index] ?? (index === 0 ? legacyChoices : [])
  })
}

export function updateHiddenText(line, text) {
  const hadHidden = lyricQuizzes(line.text, false).length > 0
  const hasHidden = lyricQuizzes(text, false).length > 0
  const modes = line.gameModes || {}
  return { ...line, text, words: [], gameModes: { ...modes,
    isMissingWord: hasHidden ? true : hadHidden ? false : Boolean(modes.isMissingWord),
    wordChoices: reconcileWordChoices(line.text, text, modes.wordChoices, modes.multipleChoices),
  } }
}
