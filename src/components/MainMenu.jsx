function MainMenu({ setScreen }) {
  return (
    <div className="main-menu-container">
      {/* Background effects */}
      <div className="bg-glow"></div>
      <div className="scanlines"></div>

      <div className="menu-content">
        <h1 className="neon-title">Neon Karaoke</h1>
        <p className="subtitle">Choisissez un mode</p>

        <div className="button-group">
          <button 
            className="neon-btn primary-btn"
            onClick={() => setScreen('player')}
          >
            <span className="icon">▶</span>
            Jouer
          </button>
          
          <button 
            className="neon-btn secondary-btn"
            onClick={() => setScreen('editor')}
          >
            <span className="icon">✎</span>
            Créer / Éditer
          </button>
          
          <button 
            className="neon-btn outline-btn"
            onClick={() => setScreen('settings')}
          >
            <span className="icon">⚙</span>
            Paramètres
          </button>
        </div>
      </div>
    </div>
  )
}

export default MainMenu
