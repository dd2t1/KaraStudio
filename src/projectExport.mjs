import { zipSync, strToU8 } from 'fflate'
import { parsePlayLevel } from './playLevel.mjs'

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024

export function createProject(lyrics, audioName, spotifyTrackId = null) {
  return {
    timingConvention: 'line-start',
    songInfo: { title: audioName?.replace(/\.[^.]+$/, '') || 'Titre inconnu', artist: 'Artiste inconnu', audioFile: audioName || null,
      ...(spotifyTrackId ? { spotifyTrackId } : {}) },
    lyrics: parsePlayLevel(JSON.stringify({ lyrics }), { requireQuizCues: true }),
  }
}

export function projectArchive(project, audioName, audioBytes) {
  const name = audioName.replace(/[\\/]/g, '_')
  const jsonName = `${name.replace(/\.[^.]+$/, '')}.json`
  if (name === jsonName) throw new Error('Choisissez un fichier audio, pas un fichier JSON.')
  return zipSync({
    [jsonName]: strToU8(JSON.stringify({ ...project, songInfo: { ...project.songInfo, audioFile: name } }, null, 2)),
    [name]: audioBytes,
  }, { level: 0 })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
