import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

export default function Player() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { clips, playhead, setPlayhead, selectedId } = useStore()
  const sortedClips = useStore.getState().getClipsSorted()
  const [error, setError] = useState<string | null>(null)
  const [currentClipIndex, setCurrentClipIndex] = useState(0)
  const isPlayingSequence = useRef(false)

  // Calculate cumulative start times for each clip in the sequence
  const clipTimings = sortedClips.map((clip, index) => {
    const prevClips = sortedClips.slice(0, index)
    const cumulativeStart = prevClips.reduce((sum, c) => sum + (c.end - c.start), 0)
    const duration = clip.end - clip.start
    return {
      clip,
      cumulativeStart,
      cumulativeEnd: cumulativeStart + duration,
      duration
    }
  })

  // Get current clip to display
  const currentTiming = clipTimings[currentClipIndex]
  const currentClip = currentTiming?.clip

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

  // Load video when current clip changes
  useEffect(() => {
    const v = videoRef.current
    if (!v || !currentClip) return
    
    setError(null)
    
    const fileUrl = getFileUrl(currentClip.path)
    console.log('Loading clip', currentClipIndex + 1, '/', sortedClips.length, ':', fileUrl)
    v.src = fileUrl
    
    const onError = (e: Event) => {
      console.error('Video load error for:', fileUrl, e)
      const target = e.target as HTMLVideoElement
      if (target.error) {
        const errorCodes = ['MEDIA_ERR_ABORTED', 'MEDIA_ERR_NETWORK', 'MEDIA_ERR_DECODE', 'MEDIA_ERR_SRC_NOT_SUPPORTED']
        const errorMsg = errorCodes[target.error.code - 1] || 'Unknown error'
        setError(`Failed to load video: ${errorMsg}`)
      } else {
        setError('Failed to load video')
      }
    }
    
    const onLoadedMetadata = () => {
      // Seek to clip's trim start
      v.currentTime = currentClip.start
    }

    v.addEventListener('error', onError)
    v.addEventListener('loadedmetadata', onLoadedMetadata)
    
    return () => {
      v.removeEventListener('error', onError)
      v.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [currentClip?.path, currentClipIndex])

  // Handle playback and sequence switching
  useEffect(() => {
    const v = videoRef.current
    if (!v || !currentClip || !currentTiming) return

    const onTimeUpdate = () => {
      const localTime = v.currentTime
      const clipProgress = localTime - currentClip.start
      const sequenceTime = currentTiming.cumulativeStart + clipProgress
      
      setPlayhead(sequenceTime)

      // Check if we've reached the end of the current clip
      if (localTime >= currentClip.end) {
        // Move to next clip if available
        if (currentClipIndex < sortedClips.length - 1) {
          console.log('Switching to next clip:', currentClipIndex + 2, '/', sortedClips.length)
          setCurrentClipIndex(currentClipIndex + 1)
          isPlayingSequence.current = true // Remember we were playing
        } else {
          // End of sequence
          v.pause()
          setPlayhead(clipTimings[clipTimings.length - 1]?.cumulativeEnd || 0)
        }
      }
    }

    const onPlay = () => {
      // Ensure we start from clip's trim start
      if (v.currentTime < currentClip.start) {
        v.currentTime = currentClip.start
      }
    }

    const onLoadedMetadata = () => {
      v.currentTime = currentClip.start
      // If we were playing and switched clips, continue playing
      if (isPlayingSequence.current) {
        v.play()
        isPlayingSequence.current = false
      }
    }

    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('play', onPlay)
    v.addEventListener('loadedmetadata', onLoadedMetadata)

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [currentClip, currentClipIndex, currentTiming, sortedClips.length])

  // When user selects a different clip, jump to it
  useEffect(() => {
    if (!selectedId) return
    const index = sortedClips.findIndex(c => c.id === selectedId)
    if (index !== -1 && index !== currentClipIndex) {
      const v = videoRef.current
      if (v) v.pause() // Pause before switching
      setCurrentClipIndex(index)
    }
  }, [selectedId, sortedClips])

  if (!currentClip || clips.length === 0) {
    return (
      <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111', color: '#999' }}>
        Import a clip to preview
      </div>
    )
  }

  if (error) {
    const handleRemove = () => {
      if (currentClip && confirm(`Remove "${currentClip.name}" from timeline?`)) {
        useStore.getState().deleteClip(currentClip.id)
      }
    }
    
    return (
      <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111', color: '#f88', padding: 20, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>⚠️ {error}</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>{currentClip.path}</div>
          <button 
            onClick={handleRemove}
            style={{ padding: '8px 16px', background: '#c00', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Remove This Clip
          </button>
        </div>
      </div>
    )
  }

  const totalDuration = clipTimings[clipTimings.length - 1]?.cumulativeEnd || 0

  return (
    <div style={{ display:'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111' }}>
        <video ref={videoRef} controls style={{ maxWidth:'100%', maxHeight:'100%' }} />
      </div>
      <div style={{ padding: '8px 16px', background: '#f8f9fa', fontSize: 12, color: '#666' }}>
        <strong>Sequence:</strong> Clip {currentClipIndex + 1} of {sortedClips.length} | 
        <strong> Playing:</strong> {currentClip.name} | 
        <strong> Total:</strong> {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toFixed(1).padStart(4, '0')}
      </div>
    </div>
  )
}
