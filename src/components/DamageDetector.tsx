import React, { useState, useEffect } from 'react'

interface DamageDetectorProps {
  isOpen: boolean
  onClose: () => void
}

interface Detection {
  cls: string
  bbox: number[]
  conf: number
  severity: number
  affected_area_pct: number
}

interface CostEstimate {
  labor_usd: number
  materials_usd: number
  disposal_usd: number
  contingency_usd: number
  total_usd: number
  assumptions: string
}

export default function DamageDetector({ isOpen, onClose }: DamageDetectorProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('default')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; path: string }>>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<{
    detections: Detection[]
    cost_estimate?: CostEstimate | null
    annotated_image?: string | null
    image_width?: number
    image_height?: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<number>(0.2)
  const [confidenceInput, setConfidenceInput] = useState<string>('0.20')
  const [confidenceError, setConfidenceError] = useState<string | null>(null)

  const loadModels = React.useCallback(async () => {
    setLoadingModels(true)
    try {
      const models = await window.clappper.listDamageModels()
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
      const result = await window.clappper.detectDamage(selectedImage, selectedModel, confidence)
      
      if (!result.success) {
        setError(result.error || 'Detection failed')
        return
      }
      
      setResult({
        detections: result.detections || [],
        cost_estimate: result.cost_estimate || null,
        annotated_image: result.annotated_image || null,
        image_width: result.image_width,
        image_height: result.image_height
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
      const originalName = selectedImage?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'detected_damage'
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

  const getSeverityColor = (severity: number) => {
    if (severity < 0.3) return '#10b981' // green
    if (severity < 0.6) return '#f59e0b' // yellow
    return '#ef4444' // red
  }

  const formatClassName = (cls: string) => {
    return cls.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#1e1e1e',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '1200px',
        maxHeight: '90vh',
        width: '90%',
        overflow: 'auto',
        color: '#fff'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>🏠 Damage Detection</h2>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '0 8px'
          }}>×</button>
        </div>

        {/* Model Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Model:
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loadingModels || detecting}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #444',
              backgroundColor: '#2a2a2a',
              color: '#fff'
            }}
          >
            {availableModels.length === 0 ? (
              <option value="default">Default Model</option>
            ) : (
              availableModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))
            )}
          </select>
          {loadingModels && <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Loading models...</p>}
        </div>

        {/* Confidence Threshold */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
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
              marginBottom: '8px',
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
              padding: '8px',
              borderRadius: '4px',
              border: confidenceError ? '1px solid #ef4444' : '1px solid #444',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              cursor: detecting ? 'not-allowed' : 'default'
            }}
          />
          {confidenceError && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', marginBottom: 0 }}>
              {confidenceError}
            </p>
          )}
        </div>

        {/* Image Selector */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={handleSelectImage}
            disabled={detecting}
            style={{
              padding: '10px 20px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#0066cc',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            📸 Select Image
          </button>
          {selectedImage && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#888' }}>
              Selected: {selectedImage.split(/[/\\]/).pop()}
            </p>
          )}
        </div>

        {/* Detect Button */}
        {selectedImage && (
          <button
            onClick={handleDetect}
            disabled={detecting}
            style={{
              padding: '10px 20px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: detecting ? '#666' : '#10b981',
              color: '#fff',
              cursor: detecting ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              marginBottom: '20px'
            }}
          >
            {detecting ? '🔍 Detecting...' : '🔍 Detect Damage'}
          </button>
        )}

        {/* Image Preview / Annotated Image */}
        {selectedImage && (
          <div style={{ marginBottom: '20px' }}>
            {result?.annotated_image ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0 }}>Annotated Image:</h4>
                  <button
                    onClick={handleDownloadImage}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: '#0066cc',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    💾 Download
                  </button>
                </div>
                <img
                  src={`data:image/png;base64,${result.annotated_image}`}
                  alt="Annotated"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '500px',
                    borderRadius: '4px',
                    border: '1px solid #444'
                  }}
                />
              </div>
            ) : (
              <img
                src={`file://${selectedImage}`}
                alt="Selected preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  borderRadius: '4px',
                  border: '1px solid #444'
                }}
              />
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#ef4444',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            <h3 style={{ marginBottom: '16px' }}>📊 Detection Results</h3>

            {/* Detections List */}
            {result.detections.length > 0 ? (
              <div style={{ marginBottom: '20px' }}>
                <h4>Found {result.detections.length} damage area{result.detections.length !== 1 ? 's' : ''}:</h4>
                {result.detections.map((det, i) => (
                  <div key={i} style={{
                    padding: '12px',
                    margin: '8px 0',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    backgroundColor: '#2a2a2a'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <div
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: getSeverityColor(det.severity),
                          marginRight: '8px'
                        }}
                      />
                      <strong style={{ fontSize: '16px' }}>{formatClassName(det.cls)}</strong>
                      <span style={{ marginLeft: '12px', color: '#888', fontSize: '14px' }}>
                        Confidence: {(det.conf * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', color: '#bbb' }}>
                      Severity: {(det.severity * 100).toFixed(1)}% ({det.affected_area_pct.toFixed(1)}% of image)
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#10b981', marginBottom: '20px' }}>✅ No damage detected!</p>
            )}

            {/* Cost Estimate */}
            {result.cost_estimate && result.detections.length > 0 && (
              <div style={{
                padding: '16px',
                backgroundColor: '#2a2a2a',
                borderRadius: '4px',
                border: '1px solid #444'
              }}>
                <h4 style={{ marginTop: 0, marginBottom: '16px' }}>💰 Cost Estimate</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444' }}>Labor:</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444', textAlign: 'right' }}>
                        ${result.cost_estimate.labor_usd.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444' }}>Materials:</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444', textAlign: 'right' }}>
                        ${result.cost_estimate.materials_usd.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444' }}>Disposal:</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444', textAlign: 'right' }}>
                        ${result.cost_estimate.disposal_usd.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444' }}>Contingency:</td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #444', textAlign: 'right' }}>
                        ${result.cost_estimate.contingency_usd.toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ fontWeight: 'bold', fontSize: '16px' }}>
                      <td style={{ padding: '12px 0 8px 0', borderTop: '2px solid #fff' }}>Total:</td>
                      <td style={{ padding: '12px 0 8px 0', borderTop: '2px solid #fff', textAlign: 'right' }}>
                        ${result.cost_estimate.total_usd.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '12px', marginBottom: 0 }}>
                  {result.cost_estimate.assumptions}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

