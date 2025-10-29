import React, { useState, useEffect } from 'react'
import { useStore } from '../store'
import ComparisonModal from './ComparisonModal'

interface EnhanceProgress {
  stage: 'extract' | 'process' | 'reassemble' | 'info'
  frame: number
  totalFrames: number
  percent: number
  eta: string
  outputResolution?: string
  scale?: number
  fps?: string
}

// Helper to calculate optimal scale (same logic as backend)
const calculateOptimalScale = (width: number, height: number): { scale: number; outputWidth: number; outputHeight: number } => {
  const maxWidth = 1920
  const maxHeight = 1080
  
  let scale = 4
  let outputWidth = width * scale
  let outputHeight = height * scale
  
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    scale = 3
    outputWidth = width * scale
    outputHeight = height * scale
  }
  
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    scale = 2
    outputWidth = width * scale
    outputHeight = height * scale
  }
  
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    const scaleX = maxWidth / width
    const scaleY = maxHeight / height
    const finalScale = Math.min(scaleX, scaleY)
    scale = Math.floor(finalScale)
    outputWidth = width * scale
    outputHeight = height * scale
  }
  
  return { scale, outputWidth, outputHeight }
}

interface EnhanceModalProps {
  isOpen: boolean
  onClose: () => void
  clipId?: string
}

