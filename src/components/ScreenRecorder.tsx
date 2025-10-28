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

export default function ScreenRecorder() {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'setup' | 'recording'>('setup')
  const [availableSources, setAvailableSources] = useState<Array<{ id: string; name: string; thumbnail: string; type: 'screen' | 'window' }>>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  
  // Recording tracks: main + 4 overlays
  const [tracks, setTracks] = useState<RecordingTrack[]>([
    { trackId: 'main', label: 'Main Screen', source: { id: null, name: 'None', type: 'none', stream: null }, size: 1, position: 'top-left' },
    { trackId: 'overlay-1', label: 'Overlay 1', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'bottom-right' },
    { trackId: 'overlay-2', label: 'Overlay 2', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'top-right' },
    { trackId: 'overlay-3', label: 'Overlay 3', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'bottom-left' },
    { trackId: 'overlay-4', label: 'Overlay 4', source: { id: null, name: 'None', type: 'none', stream: null }, size: 0.25, position: 'top-left' }
  ])
  
  const [selectingTrack, setSelectingTrack] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingIntervalRef = useRef<number | null>(null)
  
  const addClips = useStore(s => s.addClips)
  
  const loadSources = async () => {
    try {
      const sourcesData = await window.clappper.getScreenSources()
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
    const mainTrack = tracks.find(t => t.trackId === 'main')
    if (!mainTrack || !mainTrack.source.stream) {
      alert('Please select a main screen source')
      return
    }
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set canvas size to main stream resolution
    canvas.width = 1920
    canvas.height = 1080
    
    setStep('recording')
    setIsRecording(true)
    setRecordingTime(0)
    
    // Start recording timer
    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingTime(t => t + 1)
    }, 1000)
    
    // Composite streams onto canvas
    const drawFrame = () => {
      if (!isRecording) return
      
      // Clear canvas
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Draw main track
      const mainVideo = document.createElement('video')
      mainVideo.srcObject = mainTrack.source.stream
      mainVideo.play()
      
      const drawLoop = () => {
        if (!isRecording) return
        
        // Draw main video
        ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height)
        
        // Draw overlays
        tracks.slice(1).forEach(track => {
          if (!track.source.stream) return
          
          const overlayVideo = document.createElement('video')
          overlayVideo.srcObject = track.source.stream
          overlayVideo.play()
          
          const overlayWidth = canvas.width * track.size
          const overlayHeight = canvas.height * track.size
          
          let x = 0, y = 0
          switch (track.position) {
            case 'top-left':
              x = 16
              y = 16
              break
            case 'top-right':
              x = canvas.width - overlayWidth - 16
              y = 16
              break
            case 'bottom-left':
              x = 16
              y = canvas.height - overlayHeight - 16
              break
            case 'bottom-right':
              x = canvas.width - overlayWidth - 16
              y = canvas.height - overlayHeight - 16
              break
          }
          
          ctx.drawImage(overlayVideo, x, y, overlayWidth, overlayHeight)
        })
        
        requestAnimationFrame(drawLoop)
      }
      
      mainVideo.onloadedmetadata = () => {
        drawLoop()
      }
    }
    
    drawFrame()
    
    // Record canvas stream
    const canvasStream = canvas.captureStream(30) // 30 FPS
    const mediaRecorder = new MediaRecorder(canvasStream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000 // 5 Mbps
    })
    
    mediaRecorderRef.current = mediaRecorder
    const chunks: Blob[] = []
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }
    
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      
      // Save to file
      const savePath = await window.clappper.savePath('recording.webm')
      if (savePath) {
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64data = reader.result as string
          
          try {
            await window.clappper.saveRecording(savePath, base64data)
            
              // Add to timeline
              const clip = {
                id: crypto.randomUUID(),
                name: 'Multi-Source Recording',
                path: savePath,
                start: 0,
                end: 0, // Will be set after transcoding
                duration: 0, // Will be set after transcoding
                order: 0,
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
      } else {
        cleanup()
      }
    }
    
    mediaRecorder.start()
  }
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    }
  }
  
  const cleanup = () => {
    tracks.forEach(track => {
      if (track.source.stream) {
        track.source.stream.getTracks().forEach(t => t.stop())
      }
    })
    
    setTracks(prev => prev.map(t => ({
      ...t,
      source: { id: null, name: 'None', type: 'none', stream: null }
    })))
    
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
        maxWidth: 1000,
        maxHeight: '90vh',
        overflowY: 'auto',
        width: '90%'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 'bold' }}>
          Multi-Source Screen Recorder
        </h2>
        
        {step === 'setup' ? (
          <>
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
            {/* Recording View */}
            <div style={{ marginBottom: 16 }}>
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  background: '#000'
                }}
              />
            </div>
            
            <div style={{
              textAlign: 'center',
              marginBottom: 16,
              fontSize: 32,
              fontWeight: 'bold',
              color: '#e74c3c',
              fontFamily: 'monospace'
            }}>
              🔴 {formatTime(recordingTime)}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={stopRecording}
                style={{
                  padding: '12px 24px',
                  background: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 'bold'
                }}
              >
                ⏹ Stop Recording
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

