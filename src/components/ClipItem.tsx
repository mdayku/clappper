import React from 'react'
import { Clip } from '../lib/types'

interface ClipItemProps {
  clip: Clip
  isSelected: boolean
  onSelect: () => void
  pixelsPerSecond: number
}

export default function ClipItem({ clip, isSelected, onSelect, pixelsPerSecond }: ClipItemProps) {
  const trimmedDuration = clip.end - clip.start
  const width = trimmedDuration * pixelsPerSecond
  
  return (
    <div
      onClick={onSelect}
      style={{
        width: `${width}px`,
        height: '60px',
        background: isSelected ? '#4a9eff' : '#6c757d',
        border: isSelected ? '2px solid #0066cc' : '2px solid #495057',
        borderRadius: '4px',
        padding: '8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: 'white',
        fontSize: '12px',
        userSelect: 'none',
        transition: 'all 0.2s',
        boxShadow: isSelected ? '0 2px 8px rgba(74, 158, 255, 0.4)' : '0 1px 3px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}
    >
      <div style={{ 
        fontWeight: isSelected ? 'bold' : 'normal',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {clip.name}
      </div>
      <div style={{ fontSize: '10px', opacity: 0.9 }}>
        {trimmedDuration.toFixed(1)}s
        {clip.start > 0 || clip.end < clip.duration ? ' (trimmed)' : ''}
      </div>
    </div>
  )
}

