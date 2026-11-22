import test from 'node:test'
import assert from 'node:assert/strict'
import { applySuggestion, validateSuggestions, targetTiming, suggestionConflict } from './aiSuggestions.mjs'
import { plainLyrics, lyricQuizzes } from './lyricMarkup.mjs'
import { createProject } from './projectExport.mjs'
import { parsePlayLevel } from './playLevel.mjs'

const line = { text: 'Été été demain', start: 10, end: 14, gameModes: { isMissingWord: false } }
const proposal = { category: 'qcm', target: { text: 'été', start: 4, end: 7 }, choices: ['hiver', 'printemps', 'automne'], explanation: 'Saison', difficulty: 'facile' }

test('AI cannot propose or apply section changes, including legacy responses', () => {
  const original = { ...line, section: 'Pré-refrain', sectionId: 3 }
  const retired = { category: 'section', section: 'Refrain', explanation: 'Phrase répétée' }
  assert.deepEqual(validateSuggestions(original, [retired]), [])
  assert.throws(() => applySuggestion(original, retired, true), /plus applicable/u)
  assert.equal(applySuggestion(original, proposal).section, 'Pré-refrain')
  assert.equal(applySuggestion(original, proposal).sectionId, 3)
})
test('AI validation preserves repeated accented targets and rejects duplicate answers and invalid offsets', () => {
  assert.equal(validateSuggestions(line, [proposal]).length, 1)
  assert.equal(validateSuggestions(line, [{ ...proposal, choices: ['ÉTÉ', 'hiver', 'HIVER'] }]).length, 0)
  assert.equal(validateSuggestions(line, [{ ...proposal, target: { ...proposal.target, start: 2 } }]).length, 0)
  assert.equal(validateSuggestions(line, [{ category: 'animation', target: proposal.target, effect: 'unknown' }]).length, 0)
})
test('word timing is trusted only with matching complete alignment, otherwise bounded estimates', () => {
  const timed = { ...line, words: [{ word: 'Été', start: 10, end: 11 }, { word: 'été', start: 11.2, end: 12 }, { word: 'demain', start: 12, end: 14 }] }
  assert.deepEqual(targetTiming(timed, proposal.target), { cue: 1.2, duration: 0.8000000000000007, timingSource: 'words' })
  assert.equal(targetTiming({ ...timed, words: [{ word: 'incorrect', start: 10, end: 14 }] }, proposal.target).timingSource, 'estimated')
  const estimate = targetTiming(line, proposal.target)
  assert.ok(estimate.cue >= 0 && estimate.cue + estimate.duration <= 4)
})
test('accepted QCM and nested visual annotations survive export without changing words', () => {
  const original = structuredClone(line)
  const qcm = applySuggestion(line, proposal)
  assert.deepEqual(line, original)
  const animation = { category: 'animation', target: proposal.target, effect: 'pulse' }
  assert.equal(suggestionConflict(qcm, animation), true)
  assert.throws(() => applySuggestion(qcm, animation))
  const animated = applySuggestion(qcm, animation, true)
  const styled = applySuggestion(animated, { category: 'style', target: proposal.target, color: '#55ffff', bold: true }, true)
  const reloaded = parsePlayLevel(JSON.stringify(createProject([styled], 'song.mp3')))[0]
  assert.equal(plainLyrics(reloaded.text), line.text)
  assert.equal(lyricQuizzes(reloaded.text, false).length, 1)
  assert.deepEqual(reloaded.gameModes.wordChoices[0], proposal.choices)
  assert.match(reloaded.text, /pulse/)
})
