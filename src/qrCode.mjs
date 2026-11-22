import qrcode from 'qrcode-generator'

function code(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  return qr
}

export function qrMatrix(text) {
  const qr = code(text)
  const count = qr.getModuleCount()
  return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => qr.isDark(row, column)))
}

export function qrSvg(text, { size = 180, margin = 4 } = {}) {
  const matrix = qrMatrix(text)
  const count = matrix.length + margin * 2
  const cells = matrix.flatMap((row, rowIndex) => row.flatMap((dark, columnIndex) => (
    dark ? `M${columnIndex + margin} ${rowIndex + margin}h1v1h-1z` : []
  )))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${count} ${count}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path fill="#111" d="${cells.join('')}"/></svg>`
}
