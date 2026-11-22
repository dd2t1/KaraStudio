export default function LabAnnotatedText({ tokens }) {
  return <span className="lab-annotated-text">{tokens.map((token, index) => {
    if (token.subdued) return <span key={index} className="lab-common-word" title="Mot courant atténué">{token.text}</span>
    if (!token.variant && !token.rhyme && !token.repeated) return <span key={index}>{token.text}</span>
    const group = token.variant || token.rhyme
    const hue = group ? [205, 275, 155, 35, 325, 185][Number(group.id.slice(1)) % 6] : 205
    const title = [token.repeated && 'Mot répété', token.variant && `Variante possible · base « ${token.variant.root} »`, token.rhyme && `Rime candidate · ${token.rhyme.key}`].filter(Boolean).join(' · ')
    return <mark key={index} style={{ '--lab-hue': hue }} className={`${token.variant ? 'lab-variant' : ''} ${token.rhyme ? 'lab-rhyme' : ''}`} title={title}>
      {token.variant ? <>{token.text.slice(0, token.variant.split)}<span className="lab-difference">{token.text.slice(token.variant.split)}</span></> : token.text}
    </mark>
  })}</span>
}
