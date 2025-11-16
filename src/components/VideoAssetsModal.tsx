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

const LOGO_ANIMATION_PRESETS: { id: string; label: string; description: string }[] = [
  { id: 'fade_scale_in', label: 'Fade & Scale In', description: 'Logo fades in while gently scaling up' },
  { id: 'slide_from_left', label: 'Slide from Left', description: 'Logo slides in smoothly from the left' },
  { id: 'glow_reveal', label: 'Glow Reveal', description: 'Logo appears with glowing light effect' },
  { id: 'minimal_zoom', label: 'Minimal Zoom', description: 'Subtle zoom in with focus shift' },
  { id: 'rotate_assemble', label: 'Rotate & Assemble', description: 'Logo elements rotate into place' }
]

export default function VideoAssetsModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'product' | 'logo'>('product')
  const [type, setType] = useState<'ai_video_pack' | '3d_render_pack'>('ai_video_pack')
  
  // Product video state
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>(SHOT_PRESETS.map(p => p.id))
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  
  // Logo animation state
  const [selectedLogoAnimations, setSelectedLogoAnimations] = useState<string[]>(LOGO_ANIMATION_PRESETS.map(p => p.id))
  const [selectedLogos, setSelectedLogos] = useState<string[]>([])
  const [conversionInfo, setConversionInfo] = useState<{
    needsConversion: boolean
    files: Array<{ path: string; extension: string; fileName: string }>
  } | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  
  const [model, setModel] = useState<'runway' | 'veo'>('veo') // Default to Veo for consistency
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

  const toggleLogoAnimation = (id: string) => {
    setSelectedLogoAnimations(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
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
      // Only use the first selected file (AI models use 1 image per prompt)
      setSelectedImages([files[0]])
      setError(null)
    } catch (err) {
      console.error('Failed to select images:', err)
      setError('Failed to open image picker')
    }
  }

  const handleSelectLogos = async () => {
    try {
      const files: string[] = await window.clappper.openImageFiles()
      if (!files || files.length === 0) return
      
      // Only use the first selected file (AI models use 1 image per prompt)
      const singleFile = [files[0]]
      
      // Detect if any files need conversion
      const detection = await window.clappper.detectImageFormats(singleFile)
      
      if (detection.needsConversion) {
        // Show conversion prompt
        setConversionInfo({
          needsConversion: true,
          files: detection.files.filter(f => f.needsConversion)
        })
        setSelectedLogos(singleFile) // Store original path temporarily
      } else {
        // Already PNG/JPG
        setSelectedLogos(singleFile)
        setConversionInfo(null)
      }
      
      setError(null)
    } catch (err) {
      console.error('Failed to select logo:', err)
      setError('Failed to open image picker')
    }
  }
  
  const handleConvertImages = async () => {
    if (!selectedLogos.length) return
    
    setIsConverting(true)
    setError(null)
    
    try {
      // Filter only files that need conversion
      const filesToConvert = conversionInfo?.files.map(f => f.path) || []
      
      // Convert the files
      const results = await window.clappper.convertImagesToPng(filesToConvert)
      
      // Check for failures
      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        setError(`Failed to convert ${failed.length} file(s): ${failed.map(f => f.error).join(', ')}`)
        setIsConverting(false)
        return
      }
      
      // Replace paths with converted PNG paths
      const updatedPaths = selectedLogos.map(originalPath => {
        const converted = results.find(r => r.inputPath === originalPath)
        return converted?.outputPath || originalPath
      })
      
      setSelectedLogos(updatedPaths)
      setConversionInfo(null)
      setIsConverting(false)
      
      console.log(`✓ Converted ${results.length} image(s) to PNG`)
    } catch (err: any) {
      console.error('Conversion failed:', err)
      setError(`Conversion failed: ${err.message}`)
      setIsConverting(false)
    }
  }
  
  const handleCancelConversion = () => {
    setConversionInfo(null)
    setSelectedLogos([])
  }

  const handleCreate = async () => {
    try {
      setError(null)
      
      // Only run one job type at a time based on active tab
      if (activeTab === 'product') {
        // Product video validation
        if (selectedImages.length === 0) {
          setError('Please select a product image.')
          return
        }
        if (selectedShotIds.length === 0) {
          setError('Please select at least one shot type.')
          return
        }
        
        setIsSubmitting(true)
        const job: VideoAssetJob = await window.clappper.createVideoAssetsJob({
          type,
          shotPresetIds: selectedShotIds,
          imagePaths: selectedImages,
          logoAnimationIds: [], // Only product videos
          logoPaths: [],
          model: model
        })
        setVideoAssetJobs([job, ...videoAssetJobs])
        setIsSubmitting(false)
        
        alert(`Product video job created! Processing ${selectedShotIds.length} shots. Check the job list below for progress.`)
      } else {
        // Logo animation validation
        if (selectedLogos.length === 0) {
          setError('Please select a logo image.')
          return
        }
        if (selectedLogoAnimations.length === 0) {
          setError('Please select at least one animation style.')
          return
        }
        
        setIsSubmitting(true)
        const job: VideoAssetJob = await window.clappper.createVideoAssetsJob({
          type,
          shotPresetIds: [], // Only logo animations
          imagePaths: [],
          logoAnimationIds: selectedLogoAnimations,
          logoPaths: selectedLogos,
          model: model
        })
        setVideoAssetJobs([job, ...videoAssetJobs])
        setIsSubmitting(false)
        
        alert(`Logo animation job created! Processing ${selectedLogoAnimations.length} animations. Check the job list below for progress.`)
      }
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
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Create Video Assets</h2>
        
        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #eee' }}>
          <button
            onClick={() => setActiveTab('product')}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: activeTab === 'product' ? 'bold' : 'normal',
              border: 'none',
              borderBottom: activeTab === 'product' ? '3px solid #007bff' : '3px solid transparent',
              background: 'transparent',
              color: activeTab === 'product' ? '#007bff' : '#666',
              cursor: 'pointer',
              marginBottom: -2
            }}
          >
            📦 Product Videos
          </button>
          <button
            onClick={() => setActiveTab('logo')}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: activeTab === 'logo' ? 'bold' : 'normal',
              border: 'none',
              borderBottom: activeTab === 'logo' ? '3px solid #007bff' : '3px solid transparent',
              background: 'transparent',
              color: activeTab === 'logo' ? '#007bff' : '#666',
              cursor: 'pointer',
              marginBottom: -2
            }}
          >
            🏷️ Logo Animations
          </button>
        </div>
        
        <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
          {activeTab === 'product' 
            ? 'Generate professional product videos using AI models. Each shot is 3-5 seconds with cinematic quality.'
            : 'Create animated logo end cards for your ads. Each animation is 2 seconds with professional motion.'}
          {' '}Requires a Replicate API key (set in Settings → API Keys).
        </p>

        {/* Model selector (applies to both product and logo) */}
        {type === 'ai_video_pack' && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 'bold',
                marginBottom: 6
              }}
            >
              AI Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as 'runway' | 'veo')}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 13,
                border: '1px solid #ccc',
                borderRadius: 4,
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="veo">Google Veo 3.1 - Superior consistency, 720p/1080p, includes audio</option>
              <option value="runway">Runway Gen-4 Turbo - Fast, 720p, high quality</option>
            </select>
            <div style={{ fontSize: 11, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
              {model === 'veo' 
                ? '✓ Recommended for consistent look across all ad parts. Generates 4s clips with audio (audio will be stripped for product clips).' 
                : '⚡ Fast generation, 5s clips, optimized for product videos.'}
            </div>
          </div>
        )}

        {/* PRODUCT VIDEO TAB CONTENT */}
        {activeTab === 'product' && (
          <>
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
                Product Image
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
                {selectedImages.length > 0 ? 'Change Image…' : 'Select Image…'}
              </button>
              {selectedImages.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
                  📁 {selectedImages[0].split('\\').pop()?.split('/').pop()}
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
          </>
        )}

        {/* LOGO ANIMATION TAB CONTENT */}
        {activeTab === 'logo' && (
          <>
            {/* Logo image selection */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 'bold',
                  marginBottom: 6
                }}
              >
                Logo Image (PNG, JPG, WebP, AVIF, SVG, etc.)
              </label>
              <button
                onClick={handleSelectLogos}
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
                {selectedLogos.length > 0 ? 'Change Logo…' : 'Select Logo…'}
              </button>
              {selectedLogos.length > 0 && !conversionInfo && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
                  📁 {selectedLogos[0].split('\\').pop()?.split('/').pop()}
                </div>
              )}
              
              {/* Conversion prompt */}
              {conversionInfo && conversionInfo.needsConversion && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#fff3cd',
                  border: '1px solid #ffecb5',
                  borderRadius: 6
                }}>
                  <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#856404' }}>
                    🔄 Format Conversion Required
                  </div>
                  <div style={{ fontSize: 12, color: '#856404', marginBottom: 10 }}>
                    The following {conversionInfo.files.length} file(s) need to be converted to PNG for AI video generation:
                  </div>
                  <ul style={{ fontSize: 11, color: '#856404', marginLeft: 20, marginBottom: 10 }}>
                    {conversionInfo.files.map((file, idx) => (
                      <li key={idx}>
                        <strong>{file.fileName}</strong> ({file.extension.toUpperCase()})
                      </li>
                    ))}
                  </ul>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 10, fontStyle: 'italic' }}>
                    SVG files will be rasterized at 2000px width. Converted files will be saved in the same directory with "_converted.png" suffix.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleConvertImages}
                      disabled={isConverting}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        borderRadius: 4,
                        border: 'none',
                        cursor: isConverting ? 'not-allowed' : 'pointer',
                        background: isConverting ? '#ccc' : '#28a745',
                        color: 'white',
                        fontWeight: 'bold'
                      }}
                    >
                      {isConverting ? '⏳ Converting...' : '✓ Convert to PNG'}
                    </button>
                    <button
                      onClick={handleCancelConversion}
                      disabled={isConverting}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        borderRadius: 4,
                        border: '1px solid #ccc',
                        cursor: isConverting ? 'not-allowed' : 'pointer',
                        background: '#f8f9fa',
                        color: '#333'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Animation presets */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 'bold',
                  marginBottom: 6
                }}
              >
                Animation Styles
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 8
                }}
              >
                {LOGO_ANIMATION_PRESETS.map(preset => {
                  const checked = selectedLogoAnimations.includes(preset.id)
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
                          onChange={() => toggleLogoAnimation(preset.id)}
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
          </>
        )}

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


