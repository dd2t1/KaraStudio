import { useRef } from 'react'
import { scanLyricsHeaders } from '../lyricsStructure.mjs'

export default function RawLyricsInput({ value, onChange, pattern, highlight }) {
  const mirror = useRef(null)
  return <div className="raw-lyrics-input">
    <div className="raw-lyrics-mirror" aria-hidden="true" ref={mirror}>
      {scanLyricsHeaders(value, pattern).map(({ raw, section }, index) => <span key={index} className={highlight && section ? 'raw-section-header' : undefined}>{raw}{'\n'}</span>)}
    </div>
    <textarea aria-label="Paroles brutes" rows={10} placeholder="Collez vos paroles ici, ligne par ligne..."
      value={value} onChange={onChange} spellCheck={false}
      onScroll={event => {
        mirror.current.scrollTop = event.currentTarget.scrollTop
        mirror.current.scrollLeft = event.currentTarget.scrollLeft
      }} />
  </div>
}
