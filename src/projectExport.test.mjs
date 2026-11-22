import test from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync, strFromU8 } from 'fflate'
import { createProject, projectArchive } from './projectExport.mjs'
import { parsePlayLevel } from './playLevel.mjs'

test('PC archive preserves original audio and a playable JSON with its matching filename', () => {
  const lyrics = [{ start: 1, end: 5, text: 'Bonjour', color: '#ffffff', effect: 'none' }]
  const project = createProject(lyrics, 'Chanson été.mp3')
  const audio = new Uint8Array([0, 255, 1, 8, 128])
  const files = unzipSync(projectArchive(project, 'Chanson été.mp3', audio))
  assert.deepEqual(files['Chanson été.mp3'], audio)
  const json = strFromU8(files['Chanson été.json'])
  assert.equal(JSON.parse(json).songInfo.audioFile, 'Chanson été.mp3')
  assert.deepEqual(parsePlayLevel(json), project.lyrics)
})

test('invalid timings cannot be exported to either destination', () => {
  assert.throws(() => createProject([{ start: 2, end: 1, text: 'Invalid' }], 'audio.mp3'))
})
