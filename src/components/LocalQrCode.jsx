import { qrSvg } from '../qrCode.mjs'

export default function LocalQrCode({ value, label, size = 168 }) {
  return (
    <div className="local-qr" style={{ textAlign: 'center', margin: '10px 0' }}>
      <div dangerouslySetInnerHTML={{ __html: qrSvg(value, { size }) }} />
      <p className="local-qr-caption"><span className="visually-hidden">{label} </span>{value}</p>
    </div>
  )
}
