import React, { useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import Toolbar from './components/Toolbar'
import Player from './components/Player'
import Timeline from './components/Timeline'
import { useStore } from './store'

export default function App() {
  const store = useStore()
  const { playhead, setPlayhead, selectedId, deleteClip, splitClip, getTotalDuration } = store
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [autosavePath, setAutosavePath] = React.useState<string>('')
  
  // Check for autosave on mount and offer to restore
  useEffect(() => {
    const checkAndRestore = async () => {
      const path = await window.clappper.getAutosavePath()
      setAutosavePath(path)
      console.log('Autosave path:', path)
      
      const { exists, path: autosaveFile } = await window.clappper.checkAutosave()
      if (exists && autosaveFile) {
        const shouldRestore = confirm(
          'Found a previous session. Would you like to restore it?'
        )
        
        if (shouldRestore) {
          try {
            const { ok, state } = await window.clappper.loadProject(autosaveFile)
            if (ok && state) {
              // Restore state to store
              store.tracks = state.tracks || store.tracks
              store.selectedId = state.selectedId || null
              store.playhead = state.playhead || 0
              store.pipSettings = state.pipSettings || store.pipSettings
              store.exportSettings = state.exportSettings || store.exportSettings
              store.visibleOverlayCount = state.visibleOverlayCount ?? store.visibleOverlayCount
              
              console.log('Session restored from', new Date(state.timestamp).toLocaleString())
              alert('Session restored successfully!')
            }
          } catch (err) {
            console.error('Failed to restore session:', err)
            alert('Failed to restore session')
          }
        }
      }
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
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      const totalDuration = getTotalDuration()
      
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
  }, [playhead, setPlayhead, selectedId, deleteClip, splitClip, getTotalDuration, isPlaying])
  
  return (
    <ErrorBoundary>
      <div style={{ display:'grid', gridTemplateRows:'auto auto 1fr', height:'100vh' }}>
        <Toolbar />
        <Player isPlaying={isPlaying} setIsPlaying={setIsPlaying} />
        <Timeline />
      </div>
    </ErrorBoundary>
  )
}

