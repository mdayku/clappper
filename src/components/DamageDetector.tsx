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
  const [estimatingCost, setEstimatingCost] = useState(false)
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [usageStats, setUsageStats] = useState<{
    total_calls: number
    total_tokens: number
    remainingCalls: number
  } | null>(null)
  const [zipCode, setZipCode] = useState<string>('')
  const [zipCodeError, setZipCodeError] = useState<string | null>(null)
  const [searchingContractors, setSearchingContractors] = useState(false)
  const [contractors, setContractors] = useState<Array<{
    name: string
    rating: number
    review_count: number
    phone: string
    distance: number
    url: string
  }> | null>(null)

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

  // Load usage stats
  const loadUsageStats = React.useCallback(async () => {
    try {
      const stats = await window.clappper.getUsageStats()
      setUsageStats({
        total_calls: stats.usage.total_calls,
        total_tokens: stats.usage.total_tokens,
        remainingCalls: stats.rate_limit.remainingCalls
      })
    } catch (err) {
      console.error('Failed to load usage stats:', err)
    }
  }, [])

  // Check for API key on mount
  useEffect(() => {
    if (isOpen) {
      window.clappper.getOpenAIKey().then((key: string | null) => {
        setHasApiKey(!!key)
        if (key) setApiKeyInput(key)
      }).catch(() => setHasApiKey(false))
      
      loadUsageStats()
    }
  }, [isOpen, loadUsageStats])

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

  const handleEstimateCost = async () => {
    if (!selectedImage || !result) return
    
    // Check if API key is set
    if (!hasApiKey) {
      setShowApiKeyDialog(true)
      return
    }
    
    setEstimatingCost(true)
    setError(null)
    
    try {
      const costResult = await window.clappper.estimateDamageCost(selectedImage, result.detections)
      
      if (!costResult.success) {
        setError(costResult.error || 'Cost estimation failed')
        if (costResult.error?.includes('API key')) {
          setShowApiKeyDialog(true)
        }
        return
      }
      
      // Update result with new cost estimate
      setResult({
        ...result,
        cost_estimate: costResult.cost_estimate
      })
      
      // Refresh usage stats after successful call
      await loadUsageStats()
    } catch (err) {
      setError(`Cost estimation failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setEstimatingCost(false)
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

  const handleZipCodeChange = (value: string) => {
    // Allow only digits and limit to 5 characters
    const cleaned = value.replace(/\D/g, '').slice(0, 5)
    setZipCode(cleaned)
    
    if (cleaned.length > 0 && cleaned.length < 5) {
      setZipCodeError('Zip code must be 5 digits')
    } else {
      setZipCodeError(null)
    }
  }

  const handleFindContractors = async () => {
    if (zipCode.length !== 5) {
      setZipCodeError('Please enter a valid 5-digit zip code')
      return
    }
    
    setSearchingContractors(true)
    setError(null)
    setContractors(null)
    
    try {
      const result = await window.clappper.findContractors(zipCode, 'roofing')
      
      if (!result.success) {
        setError(result.error || 'Failed to find contractors')
        return
      }
      
      setContractors(result.contractors || [])
    } catch (err) {
      setError(`Contractor search failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSearchingContractors(false)
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
    // Always show "Roof Damage" regardless of actual class
    return 'Roof Damage'
  }

  if (!isOpen) return null

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
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>🏚️ Damage Detection</h2>
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
              {detecting ? 'Detecting...' : 'Detect Damage'}
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

            {result && result.detections.length > 0 && (
              <>
                <div style={{
                  padding: 8,
                  background: '#d4edda',
                  border: '1px solid #c3e6cb',
                  borderRadius: 4,
                  color: '#155724',
                  fontSize: 12
                }}>
                  Found {result.detections.length} damage area{result.detections.length !== 1 ? 's' : ''}
                </div>
                
                {/* Estimate Cost Button */}
                <button
                  onClick={handleEstimateCost}
                  disabled={estimatingCost}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    border: 'none',
                    borderRadius: 4,
                    background: estimatingCost ? '#ccc' : '#ffc107',
                    color: estimatingCost ? '#666' : '#000',
                    cursor: estimatingCost ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {estimatingCost ? 'Estimating...' : 'Estimate Repair Cost with GPT-4 Vision (AI)'}
                </button>

                {!hasApiKey && (
                  <div style={{ fontSize: 11, color: '#856404', fontStyle: 'italic' }}>
                    💡 OpenAI API key required
                  </div>
                )}

                {/* Usage Stats */}
                {hasApiKey && usageStats && (
                  <div style={{
                    fontSize: 10,
                    color: '#6c757d',
                    padding: '6px 8px',
                    background: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: 4
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 2 }}>📊 API Usage</div>
                    <div>Total calls: {usageStats.total_calls} | Tokens: {usageStats.total_tokens.toLocaleString()}</div>
                    <div style={{ color: usageStats.remainingCalls <= 3 ? '#dc3545' : '#28a745' }}>
                      Rate limit: {usageStats.remainingCalls}/10 calls remaining
                    </div>
                  </div>
                )}
                
                {/* Download Button */}
                {result.annotated_image && (
                  <button
                    onClick={handleDownloadImage}
                    style={{
                      padding: '8px 12px',
                      fontSize: 13,
                      border: 'none',
                      borderRadius: 4,
                      background: '#007bff',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    📥 Download Image
                  </button>
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
                    alt="Detected damage"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                </div>

                {/* Detections List */}
                <div style={{
                  padding: 12,
                  background: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  maxHeight: 300,
                  overflow: 'auto'
                }}>
                  <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#495057' }}>Detections:</div>
                  {result.detections.map((det, i) => (
                    <div key={i} style={{
                      padding: '8px',
                      margin: '4px 0',
                      border: '1px solid #dee2e6',
                      borderRadius: 4,
                      backgroundColor: '#ffffff'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: getSeverityColor(det.severity),
                            marginRight: '6px'
                          }}
                        />
                        <strong style={{ fontSize: '13px', color: '#495057' }}>{formatClassName(det.cls)}</strong>
                        <span style={{ marginLeft: '8px', color: '#6c757d', fontSize: '11px' }}>
                          {(det.conf * 100).toFixed(1)}% conf
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#6c757d', paddingLeft: '14px' }}>
                        Severity: {(det.severity * 100).toFixed(1)}% • Area: {det.affected_area_pct.toFixed(2)}%
                      </div>
                    </div>
                  ))}

                  {/* Cost Estimate */}
                  {result.cost_estimate && (
                    <div style={{
                      marginTop: 8,
                      padding: 8,
                      background: result.cost_estimate.assumptions.includes('GPT') || result.cost_estimate.assumptions.includes('contractor') ? '#d4edda' : '#fff3cd',
                      border: result.cost_estimate.assumptions.includes('GPT') || result.cost_estimate.assumptions.includes('contractor') ? '1px solid #c3e6cb' : '1px solid #ffc107',
                      borderRadius: 4
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 4, color: result.cost_estimate.assumptions.includes('GPT') || result.cost_estimate.assumptions.includes('contractor') ? '#155724' : '#856404', fontSize: 11 }}>
                        💰 Cost Estimate {result.cost_estimate.assumptions.includes('GPT') || result.cost_estimate.assumptions.includes('contractor') ? '(AI-Generated)' : '(Demo)'}
                      </div>
                      <div style={{ fontSize: 11, color: '#495057' }}>
                        <div>Labor: ${result.cost_estimate.labor_usd.toFixed(2)}</div>
                        <div>Materials: ${result.cost_estimate.materials_usd.toFixed(2)}</div>
                        <div>Disposal: ${result.cost_estimate.disposal_usd.toFixed(2)}</div>
                        <div>Contingency: ${result.cost_estimate.contingency_usd.toFixed(2)}</div>
                        <div style={{ fontWeight: 'bold', marginTop: 4, paddingTop: 4, borderTop: '1px solid ' + (result.cost_estimate.assumptions.includes('GPT') || result.cost_estimate.assumptions.includes('contractor') ? '#c3e6cb' : '#ffc107') }}>
                          Total: ${result.cost_estimate.total_usd.toFixed(2)}
                        </div>
                        <div style={{ 
                          fontSize: 9, 
                          color: '#6c757d', 
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: '1px dashed ' + (result.cost_estimate.assumptions.includes('GPT') || result.cost_estimate.assumptions.includes('contractor') ? '#c3e6cb' : '#ffc107'),
                          fontStyle: 'italic'
                        }}>
                          {result.cost_estimate.assumptions}
                        </div>
                      </div>

                      {/* Contractor Search */}
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #dee2e6' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 6, fontSize: 11 }}>
                          Find Local Roofing Contractors
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input
                            type="text"
                            value={zipCode}
                            onChange={(e) => handleZipCodeChange(e.target.value)}
                            placeholder="Zip Code"
                            maxLength={5}
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              fontSize: 12,
                              border: zipCodeError ? '1px solid #dc3545' : '1px solid #ced4da',
                              borderRadius: 4
                            }}
                          />
                          <button
                            onClick={handleFindContractors}
                            disabled={searchingContractors || zipCode.length !== 5}
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              border: 'none',
                              borderRadius: 4,
                              background: searchingContractors || zipCode.length !== 5 ? '#ccc' : '#007bff',
                              color: 'white',
                              cursor: searchingContractors || zipCode.length !== 5 ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {searchingContractors ? 'Searching...' : 'Search'}
                          </button>
                        </div>
                        {zipCodeError && zipCode.length > 0 && (
                          <div style={{ fontSize: 10, color: '#dc3545', marginTop: 4 }}>
                            {zipCodeError}
                          </div>
                        )}
                      </div>

                      {/* Contractor Results */}
                      {contractors && contractors.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          {contractors.map((contractor, idx) => (
                            <div key={idx} style={{
                              padding: 8,
                              background: '#f8f9fa',
                              border: '1px solid #dee2e6',
                              borderRadius: 4,
                              marginBottom: 6,
                              fontSize: 11
                            }}>
                              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{contractor.name}</div>
                              <div style={{ color: '#6c757d' }}>
                                ⭐ {contractor.rating} ({contractor.review_count} reviews) • {contractor.distance.toFixed(1)} mi
                              </div>
                              {contractor.phone && (
                                <div style={{ marginTop: 4 }}>
                                  📞 <a href={`tel:${contractor.phone}`} style={{ color: '#007bff' }}>{contractor.phone}</a>
                                </div>
                              )}
                              <a href={contractor.url} target="_blank" rel="noopener noreferrer" style={{ 
                                fontSize: 10, 
                                color: '#007bff',
                                marginTop: 4,
                                display: 'inline-block'
                              }}>
                                View on Yelp →
                              </a>
                            </div>
                          ))}
                        </div>
                      )}

                      {contractors && contractors.length === 0 && (
                        <div style={{ 
                          marginTop: 8, 
                          padding: 8, 
                          background: '#fff3cd', 
                          border: '1px solid #ffc107',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#856404'
                        }}>
                          No roofing contractors found in this area. Try a different zip code.
                        </div>
                      )}
                    </div>
                  )}
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
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🏚️</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                    Select a Roof Image
                  </div>
                  <div style={{ fontSize: 14 }}>
                    Choose a PNG or JPG image to detect damage
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
              To use AI-powered cost estimation, please enter your OpenAI API key. 
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

