import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { VideoAssetJob } from '../lib/types'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const SHOT_PRESETS: { id: string; label: string; description: string }[] = [
  { id: 'slow_pan_lr', label: 'Slow pan L → R', description: 'Camera moves left to right across the product' },
  { id: 'slow_pan_rl', label: 'Slow pan R → L', description: 'Camera moves right to left across the product' },
  { id: 'slow_dolly_in', label: 'Slow dolly in', description: 'Slow push-in toward the product' },
  { id: 'slow_dolly_out', label: 'Slow dolly out', description: 'Slow pull-back from the product' },
  { id: 'orbit_360', label: '360° orbit', description: 'Full orbit around the product' },
  { id: 'hero_front', label: 'Hero front shot', description: 'Straight-on hero shot' },
  { id: 'top_down', label: 'Top-down', description: 'Overhead view of the product' }
]

export default function VideoAssetsModal({ isOpen, onClose }: Props) {
  const [type, setType] = useState<'ai_video_pack' | '3d_render_pack'>('ai_video_pack')
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>(SHOT_PRESETS.map(p => p.id))
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [selectedVideos, setSelectedVideos] = useState<Record<string, string[]>>({}) // jobId -> videoUrls[]

  const videoAssetJobs = useStore(s => s.videoAssetJobs)
  const setVideoAssetJobs = useStore(s => s.setVideoAssetJobs)
  const addClips = useStore(s => s.addClips)

  // Poll for job updates
  useEffect(() => {
    if (!isOpen) return

    const pollJobs = async () => {
      try {
        const jobs: VideoAssetJob[] = await window.clappper.listVideoAssetsJobs()
        setVideoAssetJobs(jobs)
      } catch (err) {
        console.error('Failed to poll jobs:', err)
      }
    }

    // Poll immediately, then every 3 seconds
    pollJobs()
    const interval = setInterval(pollJobs, 3000)

    return () => clearInterval(interval)
  }, [isOpen, setVideoAssetJobs])

  useEffect(() => {
    if (!isOpen) {
      // Reset ephemeral error state when modal closes
      setError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const toggleShot = (id: string) => {
    setSelectedShotIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const toggleVideoSelection = (jobId: string, videoUrl: string) => {
    setSelectedVideos(prev => {
      const current = prev[jobId] || []
      const updated = current.includes(videoUrl)
        ? current.filter(url => url !== videoUrl)
        : [...current, videoUrl]
      return { ...prev, [jobId]: updated }
    })
  }

  const selectAllVideos = (jobId: string, videoUrls: string[]) => {
    setSelectedVideos(prev => ({ ...prev, [jobId]: videoUrls }))
  }

  const handleImportSelected = async (jobId: string) => {
    const urls = selectedVideos[jobId] || []
    if (urls.length === 0) {
      alert('Please select at least one video to import')
      return
    }

    try {
      // Extract file paths from file:// URLs
      const filePaths = urls.map(url => url.replace('file://', ''))
      
      // Use existing import logic
      const newClips = []
      for (const filePath of filePaths) {
        try {
          const metadata = await window.clappper.ffprobe(filePath)
          const clip = {
            id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            path: filePath,
            name: filePath.split(/[\\/]/).pop() || 'video.mp4',
            duration: metadata.format.duration,
            start: 0,
            end: metadata.format.duration,
            width: metadata.streams.find((s: any) => s.codec_type === 'video')?.width || 1920,
            height: metadata.streams.find((s: any) => s.codec_type === 'video')?.height || 1080,
            trackId: 'main',
            order: 0
          }
          newClips.push(clip)
        } catch (err) {
          console.error(`Failed to import ${filePath}:`, err)
        }
      }

      if (newClips.length > 0) {
        addClips(newClips)
        alert(`Successfully imported ${newClips.length} video(s) to timeline!`)
        // Clear selection after import
        setSelectedVideos(prev => ({ ...prev, [jobId]: [] }))
      }
    } catch (err: any) {
      console.error('Failed to import videos:', err)
      alert(`Import failed: ${err.message}`)
    }
  }

  const handleSelectImages = async () => {
    try {
      const files: string[] = await window.clappper.openImageFiles()
      if (!files || files.length === 0) return
      setSelectedImages(files)
      setError(null)
    } catch (err) {
      console.error('Failed to select images:', err)
      setError('Failed to open image picker')
    }
  }

  const handleCreate = async () => {
    try {
      setError(null)
      if (selectedImages.length === 0) {
        setError('Please select at least one product image.')
        return
      }
      if (selectedShotIds.length === 0) {
        setError('Please select at least one shot preset.')
        return
      }
      setIsSubmitting(true)
      const job: VideoAssetJob = await window.clappper.createVideoAssetsJob({
        type,
        shotPresetIds: selectedShotIds,
        imagePaths: selectedImages
      })
      // Prepend new job for recency
      setVideoAssetJobs([job, ...videoAssetJobs])
      setIsSubmitting(false)
      // Don't close modal - let user see progress
      alert(`Video asset job created! Processing ${selectedShotIds.length} shots. Check the job list below for progress.`)
    } catch (err: any) {
      console.error('Failed to create video asset job:', err)
      setIsSubmitting(false)
      setError(err?.message || 'Failed to create video asset job')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          maxWidth: 720,
          width: '95%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)'
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Create Video Assets</h2>
        <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
          Generate professional product videos using{' '}
          <strong>Runway Gen-4 Turbo</strong> AI. Each shot is 5 seconds at 720p with cinematic quality.
          Requires a Replicate API key (set in Settings → API Keys).
        </p>

        {/* Type selector */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 'bold',
              marginBottom: 6
            }}
          >
            Pipeline
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="videoAssetsType"
                value="ai_video_pack"
                checked={type === 'ai_video_pack'}
                onChange={() => setType('ai_video_pack')}
              />{' '}
              AI Video Pack (hosted models)
            </label>
            <label style={{ fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="videoAssetsType"
                value="3d_render_pack"
                checked={type === '3d_render_pack'}
                onChange={() => setType('3d_render_pack')}
              />{' '}
              3D Render Pack (Blender)
            </label>
          </div>
        </div>

        {/* Image selection */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 'bold',
              marginBottom: 6
            }}
          >
            Product Images
          </label>
          <button
            onClick={handleSelectImages}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              borderRadius: 4,
              border: '1px solid #ccc',
              cursor: 'pointer',
              background: '#f8f9fa'
            }}
            disabled={isSubmitting}
          >
            {selectedImages.length > 0 ? 'Change Images…' : 'Select Images…'}
          </button>
          {selectedImages.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
              {selectedImages.length} image(s) selected
            </div>
          )}
        </div>

        {/* Shot presets */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 'bold',
              marginBottom: 6
            }}
          >
            Shot Presets
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 8
            }}
          >
            {SHOT_PRESETS.map(preset => {
              const checked = selectedShotIds.includes(preset.id)
              return (
                <label
                  key={preset.id}
                  style={{
                    border: checked ? '1px solid #007bff' : '1px solid #ddd',
                    borderRadius: 6,
                    padding: 8,
                    fontSize: 12,
                    cursor: 'pointer',
                    background: checked ? '#e9f3ff' : '#fafafa'
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleShot(preset.id)}
                      style={{ marginRight: 6 }}
                    />
                    <strong>{preset.label}</strong>
                  </div>
                  <div style={{ color: '#666', fontSize: 11 }}>{preset.description}</div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Existing jobs summary */}
        <div
          style={{
            marginTop: 16,
            marginBottom: 16,
            padding: 10,
            borderRadius: 6,
            border: '1px dashed #ccc',
            background: '#fcfcfc'
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>
            Recent Video Asset Jobs
          </div>
          <div style={{ fontSize: 12, color: '#555', maxHeight: 240, overflowY: 'auto' }}>
            {videoAssetJobs.slice(0, 10).map(job => {
              const statusColor =
                job.status === 'completed'
                  ? '#28a745'
                  : job.status === 'failed'
                  ? '#dc3545'
                  : job.status === 'running'
                  ? '#007bff'
                  : '#6c757d'
              
              const statusIcon =
                job.status === 'completed'
                  ? '✓'
                  : job.status === 'failed'
                  ? '✗'
                  : job.status === 'running'
                  ? '⟳'
                  : '○'

              const isExpanded = expandedJobId === job.id
              const jobVideoUrls = job.resultAssets.map(a => a.url)
              const selectedCount = (selectedVideos[job.id] || []).length

              return (
                <div
                  key={job.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 6px',
                    borderBottom: '1px solid #eee',
                    background: job.status === 'running' ? '#f0f8ff' : 'transparent'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                      cursor: job.status === 'completed' && job.resultAssets.length > 0 ? 'pointer' : 'default'
                    }}
                    onClick={() => {
                      if (job.status === 'completed' && job.resultAssets.length > 0) {
                        setExpandedJobId(isExpanded ? null : job.id)
                      }
                    }}
                  >
                    <span>
                      {job.status === 'completed' && job.resultAssets.length > 0 && (
                        <span style={{ marginRight: 4 }}>{isExpanded ? '▼' : '▶'}</span>
                      )}
                      <strong>{job.type === 'ai_video_pack' ? 'AI Pack' : '3D Pack'}</strong> ·{' '}
                      {job.shotPresetIds.length} shots
                    </span>
                    <span style={{ color: statusColor, fontWeight: 'bold' }}>
                      {statusIcon} {job.status}
                    </span>
                  </div>
                  {job.status === 'completed' && job.resultAssets.length > 0 && !isExpanded && (
                    <div style={{ fontSize: 11, color: '#060', marginTop: 2 }}>
                      ✓ {job.resultAssets.length} videos saved • Click to view and import
                    </div>
                  )}
                  {job.status === 'failed' && job.error && (
                    <div style={{ fontSize: 11, color: '#c00', marginTop: 2 }}>
                      Error: {job.error}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    Created: {new Date(job.createdAt).toLocaleString()}
                  </div>

                  {/* Expanded view with video thumbnails */}
                  {isExpanded && job.status === 'completed' && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #ddd' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <button
                          onClick={() => selectAllVideos(job.id, jobVideoUrls)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 11,
                            borderRadius: 3,
                            border: '1px solid #007bff',
                            background: '#fff',
                            color: '#007bff',
                            cursor: 'pointer'
                          }}
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => handleImportSelected(job.id)}
                          disabled={selectedCount === 0}
                          style={{
                            padding: '4px 12px',
                            fontSize: 11,
                            borderRadius: 3,
                            border: 'none',
                            background: selectedCount > 0 ? '#28a745' : '#ccc',
                            color: '#fff',
                            cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold'
                          }}
                        >
                          Import Selected ({selectedCount})
                        </button>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                        {job.resultAssets.map((asset, idx) => {
                          const isSelected = (selectedVideos[job.id] || []).includes(asset.url)
                          const shotPreset = SHOT_PRESETS.find(p => p.id === asset.shotId)
                          
                          return (
                            <div
                              key={idx}
                              style={{
                                border: isSelected ? '2px solid #007bff' : '1px solid #ddd',
                                borderRadius: 4,
                                padding: 4,
                                cursor: 'pointer',
                                background: isSelected ? '#e9f3ff' : '#fff'
                              }}
                              onClick={() => toggleVideoSelection(job.id, asset.url)}
                            >
                              <div style={{
                                width: '100%',
                                height: 68,
                                background: '#000',
                                borderRadius: 3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 4,
                                position: 'relative'
                              }}>
                                <video
                                  src={asset.url}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: 3
                                  }}
                                  muted
                                />
                                <div style={{
                                  position: 'absolute',
                                  top: 4,
                                  left: 4,
                                  width: 14,
                                  height: 14,
                                  border: '2px solid #fff',
                                  borderRadius: 2,
                                  background: isSelected ? '#007bff' : 'rgba(0,0,0,0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                  fontSize: 10
                                }}>
                                  {isSelected && '✓'}
                                </div>
                              </div>
                              <div style={{ fontSize: 10, color: '#333', textAlign: 'center' }}>
                                {shotPreset?.label || asset.shotId}
                              </div>
                              <div style={{ fontSize: 9, color: '#888', textAlign: 'center' }}>
                                {asset.durationSec}s
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      <div style={{ fontSize: 10, color: '#666', marginTop: 8, fontStyle: 'italic' }}>
                        💾 Videos saved locally. You can import them anytime.
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {videoAssetJobs.length === 0 && (
              <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', padding: '8px 0' }}>
                No jobs yet. Create your first video asset pack!
              </div>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: 8,
              borderRadius: 4,
              background: '#fee',
              color: '#c00',
              fontSize: 12
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              borderRadius: 4,
              border: 'none',
              background: '#007bff',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isSubmitting ? 'Creating…' : 'Create Pack'}
          </button>
        </div>
      </div>
    </div>
  )
}


