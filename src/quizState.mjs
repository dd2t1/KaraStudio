import { lyricQuizzes } from './lyricMarkup.mjs'
import { getPlayerLines } from './playerLines.mjs'

export function lineQuestions(line, index = 0) {
  if (!line || line.isInstrumental || !line.gameModes?.isMissingWord) return []
  const targets = lyricQuizzes(line.text)
  const questions = targets.map((target, targetIndex) => {
    const duration = target.duration ?? line.gameModes.muteDuration ?? 2
    const offset = target.cue ?? Math.max(0, line.end - line.start - (duration || 2))
    return { ...target, index, targetIndex, key: `${index}:${target.group}`,
      start: line.start + offset, end: Math.min(line.end, line.start + offset + (duration || (line.end - line.start))),
      pause: duration === 0, duration,
      choices: line.gameModes.wordChoices?.[targetIndex] ?? (targetIndex === 0 ? line.gameModes.multipleChoices || [] : []),
    }
  }).sort((a, b) => a.start - b.start || a.targetIndex - b.targetIndex)
  // One visible question at a time; a following marker closes the previous window.
  return questions.map((question, i) => ({ ...question, end: Math.min(question.end, questions[i + 1]?.start ?? line.end) }))
}

export function quizAtTime(lines, time, answered) {
  const index = getPlayerLines(lines, time).active
  return lineQuestions(lines[index], index).find(question => !answered.has(question.key) && time >= question.start && time < question.end) || null
}

export function shuffledChoices(line, random = Math.random, target = null) {
  const answer = target?.answer ?? lyricQuizzes(line.text)[0]?.answer ?? ''
  const choices = [...new Set([...(target?.choices ?? line.gameModes?.multipleChoices ?? []).filter(Boolean), answer])]
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j], choices[i]]
  }
  return choices
}

export function recordAnswer(answered, quiz, choice) {
  if (!quiz || answered.has(quiz.key)) return null
  answered.add(quiz.key)
  return choice === quiz.answer
}

export function nextPause(questions, previous, time, fired, answered) {
  if (time < previous) return null
  return questions.find(question => question.pause && question.start >= previous - 0.001 && question.start <= time &&
    !fired.has(question.key) && !answered.has(question.key)) || null
}
