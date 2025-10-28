import React, { useState } from 'react'
import { useStore } from '../store'
import ScreenRecorder from './ScreenRecorder'

export default function Toolbar() {
  const [progress, setProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [transcodeProgress, setTranscodeProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)

  React.useEffect(() => {
    if (window.clappper) {
      window.clappper.onExportProgress((p: number) => setProgress(p))
      window.clappper.onTranscodeProgress((p: number) => setTranscodeProgress(p))
      
      // Listen for menu events
      window.clappper.onMenuSaveProject(() => {
        console.log('Menu: Save Project')
        saveProject()
      })
      window.clappper.onMenuLoadProject(() => {
        console.log('Menu: Load Project')
        loadProject()
      })
    }
  }, [])

  const onImport = async () => {
    try {
      setError(null)
      setIsImporting(true)
      setTranscodeProgress(0)
      
      const files: string[] = await window.clappper.openFiles()
      if (files.length === 0) {
        setIsImporting(false)
        return // User cancelled
      }
      
      const metas = await Promise.all(files.map(async f => {
        try {
          const info = await window.clappper.ffprobe(f)
          const dur = Number(info.format.duration) || 0
          if (dur === 0) {
            console.warn(`File ${f} has zero duration, skipping`)
            return null
          }
          const v = info.streams.find((s) => s.codec_type === 'video')
          if (!v) {
            console.warn(`File ${f} has no video stream, skipping`)
            return null
          }
          
          // Transcode everything to H.264 for guaranteed Chromium compatibility
          // Chromium's codec support is limited: H.264 works, but H.265, mpeg4, VP8 variants often fail
          const needsTranscode = v.codec_name !== 'h264'
          console.log(`Video codec: ${v.codec_name}, needs transcode: ${needsTranscode}`)
          
          return { 
            path: f, 
            duration: dur, 
            width: v?.width || 0, 
            height: v?.height || 0,
            codecName: v.codec_name,
            needsTranscode
          }
        } catch (err) {
          console.error(`Failed to probe ${f}:`, err)
          return null
        }
      }))
      
      const validMetas = metas.filter(m => m !== null)
      if (validMetas.length === 0) {
        setError('No valid video files found')
        setIsImporting(false)
        return
      }
      
      // Transcode videos that need it
      const processedMetas = await Promise.all(validMetas.map(async (m) => {
        if (!m!.needsTranscode) return m
        
        try {
          const pathParts = m!.path.split(/[/\\]/)
          const fileName = pathParts[pathParts.length - 1]
          const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
          const tempPath = `${m!.path}.h264.mp4`
          
          console.log(`Transcoding ${fileName} from ${m!.codecName} to H.264...`)
          setError(`Converting ${fileName} to compatible format...`)
          
          await window.clappper.transcode({ input: m!.path, output: tempPath })
          
          return { ...m!, path: tempPath, originalPath: m!.path }
        } catch (err) {
          console.error(`Transcode failed for ${m!.path}:`, err)
          setError(`Failed to convert ${m!.path}. Skipping this file.`)
          return null
        }
      }))
      
      const finalMetas = processedMetas.filter(m => m !== null)
      
      const payload = finalMetas.map((m) => {
        // Extract filename from path for display name
        const pathParts = ('originalPath' in m! ? m!.originalPath : m!.path).split(/[/\\]/)
        const fileName = pathParts[pathParts.length - 1]
        
        // TODO Phase 9: Generate filmstrip thumbnails here
        
        return {
          id: crypto.randomUUID(), 
          path: m!.path,
          originalPath: 'originalPath' in m! ? m!.originalPath : undefined,
          name: fileName,
          duration: m!.duration, 
          start: 0, 
          end: m!.duration,
          order: 0, // Will be reassigned by store
          trackId: 'main', // Default to main track
          width: m!.width, 
          height: m!.height
        }
      })
      
      useStore.getState().addClips(payload)
      setError(null)
      setIsImporting(false)
      setTranscodeProgress(0)
    } catch (err) {
      console.error('Import failed:', err)
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setIsImporting(false)
    }
  }

  const handleExportClick = () => {
    setShowExportModal(true)
  }

  const exportSelected = async () => {
    try {
      const mainTrack = useStore.getState().getMainTrack()
      const allOverlayTracks = useStore.getState().getOverlayTracks()
      const pipSettings = useStore.getState().pipSettings
      const exportSettings = useStore.getState().exportSettings
      
      const mainClips = mainTrack.clips
      // Get clips from ALL overlay tracks that have clips
      const overlayClips = allOverlayTracks.flatMap(track => track.clips)
      
      // Validation: Block export on empty timeline
      if (mainClips.length === 0) {
        setError('Cannot export: Main track is empty. Please add at least one video clip.')
        return
      }
      
      // Validation: Check for zero-duration clips
      const zeroDurationClips = mainClips.filter(c => c.end <= c.start)
      if (zeroDurationClips.length > 0) {
        setError(`Cannot export: ${zeroDurationClips.length} clip(s) have zero or negative duration. Please adjust trim points.`)
        return
      }
      
      setShowExportModal(false)
      setError(null)
      
      // Validate all clips
      for (const clip of [...mainClips, ...overlayClips]) {
        if (clip.end <= clip.start) {
          setError(`Invalid trim range for "${clip.name}": end must be greater than start`)
          return
        }
      }
      
      // Show save dialog
      const defaultName = mainClips.length === 1 && overlayClips.length === 0
        ? mainClips[0].name.replace(/\.[^.]+$/, '') + '_exported.mp4'
        : 'clappper_export.mp4'
      const savePath = await window.clappper.savePath(defaultName)
      
      if (!savePath) {
        // User cancelled
        return
      }
      
      setIsExporting(true)
      setProgress(0)
      
      // Check if we need PiP export (main track + at least one overlay)
      if (mainClips.length > 0 && overlayClips.length > 0) {
        // PiP export: Export first main clip with ALL overlay clips
        console.log(`Exporting PiP: ${mainClips.length} main clip(s), ${overlayClips.length} overlay clip(s)`)
        await window.clappper.exportPip({
          mainClip: {
            input: mainClips[0].path,
            start: mainClips[0].start,
            end: mainClips[0].end
          },
          overlayClips: overlayClips.map(clip => ({
            input: clip.path,
            start: clip.start,
            end: clip.end
          })),
          outPath: savePath,
          pipPosition: pipSettings.position,
          pipSize: pipSettings.size,
          keyframes: pipSettings.keyframes.length > 0 ? pipSettings.keyframes : undefined,
          customX: pipSettings.customX,
          customY: pipSettings.customY,
          resolution: exportSettings.resolution,
          preset: exportSettings.preset
        })
      } else if (mainClips.length === 1) {
        // Single clip: use trim export
        await window.clappper.exportTrim({ 
          input: mainClips[0].path, 
          outPath: savePath, 
          start: mainClips[0].start, 
          end: mainClips[0].end,
          resolution: exportSettings.resolution,
          preset: exportSettings.preset
        })
      } else {
        // Multiple clips on main track: concatenate
        const clipSegments = mainClips.map(clip => ({
          input: clip.path,
          start: clip.start,
          end: clip.end
        }))
        
        await window.clappper.exportConcat({
          clips: clipSegments,
          outPath: savePath,
          resolution: exportSettings.resolution,
          preset: exportSettings.preset
        })
      }
      
      setProgress(100)
      setTimeout(() => {
        setProgress(0)
        setIsExporting(false)
        alert(`Export complete!\nSaved to: ${savePath}`)
      }, 500)
    } catch (err) {
      console.error('Export failed:', err)
      setIsExporting(false)
      
      // Provide more helpful error messages
      let errorMessage = 'Export failed: '
      if (err instanceof Error) {
        const msg = err.message.toLowerCase()
        if (msg.includes('enoent') || msg.includes('no such file')) {
          errorMessage += 'File not found. The video file may have been moved or deleted.'
        } else if (msg.includes('enospc') || msg.includes('no space')) {
          errorMessage += 'Not enough disk space. Please free up some space and try again.'
        } else if (msg.includes('eacces') || msg.includes('permission')) {
          errorMessage += 'Permission denied. Please check file permissions or try a different location.'
        } else if (msg.includes('codec')) {
          errorMessage += 'Unsupported video codec. Try transcoding the video first.'
        } else {
          errorMessage += err.message
        }
      } else {
        errorMessage += 'Unknown error occurred.'
      }
      
      setError(errorMessage)
    }
  }

  const clearAll = () => {
    const allClips = useStore.getState().getAllClips()
    if (allClips.length === 0) return
    if (confirm(`Remove all ${allClips.length} clip(s) from timeline?`)) {
      useStore.getState().setClips([])
      setError(null)
    }
  }
  
  const saveProject = async () => {
    try {
      const savePath = await window.clappper.savePath('project.json')
      if (!savePath) return
      
      const store = useStore.getState()
      const state = {
        version: 1,
        tracks: store.tracks,
        selectedId: store.selectedId,
        playhead: store.playhead,
        pipSettings: store.pipSettings,
        exportSettings: store.exportSettings,
        visibleOverlayCount: store.visibleOverlayCount,
        timestamp: Date.now()
      }
      
      await window.clappper.saveProject(savePath, state)
      alert(`Project saved to:\n${savePath}`)
    } catch (err) {
      console.error('Save project failed:', err)
      setError(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }
  
  const loadProject = async () => {
    try {
      const files = await window.clappper.openFiles()
      if (files.length === 0) return
      
      const filePath = files[0]
      if (!filePath.endsWith('.json')) {
        setError('Please select a .json project file')
        return
      }
      
      const { ok, state } = await window.clappper.loadProject(filePath)
      if (ok && state) {
        const store = useStore.getState()
        store.tracks = state.tracks || store.tracks
        store.selectedId = state.selectedId || null
        store.playhead = state.playhead || 0
        store.pipSettings = state.pipSettings || store.pipSettings
        store.exportSettings = state.exportSettings || store.exportSettings
        store.visibleOverlayCount = state.visibleOverlayCount ?? store.visibleOverlayCount
        
        alert('Project loaded successfully!')
      }
    } catch (err) {
      console.error('Load project failed:', err)
      setError(`Load failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const allClips = useStore.getState().getAllClips()
  const visibleOverlayCount = useStore(s => s.visibleOverlayCount)
  const setVisibleOverlayCount = useStore(s => s.setVisibleOverlayCount)
  const exportSettings = useStore(s => s.exportSettings)
  const setExportSettings = useStore(s => s.setExportSettings)

  return (
    <div style={{ display:'flex', flexDirection: 'column', borderBottom: '1px solid #eee' }}>
      <div style={{ display:'flex', gap: 8, padding: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onImport} disabled={isExporting || isImporting}>
          {isImporting ? 'Importing...' : 'Import'}
        </button>
        <ScreenRecorder />
        <button onClick={handleExportClick} disabled={isExporting || isImporting || allClips.length === 0}>
          {isExporting ? 'Exporting...' : 'Export'}
        </button>
        <button 
          onClick={clearAll} 
          disabled={isExporting || isImporting || allClips.length === 0}
          style={{ color: '#c00' }}
        >
          Clear All
        </button>
        
        {/* Overlay Track Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <label style={{ fontSize: 12, color: '#666' }}>Overlay Tracks:</label>
          <select 
            value={visibleOverlayCount}
            onChange={(e) => setVisibleOverlayCount(parseInt(e.target.value))}
            style={{ 
              padding: '4px 8px', 
              fontSize: 12,
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            <option value="0">None</option>
            <option value="1">1 Track</option>
            <option value="2">2 Tracks</option>
            <option value="3">3 Tracks</option>
            <option value="4">4 Tracks</option>
          </select>
        </div>
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {allClips.length > 0 && <span style={{ fontSize: 12, color: '#666' }}>{allClips.length} clip(s)</span>}
          {transcodeProgress > 0 && transcodeProgress < 100 && <span style={{ fontSize: 12, color: '#666' }}>Converting: {transcodeProgress.toFixed(0)}%</span>}
          {progress > 0 && progress < 100 && <span style={{ fontSize: 12, color: '#666' }}>Export: {progress.toFixed(0)}%</span>}
        </div>
      </div>
      {error && (
        <div style={{ padding: '4px 8px', background: '#fee', color: '#c00', fontSize: 12, borderTop: '1px solid #fcc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button 
            onClick={() => setError(null)} 
            style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', border: '1px solid #c00', color: '#c00', cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )}
      
      {/* Export Settings Modal */}
      {(showExportModal || isExporting) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            minWidth: 400,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 'bold' }}>
              {isExporting ? 'Exporting...' : 'Export Settings'}
            </h2>
            
            {isExporting ? (
              // Show progress during export
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ 
                    width: '100%', 
                    height: 24, 
                    background: '#f0f0f0', 
                    borderRadius: 12,
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #4CAF50, #45a049)',
                      transition: 'width 0.3s ease',
                      borderRadius: 12
                    }} />
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: progress > 50 ? 'white' : '#333'
                    }}>
                      {progress.toFixed(0)}%
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: '#666', textAlign: 'center', margin: '0 0 16px 0' }}>
                  Please wait... This may take a few minutes.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={async () => {
                      try {
                        await window.clappper.cancelExport()
                        setIsExporting(false)
                        setProgress(0)
                        setError('Export cancelled')
                      } catch (err) {
                        console.error('Cancel failed:', err)
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      fontSize: 14,
                      border: '1px solid #c00',
                      borderRadius: 4,
                      background: 'white',
                      color: '#c00',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Cancel Export
                  </button>
                </div>
              </div>
            ) : (
              // Show settings form
              <div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 'bold', marginBottom: 8, color: '#333' }}>
                Resolution
              </label>
              <select 
                value={exportSettings.resolution}
                onChange={(e) => setExportSettings({ resolution: e.target.value as any })}
                style={{ 
                  width: '100%',
                  padding: '8px 12px', 
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                <option value="360p">360p (Low Quality)</option>
                <option value="480p">480p (SD)</option>
                <option value="720p">720p (HD)</option>
                <option value="1080p">1080p (Full HD)</option>
                <option value="source">Source (No Scaling)</option>
              </select>
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 'bold', marginBottom: 8, color: '#333' }}>
                Encoding Quality
              </label>
              <select 
                value={exportSettings.preset}
                onChange={(e) => setExportSettings({ preset: e.target.value as any })}
                style={{ 
                  width: '100%',
                  padding: '8px 12px', 
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                <option value="fast">Fast (Larger File, Quick Export)</option>
                <option value="medium">Medium (Balanced)</option>
                <option value="slow">Slow (Smaller File, Best Quality)</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={exportSelected}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  border: 'none',
                  borderRadius: 4,
                  background: '#007bff',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Export Now
              </button>
            </div>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

