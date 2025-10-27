import React, { useState } from 'react'
import { Track, Clip } from '../lib/types'
import ClipItem from './ClipItem'

interface TrackLaneProps {
  track: Track
  selectedId?: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  pixelsPerSecond: number
  onDragStart: (index: number) => (e: React.DragEvent) => void
  onDragOver: (index: number) => (e: React.DragEvent) => void
  onDrop: (index: number) => (e: React.DragEvent) => void
  dragOverIndex: number | null
  draggedIndex: number | null
  onDropOnTrack?: (e: React.DragEvent) => void
}

export default function TrackLane({
  track,
  selectedId,
  onSelect,
  onDelete,
  onReorder,
  pixelsPerSecond,
  onDragStart,
  onDragOver,
  onDrop,
  dragOverIndex,
  draggedIndex,
  onDropOnTrack
}: TrackLaneProps) {
  const sortedClips = [...track.clips].sort((a, b) => a.order - b.order)
  const isPiP = track.type === 'overlay'

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (onDropOnTrack) {
      onDropOnTrack(e)
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ 
        fontSize: 11, 
        color: '#666', 
        marginBottom: 4, 
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <span>{track.name.toUpperCase()}</span>
        {isPiP && (
          <span style={{ 
            fontSize: 9, 
            background: '#9c27b0', 
            color: 'white', 
            padding: '2px 6px', 
            borderRadius: 3,
            fontWeight: 'bold'
          }}>
            PiP
          </span>
        )}
        <span style={{ color: '#999', fontWeight: 'normal' }}>
          ({sortedClips.length} clip{sortedClips.length !== 1 ? 's' : ''})
        </span>
      </div>
      
      <div 
        style={{ 
          display: 'flex', 
          gap: 8, 
          padding: 12, 
          background: isPiP ? '#f3e5f5' : '#f8f9fa', 
          border: isPiP ? '2px dashed #9c27b0' : '1px solid #ddd',
          borderRadius: 4,
          overflowX: 'auto',
          minHeight: track.height,
          position: 'relative'
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {sortedClips.length === 0 ? (
          <div style={{ 
            color: '#999', 
            fontSize: 11, 
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center'
          }}>
            {isPiP ? 'Drop clips here for Picture-in-Picture overlay' : 'Drop clips here'}
          </div>
        ) : (
          sortedClips.map((clip, index) => (
            <ClipItem
              key={clip.id}
              clip={clip}
              isSelected={clip.id === selectedId}
              onSelect={() => onSelect(clip.id)}
              onDelete={() => onDelete(clip.id)}
              pixelsPerSecond={pixelsPerSecond}
              onDragStart={onDragStart(index)}
              onDragOver={onDragOver(index)}
              onDrop={onDrop(index)}
              isDragOver={dragOverIndex === index && draggedIndex !== index}
            />
          ))
        )}
      </div>
    </div>
  )
}

