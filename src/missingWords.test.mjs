import test from 'node:test'
import assert from 'node:assert/strict'
import { lyricQuizzes, plainLyrics } from './lyricMarkup.mjs'
import { stampHiddenWord, updateHiddenText } from './missingWords.mjs'
import { lineQuestions, quizAtTime, nextPause, recordAnswer } from './quizState.mjs'
import { parsePlayLevel } from './playLevel.mjs'

const base = { text: 'Bonjour monde et ciel', start: 10, end: 20, gameModes: { isMissingWord: false, muteDuration: 2, multipleChoices: ['autre'] } }
const prepare = () => {
  let line = updateHiddenText(base, 'Bonjour *cache:monde* et *cache:**ciel***')
  line = updateHiddenText(line, stampHiddenWord(line.text, 1, 2, 0))
  line = updateHiddenText(line, stampHiddenWord(line.text, 2, 6, 1))
  return line
}

test('hiding words enables the game and each target retains its cue and zero duration', () => {
  const line = prepare()
  assert.equal(line.gameModes.isMissingWord, true)
  assert.equal(plainLyrics(line.text), 'Bonjour monde et ciel')
  assert.deepEqual(lyricQuizzes(line.text).map(({ answer, cue, duration }) => ({ answer, cue, duration })), [
    { answer: 'monde', cue: 2, duration: 0 }, { answer: 'ciel', cue: 6, duration: 1 },
  ])
  assert.equal(updateHiddenText(line, 'Bonjour monde et ciel').gameModes.isMissingWord, false)
})

test('choices stay with their word when earlier targets are inserted or removed', () => {
  const line = prepare()
  line.gameModes.wordChoices = [['terre'], ['soleil']]
  const removed = updateHiddenText(line, 'Bonjour monde et *cache@6/1:**ciel***')
  assert.deepEqual(removed.gameModes.wordChoices, [['soleil']])
  const inserted = updateHiddenText(line, '*cache:Bonjour* *cache@2/0:monde* et *cache@6/1:**ciel***')
  assert.deepEqual(inserted.gameModes.wordChoices, [[], ['terre'], ['soleil']])
})

test('multiple targets export and reload with independent choices and manual pauses', () => {
  const line = prepare()
  line.gameModes.wordChoices = [['terre'], ['soleil']]
  const [loaded] = parsePlayLevel(JSON.stringify({ lyrics: [line] }), { requireQuizCues: true })
  assert.deepEqual(lineQuestions(loaded).map(q => [q.answer, q.start, q.end, q.pause, q.choices]), [
    ['monde', 12, 16, true, ['terre']], ['ciel', 16, 17, false, ['soleil']],
  ])
  const answered = new Set()
  assert.equal(recordAnswer(answered, quizAtTime([loaded], 12, answered), 'monde'), true)
  assert.equal(quizAtTime([loaded], 12, answered), null)
  assert.equal(quizAtTime([loaded], 16, answered).answer, 'ciel')
  assert.equal(recordAnswer(answered, quizAtTime([loaded], 16, answered), 'faux'), false)
  assert.equal(answered.size, 2)
})

test('pause markers trigger on a crossing once, never after a forward seek past them', () => {
  const questions = lineQuestions(prepare())
  const fired = new Set(), answered = new Set()
  assert.equal(nextPause(questions, 11.9, 12.03, fired, answered).answer, 'monde')
  fired.add(questions[0].key)
  assert.equal(nextPause(questions, 12, 12.1, fired, answered), null)
  fired.clear()
  assert.equal(nextPause(questions, 14, 14.1, fired, answered), null)
  assert.equal(nextPause(questions, 12, 11, fired, answered), null)
  answered.add(questions[0].key)
  assert.equal(nextPause(questions, 11.9, 12.1, fired, answered), null)
})

test('legacy zero is preserved and incomplete multi-word projects can be edited but not played', () => {
  const [legacy] = parsePlayLevel(JSON.stringify({ lyrics: [{ ...base, gameModes: { isMissingWord: true, muteDuration: 0 } }] }))
  assert.equal(legacy.gameModes.muteDuration, 0)
  assert.equal(lineQuestions(legacy)[0].pause, true)
  const source = JSON.stringify({ lyrics: [{ ...base, text: '*cache:un* *cache:deux*', gameModes: { isMissingWord: true } }] })
  assert.equal(parsePlayLevel(source).length, 1)
  assert.throws(() => parsePlayLevel(source, { requireQuizCues: true }), /repère V distinct/)
})

test('stamping replaces one target without touching its neighbor or losing formatting', () => {
  const source = '*cache@1/2:&crouge&r* et *cache@3/1:**bleu***'
  const result = stampHiddenWord(source, 2, 4, 0)
  assert.equal(result, '*cache@1/2:&crouge&r* et *cache@4.00/0.00:**bleu***')
  assert.throws(() => stampHiddenWord(source, 1, -1, 2))
  assert.throws(() => stampHiddenWord(source, 4, 1, 2))
})
