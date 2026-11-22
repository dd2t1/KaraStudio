const normalizeToken = (token) => token
  .toLocaleLowerCase('fr')
  .replaceAll('’', "'")
  .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

const tokenize = (text) => text
  .split(/\s+/u)
  .map((token) => token.trim())
  .filter(Boolean)

function compareWords(referenceText, transcriptionText) {
  const reference = tokenize(referenceText)
  const transcription = tokenize(transcriptionText)
  const rows = reference.length + 1
  const columns = transcription.length + 1
  const lcs = Array.from({ length: rows }, () => new Uint16Array(columns))

  for (let referenceIndex = reference.length - 1; referenceIndex >= 0; referenceIndex -= 1) {
    for (let transcriptionIndex = transcription.length - 1; transcriptionIndex >= 0; transcriptionIndex -= 1) {
      lcs[referenceIndex][transcriptionIndex] = normalizeToken(reference[referenceIndex]) === normalizeToken(transcription[transcriptionIndex])
        ? lcs[referenceIndex + 1][transcriptionIndex + 1] + 1
        : Math.max(lcs[referenceIndex + 1][transcriptionIndex], lcs[referenceIndex][transcriptionIndex + 1])
    }
  }

  const referenceDiff = []
  const transcriptionDiff = []
  let referenceIndex = 0
  let transcriptionIndex = 0
  let matches = 0

  while (referenceIndex < reference.length || transcriptionIndex < transcription.length) {
    if (
      referenceIndex < reference.length
      && transcriptionIndex < transcription.length
      && normalizeToken(reference[referenceIndex]) === normalizeToken(transcription[transcriptionIndex])
    ) {
      referenceDiff.push({ text: reference[referenceIndex], status: 'unchanged' })
      transcriptionDiff.push({ text: transcription[transcriptionIndex], status: 'unchanged' })
      referenceIndex += 1
      transcriptionIndex += 1
      matches += 1
    } else if (
      referenceIndex < reference.length
      && (transcriptionIndex >= transcription.length || lcs[referenceIndex + 1][transcriptionIndex] >= lcs[referenceIndex][transcriptionIndex + 1])
    ) {
      referenceDiff.push({ text: reference[referenceIndex], status: 'missing' })
      referenceIndex += 1
    } else {
      transcriptionDiff.push({ text: transcription[transcriptionIndex], status: 'added' })
      transcriptionIndex += 1
    }
  }

  const total = reference.length + transcription.length
  return {
    referenceDiff,
    transcriptionDiff,
    matches,
    missing: reference.length - matches,
    added: transcription.length - matches,
    similarity: total ? Math.round((matches * 2 / total) * 100) : 100,
  }
}

function DiffText({ tokens }) {
  return (
    <div className="diff-text">
      {tokens.map((token, index) => (
        <span key={`${token.text}-${index}`} className={`diff-word ${token.status}`}>
          {token.text}
        </span>
      ))}
    </div>
  )
}

function LyricsDiff({ referenceText, transcriptionText, referenceName, ignoredHeaders, onClose }) {
  const comparison = compareWords(referenceText, transcriptionText)

  return (
    <div className="lyrics-diff-overlay" role="dialog" aria-modal="true" aria-labelledby="lyrics-diff-title">
      <div className="lyrics-diff-modal glass-panel">
        <header className="lyrics-diff-header">
          <div>
            <p className="diff-eyebrow">Comparateur de paroles</p>
            <h2 id="lyrics-diff-title">Diff comme Git</h2>
            <p className="diff-subtitle">
              {ignoredHeaders} titre{ignoredHeaders > 1 ? 's' : ''} de section ignoré{ignoredHeaders > 1 ? 's' : ''} dans {referenceName}.
            </p>
          </div>
          <button className="diff-close" type="button" onClick={onClose} aria-label="Fermer le comparateur">×</button>
        </header>

        <div className="diff-stats" aria-label="Résumé de la comparaison">
          <span className="similarity">{comparison.similarity}% identique</span>
          <span className="missing">− {comparison.missing} mot{comparison.missing > 1 ? 's' : ''} manquant{comparison.missing > 1 ? 's' : ''}</span>
          <span className="added">+ {comparison.added} mot{comparison.added > 1 ? 's' : ''} différent{comparison.added > 1 ? 's' : ''}</span>
        </div>

        <div className="diff-legend">
          <span><i className="legend-swatch missing" /> attendu mais non reconnu</span>
          <span><i className="legend-swatch added" /> reconnu uniquement par Whisper</span>
        </div>

        <div className="diff-columns">
          <section className="diff-column reference">
            <h3><span className="diff-prefix">−</span> Paroles réelles</h3>
            <DiffText tokens={comparison.referenceDiff} />
          </section>
          <section className="diff-column transcription">
            <h3><span className="diff-prefix">+</span> Transcription</h3>
            <DiffText tokens={comparison.transcriptionDiff} />
          </section>
        </div>
      </div>
    </div>
  )
}

export default LyricsDiff
