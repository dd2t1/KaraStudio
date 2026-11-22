import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAnimationProfile, animationProfileId, validateProfileLibrary, profileStyle } from './animationProfiles.mjs'
import { applyWordSignature, signatureTargets, repeatedAnimationWords, animationSignatureLibrary } from './wordSignatures.mjs'
import { plainLyrics, parseLyricMarkup, lyricQuizzes } from './lyricMarkup.mjs'
import { parsePlayLevel } from './playLevel.mjs'
import { createProject } from './projectExport.mjs'
import { editLyrics } from './visualLyrics.mjs'

const rest = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, glow: 0 }
const profile = { name: 'Élan doux', duration: .8, easing: 'smooth', frames: [
  { at: 0, ...rest }, { at: .5, ...rest, y: -12, scale: 1.15, glow: 10 }, { at: 1, ...rest },
] }
const lines = [
  { text: '&cAmour&r, *cache@1/0:amour*, toujours.', start: 0, end: 4, section: 'Refrain', gameModes: { isMissingWord: true, wordChoices: [['soleil', 'nuage', 'vent']] } },
  { text: 'Mon amour est un détour.', start: 4, end: 8, section: 'Couplet' },
  { text: 'Amour, mon amour.', start: 8, end: 12, section: 'Refrain' },
]

test('bounded animation profiles reject executable fields, invalid endpoints and unsafe intensity', () => {
  assert.deepEqual(validateAnimationProfile(profile), profile)
  for (const changed of [
    { ...profile, css: 'url(https://example.com)' }, { ...profile, script: 'alert(1)' },
    { ...profile, duration: 0 }, { ...profile, duration: 4 },
    { ...profile, frames: profile.frames.map((frame, i) => i === 1 ? { ...frame, opacity: 0 } : frame) },
    { ...profile, frames: profile.frames.map((frame, i) => i === 1 ? { ...frame, scale: 100 } : frame) },
    { ...profile, frames: profile.frames.map((frame, i) => i === 0 ? { ...frame, x: 20 } : frame) },
    { ...profile, frames: profile.frames.map((frame, i) => i === 1 ? { ...frame, at: .01 } : frame) },
    { ...profile, name: '<script>' },
  ]) assert.throws(() => validateAnimationProfile(changed))
  const id = animationProfileId(profile)
  assert.deepEqual(validateProfileLibrary({ [id]: profile }), { [id]: profile })
  assert.throws(() => validateProfileLibrary({ 'anim-0000000000000000': profile }), /Identifiant/)
  assert.throws(() => validateProfileLibrary(JSON.parse('{"__proto__":{}}')))
})

test('profile sampling is deterministic across pause, seek and exact endpoints', () => {
  assert.deepEqual(profileStyle(profile, .4), profileStyle(profile, .4))
  assert.notDeepEqual(profileStyle(profile, .2), profileStyle(profile, .4))
  assert.equal(profileStyle(profile, .4).opacity, 1)
  assert.match(profileStyle(profile, .4).transform, /-12\.000px/)
  assert.deepEqual(profileStyle(profile, 0), profileStyle(profile, .8))
})

test('repeated words keep French accents, apostrophes, boundaries and decomposed Unicode offsets', () => {
  const source = [{ text: "Âme, âme, ame. J’aime, j'aime. Amoureux. amour AMOUR a\u0302me", start: 0, end: 8 }]
  const targets = signatureTargets(source, { word: 'âme', scope: 'song' })
  assert.equal(targets.length, 3)
  assert.ok(targets.every(target => plainLyrics(source[0].text).slice(target.start, target.end).normalize('NFC').toLowerCase() === 'âme'))
  assert.equal(signatureTargets(source, { word: "j'aime", scope: 'song' }).length, 2)
  assert.equal(signatureTargets(source, { word: 'amour', scope: 'song' }).length, 2)
  assert.ok(repeatedAnimationWords(source).some(item => item.word.toLowerCase() === 'âme' && item.count === 3))
})

