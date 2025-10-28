import React, { useRef, useEffect, useState } from 'react'
import { useStore } from '../store'
import { clamp } from '../lib/ff'
import TrackLane from './TrackLane'

export default function Timeline() {
  const { setTrim, selectedId, select, reorderClips, deleteClip, moveClipToTrack, getClipById } = useStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const mainTrack = useStore(s => s.tracks.find(t => t.id === 'main'))!
  const visibleOverlayCount = useStore(s => s.visibleOverlayCount)
  const allOverlayTracks = useStore(s => s.tracks.filter(t => t.type === 'overlay'))
  const overlayTracks = allOverlayTracks.slice(0, visibleOverlayCount) // Only show visible tracks
  const allClips = useStore.getState().getAllClips()
  
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null)
  
  // Auto-select first clip if nothing selected (must be before early return)
  useEffect(() => {
    if (!selectedId && allClips.length > 0) {
      select(allClips[0].id)
    }
  }, [selectedId, allClips.length, select])
  
  if (allClips.length === 0) {
    return (
      <div style={{ padding: 16, color: '#999' }}>
        Timeline: (empty) - Import clips to get started
      </div>
    )
  }

  const sel = getClipById(selectedId || '') || allClips[0]

  // Safety checks
  if (!sel || sel.duration <= 0) {
    return <div style={{ padding: 16, color: '#c00' }}>Error: Invalid clip duration</div>
  }

  const width = 800
  const pxPerSec = width / Math.max(1, sel.duration)
  const left = sel.start * pxPerSec
  const right = sel.end * pxPerSec

  const onDrag = (which: 'start'|'end', clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clamp(clientX - rect.left, 0, width)
    const t = x / pxPerSec
    
    // Ensure minimum 0.1s duration
    const minDuration = 0.1
    let start = sel.start
    let end = sel.end
    
    if (which === 'start') {
      start = clamp(t, 0, sel.end - minDuration)
    } else {
      end = clamp(t, sel.start + minDuration, sel.duration)
    }
    
    // Only update if values actually changed
    if (start !== sel.start || end !== sel.end) {
      setTrim(sel.id, start, end)
    }
  }

  const handleMouseDown = (which: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const move = (ev: MouseEvent) => {
      ev.preventDefault()
      onDrag(which, ev.clientX)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const trimmedDuration = sel.end - sel.start
  const percentTrimmed = ((sel.duration - trimmedDuration) / sel.duration * 100).toFixed(1)
  
  // Calculate total duration and scale to fit in ~1000px max
  const totalDuration = useStore.getState().getTotalDuration()
  const maxTimelineWidth = 1000
  const PIXELS_PER_SECOND = Math.min(50, maxTimelineWidth / Math.max(1, totalDuration))
  
  // Drag and drop handlers for tracks
  const createTrackHandlers = (trackId: string) => {
    const track = trackId === 'main' ? mainTrack : overlayTracks.find(t => t.id === trackId)
    const trackClips = track ? track.clips : []
    
    const handleDragStart = (index: number) => (e: React.DragEvent) => {
      setDraggedIndex(index)
      setDraggedTrackId(trackId)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('trackId', trackId)
      e.dataTransfer.setData('clipId', trackClips[index].id)
    }
    
    const handleDragOver = (index: number) => (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverIndex(index)
    }
    
    const handleDrop = (index: number) => (e: React.DragEvent) => {
      e.preventDefault()
      const sourceTrackId = e.dataTransfer.getData('trackId')
      
      if (sourceTrackId === trackId && draggedIndex !== null && draggedIndex !== index) {
        // Reorder within same track
        reorderClips(draggedIndex, index, trackId)
      } else if (sourceTrackId !== trackId) {
        // Move to different track (Phase 3.4)
        const clipId = e.dataTransfer.getData('clipId')
        if (clipId) {
          moveClipToTrack(clipId, trackId)
        }
      }
      
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDraggedTrackId(null)
    }
    
    const handleDropOnTrack = (e: React.DragEvent) => {
      e.preventDefault()
      const sourceTrackId = e.dataTransfer.getData('trackId')
      const clipId = e.dataTransfer.getData('clipId')
      
      if (sourceTrackId && sourceTrackId !== trackId && clipId) {
        // Move clip to this track (drop on empty area)
        moveClipToTrack(clipId, trackId)
      }
      
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDraggedTrackId(null)
    }
    
    return { handleDragStart, handleDragOver, handleDrop, handleDropOnTrack }
  }
  
  const mainHandlers = createTrackHandlers('main')
  // Create handlers for each overlay track
  const overlayHandlers = overlayTracks.map(track => ({
    trackId: track.id,
    handlers: createTrackHandlers(track.id)
  }))

  return (
    <div style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(100vh - 500px)' }}>
      {/* Trim Controls for Selected Clip - MOVED TO TOP */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>TRIM SELECTED CLIP: {sel.name}</span>
          <button
            onClick={() => {
              const { playhead } = useStore.getState()
              // Playhead is relative to clip's start
              const splitTime = sel.start + playhead
              
              // Validate split time is within clip bounds
              if (splitTime <= sel.start || splitTime >= sel.end) {
                alert('Playhead must be between clip start and end to split')
                return
              }
              
              if (confirm(`Split "${sel.name}" at ${(splitTime - sel.start).toFixed(2)}s?`)) {
                useStore.getState().splitClip(sel.id, splitTime)
              }
            }}
            style={{
              padding: '4px 12px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 'bold'
            }}
            title="Split clip at current playhead position"
          >
            Split at Playhead
          </button>
        </div>
        <div ref={containerRef} style={{ width, height: 64, position:'relative', background:'#fafafa', border:'1px solid #ddd', margin:'8px 0', userSelect: 'none' }}>
          {/* Full duration background */}
          <div style={{ position:'absolute', left: 0, width: '100%', top:0, bottom:0, background:'#f0f0f0' }} />
          {/* Trimmed out regions (darker) */}
          {left > 0 && (
            <div style={{ position:'absolute', left: 0, width: left, top:0, bottom:0, background:'#ddd', opacity: 0.7 }} />
          )}
          {right < width && (
            <div style={{ position:'absolute', left: right, width: width - right, top:0, bottom:0, background:'#ddd', opacity: 0.7 }} />
          )}
          {/* Selected range */}
          <div style={{ position:'absolute', left: left, width: Math.max(2, right-left), top:0, bottom:0, background:'#cde4ff' }} />
          {/* Start handle */}
          <div 
            onMouseDown={handleMouseDown('start')}
            style={{ 
              position:'absolute', 
              left: Math.max(0, left-4), 
              top:0, 
              bottom:0, 
              width:8, 
              background:'#1e90ff', 
              cursor:'ew-resize',
              boxShadow: '0 0 2px rgba(0,0,0,0.3)',
              zIndex: 10
            }} 
            title="Drag to adjust start time"
          />
          {/* End handle */}
          <div 
            onMouseDown={handleMouseDown('end')}
            style={{ 
              position:'absolute', 
              left: Math.min(width-8, right-4), 
              top:0, 
              bottom:0, 
              width:8, 
              background:'#1e90ff', 
              cursor:'ew-resize',
              boxShadow: '0 0 2px rgba(0,0,0,0.3)',
              zIndex: 10
            }} 
            title="Drag to adjust end time"
          />
        </div>
        <div style={{ fontSize:12, color:'#666' }}>
          <strong>Start:</strong> {sel.start.toFixed(2)}s | <strong>End:</strong> {sel.end.toFixed(2)}s | <strong>Duration:</strong> {trimmedDuration.toFixed(2)}s
          {trimmedDuration < sel.duration && <span style={{ color: '#1e90ff', marginLeft: 8 }}>({percentTrimmed}% trimmed)</span>}
        </div>
      </div>

      {/* Multi-Track Timeline */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 12, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>MULTI-TRACK TIMELINE ({allClips.length} total clip{allClips.length !== 1 ? 's' : ''})</span>
          <span style={{ fontWeight: 'normal', color: '#1e90ff' }}>
            Total Duration: {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toFixed(1).padStart(4, '0')}
          </span>
        </div>
        
        {/* Main Track */}
        <TrackLane
          track={mainTrack}
          selectedId={selectedId}
          onSelect={select}
          onDelete={deleteClip}
          onReorder={(from, to) => reorderClips(from, to, 'main')}
          pixelsPerSecond={PIXELS_PER_SECOND}
          onDragStart={mainHandlers.handleDragStart}
          onDragOver={mainHandlers.handleDragOver}
          onDrop={mainHandlers.handleDrop}
          dragOverIndex={draggedTrackId === 'main' ? dragOverIndex : null}
          draggedIndex={draggedTrackId === 'main' ? draggedIndex : null}
          onDropOnTrack={mainHandlers.handleDropOnTrack}
        />
        
        {/* Overlay Tracks (PiP) */}
        {overlayHandlers.map(({ trackId, handlers }) => {
          const track = overlayTracks.find(t => t.id === trackId)!
          return (
            <TrackLane
              key={trackId}
              track={track}
              selectedId={selectedId}
              onSelect={select}
              onDelete={deleteClip}
              onReorder={(from, to) => reorderClips(from, to, trackId)}
              pixelsPerSecond={PIXELS_PER_SECOND}
              onDragStart={handlers.handleDragStart}
              onDragOver={handlers.handleDragOver}
              onDrop={handlers.handleDrop}
              dragOverIndex={draggedTrackId === trackId ? dragOverIndex : null}
              draggedIndex={draggedTrackId === trackId ? draggedIndex : null}
              onDropOnTrack={handlers.handleDropOnTrack}
            />
          )
        })}
      </div>
    </div>
  )
}

