import React, { useState } from 'react'
import { useStore } from '../store'

export default function Toolbar() {
  const [progress, setProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { clips } = useStore()

  React.useEffect(() => {
    if (window.clappper) {
      window.clappper.onExportProgress((p: number) => setProgress(p))
    }
  }, [])

  const onImport = async () => {
    try {
      setError(null)
      const files: string[] = await window.clappper.openFiles()
      if (files.length === 0) return // User cancelled
      
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
          return { path: f, duration: dur, width: v?.width || 0, height: v?.height || 0 }
        } catch (err) {
          console.error(`Failed to probe ${f}:`, err)
          return null
        }
      }))
      
      const validMetas = metas.filter(m => m !== null)
      if (validMetas.length === 0) {
        setError('No valid video files found')
        return
      }
      
      const payload = validMetas.map((m) => {
        // Extract filename from path for display name
        const pathParts = m!.path.split(/[/\\]/)
        const fileName = pathParts[pathParts.length - 1]
        
        return {
          id: crypto.randomUUID(), 
          path: m!.path,
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
    } catch (err) {
      console.error('Import failed:', err)
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
        <button onClick={onImport} disabled={isExporting}>Import</button>
        <button onClick={exportSelected} disabled={isExporting || clips.length === 0}>
          {isExporting ? 'Exporting...' : 'Export Selected (Trim)'}
        </button>
        <button 
          onClick={clearAll} 
          disabled={isExporting || clips.length === 0}
          style={{ marginLeft: 8, color: '#c00' }}
        >
          Clear All
        </button>
        <div style={{ marginLeft: 'auto' }}>
          {clips.length > 0 && <span style={{ fontSize: 12, color: '#666', marginRight: 12 }}>{clips.length} clip(s)</span>}
          {progress > 0 && progress < 100 ? `Export: ${progress.toFixed(0)}%` : ''}
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

