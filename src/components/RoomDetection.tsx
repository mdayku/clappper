import React, { useState, useEffect } from 'react'

interface RoomDetectionProps {
  isOpen: boolean
  onClose: () => void
}

export default function RoomDetection({ isOpen, onClose }: RoomDetectionProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('default')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; path: string }>>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<{
    detections: Array<{ id: string; bounding_box: [number, number, number, number]; name_hint: string }>
    annotated_image?: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadModels = React.useCallback(async () => {
    setLoadingModels(true)
    try {
      const models = await window.clappper.listRoomModels()
      setAvailableModels(models)
      // Set default model to first available, or 'default' if none found
      if (models.length > 0 && !models.find(m => m.id === selectedModel)) {
        setSelectedModel(models[0].id)
      }
    } catch (err) {
      console.error('Failed to load models:', err)
      setError(`Failed to load models: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoadingModels(false)
    }
  }, [selectedModel])

  // Load available models when modal opens
  useEffect(() => {
    if (isOpen && availableModels.length === 0) {
      loadModels()
    }
  }, [isOpen, availableModels.length, loadModels])

  const handleSelectImage = async () => {
    try {
      const files = await window.clappper.openImageFiles()
      if (files.length === 0) return
      
      // Use the first selected image file
      const imageFile = files[0]
      if (!imageFile) {
        setError('Please select a PNG or JPG image file')
        return
      }
      
      setSelectedImage(imageFile)
      setResult(null)
      setError(null)
    } catch (err) {
      setError(`Failed to select image: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDetect = async () => {
    if (!selectedImage) return
    
    setDetecting(true)
    setError(null)
    
    try {
      const result = await window.clappper.detectRooms(selectedImage, selectedModel)
      
      if (!result.success) {
        setError(result.error || 'Detection failed')
        return
      }
      
      setResult({
        detections: result.detections || [],
        annotated_image: result.annotated_image || null
      })
    } catch (err) {
      setError(`Detection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDetecting(false)
    }
  }

  const handleDownloadImage = async () => {
    if (!result?.annotated_image) return
    
    try {
      // Get the original filename without extension
      const originalName = selectedImage?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'detected_rooms'
      const defaultName = `${originalName}_annotated.png`
      
      // Use browser download (works in Electron)
      const base64Data = result.annotated_image
      const blob = await fetch(`data:image/png;base64,${base64Data}`).then(r => r.blob())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(`Failed to download image: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDownloadJSON = async () => {
    if (!result?.detections) return
    
    try {
      const originalName = selectedImage?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'detections'
      const defaultName = `${originalName}_detections.json`
      
      // Use browser download (works in Electron)
      const jsonContent = JSON.stringify(result.detections, null, 2)
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(`Failed to download JSON: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Explicitly check - only render if explicitly opened
  if (!isOpen) {
    return null
  }

  return (
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
        minWidth: 800,
        maxWidth: '90vw',
        maxHeight: '90vh',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>Room Detection</h2>
          <button
            onClick={onClose}
            style={{
              padding: '4px 12px',
              fontSize: 14,
              border: '1px solid #ccc',
              borderRadius: 4,
              background: 'white',
              cursor: 'pointer'
            }}
          >
            ✕ Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Left side - Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 200 }}>
            {/* Model Selector */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 'bold', marginBottom: 6, color: '#495057' }}>
                Model
              </label>
              {loadingModels ? (
                <div style={{ fontSize: 12, color: '#666', padding: '8px 0' }}>Loading models...</div>
              ) : availableModels.length > 0 ? (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={detecting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 13,
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    background: 'white',
                    cursor: detecting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>
                  No models found. Using default.
                </div>
              )}
            </div>

            <button
              onClick={handleSelectImage}
              disabled={detecting}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                border: 'none',
                borderRadius: 4,
                background: '#007bff',
                color: 'white',
                cursor: detecting ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {selectedImage ? 'Change Image' : 'Select Image'}
            </button>

            {selectedImage && (
              <div style={{ fontSize: 12, color: '#666', wordBreak: 'break-all' }}>
                {selectedImage.split(/[/\\]/).pop()}
              </div>
            )}

            <button
              onClick={handleDetect}
              disabled={!selectedImage || detecting}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                border: 'none',
                borderRadius: 4,
                background: selectedImage && !detecting ? '#28a745' : '#ccc',
                color: 'white',
                cursor: (selectedImage && !detecting) ? 'pointer' : 'not-allowed',
                fontWeight: 'bold'
              }}
            >
              {detecting ? 'Detecting...' : 'Detect Rooms'}
            </button>

            {error && (
              <div style={{
                padding: 8,
                background: '#fee',
                border: '1px solid #fcc',
                borderRadius: 4,
                color: '#c00',
                fontSize: 12
              }}>
                {error}
              </div>
            )}

            {result && (
              <>
                <div style={{
                  padding: 8,
                  background: '#d4edda',
                  border: '1px solid #c3e6cb',
                  borderRadius: 4,
                  color: '#155724',
                  fontSize: 12
                }}>
                  Found {result.detections.length} room{result.detections.length !== 1 ? 's' : ''}
                </div>
                
                {/* Download Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={handleDownloadImage}
                    disabled={!result.annotated_image}
                    style={{
                      padding: '8px 12px',
                      fontSize: 13,
                      border: 'none',
                      borderRadius: 4,
                      background: result.annotated_image ? '#007bff' : '#ccc',
                      color: 'white',
                      cursor: result.annotated_image ? 'pointer' : 'not-allowed',
                      fontWeight: 'bold'
                    }}
                  >
                    📥 Download Image
                  </button>
                  <button
                    onClick={handleDownloadJSON}
                    disabled={!result.detections || result.detections.length === 0}
                    style={{
                      padding: '8px 12px',
                      fontSize: 13,
                      border: 'none',
                      borderRadius: 4,
                      background: (result.detections && result.detections.length > 0) ? '#28a745' : '#ccc',
                      color: 'white',
                      cursor: (result.detections && result.detections.length > 0) ? 'pointer' : 'not-allowed',
                      fontWeight: 'bold'
                    }}
                  >
                    📥 Download JSON
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right side - Image and Results */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', minHeight: 0 }}>
            {result?.annotated_image ? (
              <>
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f8f9fa',
                  borderRadius: 4,
                  padding: 16,
                  minHeight: 400,
                  overflow: 'auto'
                }}>
                  <img
                    src={`data:image/png;base64,${result.annotated_image}`}
                    alt="Detected rooms"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                </div>

                {/* JSON Detections */}
                <div style={{
                  padding: 12,
                  background: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  maxHeight: 200,
                  overflow: 'auto'
                }}>
                  <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#495057' }}>Detections (JSON):</div>
                  <pre style={{
                    margin: 0,
                    padding: 8,
                    background: '#ffffff',
                    border: '1px solid #dee2e6',
                    borderRadius: 4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {JSON.stringify(result.detections, null, 2)}
                  </pre>
                </div>
              </>
            ) : selectedImage ? (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8f9fa',
                borderRadius: 4,
                padding: 16,
                minHeight: 400
              }}>
                <div style={{ textAlign: 'center', color: '#6c757d' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📐</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                    Image Selected
                  </div>
                  <div style={{ fontSize: 14 }}>
                    Click "Detect Rooms" to analyze
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8f9fa',
                borderRadius: 4,
                padding: 16,
                minHeight: 400
              }}>
                <div style={{ textAlign: 'center', color: '#6c757d' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                    Select a Blueprint Image
                  </div>
                  <div style={{ fontSize: 14 }}>
                    Choose a PNG or JPG image to detect room boundaries
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

