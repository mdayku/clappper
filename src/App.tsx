import React, { useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import Toolbar from './components/Toolbar'
import Player from './components/Player'
import Timeline from './components/Timeline'
import { useStore } from './store'

export default function App() {
  const store = useStore()
  const { playhead, setPlayhead, selectedId, deleteClip, splitClip, getTotalDuration, undo, redo } = store
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [autosavePath, setAutosavePath] = React.useState<string>('')
  const [showApiKeyDialog, setShowApiKeyDialog] = React.useState(false)
  const [apiKeyInput, setApiKeyInput] = React.useState('')
  const [apiKeySaveError, setApiKeySaveError] = React.useState<string | null>(null)
  
  // Check for autosave on mount and offer to restore
  // TEMPORARILY DISABLED to test if autosave is causing room detection to show
  useEffect(() => {
    const checkAndRestore = async () => {
      const path = await window.clappper.getAutosavePath()
      setAutosavePath(path)
      console.log('Autosave path:', path)
      
      // TEMPORARILY DISABLED - uncomment to re-enable autosave restore
      /*
      const { exists, path: autosaveFile } = await window.clappper.checkAutosave()
      if (exists && autosaveFile) {
        const shouldRestore = confirm(
          'Found a previous session. Would you like to restore it?'
        )
        
        if (shouldRestore) {
          try {
            const { ok, state } = await window.clappper.loadProject(autosaveFile)
            if (ok && state) {
              // Restore state to store - only restore valid state
              // Ensure we don't restore any UI state that might cause issues
              if (state.tracks) store.tracks = state.tracks
              if (state.selectedId !== undefined) store.selectedId = state.selectedId || null
              if (state.playhead !== undefined) store.playhead = state.playhead || 0
              if (state.pipSettings) store.pipSettings = state.pipSettings
              if (state.exportSettings) store.exportSettings = state.exportSettings
              if (state.visibleOverlayCount !== undefined) store.visibleOverlayCount = state.visibleOverlayCount ?? store.visibleOverlayCount
              
              console.log('Session restored from', new Date(state.timestamp).toLocaleString())
              alert('Session restored successfully!')
            }
          } catch (err) {
            console.error('Failed to restore session:', err)
            alert('Failed to restore session')
          }
        }
      }
      */
    }
    
    checkAndRestore()
  }, [])
  
  // Autosave every 5 seconds
  useEffect(() => {
    if (!autosavePath) return
    
    const interval = setInterval(async () => {
      const state = {
        version: 1,
        tracks: store.tracks,
        selectedId: store.selectedId,
        playhead: store.playhead,
        pipSettings: store.pipSettings,
        exportSettings: store.exportSettings,
        visibleOverlayCount: store.visibleOverlayCount,
        timestamp: Date.now()
      }
      
      try {
        await window.clappper.saveProject(autosavePath, state)
        console.log('Autosaved at', new Date().toLocaleTimeString())
      } catch (err) {
        console.error('Autosave failed:', err)
      }
    }, 5000) // Every 5 seconds
    
    return () => clearInterval(interval)
  }, [autosavePath, store])
  
  // Listen for menu events
  useEffect(() => {
    const handleChangeApiKey = async () => {
      // Load current API key
      const currentKey = await window.clappper.getOpenAIKey()
      setApiKeyInput(currentKey || '')
      setShowApiKeyDialog(true)
    }
    
    if (window.clappper?.onMenuChangeApiKey) {
      window.clappper.onMenuChangeApiKey(handleChangeApiKey)
    }
  }, [])

  const handleSaveApiKey = async () => {
    try {
      await window.clappper.setOpenAIKey(apiKeyInput)
      setShowApiKeyDialog(false)
      setApiKeySaveError(null)
      alert('API key saved successfully!')
    } catch (err) {
      setApiKeySaveError(`Failed to save API key: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      const totalDuration = getTotalDuration()
      
      // Undo/Redo (check first to handle Ctrl+Z and Ctrl+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        redo()
        console.log('Redo')
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        console.log('Undo')
        return
      }
      
      switch (e.key.toLowerCase()) {
        case ' ': // Space: Play/pause
          e.preventDefault()
          setIsPlaying(prev => !prev)
          console.log('Play/Pause toggled:', !isPlaying)
          break
          
        case 'delete':
        case 'backspace': // Delete/Backspace: Delete selected clip
          if (selectedId) {
            e.preventDefault()
            if (confirm('Delete selected clip?')) {
              deleteClip(selectedId)
            }
          }
          break
          
        case 's': // S: Split at playhead
          if (selectedId) {
            e.preventDefault()
            splitClip(selectedId, playhead)
            console.log('Split clip at', playhead)
          }
          break
          
        case 'arrowleft': // ←: Nudge playhead left
          e.preventDefault()
          const leftStep = e.shiftKey ? 1 : 0.1
          setPlayhead(Math.max(0, playhead - leftStep))
          break
          
        case 'arrowright': // →: Nudge playhead right
          e.preventDefault()
          const rightStep = e.shiftKey ? 1 : 0.1
          setPlayhead(Math.min(totalDuration, playhead + rightStep))
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playhead, setPlayhead, selectedId, deleteClip, splitClip, getTotalDuration, isPlaying, undo, redo])
  
  return (
    <ErrorBoundary>
      <div style={{ display:'grid', gridTemplateRows:'auto auto 1fr', height:'100vh' }}>
        <Toolbar />
        <Player isPlaying={isPlaying} setIsPlaying={setIsPlaying} />
        <Timeline />
      </div>

      {/* API Key Configuration Dialog */}
      {showApiKeyDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>🔑 OpenAI API Key</h3>
            <p style={{ fontSize: 14, color: '#495057', marginBottom: 16 }}>
              Enter your OpenAI API key for GPT-4 Vision cost estimation.
              Your key will be stored locally and never shared.
            </p>
            <div style={{ marginBottom: 16 }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontFamily: 'monospace'
                }}
              />
            </div>
            {apiKeySaveError && (
              <div style={{ fontSize: 12, color: '#dc3545', marginBottom: 16 }}>
                {apiKeySaveError}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#6c757d', marginBottom: 16 }}>
              Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>platform.openai.com/api-keys</a>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowApiKeyDialog(false)
                  setApiKeySaveError(null)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  border: 'none',
                  borderRadius: 4,
                  background: apiKeyInput.trim() ? '#28a745' : '#ccc',
                  color: 'white',
                  cursor: apiKeyInput.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}

