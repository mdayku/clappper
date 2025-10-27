import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

export default function Player() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { clips, playhead, setPlayhead } = useStore()
  const sel = clips[0]
  const [error, setError] = useState<string | null>(null)
  const trimBoundsRef = useRef({ start: 0, end: 0 })
  const prevTrimRef = useRef({ start: 0, end: 0 })

  // Update trim bounds ref when they change
  useEffect(() => {
    if (sel) {
      trimBoundsRef.current = { start: sel.start, end: sel.end }
    }
  }, [sel?.start, sel?.end])

  // Load video when path changes
  useEffect(() => {
    const v = videoRef.current
    if (!v || !sel) return
    
    setError(null)
    
    // Use file:// protocol with proper Windows path handling
    // All videos are transcoded to H.264 on import for guaranteed compatibility
    let fileUrl = sel.path
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
    
    console.log('Loading video from:', fileUrl)
    v.src = fileUrl
    
    const onTime = () => {
      const currentTime = v.currentTime
      setPlayhead(currentTime)
      // Auto-stop at trim end
      const { start, end } = trimBoundsRef.current
      if (currentTime >= end) {
        v.currentTime = start
        v.pause()
      }
    }
    const onError = (e: Event) => {
      console.error('Video load error for:', fileUrl, e)
      const target = e.target as HTMLVideoElement
      if (target.error) {
        const errorCodes = ['MEDIA_ERR_ABORTED', 'MEDIA_ERR_NETWORK', 'MEDIA_ERR_DECODE', 'MEDIA_ERR_SRC_NOT_SUPPORTED']
        const errorMsg = errorCodes[target.error.code - 1] || 'Unknown error'
        console.error('MediaError:', errorMsg, target.error.message)
        setError(`Failed to load video: ${errorMsg}. The file may be corrupted or codec unsupported by Chromium.`)
      } else {
        setError('Failed to load video. File may be corrupted or unsupported.')
      }
    }
    const onLoadedMetadata = () => {
      // Seek to start point when video loads
      v.currentTime = trimBoundsRef.current.start
    }
    const onPlay = () => {
      // Ensure playback starts from trim start if before it
      const { start } = trimBoundsRef.current
      if (v.currentTime < start) {
        v.currentTime = start
      }
    }
    
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('error', onError)
    v.addEventListener('loadedmetadata', onLoadedMetadata)
    v.addEventListener('play', onPlay)
    
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('error', onError)
      v.removeEventListener('loadedmetadata', onLoadedMetadata)
      v.removeEventListener('play', onPlay)
    }
  }, [sel?.path, setPlayhead]) // Only path dependency - no reload on trim changes

  // Seek video when trim points change
  useEffect(() => {
    const v = videoRef.current
    if (!v || !sel) return
    
    // Only update if video is paused to avoid disrupting playback
    if (v.paused) {
      const prev = prevTrimRef.current
      
      // Determine which handle changed
      if (sel.start !== prev.start) {
        // Start handle moved - show start frame
        v.currentTime = sel.start
      } else if (sel.end !== prev.end) {
        // End handle moved - show end frame (minus a tiny bit to stay within bounds)
        v.currentTime = Math.max(sel.start, sel.end - 0.1)
      }
      
      // Update previous values
      prevTrimRef.current = { start: sel.start, end: sel.end }
    }
  }, [sel?.start, sel?.end])

  if (!sel) {
    return (
      <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111', color: '#999' }}>
        Import a clip to preview
      </div>
    )
  }

  if (error) {
    const handleRemove = () => {
      if (sel && confirm(`Remove "${sel.name}" from timeline?`)) {
        useStore.getState().deleteClip(sel.id)
      }
    }
    
    return (
      <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111', color: '#f88', padding: 20, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>⚠️ {error}</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>{sel.path}</div>
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

  return (
    <div style={{ display:'grid', placeItems:'center', height: 420, background:'#111' }}>
      <video ref={videoRef} controls style={{ maxWidth:'100%', maxHeight:'100%' }} />
    </div>
  )
}

