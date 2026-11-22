import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBreaks, parseLyricMarkup, plainLyrics, lyricQuiz } from './lyricMarkup.mjs'
import { parsePlayLevel } from './playLevel.mjs'

test('line breaks and ordinary lyrics survive markup rendering', () => {
  assert.equal(normalizeBreaks('un\\ndeux/ntrois\nquatre'), 'un\ndeux\ntrois\nquatre')
  assert.equal(plainLyrics('Rock & roll <script> texte *inachevé'), 'Rock & roll <script> texte *inachevé')
})
test('Minecraft colors, reset, bold and timed effects can be combined', () => {
  const tokens = parseLyricMarkup('&crouge&r **fort** *saut@1.20:§bhaut* &#ffaa00or')
  assert.equal(tokens[0].color, '#ff5555')
  assert.equal(tokens[1].color, undefined)
  assert.equal(tokens.find(t => t.text === 'fort').bold, true)
  assert.deepEqual(tokens.find(t => t.text === 'haut'), { text: 'haut', color: '#55ffff', effect: 'saut', cue: 1.2, duration: 0.8 })
  assert.equal(tokens.at(-1).color, '#ffaa00')
  assert.equal(parseLyricMarkup('*saut:**haut***')[0].bold, true)
  assert.equal(plainLyrics('&crouge&r **fort** *saut@1.20:§bhaut* &#ffaa00or'), 'rouge fort haut or')
})
test('quiz answers exclude markup and support a word inside the phrase', () => {
  const source = 'Mon *cache:&csecret&r* reste ici'
  assert.deepEqual(lyricQuiz(source), { start: 4, end: 10, answer: 'secret' })
  assert.equal(lyricQuiz('Dernier/ n **mot!**  ').answer, 'mot')
  assert.equal(lyricQuiz('Mon *cache:premier* et *cache:second*').answer, 'premier')
})
test('export and reload retain source codes and timing', () => {
  const text = 'Bonjour/n*saut@0.40:&amonde&r*'
  const [line] = parsePlayLevel(JSON.stringify({ lyrics: [{ text, start: 4, end: 8 }] }))
  assert.equal(line.text, text)
  assert.equal(line.start, 4)
  assert.equal(plainLyrics(line.text), 'Bonjour\nmonde')
})
