import test from 'node:test'
import assert from 'node:assert/strict'
import { quizAtTime, recordAnswer, shuffledChoices } from './quizState.mjs'

const lines = [
  { start: 1, end: 5, text: 'Bonjour *cache:monde*', gameModes: { isMissingWord: true, muteDuration: 2, multipleChoices: ['ciel', 'monde', 'ciel'] } },
  { start: 5, end: 7, text: 'La suite', gameModes: { isMissingWord: true, muteDuration: 1 } },
]
test('quiz boundaries and seeks do not keep an old question active', () => {
  const answered = new Set()
  assert.equal(quizAtTime(lines, 2.99, answered), null)
  assert.equal(quizAtTime(lines, 3, answered).index, 0)
  assert.equal(quizAtTime(lines, 5, answered), null)
  assert.equal(quizAtTime(lines, 6, answered).index, 1)
  assert.equal(quizAtTime(lines, 7, answered), null)
  assert.equal(quizAtTime(lines, 3.5, answered).index, 0)
})
test('answers are counted once even with immediate double clicks or replay', () => {
  const answered = new Set()
  const quiz = quizAtTime(lines, 4, answered)
  assert.equal(recordAnswer(answered, quiz, 'monde'), true)
  assert.equal(recordAnswer(answered, quiz, 'monde'), null)
  assert.equal(quizAtTime(lines, 4, answered), null)
  assert.equal(recordAnswer(answered, quizAtTime(lines, 6, answered), 'faux'), false)
})
test('choices contain each answer once and instrumentals never ask questions', () => {
  assert.deepEqual(shuffledChoices(lines[0], () => 0).sort(), ['ciel', 'monde'])
  assert.equal(quizAtTime([{ ...lines[0], isInstrumental: true }], 4, new Set()), null)
})