test('signature scope and selected occurrences do not rewrite lyrics or alter QCM/style', () => {
  assert.equal(signatureTargets(lines, { word: 'amour', scope: 'phrase', lineIndex: 0 }).length, 2)
  assert.equal(signatureTargets(lines, { word: 'amour', scope: 'section', lineIndex: 0 }).length, 4)
  const plan = signatureTargets(lines, { word: 'amour', scope: 'song' })
  assert.equal(plan.length, 5)
  const result = applyWordSignature(lines, { word: 'amour', scope: 'song', effect: 'pulse', keys: [plan[1].key, plan[2].key] })
  assert.equal(result.count, 2)
  assert.equal(result.lines[2], lines[2])
  assert.deepEqual(result.lines.map(line => plainLyrics(line.text)), lines.map(line => plainLyrics(line.text)))
  assert.deepEqual(result.lines[0].gameModes, lines[0].gameModes)
  assert.deepEqual(lyricQuizzes(result.lines[0].text), lyricQuizzes(lines[0].text))
  assert.equal(parseLyricMarkup(result.lines[0].text)[0].color, '#ff5555')
})

test('existing effects need explicit replacement and retain their calibrated cue', () => {
  const source = [{ text: '*saut@1/0.8:amour* revient', start: 0, end: 4 }]
  assert.throws(() => applyWordSignature(source, { word: 'amour', scope: 'song', profile }), /Confirmez/)
  const result = applyWordSignature(source, { word: 'amour', scope: 'song', profile, replace: true })
  assert.equal(parseLyricMarkup(result.lines[0].text)[0].cue, 1)
  assert.equal(result.estimated, 0)
  assert.ok(!result.lines[0].text.includes('*saut'))
})

test('word-aligned placements are exact and short/outside placements cannot overflow', () => {
  const source = [{ text: 'Mon amour', start: 2, end: 4, words: [{ word: 'Mon', start: 2, end: 2.5 }, { word: 'amour', start: 3, end: 4 }] }]
  const result = applyWordSignature(source, { word: 'amour', scope: 'song', profile })
  assert.equal(parseLyricMarkup(result.lines[0].text).find(token => token.effect).cue, 1)
  assert.equal(result.estimated, 0)
  assert.throws(() => applyWordSignature([{ text: 'amour', start: 0, end: .1 }], { word: 'amour', profile }), /trop courtes/)
  assert.throws(() => applyWordSignature([{ text: '*saut@4/0.8:amour*', start: 0, end: 2 }], { word: 'amour', profile, replace: true }), /trop courtes/)
})

test('accepted custom profiles survive nested markup, plain editing and project export/reload', () => {
  const result = applyWordSignature(lines, { word: 'amour', scope: 'song', profile })
  const id = animationProfileId(profile)
  const project = createProject(result.lines, 'song.mp3')
  const reloaded = parsePlayLevel(JSON.stringify(project))
  assert.equal(animationSignatureLibrary(reloaded).length, 1)
  assert.deepEqual(reloaded.map(line => plainLyrics(line.text)), lines.map(line => plainLyrics(line.text)))
  assert.deepEqual(reloaded[0].animationProfiles[id], profile)
  assert.equal(lyricQuizzes(reloaded[0].text).length, 1)
  const edited = editLyrics(reloaded[0].text, plainLyrics(reloaded[0].text) + ' Encore.')
  assert.ok(parseLyricMarkup(edited).some(token => token.effect === id))
  assert.throws(() => parsePlayLevel(JSON.stringify({ lyrics: [{ ...reloaded[0], animationProfiles: {} }] })), /manquant/)
  assert.throws(() => parsePlayLevel(JSON.stringify({ lyrics: [{ ...reloaded[0], text: `*${id}@3.9/0.8:amour*` }] })), /hors/)
})
