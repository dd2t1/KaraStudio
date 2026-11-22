export function normalizeDeviceCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export function formatDeviceCode(code) {
  const clean = normalizeDeviceCode(code)
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean
}

export async function createCastPair(base = '/') {
  const response = await fetch(`${base}api/cast/pair`, { method: 'POST' })
  if (!response.ok) throw new Error('Impossible de préparer l’écran de la télé.')
  return response.json()
}

export async function castPairStatus(code, base = '/') {
  const response = await fetch(`${base}api/cast/pair/${encodeURIComponent(normalizeDeviceCode(code))}`, { cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Liaison indisponible.')
  return response.json()
}

export async function claimCastPair(code, base = '/') {
  const response = await fetch(`${base}api/cast/pair/${encodeURIComponent(normalizeDeviceCode(code))}/claim`, { method: 'POST' })
  const data = await response.json().catch(() => ({}))
  if (response.status === 409) throw new Error('Cette télé est déjà liée à un téléphone. Affichez un nouveau code sur la télé.')
  if (!response.ok) throw new Error(data.error || 'Ce code n’est plus valable. Regardez le code affiché sur la télé.')
  return data
}
