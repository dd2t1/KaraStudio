import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeLyrics } from './lyricsLab.mjs'

test('mini repetitions, motifs and openings keep evidence without modifying the project', () => {
  const lines = [
    { text: 'Oh, oh, OH ! Je chante.', start: 0, end: 5 },
    { text: 'Je chante, je danse.', start: 5, end: 7 },
    { text: 'Je chante encore.', start: 7, end: 10 },
  ]
  const before = structuredClone(lines)
  lines.forEach(Object.freeze)
  const report = analyzeLyrics(Object.freeze(lines))
  assert.deepEqual(lines, before)
  assert.deepEqual(report.immediateRepeats, [{ text: 'oh', count: 3, line: 1, wordIndex: 1 }])
  assert.equal(report.motifs.find(item => item.text === 'je chante').count, 3)
  assert.deepEqual(report.motifs.find(item => item.text === 'je chante').lines, [1, 2, 3])
  assert.equal(report.repeatedOpenings[0].text, 'je chante')
  assert.deepEqual(report.repeatedOpenings[0].lines, [2, 3])
  assert.equal(report.density[1].wordsPerSecond, 2)
  assert.equal(report.summary.words, 12)
})

test('markup is not counted, Unicode and apostrophes normalize, accents remain distinct', () => {
  const report = analyzeLyrics([{ text: '**Été** été e\u0301te\u0301 eté L’amour l\'amour' }])
  assert.equal(report.vocabulary.find(item => item.word === 'été').count, 3)
  assert.equal(report.vocabulary.find(item => item.word === 'eté').count, 1)
  assert.equal(report.vocabulary.find(item => item.word === "l'amour").count, 2)
  assert.equal(report.density.length, 0)
})

test('instrumental notes and invalid timings do not create musical statistics', () => {
  const report = analyzeLyrics([{ text: 'solo solo', isInstrumental: true, start: 0, end: 8 }, { text: 'bonjour', start: 0, end: 0 }, { text: 'salut', start: -1, end: 2 }])
  assert.equal(report.summary.words, 2)
  assert.equal(report.density.length, 0)
  assert.equal(report.immediateRepeats.length, 0)
  assert.equal(report.vocabulary.some(item => item.word === 'solo'), false)
})

test('motifs stay inside lines; empty inputs and singleton vectors are finite', () => {
  assert.equal(analyzeLyrics([{ text: 'a' }, { text: 'b' }, { text: 'a' }, { text: 'b' }]).motifs.length, 0)
  assert.equal(analyzeLyrics([]).summary.lexicalDiversity, 0)
  assert.deepEqual(analyzeLyrics([{ text: 'bonjour' }]).vocabulary[0].vector, [1, 1, 0, 7, 0])
  assert.doesNotThrow(() => JSON.stringify(analyzeLyrics([])))
})

test('large inputs are explicitly bounded rather than silently truncated', () => {
  assert.throws(() => analyzeLyrics(Array.from({ length: 2001 }, () => ({ text: '' }))), /2 000/)
  assert.throws(() => analyzeLyrics([{ text: 'a '.repeat(25001) }]), /25 000/)
  assert.throws(() => analyzeLyrics([{ text: 'a'.repeat(500001) }]), /volumineux/)
})

test('French variants expose differing endings and preserve the exact displayed lyrics', () => {
  const lines = [{ text: 'Je chante la nuit' }, { text: 'Je chantais la nuit' }, { text: 'Je veux chanter, puis danser.' }]
  const report = analyzeLyrics(lines)
  const family = report.variants.find(group => group.root === 'chant')
  assert.deepEqual(new Set(family.forms.map(form => form.word)), new Set(['chante', 'chantais', 'chanter']))
  assert.equal(report.nearLines.length, 1)
  assert.equal(report.nearLines[0].length, 2)
  assert.deepEqual(report.annotatedLines.map(row => row.tokens.map(token => token.text).join('')), lines.map(line => line.text))
  const marked = report.annotatedLines[1].tokens.find(token => token.text === 'chantais')
  assert.equal(marked.text.slice(marked.variant.split), 'ais')
})

test('candidate rhymes require different words and report uncertainty', () => {
  const report = analyzeLyrics([{ text: 'Dans mon cœur' }, { text: 'Sans aucune peur' }, { text: 'Dans la nuit' }, { text: 'Sans un bruit' }, { text: 'Encore la nuit' }])
  assert.equal(report.rhymes.length, 2)
  assert.deepEqual(report.rhymes.find(group => group.key === 'eur').occurrences.map(item => item.word), ['cœur', 'peur'])
  assert.equal(report.rhymes.find(group => group.key === 'ui').occurrences.length, 3)
  assert.match(report.rhymes[0].basis, /confirmer/)
  assert.equal(analyzeLyrics([{ text: 'la nuit' }, { text: 'la nuit' }]).rhymes.length, 0)
  assert.ok(report.annotatedLines[0].tokens.at(-1).rhyme)
})

test('only the same line and immediately adjacent lines create matching evidence', () => {
  const report = analyzeLyrics([{ text: 'Je chante dans la nuit' }, { text: 'Un bateau solitaire' }, { text: 'Je veux chanter sans bruit' }])
  assert.equal(report.rhymes.length, 0)
  assert.equal(report.variants.length, 0)
  assert.equal(report.motifs.length, 0)
  assert.equal(report.annotatedLines[0].tokens.find(token => token.text === 'Je').repeated, false)
  const internal = analyzeLyrics([{ text: 'Dans mon cœur la peur' }]).rhymes.find(group => group.key === 'eur')
  assert.deepEqual(internal.occurrences.map(item => item.atEnd), [false, true])
})

test('common words are subdued except when part of a locally repeated motif', () => {
  const ordinary = analyzeLyrics([{ text: 'Je souffle' }, { text: 'Je tombe' }])
  assert.equal(ordinary.annotatedLines[0].tokens[0].subdued, true)
  const motif = analyzeLyrics([{ text: 'Je veux danser' }, { text: 'Je veux chanter' }])
  assert.equal(motif.annotatedLines[0].tokens[0].subdued, false)
  assert.equal(motif.annotatedLines[0].tokens[0].repeated, true)
})
