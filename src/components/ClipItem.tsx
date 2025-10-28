import React from 'react'
import { Clip } from '../lib/types'

interface ClipItemProps {
  clip: Clip
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  pixelsPerSecond: number
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  isDragOver: boolean
}

export default function ClipItem({ 
  clip, 
  isSelected, 
  onSelect, 
  onDelete,
  pixelsPerSecond,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver
}: ClipItemProps) {
  const trimmedDuration = clip.end - clip.start
  const width = trimmedDuration * pixelsPerSecond
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation() // Don't trigger onSelect
    if (confirm(`Delete "${clip.name}"?`)) {
      onDelete()
    }
  }
  
  // TODO Phase 9: Implement filmstrip thumbnails (cascading thumbnails across clip width)
  
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      style={{
        width: `${width}px`,
        height: '60px',
        background: isDragOver ? '#ffc107' : (isSelected ? '#4a9eff' : '#6c757d'),
        border: isSelected ? '2px solid #0066cc' : '2px solid #495057',
        borderRadius: '4px',
        padding: '8px',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: 'white',
        fontSize: '12px',
        userSelect: 'none',
        transition: 'all 0.2s',
        boxShadow: isSelected ? '0 2px 8px rgba(74, 158, 255, 0.4)' : '0 1px 3px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        opacity: isDragOver ? 0.7 : 1,
        position: 'relative'
      }}
    >
      <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)'
      }}>
        <div style={{ 
          fontWeight: isSelected ? 'bold' : 'normal',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1
        }}>
          {clip.name}
        </div>
        <button
          onClick={handleDelete}
          style={{
            background: 'rgba(255,0,0,0.8)',
            border: 'none',
            color: 'white',
            padding: '2px 6px',
            fontSize: '10px',
            borderRadius: '3px',
            cursor: 'pointer',
            marginLeft: '4px'
          }}
          title="Delete clip"
        >
          ✕
        </button>
      </div>
      <div style={{ fontSize: '10px', opacity: 0.9, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
        {trimmedDuration.toFixed(1)}s
        {clip.start > 0 || clip.end < clip.duration ? ' (trimmed)' : ''}
      </div>
    </div>
  )
}

