import { Component } from 'react'

export default class ScreenErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen-error" role="alert">
        <p>Cet écran a rencontré un problème.</p>
        <button type="button" className="neon-btn primary-btn" onClick={() => { this.setState({ error: null }); this.props.onReset() }}>
          Retour au menu
        </button>
      </div>
    )
  }
}
