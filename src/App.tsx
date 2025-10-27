import React from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import Toolbar from './components/Toolbar'
import Player from './components/Player'
import Timeline from './components/Timeline'

export default function App() {
  return (
    <ErrorBoundary>
      <div style={{ display:'grid', gridTemplateRows:'auto auto 1fr', height:'100vh' }}>
        <Toolbar />
        <Player />
        <Timeline />
      </div>
    </ErrorBoundary>
  )
}

