import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileSectionPattern, detectSection, parseLyricsStructure, prepareReferenceLyrics, scanLyricsHeaders } from './lyricsStructure.mjs'

test('recognizes complete headers without consuming sung phrases', () => {
  assert.equal(detectSection('[Couplet 2]'), 'Couplet 2')
  assert.equal(detectSection('PRÉ REFRAIN :'), 'Pré-refrain')
  assert.equal(detectSection('(Chorus II)'), 'Refrain II')
  assert.equal(detectSection('Refrain de ma vie'), null)
  assert.equal(detectSection('Je chante le refrain'), null)
})

test('recognizes Markdown section headings while preserving formatted lyrics and song titles', () => {
  for (const heading of ['**[Couplet 1]**', '[**Couplet 1**]', '**Couplet 1**', '__Couplet 1__', ' **[Couplet 1]** : ']) {
    assert.equal(detectSection(heading), 'Couplet 1', heading)
  }
  assert.equal(detectSection('**« Fais-en un monde » — FabBloc**'), null)
  assert.equal(detectSection('**Refrain de ma vie**'), null)
  const parsed = parseLyricsStructure('**[Couplet 1]**\nBonjour\n**[Refrain]**\nRetour\n**[Solo]**')
  assert.equal(parsed.headers, 3)
  assert.deepEqual(parsed.lines.map(line => line.section), ['Couplet 1', 'Refrain', 'Solo'])
  assert.equal(parsed.lines[2].isInstrumental, true)
})

test('custom rules supplement automatic detection consistently for synchronization and comparison', () => {
  const { pattern, error } = compileSectionPattern('\\*\\*(.+)\\*\\*')
  assert.equal(error, '')
  const source = '**Titre libre**\nBonjour\n[Refrain]\nRetour'
  assert.equal(detectSection('**Titre libre**', pattern), 'Titre libre')
  assert.equal(detectSection('Chante **Titre libre** encore', pattern), null)
  assert.equal(parseLyricsStructure(source, pattern).headers, 2)
  assert.deepEqual(prepareReferenceLyrics(source, pattern), { text: 'Bonjour\nRetour', ignoredHeaders: 2 })
  assert.equal(detectSection('**[Solo]**', pattern), 'Solo')
  assert.equal(detectSection('', compileSectionPattern('.*').pattern), null)
})

test('invalid and empty regexes preserve automatic detection', () => {
  const invalid = compileSectionPattern('[')
  assert.ok(invalid.error)
  assert.equal(invalid.pattern, null)
  assert.equal(detectSection('**[Refrain]**', invalid.pattern), 'Refrain')
  assert.deepEqual(compileSectionPattern('  '), { pattern: null, error: '' })
})

test('recognizes section directions after a dash or colon without consuming sung sentences', () => {
  assert.equal(detectSection('**[Pont – la musique retombe, puis remonte]**'), 'Pont')
  assert.equal(detectSection('**[Outro – scandé]**'), 'Outro')
  assert.equal(detectSection('[Pré-refrain — doucement]'), 'Pré-refrain')
  assert.equal(detectSection('**[Couplet 2 : parlé]**'), 'Couplet 2')
  assert.equal(detectSection('Le refrain — chanté ensemble'), null)
  assert.equal(detectSection('Refrain de ma vie — encore'), null)
})

test('multiline framed headings count once and highlight every physical line', () => {
  const source = 'Avant\n**[Pont – la musique\nretombe, puis remonte]**\nIl manquait une porte ? On l’a dessinée.\n**[Outro – scandé]**\nUne idée. Un bloc.'
  const parsed = parseLyricsStructure(source)
  assert.equal(parsed.headers, 2)
  assert.deepEqual(parsed.lines.map(line => [line.text, line.section]), [
    ['Avant', ''], ['Il manquait une porte ? On l’a dessinée.', 'Pont'], ['Une idée. Un bloc.', 'Outro'],
  ])
  assert.deepEqual(scanLyricsHeaders(source).map(row => Boolean(row.section)), [false, true, true, false, true, false])
  assert.equal(prepareReferenceLyrics(source).text, 'Avant\nIl manquait une porte ? On l’a dessinée.\nUne idée. Un bloc.')
  assert.equal(parseLyricsStructure('[Solo – guitare\nélectrique]\nRetour').lines[0].isInstrumental, true)
})

test('custom Markdown rules support multiline headings and incomplete wrappers preserve lyrics', () => {
  const { pattern } = compileSectionPattern('\\*\\*(.+)\\*\\*')
  const source = '**Titre libre\nsur deux lignes**\nBonjour'
  assert.equal(parseLyricsStructure(source, pattern).headers, 1)
  assert.equal(prepareReferenceLyrics(source, pattern).text, 'Bonjour')
  assert.equal(scanLyricsHeaders(source, pattern).filter(row => row.section).length, 2)
  for (const text of ['**[Pont – musique\nBonjour', '**[Pont – musique\n\nBonjour]**', '**Une phrase\nchantée**']) {
    assert.equal(parseLyricsStructure(text).headers, 0)
    assert.equal(prepareReferenceLyrics(text).text, text.replace('\n\n', '\n'))
  }
})

test('retains first lines and propagates section labels', () => {
  const result = parseLyricsStructure('Première ligne\nDeuxième\n\nCouplet 1\nBonjour\nEncore\n\nRefrain\nRetour\nRefrain\nRetour')
  assert.equal(result.lines.length, 6)
  assert.equal(result.lines[0].text, 'Première ligne')
  assert.equal(result.lines[3].section, 'Couplet 1')
  assert.notEqual(result.lines[4].sectionId, result.lines[5].sectionId)
  assert.equal(prepareReferenceLyrics('Première\nDeuxième\n\nTroisième').text, 'Première\nDeuxième\nTroisième')
})

test('creates a timed placeholder only for explicit non-lyric sections', () => {
  const result = parseLyricsStructure('[Instrumental]\n\n[Outro]\nDerniers mots')
  assert.equal(result.lines.length, 2)
  assert.equal(result.lines[0].isInstrumental, true)
  assert.equal(result.lines[1].isInstrumental, false)
  assert.equal(prepareReferenceLyrics('[Solo]\n[Couplet]\nBonjour').text, 'Bonjour')
})

test('parses a structured song into sung lines and sections', () => {
  const sampleLyrics = [
    'Couplet 1',
    'Première ligne chantée',
    'Deuxième ligne chantée',
    '',
    'Refrain',
    'Voici le refrain',
    'Toujours le refrain',
    '',
    'Couplet 2',
    'Autre phrase du couplet',
    '',
    'Outro',
    'Dernière note de la chanson',
  ].join('\n')
  const result = parseLyricsStructure(sampleLyrics)
  assert.equal(result.headers, 4)
  assert.equal(result.lines.length, 6)
  assert.equal(result.lines[0].section, 'Couplet 1')
  assert.equal(result.lines.at(-1).section, 'Outro')
})
