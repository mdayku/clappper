import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

interface PlayerProps {
  isPlaying: boolean
  setIsPlaying: (playing: boolean) => void
}

export default function Player({ isPlaying, setIsPlaying }: PlayerProps) {
  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const overlayVideoRefs = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null)
  ]
  const containerRef = useRef<HTMLDivElement>(null)
  const { playhead, setPlayhead, selectedId, select, getClipById, pipSettings, setPipSettings } = useStore()
  const [error, setError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [isDragging, setIsDragging] = useState<number | null>(null) // Track which overlay is being dragged
  const [showKeyframes, setShowKeyframes] = useState(false)
  
  const mainTrack = useStore.getState().getMainTrack()
  const overlayTracks = useStore.getState().getOverlayTracks()
  
  // Determine which clip is selected
  const selectedClip = selectedId ? getClipById(selectedId) : null
  
  // If a clip is selected on main track, show that. Otherwise show first clip.
  let mainClip = null
  let currentClipIndex = 0
  
  if (selectedClip && selectedClip.trackId === 'main') {
    // Selected clip is on main track
    mainClip = selectedClip
    currentClipIndex = mainTrack.clips.findIndex(c => c.id === selectedClip.id)
  } else {
    // No selection or selected clip is overlay - show first main clip
    mainClip = mainTrack.clips.length > 0 ? mainTrack.clips[0] : null
    currentClipIndex = 0
  }
  
  const overlayClips = overlayTracks.map(track => 
    track.clips.length > 0 ? track.clips[0] : null
  )
  
  // Check if any overlay has clips
  const hasOverlays = overlayClips.some(clip => clip !== null)

  // Helper to load a file URL
  const getFileUrl = (path: string) => {
    let fileUrl = path
    if (!fileUrl.startsWith('file://')) {
      fileUrl = fileUrl.replace(/\\/g, '/')
      const isWindowsAbsolute = /^[A-Za-z]:/.test(fileUrl)
      if (isWindowsAbsolute) {
        const parts = fileUrl.split('/')
        const encodedParts = parts.map((part, i) => 
          i === 0 ? part : encodeURIComponent(part)
        )
        fileUrl = 'file:///' + encodedParts.join('/')
      } else {
        if (!fileUrl.startsWith('/')) fileUrl = '/' + fileUrl
        const parts = fileUrl.split('/')
        fileUrl = 'file://' + parts.map(part => encodeURIComponent(part)).join('/')
      }
    }
    return fileUrl
  }

  // Load main video
  useEffect(() => {
    const v = mainVideoRef.current
    if (!v || !mainClip) {
      // Cleanup: clear video source when no clip
      if (v) {
        v.src = ''
        v.load() // Force release of resources
      }
      return
    }
    
    const fileUrl = getFileUrl(mainClip.path)
    console.log('Loading main clip:', mainClip.name, fileUrl)
    v.src = fileUrl
    
    const onLoadedMetadata = () => {
      v.currentTime = mainClip.start
      // Resume playback if we were playing
      if (isPlaying) {
        v.play().catch(err => console.error('Auto-play failed:', err))
      }
    }
    
    v.addEventListener('loadedmetadata', onLoadedMetadata)
    return () => {
      v.removeEventListener('loadedmetadata', onLoadedMetadata)
      // Cleanup on unmount or clip change
      v.pause()
    }
  }, [mainClip?.path, mainClip?.id, isPlaying])

  // Update video currentTime when trim points change
  const prevTrimRef = React.useRef({ start: mainClip?.start, end: mainClip?.end })
  useEffect(() => {
    const v = mainVideoRef.current
    if (!v || !mainClip || v.readyState < 2) return
    
    const prev = prevTrimRef.current
    
    // If start changed, seek to new start
    if (prev.start !== mainClip.start) {
      v.currentTime = mainClip.start
    }
    // If end changed (but not start), seek to new end
    else if (prev.end !== mainClip.end) {
      v.currentTime = mainClip.end
    }
    
    prevTrimRef.current = { start: mainClip.start, end: mainClip.end }
  }, [mainClip?.start, mainClip?.end])

  // Load overlay videos
  useEffect(() => {
    overlayClips.forEach((clip, index) => {
      const v = overlayVideoRefs[index].current
      if (!v) return
      
      if (!clip) {
        // Cleanup: clear video source when no clip
        v.src = ''
        v.load() // Force release of resources
        return
      }
      
      const fileUrl = getFileUrl(clip.path)
      console.log(`Loading overlay ${index + 1} clip:`, clip.name, fileUrl)
      v.src = fileUrl
      
      const onLoadedMetadata = () => {
        v.currentTime = clip.start
      }
      
      v.addEventListener('loadedmetadata', onLoadedMetadata)
    })
    
    // Cleanup function for all overlay videos
    return () => {
      overlayVideoRefs.forEach(ref => {
        if (ref.current) {
          ref.current.pause()
        }
      })
    }
  }, [overlayClips.map(c => c?.path).join(','), overlayClips.map(c => c?.id).join(',')])

  // Update overlay videos currentTime when trim points change
  useEffect(() => {
    overlayClips.forEach((clip, index) => {
      const v = overlayVideoRefs[index].current
      if (!v || !clip || v.readyState < 2) return
      v.currentTime = clip.start
    })
  }, [overlayClips.map(c => c ? `${c.id}-${c.start}-${c.end}` : '').join(',')])

  // Handle play/pause from keyboard shortcut
  useEffect(() => {
    const mainV = mainVideoRef.current
    if (!mainV) return
    
    if (isPlaying) {
      mainV.play().catch(err => console.error('Play failed:', err))
      overlayVideoRefs.forEach(ref => {
        if (ref.current) {
          ref.current.play().catch(err => console.error('Overlay play failed:', err))
        }
      })
    } else {
      mainV.pause()
      overlayVideoRefs.forEach(ref => {
        if (ref.current) {
          ref.current.pause()
        }
      })
    }
  }, [isPlaying])
  
  // Sync playback between main and all overlays
  useEffect(() => {
    const mainV = mainVideoRef.current
    if (!mainV) return

    const onTimeUpdate = () => {
      const localTime = mainV.currentTime
      
      // Sync all overlay videos
      overlayClips.forEach((clip, index) => {
        const overlayV = overlayVideoRefs[index].current
        if (overlayV && clip && Math.abs(overlayV.currentTime - localTime) > 0.1) {
          overlayV.currentTime = localTime
        }
      })
      
      // Update playhead
      if (mainClip) {
        const clipProgress = Math.max(0, localTime - mainClip.start)
        setPlayhead(clipProgress)

        // Check if we've reached the end of current clip
        if (localTime >= mainClip.end - 0.1) { // Buffer to catch the end
          // Get fresh state
          const freshMainTrack = useStore.getState().getMainTrack()
          const freshCurrentIndex = freshMainTrack.clips.findIndex(c => c.id === mainClip.id)
          const nextIndex = freshCurrentIndex + 1
          const nextClip = freshMainTrack.clips[nextIndex]
          
          console.log(`Clip ended. Current: ${mainClip.name}, Next index: ${nextIndex}, Has next: ${!!nextClip}`)
          
          if (nextClip) {
            // There's a next clip - switch to it
            console.log('Auto-advancing to next clip:', nextClip.name)
            mainV.pause() // Pause current video first
            select(nextClip.id)
            setPlayhead(0) // Reset playhead for next clip
            // The useEffect will reload the video and resume playback
          } else {
            // No more clips - stop playback
            console.log('Reached end of timeline - stopping')
            mainV.pause()
            overlayVideoRefs.forEach(ref => ref.current?.pause())
            setIsPlaying(false)
            mainV.currentTime = mainClip.end
          }
        }
      }
    }

    const onPlay = () => {
      // Sync all overlay playback
      overlayClips.forEach((clip, index) => {
        if (clip) overlayVideoRefs[index].current?.play()
      })
      
      // Ensure we start from clip's trim start
      if (mainClip && (mainV.currentTime < mainClip.start || mainV.currentTime >= mainClip.end)) {
        mainV.currentTime = mainClip.start
        overlayClips.forEach((clip, index) => {
          if (clip) overlayVideoRefs[index].current!.currentTime = clip.start
        })
      }
    }

    const onPause = () => {
      // Sync all overlay pause
      overlayVideoRefs.forEach(ref => ref.current?.pause())
    }

    mainV.addEventListener('timeupdate', onTimeUpdate)
    mainV.addEventListener('play', onPlay)
    mainV.addEventListener('pause', onPause)

    return () => {
      mainV.removeEventListener('timeupdate', onTimeUpdate)
      mainV.removeEventListener('play', onPlay)
      mainV.removeEventListener('pause', onPause)
    }
  }, [mainClip?.id, currentClipIndex, isPlaying, overlayClips.map(c => c?.id).join(',')])

  if (!mainClip) {
    return (
      <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111', color: '#999' }}>
        Import a clip to preview
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111', color: '#f88', padding: 20, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>⚠️ {error}</div>
          <button 
            onClick={() => setError(null)}
            style={{ padding: '8px 16px', background: '#c00', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  // Calculate PiP position based on keyframes or preset
  const getPipPositionAtTime = (time: number) => {
    const { keyframes, position, customX, customY } = pipSettings
    
    // If we have keyframes, interpolate position
    if (keyframes.length > 0) {
      // Find surrounding keyframes
      const before = keyframes.filter(k => k.time <= time).sort((a, b) => b.time - a.time)[0]
      const after = keyframes.filter(k => k.time > time).sort((a, b) => a.time - b.time)[0]
      
      if (!before && after) {
        // Before first keyframe
        return { x: after.x, y: after.y, size: after.size }
      } else if (before && !after) {
        // After last keyframe
        return { x: before.x, y: before.y, size: before.size }
      } else if (before && after) {
        // Interpolate between keyframes
        const progress = (time - before.time) / (after.time - before.time)
        return {
          x: before.x + (after.x - before.x) * progress,
          y: before.y + (after.y - before.y) * progress,
          size: before.size + (after.size - before.size) * progress
        }
      } else if (before) {
        return { x: before.x, y: before.y, size: before.size }
      }
    }
    
    // Use custom position if set
    if (position === 'custom' && customX !== undefined && customY !== undefined) {
      return { x: customX, y: customY, size: pipSettings.size }
    }
    
    // Use preset positions
    const padding = 0.04 // 4% padding
    const size = pipSettings.size
    
    switch (position) {
      case 'top-left':
        return { x: padding, y: padding, size }
      case 'top-right':
        return { x: 1 - size - padding, y: padding, size }
      case 'bottom-left':
        return { x: padding, y: 1 - size - padding, size }
      case 'center':
        return { x: (1 - size) / 2, y: (1 - size) / 2, size }
      default: // bottom-right
        return { x: 1 - size - padding, y: 1 - size - padding, size }
    }
  }
  
  const currentPipPos = getPipPositionAtTime(playhead)
  const pipSizePercent = Math.round(currentPipPos.size * 100)
  
  // Calculate overlay dimensions to match export behavior
  // Export uses: scale2ref='oh*mdar':'ih*${pipSize}' 
  // This means overlay height = main height * pipSize, width maintains aspect ratio
  // In preview, we need to do the same relative to container height
  const overlayHeightPercent = pipSizePercent // % of container height
  
  // Handle dragging the PiP overlay (for first overlay only - simplified)
  const handlePipMouseDown = (overlayIndex: number) => (e: React.MouseEvent) => {
    if (!containerRef.current) return
    e.preventDefault()
    e.stopPropagation()
    
    setIsDragging(overlayIndex)
    
    const container = containerRef.current.getBoundingClientRect()
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const x = (moveEvent.clientX - container.left) / container.width
      const y = (moveEvent.clientY - container.top) / container.height
      
      // Clamp to container bounds
      const clampedX = Math.max(0, Math.min(1 - currentPipPos.size, x))
      const clampedY = Math.max(0, Math.min(1 - currentPipPos.size, y))
      
      setPipSettings({ 
        position: 'custom',
        customX: clampedX,
        customY: clampedY
      })
    }
    
    const handleMouseUp = () => {
      setIsDragging(null)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }
  
  // Add keyframe at current playhead position
  const addKeyframe = () => {
    const newKeyframe = {
      time: playhead,
      x: currentPipPos.x,
      y: currentPipPos.y,
      size: currentPipPos.size
    }
    
    // Remove any existing keyframe at this time
    const filtered = pipSettings.keyframes.filter(k => Math.abs(k.time - playhead) > 0.1)
    const updated = [...filtered, newKeyframe].sort((a, b) => a.time - b.time)
    
    setPipSettings({ keyframes: updated })
  }
  
  // Remove keyframe closest to current time
  const removeKeyframe = () => {
    const closest = pipSettings.keyframes
      .map((k, i) => ({ ...k, index: i, distance: Math.abs(k.time - playhead) }))
      .sort((a, b) => a.distance - b.distance)[0]
    
    if (closest && closest.distance < 1) {
      const updated = pipSettings.keyframes.filter((_, i) => i !== closest.index)
      setPipSettings({ keyframes: updated })
    }
  }
  
  // Clear all keyframes
  const clearKeyframes = () => {
    if (confirm('Clear all position keyframes?')) {
      setPipSettings({ keyframes: [] })
    }
  }

  return (
    <div style={{ display:'flex', flexDirection: 'column', gap: 8 }}>
      <div 
        ref={containerRef}
        style={{ 
          display:'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: 420, 
          background:'#111',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Main video */}
        <video 
          ref={mainVideoRef} 
          controls 
          style={{ 
            maxWidth:'100%', 
            maxHeight:'100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            border: selectedClip?.id === mainClip.id ? '3px solid #4a9eff' : 'none'
          }} 
        />
        
        {/* Overlay videos (PiP) - Draggable */}
        {overlayClips.map((clip, index) => {
          if (!clip) return null
          
          // Calculate position with slight offset for each overlay to avoid complete overlap
          const offsetX = index * 0.05 // 5% offset per overlay
          const offsetY = index * 0.05
          const posX = (currentPipPos.x + offsetX) % (1 - currentPipPos.size)
          const posY = (currentPipPos.y + offsetY) % (1 - currentPipPos.size)
          
          // Different border colors for each overlay
          const borderColors = ['#9c27b0', '#2196f3', '#4caf50', '#ff9800']
          const borderColor = borderColors[index]
          
          return (
            <div
              key={index}
              onMouseDown={handlePipMouseDown(index)}
              style={{ 
                position: 'absolute',
                left: `${posX * 100}%`,
                top: `${posY * 100}%`,
                height: `${overlayHeightPercent}%`, // Size relative to container HEIGHT (matches export)
                width: 'auto', // Width will be calculated to maintain aspect ratio
                cursor: isDragging === index ? 'grabbing' : 'grab',
                zIndex: 10 + index,
                userSelect: 'none'
              }}
            >
              <video 
                ref={overlayVideoRefs[index]}
                style={{ 
                  height: '100%',
                  width: 'auto',
                  objectFit: 'contain',
                  border: selectedClip?.id === clip.id ? `3px solid ${borderColor}` : '2px solid white',
                  borderRadius: 4,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  pointerEvents: 'none',
                  display: 'block'
                }} 
              />
              {/* Overlay number badge */}
              <div style={{
                position: 'absolute',
                top: 4,
                left: 4,
                background: borderColor,
                color: 'white',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 'bold',
                pointerEvents: 'none'
              }}>
                {index + 1}
              </div>
              {/* Drag indicator */}
              {isDragging !== index && (
                <div style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: `rgba(${index === 0 ? '156, 39, 176' : index === 1 ? '33, 150, 243' : index === 2 ? '76, 175, 80' : '255, 152, 0'}, 0.9)`,
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: 3,
                  fontSize: 10,
                  fontWeight: 'bold',
                  pointerEvents: 'none'
                }}>
                  DRAG
                </div>
              )}
            </div>
          )
        })}
        
        {/* Keyframe indicators on timeline */}
        {hasOverlays && showKeyframes && pipSettings.keyframes.map((kf, i) => {
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${kf.x * 100}%`,
                top: `${kf.y * 100}%`,
                width: 8,
                height: 8,
                background: '#9c27b0',
                border: '2px solid white',
                borderRadius: '50%',
                zIndex: 5,
                pointerEvents: 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
              }}
              title={`Keyframe at ${kf.time.toFixed(1)}s`}
            />
          )
        })}
      </div>
      
      {/* Status Bar */}
      <div style={{ padding: '8px 16px', background: '#f8f9fa', fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Main:</strong> {mainClip.name} ({(mainClip.end - mainClip.start).toFixed(1)}s)
          {overlayClips.filter(c => c).length > 0 && (
            <>
              {' | '}
              <strong>Overlays:</strong> {overlayClips.filter(c => c).length} active
            </>
          )}
        </div>
        {hasOverlays && (
          <button
            onClick={() => setShowControls(!showControls)}
            style={{
              padding: '4px 12px',
              background: showControls ? '#9c27b0' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 'bold'
            }}
          >
            {showControls ? 'Hide' : 'Show'} PiP Controls
          </button>
        )}
      </div>
      
      {/* PiP Controls Panel */}
      {hasOverlays && showControls && (
        <div style={{ 
          padding: 16, 
          background: '#f3e5f5', 
          border: '2px solid #9c27b0',
          borderRadius: 4
        }}>
          <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12, color: '#9c27b0' }}>
            Picture-in-Picture Settings
          </div>
          
          {/* Position Presets */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
              Position Presets: <span style={{ fontSize: 10, fontWeight: 'normal', color: '#999' }}>(or drag PiP window)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => setPipSettings({ position: pos })}
                  style={{
                    padding: '6px 12px',
                    background: pipSettings.position === pos ? '#9c27b0' : '#e0e0e0',
                    color: pipSettings.position === pos ? 'white' : '#333',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: pipSettings.position === pos ? 'bold' : 'normal'
                  }}
                >
                  {pos.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </button>
              ))}
              {pipSettings.position === 'custom' && (
                <div style={{
                  padding: '6px 12px',
                  background: '#9c27b0',
                  color: 'white',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 'bold'
                }}>
                  Custom Position
                </div>
              )}
            </div>
          </div>
          
          {/* Size Control */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
              Size: {pipSizePercent}%
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min="15"
                max="50"
                step="5"
                value={pipSizePercent}
                onChange={(e) => setPipSettings({ size: parseInt(e.target.value) / 100 })}
                style={{ flex: 1 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setPipSettings({ size: 0.15 })}
                  style={{
                    padding: '4px 8px',
                    background: '#e0e0e0',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontSize: 10
                  }}
                >
                  Small
                </button>
                <button
                  onClick={() => setPipSettings({ size: 0.25 })}
                  style={{
                    padding: '4px 8px',
                    background: '#e0e0e0',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontSize: 10
                  }}
                >
                  Medium
                </button>
                <button
                  onClick={() => setPipSettings({ size: 0.40 })}
                  style={{
                    padding: '4px 8px',
                    background: '#e0e0e0',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontSize: 10
                  }}
                >
                  Large
                </button>
              </div>
            </div>
          </div>
          
          {/* Keyframe Animation Controls */}
          <div style={{ 
            borderTop: '1px solid #ce93d8', 
            paddingTop: 12,
            marginTop: 12
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 8
            }}>
              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#666' }}>
                Position Animation ({pipSettings.keyframes.length} keyframe{pipSettings.keyframes.length !== 1 ? 's' : ''})
              </label>
              <button
                onClick={() => setShowKeyframes(!showKeyframes)}
                style={{
                  padding: '2px 8px',
                  background: showKeyframes ? '#9c27b0' : '#e0e0e0',
                  color: showKeyframes ? 'white' : '#333',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 10
                }}
              >
                {showKeyframes ? 'Hide' : 'Show'} Markers
              </button>
            </div>
            
            <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
              Drag the PiP window to a position, then add a keyframe at the current time ({playhead.toFixed(1)}s)
            </div>
            
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={addKeyframe}
                style={{
                  padding: '6px 12px',
                  background: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 'bold'
                }}
              >
                ➕ Add Keyframe Here
              </button>
              <button
                onClick={removeKeyframe}
                disabled={pipSettings.keyframes.length === 0}
                style={{
                  padding: '6px 12px',
                  background: pipSettings.keyframes.length > 0 ? '#ff9800' : '#e0e0e0',
                  color: pipSettings.keyframes.length > 0 ? 'white' : '#999',
                  border: 'none',
                  borderRadius: 4,
                  cursor: pipSettings.keyframes.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: 11,
                  fontWeight: 'bold'
                }}
              >
                ➖ Remove Nearest
              </button>
              <button
                onClick={clearKeyframes}
                disabled={pipSettings.keyframes.length === 0}
                style={{
                  padding: '6px 12px',
                  background: pipSettings.keyframes.length > 0 ? '#f44336' : '#e0e0e0',
                  color: pipSettings.keyframes.length > 0 ? 'white' : '#999',
                  border: 'none',
                  borderRadius: 4,
                  cursor: pipSettings.keyframes.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: 11,
                  fontWeight: 'bold'
                }}
              >
                🗑️ Clear All
              </button>
            </div>
            
            {/* Keyframe List */}
            {pipSettings.keyframes.length > 0 && (
              <div style={{ 
                marginTop: 12,
                background: 'white',
                borderRadius: 4,
                padding: 8,
                maxHeight: 120,
                overflowY: 'auto'
              }}>
                {pipSettings.keyframes.map((kf, i) => (
                  <div 
                    key={i}
                    style={{
                      fontSize: 10,
                      padding: '4px 8px',
                      background: Math.abs(kf.time - playhead) < 0.5 ? '#e1bee7' : 'transparent',
                      borderRadius: 3,
                      marginBottom: 2,
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>
                      <strong>#{i + 1}</strong> @ {kf.time.toFixed(1)}s
                    </span>
                    <span style={{ color: '#666' }}>
                      x:{(kf.x * 100).toFixed(0)}% y:{(kf.y * 100).toFixed(0)}% size:{(kf.size * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
