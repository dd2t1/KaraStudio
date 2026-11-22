import { useEffect, useState } from 'react'
import useAiPreference, { setAiAssistance } from '../aiPreference'
import useDiagnosticPreference, { setLocalDiagnostics } from '../diagnosticPreference'
import useLyricsLabPreference, { setLyricsLab } from '../lyricsLabPreference'
import useTvMode, { setTvMode } from '../tvMode.js'
import ThemeSelector from './ThemeSelector'

function Settings({ onBack }) {
  const aiAssistance = useAiPreference()
  const diagnostics = useDiagnosticPreference()
  const lyricsLab = useLyricsLabPreference()
  const tvMode = useTvMode()
  const [spotifyClientId, setSpotifyClientId] = useState(() => localStorage.getItem('karaoke.spotify.client') || '')
  const spotifyRedirectUri = `${location.origin}${location.pathname}`

  // Configuration serveur (.env)
  const [hassUrl, setHassUrl] = useState('')
  const [hassToken, setHassToken] = useState('')
  const [hasServerHassToken, setHasServerHassToken] = useState(false)
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [hasServerOpenaiApiKey, setHasServerOpenaiApiKey] = useState(false)
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('')
  const [openaiModel, setOpenaiModel] = useState('')
  const [transcriptionProvider, setTranscriptionProvider] = useState('local')
  const [localWhisperModel, setLocalWhisperModel] = useState('large-v3')
  const [aiQcmEvery, setAiQcmEvery] = useState('4')

  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [saveStatus, setSaveStatus] = useState({ type: '', message: '' })

  useEffect(() => {
    let cancelled = false
    const loadConfig = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/config`)
        if (!res.ok) throw new Error('Impossible de joindre le serveur API local.')
        const data = await res.json()
        if (cancelled) return
        setHassUrl(data.hassUrl || '')
        setHasServerHassToken(Boolean(data.hasHassToken))
        setHasServerOpenaiApiKey(Boolean(data.hasOpenaiApiKey))
        setOpenaiBaseUrl(data.openaiBaseUrl || '')
        setOpenaiModel(data.openaiModel || '')
        setTranscriptionProvider(data.transcriptionProvider || 'local')
        setLocalWhisperModel(data.localWhisperModel || 'large-v3')
        setAiQcmEvery(data.aiQcmEvery || '4')
      } catch {
        if (!cancelled) setSaveStatus({ type: 'error', message: 'API locale non connectée ou configuration indisponible.' })
      } finally {
        if (!cancelled) setLoadingConfig(false)
      }
    }
    loadConfig()
    return () => { cancelled = true }
  }, [])

  const handleSaveEnvConfig = async event => {
    event?.preventDefault()
    setSavingConfig(true)
    setSaveStatus({ type: '', message: '' })
    try {
      const payload = {
        hassUrl,
        openaiBaseUrl,
        openaiModel,
        transcriptionProvider,
        localWhisperModel,
        aiQcmEvery,
      }
      if (hassToken.trim()) payload.hassToken = hassToken.trim()
      if (openaiApiKey.trim()) payload.openaiApiKey = openaiApiKey.trim()

      const res = await fetch(`${import.meta.env.BASE_URL}api/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Karaoke-Request': '1',
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la sauvegarde.')
      setHassToken('')
      setOpenaiApiKey('')
      if (data.config) {
        setHasServerHassToken(Boolean(data.config.hasHassToken))
        setHasServerOpenaiApiKey(Boolean(data.config.hasOpenaiApiKey))
      }
      setSaveStatus({ type: 'success', message: 'Configuration enregistrée dans le fichier .env du serveur !' })
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message || 'Échec de la sauvegarde.' })
    } finally {
      setSavingConfig(false)
    }
  }

  const toggleAiAssistance = event => {
    const enabled = event.target.checked
    setAiAssistance(enabled)
  }

  return (
    <div className="main-menu-container settings-page">
      <div className="bg-glow"></div>
      <div className="scanlines"></div>

      <div className="menu-content glass-panel" style={{ padding: 'clamp(18px, 4vw, 48px)', borderRadius: '2rem' }}>
        <h1 className="neon-title" style={{ fontSize: '2.5rem', color: '#e0b6ff' }}>Paramètres</h1>
        
        <div className="settings-options" style={{ marginTop: '2rem', textAlign: 'left', width: '100%' }}>
          <section className="settings-experimental" aria-labelledby="tv-settings-title">
            <h2 id="tv-settings-title">Écran de salon</h2>
            <label className="settings-toggle">
              <input type="checkbox" checked={tvMode} onChange={event => setTvMode(event.target.checked)} />
              <span><strong>Mode TV</strong><small>Remplace la saisie difficile par un QR code local, généré sur cet appareil. Désactivez-le pour retrouver l’éditeur ici.</small></span>
            </label>
          </section>

          {/* Section Home Assistant */}
          <section className="settings-experimental" aria-labelledby="hass-settings-title">
            <h2 id="hass-settings-title">Home Assistant</h2>
            <p className="settings-description">
              Connexion à l’intégration <code>karaoke_storage</code> pour sauvegarder, chercher et diffuser les projets sur vos écrans Cast.
            </p>
            <div className="input-group">
              <label htmlFor="settings-hass-url">URL de Home Assistant (HASS_URL)</label>
              <input
                id="settings-hass-url"
                className="neon-input"
                type="url"
                value={hassUrl}
                onChange={e => setHassUrl(e.target.value)}
                placeholder="https://homeassistant.local:8123"
              />
              <label htmlFor="settings-hass-token" style={{ marginTop: '12px' }}>
                Jeton d’accès longue durée (HASS_TOCKEN) {hasServerHassToken && <span style={{ color: '#7edeee', fontSize: '0.8rem' }}>✓ Configuré sur le serveur</span>}
              </label>
              <input
                id="settings-hass-token"
                className="neon-input"
                type="password"
                value={hassToken}
                onChange={e => setHassToken(e.target.value)}
                placeholder={hasServerHassToken ? "•••••••••••• (laisser vide pour conserver)" : "Collez votre jeton Home Assistant"}
                autoComplete="off"
              />
              <small>Créez ce jeton dans votre profil utilisateur Home Assistant (en bas de page : Jetons d’accès longue durée). La clé reste sécurisée sur le serveur.</small>
            </div>
          </section>

          {/* Section LLM OpenAI Compatible & Moteur IA */}
          <section className="settings-experimental" aria-labelledby="llm-settings-title">
            <h2 id="llm-settings-title">Modèle LLM (OpenAI Compatible / LM Studio)</h2>
            <p className="settings-description">
              Fournisseur pour les suggestions de paroles, QCM et animations personnalisées. Fonctionne avec OpenAI, LM Studio, Ollama, VLLM ou tout serveur compatible OpenAI.
            </p>
            <div className="input-group">
              <label htmlFor="settings-openai-url">URL de base de l’API (OPENAI_BASE_URL)</label>
              <input
                id="settings-openai-url"
                className="neon-input"
                type="url"
                value={openaiBaseUrl}
                onChange={e => setOpenaiBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:1234/v1 ou https://api.openai.com/v1"
              />
              <label htmlFor="settings-openai-key" style={{ marginTop: '12px' }}>
                Clé d’API (OPENAI_API_KEY) {hasServerOpenaiApiKey && <span style={{ color: '#7edeee', fontSize: '0.8rem' }}>✓ Configurée sur le serveur</span>}
              </label>
              <input
                id="settings-openai-key"
                className="neon-input"
                type="password"
                value={openaiApiKey}
                onChange={e => setOpenaiApiKey(e.target.value)}
                placeholder={hasServerOpenaiApiKey ? "•••••••••••• (laisser vide pour conserver)" : "sk-... (laisser vide si LM Studio sans clé)"}
                autoComplete="off"
              />
              <label htmlFor="settings-openai-model" style={{ marginTop: '12px' }}>Nom du modèle (OPENAI_MODEL)</label>
              <input
                id="settings-openai-model"
                className="neon-input"
                type="text"
                value={openaiModel}
                onChange={e => setOpenaiModel(e.target.value)}
                placeholder="Ex. : google/gemma-4-e4b ou gpt-4o-mini"
              />
              <label htmlFor="settings-ai-qcm" style={{ marginTop: '12px' }}>Fréquence des suggestions QCM (AI_QCM_EVERY)</label>
              <input
                id="settings-ai-qcm"
                className="neon-input"
                type="number"
                min="2"
                max="20"
                value={aiQcmEvery}
                onChange={e => setAiQcmEvery(e.target.value)}
                placeholder="4"
              />
              <small>Propose un QCM au plus une phrase sur N (entre 2 et 20, valeur par défaut : 4).</small>
            </div>
          </section>

          {/* Section Transcription Vocale */}
          <section className="settings-experimental" aria-labelledby="transcription-settings-title">
            <h2 id="transcription-settings-title">Transcription Vocale (Whisper)</h2>
            <div className="input-group">
              <label htmlFor="settings-transcription-provider">Fournisseur de transcription</label>
              <select
                id="settings-transcription-provider"
                className="neon-input"
                value={transcriptionProvider}
                onChange={e => setTranscriptionProvider(e.target.value)}
              >
                <option value="local">Local (Python Faster-Whisper)</option>
                <option value="openai">OpenAI Cloud (Whisper-1 via OPENAI_API_KEY)</option>
              </select>
              {transcriptionProvider === 'local' && (
                <>
                  <label htmlFor="settings-local-whisper-model" style={{ marginTop: '12px' }}>Modèle Whisper Local (LOCAL_WHISPER_MODEL)</label>
                  <input
                    id="settings-local-whisper-model"
                    className="neon-input"
                    type="text"
                    value={localWhisperModel}
                    onChange={e => setLocalWhisperModel(e.target.value)}
                    placeholder="large-v3, medium, small..."
                  />
                </>
              )}
            </div>
          </section>

          {/* Enregistrement de la configuration serveur */}
          <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              className="neon-btn primary-btn"
              style={{ width: '100%', padding: '14px 20px', fontSize: '1.1rem' }}
              disabled={loadingConfig || savingConfig}
              onClick={handleSaveEnvConfig}
            >
              {savingConfig ? 'Enregistrement dans .env…' : 'Enregistrer la configuration serveur (.env)'}
            </button>
            {saveStatus.message && (
              <p
                role={saveStatus.type === 'error' ? 'alert' : 'status'}
                style={{
                  color: saveStatus.type === 'error' ? '#ff9fc8' : '#7edeee',
                  fontWeight: 'bold',
                  margin: '4px 0 0',
                  textAlign: 'center',
                }}
              >
                {saveStatus.message}
              </p>
            )}
          </div>

          {/* Section Spotify */}
          <section className="settings-experimental" aria-labelledby="spotify-settings-title">
            <h2 id="spotify-settings-title">Spotify Connect</h2>
            <div className="input-group">
              <label htmlFor="settings-spotify-client-id">Client ID</label>
              <input id="settings-spotify-client-id" className="neon-input" value={spotifyClientId}
                onChange={event => { const value = event.target.value.trim(); setSpotifyClientId(value); localStorage.setItem('karaoke.spotify.client', value) }}
                placeholder="Client ID Spotify Developer" aria-invalid={Boolean(spotifyClientId && !/^[a-f0-9]{32}$/i.test(spotifyClientId))} />
              <label htmlFor="settings-spotify-redirect" style={{ marginTop: '12px' }}>Redirect URI à enregistrer</label>
              <input id="settings-spotify-redirect" className="neon-input" value={spotifyRedirectUri} readOnly onFocus={event => event.target.select()} />
              <small>Copiez cette adresse exacte dans Spotify Developer Dashboard. Aucun Client Secret n’est nécessaire avec la connexion PKCE utilisée ici.</small>
            </div>
          </section>

          {/* Paramètres expérimentaux */}
          <section className="settings-experimental" aria-labelledby="experimental-settings-title">
            <h2 id="experimental-settings-title">Paramètres expérimentaux</h2>
            <label className="settings-toggle">
              <input type="checkbox" checked={lyricsLab} onChange={event => setLyricsLab(event.target.checked)} />
              <span><strong>Laboratoire des paroles</strong><small>Statistiques locales, répétitions et vecteurs descriptifs. Un bouton dans l’éditeur lance l’analyse à la demande. Ne modifie ni les paroles ni la lecture. Désactivé par défaut.</small></span>
            </label>
            <p className="settings-experimental-status" role="status">{lyricsLab ? 'Laboratoire disponible dans le studio.' : 'Laboratoire désactivé.'}</p>
            <label className="settings-toggle">
              <input type="checkbox" checked={aiAssistance} onChange={toggleAiAssistance} />
              <span>
                <strong>Activer l’aide IA</strong>
                <small>Analyse automatiquement les phrases synchronisées avec les moteurs locaux ou compatibles OpenAI. Validez les suggestions QCM, animations et styles dans l’éditeur.</small>
              </span>
            </label>
            <p className="settings-experimental-status" role="status">
              {aiAssistance ? 'Aide IA expérimentale activée.' : 'Aide IA expérimentale désactivée.'}
            </p>
            <label className="settings-toggle">
              <input type="checkbox" checked={diagnostics} onChange={event => setLocalDiagnostics(event.target.checked)} />
              <span><strong>Remonter les erreurs au serveur local</strong>
                <small>Diagnostic du karaoké sur ce PC : types d’erreurs, emplacements du code et statuts techniques seulement. Aucun texte saisi, parole, audio ou message d’erreur brut. Désactivé par défaut ; disponible uniquement à une adresse locale.</small>
              </span>
            </label>
            <p className="settings-experimental-status" role="status">{diagnostics ? 'Diagnostic local activé.' : 'Diagnostic local désactivé.'}</p>
          </section>
        </div>

        {/* Section Thème */}
        <section className="settings-experimental" aria-labelledby="theme-settings-title" style={{ marginTop: '2rem' }}>
          <h2 id="theme-settings-title">Thème Visuel</h2>
          <div className="input-group">
            <ThemeSelector />
            <small>Choisissez un thème pour personnaliser l'apparence de l'application.</small>
          </div>
        </section>

        <button className="neon-btn outline-btn" onClick={onBack} style={{ marginTop: '2rem' }}>
          ← Retour au Menu
        </button>
      </div>
    </div>
  )
}

export default Settings
