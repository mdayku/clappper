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

  const videoAssetJobs = useStore(s => s.videoAssetJobs)
  const setVideoAssetJobs = useStore(s => s.setVideoAssetJobs)

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
      onClose()
      alert('Video asset job created (mock provider). This will later call real AI/video APIs.')
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
          Generate a reusable pack of stock clips for this product. For now this uses a{' '}
          <strong>mock provider</strong>; later it will call real 3D/AI video APIs.
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
        {videoAssetJobs.length > 0 && (
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
            <div style={{ fontSize: 12, color: '#555', maxHeight: 120, overflowY: 'auto' }}>
              {videoAssetJobs.slice(0, 5).map(job => (
                <div
                  key={job.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    borderBottom: '1px solid #eee'
                  }}
                >
                  <span>
                    <strong>{job.type === 'ai_video_pack' ? 'AI Pack' : '3D Pack'}</strong> ·{' '}
                    {job.shotPresetIds.length} shots · {job.status}
                  </span>
                  <span style={{ color: '#888' }}>
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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


