export const DIAGNOSTIC_TYPES = {
  'javascript-error': 'Erreur JavaScript', 'promise-rejection': 'Promesse non gérée',
  'resource-error': 'Ressource de l’application indisponible', 'ai-error': 'Échec de la demande IA',
}
const errorNames = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'TimeoutError', 'AbortError'])

// An allowlist, not redaction of arbitrary messages: no user text can pass through.
export function sanitizeDiagnostic(value) {
  if (!value || !Object.hasOwn(DIAGNOSTIC_TYPES, value.type)) return null
  const result = { type: value.type, errorName: errorNames.has(value.errorName) ? value.errorName : 'Error' }
  if (Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) result.status = value.status
  if (Number.isInteger(value.line) && value.line > 0 && value.line <= 10000000) result.line = value.line
  if (Number.isInteger(value.column) && value.column > 0 && value.column <= 10000000) result.column = value.column
  // Only known code locations, never URL query strings or audio/document paths.
  if (typeof value.source === 'string' && value.source.length <= 180 && /^\/(?:dev\/)?(?:src|assets)\/[a-zA-Z0-9_./-]+\.(?:js|jsx|mjs)$/.test(value.source) && !value.source.includes('..')) result.source = value.source
  return result
}
