import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MainMenu from './components/MainMenu'
import Editor from './components/Editor'
import Settings from './components/Settings'
import PlaySetup from './components/PlaySetup'
import ScreenErrorBoundary from './components/ScreenErrorBoundary'
import './index.css'
import useMotionPreference from './useMotionPreference'
import CastScreen from './components/CastScreen'

function App() {
  const reducedMotion = useMotionPreference()
  const [currentScreen, setCurrentScreen] = useState(() => {
    const action = new URLSearchParams(location.search).get('action')
    if (action === 'edit' || action === 'spotify-auth') return 'editor'
    if (action === 'settings') return 'settings'
    if (action === 'join' || new URLSearchParams(location.search).has('project') || new URLSearchParams(location.search).has('lyrics')) return 'player'
    if (new URLSearchParams(location.search).has('code')) return 'editor'
    return 'menu'
  })
  if (new URLSearchParams(window.location.search).get('cast') === '1') return <CastScreen />

  const pageVariants = {
    initial: { opacity: 0, scale: reducedMotion ? 1 : 0.95 },
    in: { opacity: 1, scale: 1 },
    out: { opacity: 0, scale: reducedMotion ? 1 : 1.05 }
  }

  const pageTransition = {
    type: "tween",
    ease: "anticipate",
    duration: reducedMotion ? 0 : 0.5
  }

  return (
    <div className="app-root">
      <ScreenErrorBoundary key={currentScreen} onReset={() => setCurrentScreen('menu')}>
      <AnimatePresence mode="wait">
        {currentScreen === 'menu' && (
          <motion.div key="menu" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} style={{height: '100%'}}>
            <MainMenu setScreen={setCurrentScreen} />
          </motion.div>
        )}
        
        {currentScreen === 'player' && (
          <motion.div key="player" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} style={{height: '100%'}}>
            <PlaySetup onBack={() => setCurrentScreen('menu')} />
          </motion.div>
        )}

        {currentScreen === 'editor' && (
          <motion.div key="editor" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} style={{height: '100%'}}>
            <Editor onBack={() => setCurrentScreen('menu')} />
          </motion.div>
        )}
        
        {currentScreen === 'settings' && (
          <motion.div key="settings" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} style={{height: '100%'}}>
            <Settings onBack={() => setCurrentScreen('menu')} />
          </motion.div>
        )}
      </AnimatePresence>
      </ScreenErrorBoundary>
    </div>
  )
}

export default App
