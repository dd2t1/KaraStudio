import test from 'node:test'
import assert from 'node:assert/strict'
import jsQR from 'jsqr'
import { qrMatrix } from './qrCode.mjs'

function decode(text) {
  const matrix = qrMatrix(text)
  const scale = 4
  const quiet = 4
  const size = (matrix.length + quiet * 2) * scale
  const pixels = new Uint8ClampedArray(size * size * 4)
  pixels.fill(255)
  matrix.forEach((row, rowIndex) => row.forEach((dark, columnIndex) => {
    if (!dark) return
    for (let y = 0; y < scale; y += 1) for (let x = 0; x < scale; x += 1) {
      const offset = (((rowIndex + quiet) * scale + y) * size + (columnIndex + quiet) * scale + x) * 4
      pixels[offset] = 17
      pixels[offset + 1] = 17
      pixels[offset + 2] = 17
    }
  }))
  return jsQR(pixels, size, size)?.data
}

test('a local karaoke URL decodes from the generated QR matrix', () => {
  const url = 'http://127.0.0.1:5173/?action=edit'
  assert.equal(decode(url), url)
})

test('a longer network address still decodes', () => {
  const url = 'http://192.168.1.42:5173/?action=spotify-auth'
  assert.equal(decode(url), url)
})
