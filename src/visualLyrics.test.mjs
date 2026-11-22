import test from 'node:test'
import assert from 'node:assert/strict'
import { editLyrics, markLyrics, lyricUnits, serializeLyrics } from './visualLyrics.mjs'
import { parseLyricMarkup, plainLyrics, lyricQuizzes } from './lyricMarkup.mjs'
import { stampHiddenWord } from './missingWords.mjs'
import { parsePlayLevel } from './playLevel.mjs'

test('visual edits preserve animation, colors and multiple hidden-word markers', () => {
  const source = '*elastic@0.36/0.80:Comme le chat*, *cache@2/0:&cmonde&r* et *cache@4/1:ciel*'
  const firstEdit = editLyrics(source, 'Comme un chat, monde et ciel')
  const edited = editLyrics(firstEdit, 'Comme un chat, monde et ciel !')
  assert.equal(plainLyrics(edited), 'Comme un chat, monde et ciel !')
  const tokens = parseLyricMarkup(edited)
  assert.equal(tokens[0].effect, 'elastic')
  assert.equal(tokens[0].cue, .36)
  assert.equal(tokens.find(token => token.text === 'monde').color, '#ff5555')
  assert.deepEqual(lyricQuizzes(edited).map(q => [q.answer, q.cue, q.duration]), [['monde', 2, 0], ['ciel', 4, 1]])
})

test('whole-phrase animation preserves quiz boundaries, timings and export roundtrip', () => {
  const source = 'Bonjour *cache@2/0:monde* et *cache@6/1:ciel*'
  const marked = markLyrics(source, 0, plainLyrics(source).length, { effect: 'saut', cue: 1.2, duration: .8 })
  assert.equal(plainLyrics(marked), plainLyrics(source))
  assert.equal(parseLyricMarkup(marked).every(token => token.effect === 'saut'), true)
  assert.deepEqual(lyricQuizzes(marked), lyricQuizzes(source))
  const stamped = stampHiddenWord(marked, 2, 7, 0)
  assert.equal(lyricQuizzes(stamped)[1].cue, 7)
  assert.equal(lyricQuizzes(stamped)[1].duration, 0)
  const [line] = parsePlayLevel(JSON.stringify({ lyrics: [{ start: 0, end: 16, text: stamped }] }), { requireQuizCues: true })
  assert.equal(line.text, stamped)
})

test('partial animations inside a hidden group do not create additional questions', () => {
  const source = 'Un *cache@1/0:grand secret* ici'
  const marked = markLyrics(source, 3, 8, { effect: 'pulse', cue: null, duration: 1 })
  assert.equal(lyricQuizzes(marked).length, 1)
  assert.equal(lyricQuizzes(marked)[0].answer, 'grand secret')
  assert.equal(parseLyricMarkup(marked).find(t => t.text === 'grand').effect, 'pulse')
  assert.equal(lyricQuizzes(stampHiddenWord(marked, 1, 2, 0))[0].cue, 2)
})

test('plain-text deletion and multiline paste retain valid markup and remove deleted questions', () => {
  const source = '*saut@1/0.8:Bonjour* *cache@2/0:monde* et *cache@4/1:ciel*'
  const edited = editLyrics(source, 'Bonjour\nciel')
  assert.equal(plainLyrics(edited), 'Bonjour\nciel')
  assert.equal(lyricQuizzes(edited, false).length, 1)
  assert.equal(lyricQuizzes(edited)[0].answer, 'ciel')
  assert.equal(plainLyrics(serializeLyrics(lyricUnits('**fort** &crouge&r *doux*'))), 'fort rouge doux')
})
