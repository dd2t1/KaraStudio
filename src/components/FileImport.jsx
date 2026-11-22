import { CheckCircle2, FileText, Music2, Upload } from 'lucide-react'

export default function FileImport({ kind, accept, label, hint, filename, onChange }) {
  const Icon = kind === 'audio' ? Music2 : FileText
  return <label className={`file-import${filename ? ' has-file' : ''}`}>
    <span className="file-import-icon"><Icon size={23} aria-hidden="true" /></span>
    <span className="file-import-copy">
      <strong>{label}</strong>
      <span className="file-import-name" aria-live="polite">{filename || hint}</span>
    </span>
    <span className="file-import-action">{filename ? <CheckCircle2 size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{filename ? 'Changer' : 'Choisir'}</span>
    <input type="file" accept={accept} aria-label={label} onChange={onChange} />
  </label>
}
