import React, { useRef, useEffect } from 'react'
import { useStore } from '../store'
import { clamp } from '../lib/ff'
import ClipItem from './ClipItem'

export default function Timeline() {
  const { clips, setTrim, selectedId, select } = useStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const sortedClips = useStore.getState().getClipsSorted()
  
  // Auto-select first clip if nothing selected (must be before early return)
  useEffect(() => {
    if (!selectedId && sortedClips.length > 0) {
      select(sortedClips[0].id)
    }
  }, [selectedId, sortedClips.length, select])
  
  if (clips.length === 0) {
    return (
      <div style={{ padding: 16, color: '#999' }}>
        Timeline: (empty) - Import clips to get started
      </div>
    )
  }

  const sel = sortedClips.find(c => c.id === selectedId) || sortedClips[0]

  // Safety checks
  if (sel.duration <= 0) {
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
  const totalDuration = sortedClips.reduce((sum, c) => sum + (c.end - c.start), 0)
  const maxTimelineWidth = 1000
  const PIXELS_PER_SECOND = Math.min(50, maxTimelineWidth / totalDuration)

  return (
    <div style={{ padding: 16 }}>
      {/* Clips Timeline */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 'bold' }}>
          CLIPS TIMELINE ({sortedClips.length} clip{sortedClips.length !== 1 ? 's' : ''})
        </div>
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          padding: 12, 
          background: '#f8f9fa', 
          border: '1px solid #ddd',
          borderRadius: 4,
          overflowX: 'auto',
          minHeight: 80
        }}>
          {sortedClips.map(clip => (
            <ClipItem
              key={clip.id}
              clip={clip}
              isSelected={clip.id === selectedId}
              onSelect={() => select(clip.id)}
              pixelsPerSecond={PIXELS_PER_SECOND}
            />
          ))}
        </div>
      </div>

      {/* Trim Controls for Selected Clip */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 'bold' }}>
          TRIM SELECTED CLIP: {sel.name}
        </div>
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
  )
}

