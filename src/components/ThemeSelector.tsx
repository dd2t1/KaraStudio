import { useEffect, useState } from 'react'

const themes = [
  { id: 'neon-futuriste', name: 'Néon futuriste' },
  { id: 'glass-morphism', name: 'Glass morphism' },
  { id: 'retro', name: 'Karaoké rétro' },
  { id: 'dark-academia', name: 'Dark academia' },
  { id: 'nature', name: 'Nature' },
]

const storageKey = 'karaoke.theme'
const defaultTheme = 'neon-futuriste'

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(storageKey, theme)
}

export default function ThemeSelector() {
  const [selectedTheme, setSelectedTheme] = useState(() => localStorage.getItem(storageKey) || defaultTheme)

  useEffect(() => { applyTheme(selectedTheme) }, [selectedTheme])

  return (
    <div className="theme-selector">
      <label htmlFor="theme-select">Choisir un thème</label>
      <select
        id="theme-select"
        value={selectedTheme}
        onChange={event => setSelectedTheme(event.target.value)}
        className="theme-select"
      >
        {themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
      </select>
    </div>
  )
}