export default function EnhanceModal({ isOpen, onClose, clipId }: EnhanceModalProps) {
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [progress, setProgress] = useState<EnhanceProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gpuInfo, setGpuInfo] = useState<{ detected: boolean; name: string; vram: string; estimatedFps: number } | null>(null)
  const [showComparison, setShowComparison] = useState(false)
  const [enhancedVideoPath, setEnhancedVideoPath] = useState<string | null>(null)
  const [enhancedResolution, setEnhancedResolution] = useState<string | null>(null)

  const clip = clipId ? useStore.getState().getClipById(clipId) : null
  const selectedClip = useStore.getState().selectedId ? useStore.getState().getClipById(useStore.getState().selectedId!) : null
  const activeClip = clip || selectedClip

  useEffect(() => {
    if (!window.clappper) return

    const handleProgress = (p: EnhanceProgress) => {
      setProgress(p)
    }

    window.clappper.onEnhanceProgress(handleProgress)

    // Detect GPU on modal open
    if (isOpen && !gpuInfo) {
      window.clappper.detectGPU().then(info => {
        setGpuInfo(info)
        console.log('GPU detected:', info)
      }).catch(err => {
        console.error('GPU detection failed:', err)
      })
    }

    return () => {
      // Cleanup if needed
    }
  }, [isOpen, gpuInfo])

  const startEnhancement = async () => {
    if (!activeClip || !window.clappper) return

    try {
      setError(null)
      setIsEnhancing(true)
      setProgress(null)

      // Generate output path next to input
      const inputDir = activeClip.path.substring(0, activeClip.path.lastIndexOf('\\') || activeClip.path.lastIndexOf('/'))
      const inputName = activeClip.path.substring(activeClip.path.lastIndexOf('\\') + 1 || activeClip.path.lastIndexOf('/') + 1)
      const nameWithoutExt = inputName.substring(0, inputName.lastIndexOf('.'))
      const outputPath = `${inputDir}/${nameWithoutExt}_enhanced.mp4`

      const result = await window.clappper.enhanceVideo({
        input: activeClip.path,
        output: outputPath
      })

      if (result.ok) {
        // Import the enhanced video
        const files = [result.outPath]
        const metas = await Promise.all(files.map(async f => {
          try {
            const info = await window.clappper.ffprobe(f)
            const dur = Number(info.format.duration) || 0
            if (dur === 0) {
              console.warn(`File ${f} has zero duration, skipping`)
              return null
            }
            const v = info.streams.find((s) => s.codec_type === 'video')
            const enhancedWidth = result.outputWidth || v?.width || 0
            const enhancedHeight = result.outputHeight || v?.height || 0
            
            return {
              path: f,
              name: f.split(/[/\\]/).pop() || f,
              duration: dur,
              width: enhancedWidth,
              height: enhancedHeight,
              start: 0,
              end: dur,
              thumbnail: undefined,
              trackId: 'main',
              order: 0
            }
          } catch (err) {
            console.error(`Failed to get metadata for ${f}:`, err)
            return null
          }
        }))

        const validClips = metas.filter(m => m !== null)
        if (validClips.length > 0) {
          useStore.getState().addClips(validClips)
          console.log(`Enhanced video imported successfully: ${result.outputWidth}×${result.outputHeight}`)
        }

        // Store enhanced video info for comparison
        setEnhancedVideoPath(result.outPath)
        setEnhancedResolution(`${result.outputWidth}×${result.outputHeight}`)
        
        // Don't close immediately - show success message with comparison option
      }
    } catch (err: any) {
      setError(err.message || 'Enhancement failed')
    } finally {
      setIsEnhancing(false)
      setProgress(null)
    }
  }

  const cancelEnhancement = async () => {
    if (window.clappper) {
      try {
        await window.clappper.enhanceCancel()
      } catch (err) {
        console.error('Cancel failed:', err)
      }
    }
    setIsEnhancing(false)
    setProgress(null)
  }

  if (!isOpen || !activeClip) return null

  const isLowRes = activeClip.height < 720
  const { scale: finalScale, outputWidth: finalOutputWidth, outputHeight: finalOutputHeight } = calculateOptimalScale(activeClip.width, activeClip.height)
  
  // Calculate estimated processing time
  const estimatedFrames = Math.ceil(activeClip.duration * 30) // 30fps
  const estimatedFps = gpuInfo?.estimatedFps || 0.3
  const estimatedSeconds = estimatedFrames / estimatedFps
  const estimatedMinutes = Math.floor(estimatedSeconds / 60)
  const estimatedSecsRemainder = Math.floor(estimatedSeconds % 60)
  const estimatedTimeString = estimatedMinutes > 0 
    ? `~${estimatedMinutes}m ${estimatedSecsRemainder}s` 
    : `~${estimatedSecsRemainder}s`

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 24,
        maxWidth: 500,
        width: '90%',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
          AI Video Enhancement
        </h3>

        {/* Clip Info */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
            <strong>Clip:</strong> {activeClip.name}
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
            <strong>Resolution:</strong> {activeClip.width}×{activeClip.height}
            {isLowRes && <span style={{ color: '#e74c3c', marginLeft: 8 }}>⚠️ Low resolution</span>}
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
            <strong>Duration:</strong> {activeClip.duration.toFixed(1)}s
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
            <strong>Output Resolution:</strong> {finalOutputWidth}×{finalOutputHeight} ({finalScale}× upscale, auto-optimized)
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
            <strong>Model:</strong> Real-ESRGAN x4plus
          </div>
          {gpuInfo && gpuInfo.detected && (
            <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
              <strong>GPU:</strong> {gpuInfo.name}
            </div>
          )}
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
            <strong>Estimated Time:</strong> {estimatedTimeString}
          </div>
          <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 8 }}>
            Scale factor automatically chosen to maximize quality while staying within 1080p limit.
          </div>
        </div>

        {/* Progress */}
        {isEnhancing && progress && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              width: '100%',
              height: 8,
              backgroundColor: '#f0f0f0',
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 8
            }}>
              <div style={{
                width: `${progress.percent}%`,
                height: '100%',
                backgroundColor: '#007acc',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
              {progress.stage === 'extract' && 'Extracting frames...'}
              {progress.stage === 'info' && progress.eta}
              {progress.stage === 'process' && `Processing frame ${progress.frame}/${progress.totalFrames}`}
              {progress.stage === 'reassemble' && 'Reassembling video...'}
            </div>
            {progress.stage === 'process' && progress.fps && (
              <div style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 2 }}>
                {progress.fps} fps
              </div>
            )}
            <div style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 4 }}>
              {progress.eta}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: 4,
            padding: 12,
            marginBottom: 20,
            color: '#c33'
          }}>
            {error}
          </div>
        )}

        {/* Success message with comparison option */}
        {enhancedVideoPath && !isEnhancing && (
          <div style={{
            backgroundColor: '#e8f5e9',
            border: '1px solid #4caf50',
            borderRadius: 4,
            padding: 12,
            marginBottom: 20,
            color: '#2e7d32'
          }}>
            ✅ Enhancement complete! Enhanced video imported to timeline.
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={isEnhancing ? cancelEnhancement : onClose}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              border: '1px solid #ccc',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            {isEnhancing ? 'Cancel' : 'Close'}
          </button>

          {/* Show comparison button after enhancement */}
          {enhancedVideoPath && !isEnhancing && activeClip && (
            <button
              onClick={() => setShowComparison(true)}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                border: '1px solid #007acc',
                borderRadius: 4,
                backgroundColor: 'white',
                color: '#007acc',
                cursor: 'pointer'
              }}
            >
              Compare Before/After
            </button>
          )}

          {!isEnhancing && !enhancedVideoPath && (
            <button
              onClick={startEnhancement}
              disabled={!isLowRes}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                border: 'none',
                borderRadius: 4,
                backgroundColor: isLowRes ? '#007acc' : '#ccc',
                color: 'white',
                cursor: isLowRes ? 'pointer' : 'not-allowed'
              }}
            >
              {isLowRes ? 'Enhance Video' : 'Already High Resolution'}
            </button>
          )}
        </div>

        {/* Info */}
        <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
          This will create a {finalScale}× upscaled version ({finalOutputWidth}×{finalOutputHeight}) using AI super-resolution.
          Processing time depends on video length and your GPU performance. Output capped at 1080p for optimal performance.
        </div>
      </div>
      
      {/* Comparison Modal */}
      {activeClip && enhancedVideoPath && enhancedResolution && (
        <ComparisonModal
          isOpen={showComparison}
          onClose={() => setShowComparison(false)}
          originalPath={activeClip.path}
          enhancedPath={enhancedVideoPath}
          originalResolution={`${activeClip.width}×${activeClip.height}`}
          enhancedResolution={enhancedResolution}
        />
      )}
    </div>
  )
}
