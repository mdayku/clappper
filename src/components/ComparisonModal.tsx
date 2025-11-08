import React, { useState } from 'react'

// Build a safe media:// URL from an absolute filesystem path
const toMediaURL = (absPath: string) =>
  `media://${encodeURI(absPath.replace(/\\/g, '/'))}`;

interface ComparisonModalProps {
  isOpen: boolean
  onClose: () => void
  originalPath: string
  enhancedPath: string
  originalResolution: string
  enhancedResolution: string
}

export default function ComparisonModal({ 
  isOpen, 
  onClose, 
  originalPath, 
  enhancedPath,
  originalResolution,
  enhancedResolution
}: ComparisonModalProps) {
  const [showEnhanced, setShowEnhanced] = useState(false)

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1001,
      padding: 20
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 24,
        maxWidth: 1200,
        width: '90%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#333' }}>
            Before/After Comparison
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              fontSize: 14,
              border: '1px solid #ccc',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        {/* Toggle Controls */}
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          marginBottom: 16,
          justifyContent: 'center'
        }}>
          <button
            onClick={() => setShowEnhanced(false)}
            style={{
              padding: '8px 24px',
              fontSize: 14,
              border: showEnhanced ? '1px solid #ccc' : '2px solid #007acc',
              borderRadius: 4,
              backgroundColor: showEnhanced ? 'white' : '#007acc',
              color: showEnhanced ? '#333' : 'white',
              cursor: 'pointer',
              fontWeight: showEnhanced ? 'normal' : 'bold'
            }}
          >
            Original ({originalResolution})
          </button>
          <button
            onClick={() => setShowEnhanced(true)}
            style={{
              padding: '8px 24px',
              fontSize: 14,
              border: showEnhanced ? '2px solid #007acc' : '1px solid #ccc',
              borderRadius: 4,
              backgroundColor: showEnhanced ? '#007acc' : 'white',
              color: showEnhanced ? 'white' : '#333',
              cursor: 'pointer',
              fontWeight: showEnhanced ? 'bold' : 'normal'
            }}
          >
            Enhanced ({enhancedResolution})
          </button>
        </div>

        {/* Video Display */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
            borderRadius: 4,
            overflow: 'hidden',
            minHeight: 400,
          }}
        >
          {(() => {
            const videoURL = toMediaURL(showEnhanced ? enhancedPath : originalPath)
            return (
              <video
                key={videoURL}
                src={videoURL}
                controls
                autoPlay
                muted
                loop
                playsInline
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                preload="metadata"
              />
            )
          })()}
        </div>


        {/* Info */}
        <div style={{ marginTop: 16, fontSize: 12, color: '#666', textAlign: 'center' }}>
          Toggle between original and enhanced to see the difference. 
          Enhanced video has {showEnhanced ? 'higher' : 'AI-upscaled'} resolution.
        </div>
      </div>
    </div>
  )
}

