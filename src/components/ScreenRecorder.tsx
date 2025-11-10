import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'

interface RecordingSource {
  id: string | null
  name: string
  type: 'screen' | 'window' | 'webcam' | 'none'
  stream: MediaStream | null
}

interface RecordingTrack {
  trackId: string
  label: string
  source: RecordingSource
  size: number // 0.15, 0.25, 0.35, 0.5 for overlays
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

interface ScreenRecorderProps {
  onRecordingStateChange?: (isRecording: boolean, time: number, stopFn: () => void) => void
}

export default function ScreenRecorder({ onRecordingStateChange }: ScreenRecorderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'setup' | 'countdown' | 'recording'>('setup')
  const [availableSources, setAvailableSources] = useState<Array<{ id: string; name: string; thumbnail: string; type: 'screen' | 'window' }>>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [countdown, setCountdown] = useState(3)
  
  // Recording tracks: main + 4 overlays
  const [tracks, setTracks] = useState<RecordingTrack[]>([
    { trackId: 'main', label: 'Main Screen', source: { id: null, name: 'None', type: 'none', stream: null }, size: 1, position: 'top-left' },
    { trackId: 'overlay-1', label: 'Overlay 1', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'bottom-right' },
    { trackId: 'overlay-2', label: 'Overlay 2', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'top-right' },
    { trackId: 'overlay-3', label: 'Overlay 3', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'bottom-left' },
    { trackId: 'overlay-4', label: 'Overlay 4', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'top-left' }
  ])
  
  const [selectingTrack, setSelectingTrack] = useState<string | null>(null)
  const [isCompositing, setIsCompositing] = useState(false)
  const [compositingProgress, setCompositingProgress] = useState(0)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingIntervalRef = useRef<number | null>(null)
  
  // Track multiple recorders for multi-source recording
  const recordersRef = useRef<Map<string, {
    recorder: MediaRecorder,
    chunks: Blob[],
    stream: MediaStream
  }>>(new Map())
  
  const addClips = useStore(s => s.addClips)
  
  // Listen for export progress during compositing
  useEffect(() => {
    if (window.clappper && isCompositing) {
      window.clappper.onExportProgress((p: number) => setCompositingProgress(p))
    }
  }, [isCompositing])
  
  // Notify parent of recording state changes
  useEffect(() => {
    if (onRecordingStateChange) {
      onRecordingStateChange(isRecording, recordingTime, stopRecording)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, recordingTime])
  
  const loadSources = async () => {
    try {
      const sourcesData = await window.clappper.getScreenSources()
      console.log('Raw sources from desktopCapturer:', sourcesData)
      console.log('Number of sources:', sourcesData.length)
      setAvailableSources(sourcesData.map(s => ({ ...s, type: s.name.includes('Screen') ? 'screen' as const : 'window' as const })))
    } catch (err) {
      console.error('Failed to get screen sources:', err)
      alert('Failed to get screen sources')
    }
  }
  
  useEffect(() => {
    if (isOpen && step === 'setup') {
      loadSources()
    }
  }, [isOpen, step])
  
  const selectSource = async (trackId: string, sourceId: string, sourceName: string, sourceType: 'screen' | 'window' | 'webcam') => {
    try {
      let stream: MediaStream
      
      if (sourceType === 'webcam') {
        // Get webcam stream
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1920, height: 1080 },
          audio: false
        })
      } else {
        // Get screen/window stream
        stream = await (navigator.mediaDevices as any).getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: 1920,
              maxWidth: 1920,
              minHeight: 1080,
              maxHeight: 1080
            }
          }
        })
      }
      
      setTracks(prev => prev.map(t => 
        t.trackId === trackId 
          ? { ...t, source: { id: sourceId, name: sourceName, type: sourceType, stream } }
          : t
      ))
      
      setSelectingTrack(null)
    } catch (err) {
      console.error('Failed to get media stream:', err)
      alert('Failed to access source. Make sure you have permission.')
    }
  }
  
  const updateTrackSize = (trackId: string, size: number) => {
    setTracks(prev => prev.map(t => t.trackId === trackId ? { ...t, size } : t))
  }
  
  const updateTrackPosition = (trackId: string, position: RecordingTrack['position']) => {
    setTracks(prev => prev.map(t => t.trackId === trackId ? { ...t, position } : t))
  }
  
  const clearTrackSource = (trackId: string) => {
    setTracks(prev => prev.map(t => {
      if (t.trackId === trackId && t.source.stream) {
        t.source.stream.getTracks().forEach(track => track.stop())
        return { ...t, source: { id: null, name: 'None', type: 'none', stream: null } }
      }
      return t
    }))
  }
  
  const startRecording = async () => {
    try {
      console.log('Starting multi-source recording...')
      const mainTrack = tracks.find(t => t.trackId === 'main')
      if (!mainTrack || !mainTrack.source.stream) {
        alert('Please select a main screen source')
        return
      }
      
      // Get all active tracks (main + overlays with streams)
      const activeTracks = tracks.filter(t => t.source.stream !== null)
      console.log(`Recording ${activeTracks.length} source(s):`, activeTracks.map(t => t.label))
      
      // Show countdown first
      setStep('countdown')
      setCountdown(3)
      
      // Countdown: 3, 2, 1...
      for (let i = 3; i > 0; i--) {
        setCountdown(i)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // Now switch to recording view
      setStep('recording')
      setIsRecording(true)
      setRecordingTime(0)
      
      // Start recording timer
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
      
      // --- Prepare microphone (optional) - add to main stream only ---
      let micStream: MediaStream | null = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        console.log('Microphone audio captured')
      } catch (err) {
        console.warn('Could not capture microphone audio:', err)
      }
      
      // --- Pick a supported codec ---
      const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm' // generic
      ]
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || ''
      if (!mimeType) {
        console.warn('No preferred WebM codec reported as supported. Using default MediaRecorder with no mimeType.')
      } else {
        console.log('Using codec:', mimeType)
      }
      
      // --- Start a MediaRecorder for each active track ---
      recordersRef.current.clear()
      
      for (const track of activeTracks) {
        const stream = track.source.stream!
        
        // Add microphone audio to main track only
        let recordStream: MediaStream
        if (track.trackId === 'main' && micStream) {
          recordStream = new MediaStream()
          stream.getVideoTracks().forEach(t => recordStream.addTrack(t))
          micStream.getAudioTracks().forEach(t => recordStream.addTrack(t))
          console.log(`Main track with microphone audio`)
        } else {
          recordStream = stream
        }
        
        const chunks: Blob[] = []
        const recorder = new MediaRecorder(
          recordStream,
          mimeType ? { mimeType, videoBitsPerSecond: 5000000 } : { videoBitsPerSecond: 5000000 }
        )
        
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data)
          }
        }
        
        recorder.onerror = (e: any) => {
          console.error(`MediaRecorder error for ${track.trackId}:`, e?.error || e)
        }
        
        recorder.onstart = () => {
          console.log(`MediaRecorder started for ${track.trackId}`)
        }
        
        recordersRef.current.set(track.trackId, {
          recorder,
          chunks,
          stream: recordStream
        })
        
        // Start recording with timeslice for seekability
        recorder.start(1000)
      }
      
      // Store mic stream for cleanup
      ;(mediaRecorderRef.current as any) = { __micStream: micStream }
      
      console.log('All recorders started successfully')
    } catch (err) {
      console.error('Failed to start recording:', err)
      alert(`Failed to start recording: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setIsRecording(false)
      setStep('setup')
    }
  }
  
  const stopRecording = async () => {
    if (!isRecording) return
    
    setIsRecording(false)
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
    
    console.log('Stopping all recorders...')
    
    // Stop all recorders
    const stopPromises: Promise<void>[] = []
    for (const [trackId, { recorder }] of recordersRef.current.entries()) {
      stopPromises.push(new Promise<void>((resolve) => {
        recorder.onstop = () => {
          console.log(`Recorder stopped for ${trackId}`)
          resolve()
        }
        recorder.stop()
      }))
    }
    
    // Wait for all recorders to stop
    await Promise.all(stopPromises)
    console.log('All recorders stopped')
    
    // Now composite the recordings
    await compositeRecordings()
  }
  
  const compositeRecordings = async () => {
    try {
      console.log('Starting compositing process...')
      
      // If only one source (main only), skip compositing
      if (recordersRef.current.size === 1) {
        console.log('Single source detected, saving directly without compositing')
        const mainEntry = recordersRef.current.get('main')
        if (mainEntry) {
          await saveSingleRecording(mainEntry.chunks)
        }
        return
      }
      
      // Show compositing modal
      setIsCompositing(true)
      setCompositingProgress(0)
      
      // Create temp directory for recordings
      const tempDir = await window.clappper.createTempDir()
      console.log('Temp directory created:', tempDir)
      
      // Save all recordings to temp files
      const tempFiles: Array<{ trackId: string; path: string; track: RecordingTrack }> = []
      
      for (const [trackId, { chunks }] of recordersRef.current.entries()) {
        const track = tracks.find(t => t.trackId === trackId)!
        const blob = new Blob(chunks, { type: 'video/webm' })
        
        if (blob.size === 0) {
          console.warn(`No data captured for ${trackId}, skipping`)
          continue
        }
        
        const tempPath = `${tempDir}/${trackId}.webm`
        const reader = new FileReader()
        
        await new Promise<void>((resolve, reject) => {
          reader.onloadend = async () => {
            try {
              const base64data = reader.result as string
              await window.clappper.saveRecording(tempPath, base64data)
              tempFiles.push({ trackId, path: tempPath, track })
              console.log(`Saved ${trackId} to ${tempPath}`)
              resolve()
            } catch (err) {
              reject(err)
            }
          }
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
      }
      
      if (tempFiles.length === 0) {
        alert('Recording failed: No data was captured.')
        cleanup()
        setIsCompositing(false)
        return
      }
      
      // Get save path for final output
      const savePath = await window.clappper.savePath('recording.mp4')
      if (!savePath) {
        // User cancelled, clean up temp files
        await window.clappper.cleanupTempDir(tempDir)
        cleanup()
        setIsCompositing(false)
        return
      }
      
      // Build PiP export configuration
      const mainFile = tempFiles.find(f => f.trackId === 'main')
      const overlayFiles = tempFiles.filter(f => f.trackId !== 'main')
      
      if (!mainFile) {
        alert('Main recording not found')
        await window.clappper.cleanupTempDir(tempDir)
        cleanup()
        setIsCompositing(false)
        return
      }
      
      // Call export:pip with the recorded streams
      // Pass position and size for each overlay
      const pipConfig = {
        mainClip: {
          input: mainFile.path,
          start: 0,
          end: 999999 // Use full duration
        },
        overlayClips: overlayFiles.map(f => ({
          input: f.path,
          start: 0,
          end: 999999, // Use full duration
          position: f.track.position,
          size: f.track.size
        })),
        outPath: savePath,
        pipPosition: 'bottom-right', // Default fallback (not used when per-overlay positions are provided)
        pipSize: 0.25, // Default fallback (not used when per-overlay sizes are provided)
        preset: 'fast' // Use fast preset for screen recordings to speed up compositing
      }
      
      console.log('Starting FFmpeg compositing with config:', pipConfig)
      
      const result = await window.clappper.exportPip(pipConfig)
      
      // Clean up compositing modal
      setIsCompositing(false)
      setCompositingProgress(0)
      
      if (result.ok) {
        // Clean up temp files
        await window.clappper.cleanupTempDir(tempDir)
        
        // Probe the video to get its actual duration and dimensions
        const metadata = await window.clappper.ffprobe(savePath)
        const duration = metadata.format.duration || 0
        const videoStream = metadata.streams.find(s => s.codec_type === 'video')
        
        // Find the highest order number on the main track to append after existing clips
        const allClips = useStore.getState().getAllClips()
        const mainTrackClips = allClips.filter((c: any) => c.trackId === 'main')
        const maxOrder = mainTrackClips.length > 0 
          ? Math.max(...mainTrackClips.map((c: any) => c.order))
          : -1
        
        // Add clip to timeline at the end
        const clip = {
          id: crypto.randomUUID(),
          name: 'Multi-Source Recording',
          path: savePath,
          start: 0,
          end: duration,
          duration: duration,
          width: videoStream?.width || 1920,
          height: videoStream?.height || 1080,
          order: maxOrder + 1,
          trackId: 'main'
        }
        addClips([clip])
        
        alert(`Recording saved to:\n${savePath}`)
        cleanup()
        setIsOpen(false)
      } else {
        // Keep temp files on error
        alert(`Compositing failed. Temp files preserved at:\n${tempDir}\n\nError: ${'message' in result ? result.message : 'Unknown error'}`)
        cleanup()
      }
      
    } catch (err) {
      console.error('Compositing error:', err)
      setIsCompositing(false)
      alert(`Compositing failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      cleanup()
    }
  }
  
  const saveSingleRecording = async (chunks: Blob[]) => {
    try {
      const blob = new Blob(chunks, { type: 'video/webm' })
      
      if (blob.size === 0) {
        alert('Recording failed: No data was captured.')
        cleanup()
        return
      }
      
      const savePath = await window.clappper.savePath('recording.webm')
      if (!savePath) {
        cleanup()
        return
      }
      
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64data = reader.result as string
        try {
          await window.clappper.saveRecording(savePath, base64data)
          
          // Probe the video to get its actual duration and dimensions
          const metadata = await window.clappper.ffprobe(savePath)
          const duration = metadata.format.duration || 0
          const videoStream = metadata.streams.find(s => s.codec_type === 'video')
          
          // Find the highest order number on the main track to append after existing clips
          const allClips = useStore.getState().getAllClips()
          const mainTrackClips = allClips.filter((c: any) => c.trackId === 'main')
          const maxOrder = mainTrackClips.length > 0 
            ? Math.max(...mainTrackClips.map((c: any) => c.order))
            : -1
          
          const clip = {
            id: crypto.randomUUID(),
            name: 'Screen Recording',
            path: savePath,
            start: 0,
            end: duration,
            duration: duration,
            width: videoStream?.width || 1920,
            height: videoStream?.height || 1080,
            order: maxOrder + 1,
            trackId: 'main'
          }
          addClips([clip])
          
          alert(`Recording saved to:\n${savePath}`)
          cleanup()
          setIsOpen(false)
        } catch (err) {
          console.error('Failed to save recording:', err)
          alert('Failed to save recording')
        }
      }
      reader.readAsDataURL(blob)
    } catch (err) {
      console.error('Save error:', err)
      alert(`Failed to save recording: ${err instanceof Error ? err.message : 'Unknown error'}`)
      cleanup()
    }
  }
  
  const cleanup = () => {
    // Stop all selected source tracks (display + overlays)
    tracks.forEach(track => {
      track.source.stream?.getTracks().forEach(t => t.stop())
    })
    
    // Stop microphone if we started it
    const mr = mediaRecorderRef.current as any
    const micStream: MediaStream | undefined = mr?.__micStream
    micStream?.getTracks().forEach(t => t.stop())
    
    // Clear timer
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
    
    // Clear recorders
    recordersRef.current.clear()
    
    // Reset
    setTracks(prev => prev.map(t => ({
      ...t,
      source: { id: null, name: 'None', type: 'none', stream: null }
    })))
    mediaRecorderRef.current = null
    setStep('setup')
    setIsRecording(false)
    setRecordingTime(0)
  }
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  
  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          padding: '8px 16px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 'bold',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      >
        🎬 Record Screen
      </button>
    )
  }
  
  return (
    <>
      {/* Compositing Progress Modal */}
      {isCompositing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 32,
            maxWidth: 500,
            width: '90%',
            textAlign: 'center'
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 'bold' }}>
              Compositing Recording...
            </h2>
            <p style={{ margin: '0 0 24px 0', color: '#666', fontSize: 14 }}>
              Combining multiple video sources using FFmpeg
            </p>
            
            <div style={{
              width: '100%',
              height: 24,
              background: '#e0e0e0',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 12
            }}>
              <div style={{
                width: `${compositingProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                transition: 'width 0.3s ease'
              }} />
            </div>
            
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>
              {compositingProgress}%
            </div>
          </div>
        </div>
      )}
      
      {/* Only show UI for setup and countdown, hide during recording */}
      {step !== 'recording' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            maxWidth: step === 'countdown' ? 400 : 1000,
            maxHeight: '90vh',
            overflowY: 'auto',
            width: '90%'
          }}>
          {step === 'setup' ? (
            <>
              <h2 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 'bold' }}>
                Multi-Source Screen Recorder
              </h2>
            <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: 14 }}>
              Configure your recording sources. Main screen is required, overlays are optional.
            </p>
            
            {/* Track Configuration */}
            <div style={{ marginBottom: 24 }}>
              {tracks.map((track, index) => (
                <div key={track.trackId} style={{
                  border: '2px solid #ddd',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 12,
                  background: track.source.stream ? '#e8f5e9' : '#fff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 16 }}>{track.label}</strong>
                      {index === 0 && <span style={{ marginLeft: 8, color: '#e74c3c', fontSize: 12 }}>*Required</span>}
                    </div>
                    <div style={{ fontSize: 14, color: '#666' }}>
                      {track.source.name}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setSelectingTrack(track.trackId)}
                      style={{
                        padding: '6px 12px',
                        background: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12
                      }}
                    >
                      Select Source
                    </button>
                    
                    {track.source.stream && (
                      <button
                        onClick={() => clearTrackSource(track.trackId)}
                        style={{
                          padding: '6px 12px',
                          background: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        Clear
                      </button>
                    )}
                    
                    {index > 0 && (
                      <>
                        <select
                          value={track.size}
                          onChange={(e) => updateTrackSize(track.trackId, parseFloat(e.target.value))}
                          style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }}
                        >
                          <option value={0.15}>Small (15%)</option>
                          <option value={0.25}>Medium (25%)</option>
                          <option value={0.35}>Large (35%)</option>
                          <option value={0.5}>XLarge (50%)</option>
                        </select>
                        
                        <select
                          value={track.position}
                          onChange={(e) => updateTrackPosition(track.trackId, e.target.value as any)}
                          style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }}
                        >
                          <option value="top-left">Top Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-right">Bottom Right</option>
                        </select>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Source Selection Modal */}
            {selectingTrack && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1001
              }}>
                <div style={{
                  background: 'white',
                  borderRadius: 8,
                  padding: 24,
                  maxWidth: 800,
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  width: '80%'
                }}>
                  <h3 style={{ margin: '0 0 16px 0' }}>Select Source</h3>
                  
                  {/* Webcam Option */}
                  <div
                    onClick={() => selectSource(selectingTrack, 'webcam', 'Webcam', 'webcam')}
                    style={{
                      border: '2px solid #ddd',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 16,
                      cursor: 'pointer',
                      textAlign: 'center',
                      background: '#f8f9fa'
                    }}
                  >
                    <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
                    <div style={{ fontWeight: 'bold' }}>Webcam</div>
                  </div>
                  
                  {/* Screen/Window Sources */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 12
                  }}>
                    {availableSources.map(source => (
                      <div
                        key={source.id}
                        onClick={() => selectSource(selectingTrack, source.id, source.name, source.type)}
                        style={{
                          border: '2px solid #ddd',
                          borderRadius: 8,
                          padding: 12,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <img 
                          src={source.thumbnail} 
                          alt={source.name}
                          style={{ width: '100%', borderRadius: 4, marginBottom: 8 }}
                        />
                        <div style={{ fontSize: 11, fontWeight: 'bold', textAlign: 'center', wordBreak: 'break-word' }}>
                          {source.name}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <button
                      onClick={() => setSelectingTrack(null)}
                      style={{
                        padding: '8px 16px',
                        background: '#95a5a6',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  cleanup()
                  setIsOpen(false)
                }}
                style={{
                  padding: '8px 16px',
                  background: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={startRecording}
                disabled={!tracks[0].source.stream}
                style={{
                  padding: '8px 16px',
                  background: tracks[0].source.stream ? '#e74c3c' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: tracks[0].source.stream ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                🔴 Start Recording
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Countdown View */}
            <div style={{
              textAlign: 'center',
              padding: 60,
              fontSize: 120,
              fontWeight: 'bold',
              color: '#e74c3c',
              fontFamily: 'monospace'
            }}>
              {countdown}
            </div>
            <div style={{
              textAlign: 'center',
              fontSize: 18,
              color: '#666'
            }}>
              Recording starts in {countdown}...
            </div>
          </>
        )}
        </div>
      </div>
      )}
      
      {/* Hidden canvas for recording */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
    </>
  )
}

