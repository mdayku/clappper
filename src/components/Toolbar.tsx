import React, { useState } from 'react'
import { useStore } from '../store'

export default function Toolbar() {
  const [progress, setProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [transcodeProgress, setTranscodeProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const { clips } = useStore()

  React.useEffect(() => {
    if (window.clappper) {
      window.clappper.onExportProgress((p: number) => setProgress(p))
      window.clappper.onTranscodeProgress((p: number) => setTranscodeProgress(p))
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
        
        return {
          id: crypto.randomUUID(), 
          path: m!.path,
          originalPath: 'originalPath' in m! ? m!.originalPath : undefined,
          name: fileName,
          duration: m!.duration, 
          start: 0, 
          end: m!.duration,
          order: 0, // Will be reassigned by store
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

  const exportSelected = async () => {
    try {
      setError(null)
      const sel = useStore.getState().clips[0]
      if (!sel) {
        setError('Please import a clip first')
        return
      }
      
      if (sel.end <= sel.start) {
        setError('Invalid trim range: end must be greater than start')
        return
      }
      
      setIsExporting(true)
      setProgress(0)
      const out = `${sel.path}.trimmed.mp4`
      await window.clappper.exportTrim({ 
        input: sel.path, 
        outPath: out, 
        start: sel.start, 
        end: sel.end 
      })
      setIsExporting(false)
      alert('Export complete:\n' + out)
    } catch (err) {
      console.error('Export failed:', err)
      setError(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setIsExporting(false)
    }
  }

  const clearAll = () => {
    if (clips.length === 0) return
    if (confirm(`Remove all ${clips.length} clip(s) from timeline?`)) {
      useStore.getState().setClips([])
      setError(null)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection: 'column', borderBottom: '1px solid #eee' }}>
      <div style={{ display:'flex', gap: 8, padding: 8 }}>
        <button onClick={onImport} disabled={isExporting || isImporting}>
          {isImporting ? 'Importing...' : 'Import'}
        </button>
        <button onClick={exportSelected} disabled={isExporting || isImporting || clips.length === 0}>
          {isExporting ? 'Exporting...' : 'Export Selected (Trim)'}
        </button>
        <button 
          onClick={clearAll} 
          disabled={isExporting || isImporting || clips.length === 0}
          style={{ marginLeft: 8, color: '#c00' }}
        >
          Clear All
        </button>
        <div style={{ marginLeft: 'auto' }}>
          {clips.length > 0 && <span style={{ fontSize: 12, color: '#666', marginRight: 12 }}>{clips.length} clip(s)</span>}
          {transcodeProgress > 0 && transcodeProgress < 100 && <span style={{ fontSize: 12, color: '#666', marginRight: 12 }}>Converting: {transcodeProgress.toFixed(0)}%</span>}
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
    </div>
  )
}

