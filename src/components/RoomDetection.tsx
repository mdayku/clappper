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
  const [confidence, setConfidence] = useState<number>(0.2)
  const [confidenceInput, setConfidenceInput] = useState<string>('0.20')
  const [confidenceError, setConfidenceError] = useState<string | null>(null)
  const [identifyingRooms, setIdentifyingRooms] = useState(false)
  const [roomLabels, setRoomLabels] = useState<Record<string, string>>({})
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')

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

  // Check for API key on mount
  useEffect(() => {
    if (isOpen) {
      window.clappper.getOpenAIKey().then((key: string | null) => {
        setHasApiKey(!!key)
        if (key) setApiKeyInput(key)
      }).catch(() => setHasApiKey(false))
    }
  }, [isOpen])

  const handleConfidenceSliderChange = (value: number) => {
    setConfidence(value)
    setConfidenceInput(value.toFixed(2))
    setConfidenceError(null)
  }

  const handleConfidenceInputChange = (value: string) => {
    setConfidenceInput(value)
    
    const num = parseFloat(value)
    if (isNaN(num) || num < 0.01 || num > 0.99) {
      setConfidenceError('Please enter a value between 0.01 and 0.99')
    } else {
      setConfidence(num)
      setConfidenceError(null)
    }
  }

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
      const result = await window.clappper.detectRooms(selectedImage, selectedModel, confidence)
      
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

  const handleIdentifyRooms = async () => {
    if (!selectedImage || !result?.detections || !result?.annotated_image) return
    
    // Check if API key is set
    if (!hasApiKey) {
      setShowApiKeyDialog(true)
      return
    }
    
    setIdentifyingRooms(true)
    setError(null)
    
    try {
      // Send the annotated image (with bounding boxes) for better visual context
      const identifyResult = await window.clappper.identifyRooms(result.annotated_image, result.detections, true)
      
      if (!identifyResult.success) {
        setError(identifyResult.error || 'Room identification failed')
        if (identifyResult.error?.includes('API key')) {
          setShowApiKeyDialog(true)
        }
        return
      }
      
      const labels = identifyResult.room_labels || {}
      setRoomLabels(labels)
      
      // Update detections with new name_hint from AI
      const updatedDetections = result.detections.map(det => ({
        ...det,
        name_hint: labels[det.id] || det.name_hint
      }))
      
      setResult({
        ...result,
        detections: updatedDetections
      })
    } catch (err) {
      setError(`Room identification failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIdentifyingRooms(false)
    }
  }

  const handleSaveApiKey = async () => {
    try {
      await window.clappper.setOpenAIKey(apiKeyInput)
      setHasApiKey(true)
      setShowApiKeyDialog(false)
      setError(null)
    } catch (err) {
      setError(`Failed to save API key: ${err instanceof Error ? err.message : 'Unknown error'}`)
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

  const handleDownloadPDF = async () => {
    if (!result?.annotated_image || !result?.detections) return
    
    try {
      // Dynamically import jsPDF
      const { jsPDF } = await import('jspdf')
      
      const timestamp = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
      
      // Create PDF in portrait mode
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })
      
      const pageWidth = pdf.internal.pageSize.getWidth()
      const margin = 15
      
      // Add title
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('ROOM DETECTION REPORT', margin, margin)
      
      // Add timestamp
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Generated: ${timestamp}`, margin, margin + 7)
      pdf.text(`Detected Rooms: ${result.detections.length}`, margin, margin + 12)
      if (Object.keys(roomLabels).length > 0) {
        pdf.text('Room types identified by GPT-4 Vision AI', margin, margin + 17)
      }
      
      // Add image
      const imageData = `data:image/png;base64,${result.annotated_image}`
      const imgWidth = pageWidth - (2 * margin)
      const imgHeight = 100
      pdf.addImage(imageData, 'PNG', margin, margin + 22, imgWidth, imgHeight)
      
      let yPos = margin + 22 + imgHeight + 10
      
      // Add detections
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text('DETECTED ROOMS:', margin, yPos)
      yPos += 7
      
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      const jsonStr = JSON.stringify(result.detections, null, 2)
      const splitText = pdf.splitTextToSize(jsonStr, pageWidth - (2 * margin))
      pdf.text(splitText, margin, yPos)
      
      // Download
      const originalName = selectedImage?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'room_detection'
      pdf.save(`${originalName}_report.pdf`)
      
    } catch (err) {
      setError(`Failed to generate PDF: ${err instanceof Error ? err.message : 'Unknown error'}`)
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

            {/* Confidence Threshold */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 'bold', marginBottom: 6, color: '#495057' }}>
                Confidence Threshold: {confidence.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.01"
                max="0.99"
                step="0.01"
                value={confidence}
                onChange={(e) => handleConfidenceSliderChange(parseFloat(e.target.value))}
                disabled={detecting}
                style={{
                  width: '100%',
                  marginBottom: 8,
                  cursor: detecting ? 'not-allowed' : 'pointer'
                }}
              />
              <input
                type="text"
                value={confidenceInput}
                onChange={(e) => handleConfidenceInputChange(e.target.value)}
                disabled={detecting}
                placeholder="0.01 - 0.99"
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  fontSize: 13,
                  border: confidenceError ? '1px solid #dc3545' : '1px solid #ccc',
                  borderRadius: 4,
                  background: 'white',
                  cursor: detecting ? 'not-allowed' : 'default'
                }}
              />
              {confidenceError && (
                <div style={{ fontSize: 11, color: '#dc3545', marginTop: 4 }}>
                  {confidenceError}
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
                    onClick={handleIdentifyRooms}
                    disabled={identifyingRooms || !result.detections || result.detections.length === 0}
                    style={{
                      padding: '8px 12px',
                      fontSize: 13,
                      border: 'none',
                      borderRadius: 4,
                      background: identifyingRooms || !result.detections || result.detections.length === 0 ? '#ccc' : '#ffc107',
                      color: identifyingRooms || !result.detections || result.detections.length === 0 ? '#666' : '#000',
                      cursor: identifyingRooms || !result.detections || result.detections.length === 0 ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {identifyingRooms ? 'Identifying...' : 'Identify Rooms with AI'}
                  </button>
                  
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
                  <button
                    onClick={handleDownloadPDF}
                    disabled={!result.annotated_image || !result.detections || result.detections.length === 0}
                    style={{
                      padding: '8px 12px',
                      fontSize: 13,
                      border: 'none',
                      borderRadius: 4,
                      background: (result.annotated_image && result.detections && result.detections.length > 0) ? '#dc3545' : '#ccc',
                      color: 'white',
                      cursor: (result.annotated_image && result.detections && result.detections.length > 0) ? 'pointer' : 'not-allowed',
                      fontWeight: 'bold'
                    }}
                  >
                    📑 Download Report (PDF)
                  </button>
                </div>

                {!hasApiKey && (
                  <div style={{ fontSize: 11, color: '#856404', fontStyle: 'italic', marginTop: 8 }}>
                    💡 OpenAI API key required for AI room identification
                  </div>
                )}
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
                  <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#495057' }}>
                    Detections {Object.keys(roomLabels).length > 0 ? '(with AI Labels)' : ''}:
                  </div>
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
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8f9fa',
                borderRadius: 4,
                padding: 16,
                minHeight: 400,
                overflow: 'auto'
              }}>
                <img
                  src={`file://${selectedImage}`}
                  alt="Selected preview"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
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

      {/* API Key Configuration Dialog */}
      {showApiKeyDialog && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>🔑 OpenAI API Key Required</h3>
            <p style={{ fontSize: 14, color: '#495057', marginBottom: 16 }}>
              To use AI-powered room identification, please enter your OpenAI API key. 
              Your key will be stored locally and never shared.
            </p>
            <div style={{ marginBottom: 16 }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontFamily: 'monospace'
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#6c757d', marginBottom: 16 }}>
              Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>platform.openai.com/api-keys</a>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApiKeyDialog(false)}
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
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  border: 'none',
                  borderRadius: 4,
                  background: apiKeyInput.trim() ? '#28a745' : '#ccc',
                  color: 'white',
                  cursor: apiKeyInput.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

