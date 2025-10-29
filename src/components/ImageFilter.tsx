import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'

interface ImageFilterProps {
  isOpen: boolean
  onClose: () => void
  initialSourceDir?: string
}

interface HistoryEntry {
  imagePath: string
  badPath: string
}

export default function ImageFilter({ isOpen, onClose, initialSourceDir }: ImageFilterProps) {
  const [step, setStep] = useState<'setup' | 'filtering'>('setup')
  const [sourceDir, setSourceDir] = useState(initialSourceDir || '')
  const [destDir, setDestDir] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [currentFolderIndex, setCurrentFolderIndex] = useState(0)
  const [images, setImages] = useState<string[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  const { setFilteringProgress, getFilteringProgress } = useStore()
  const imageRef = useRef<HTMLImageElement>(null)

  // Load folders when source directory is set
  useEffect(() => {
    if (step === 'filtering' && sourceDir) {
      loadFolders()
    }
  }, [step, sourceDir])

  // Load images when folder changes
  useEffect(() => {
    if (step === 'filtering' && folders.length > 0 && currentFolderIndex < folders.length) {
      loadImages(folders[currentFolderIndex])
    }
  }, [currentFolderIndex, folders, step])

  // Keyboard shortcuts
  useEffect(() => {
    if (step !== 'filtering' || !isOpen) return

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key.toLowerCase()) {
        case 'k':
          await handleKeep()
          break
        case 'd':
          await handleDelete()
          break
        case 'u':
          await handleUndo()
          break
        case 'escape':
          handleExit()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step, isOpen, currentImageIndex, images, folders, currentFolderIndex, history])

  const loadFolders = async () => {
    try {
      setIsLoading(true)
      const folderList = await window.clappper.filterListFolders(sourceDir)
      setFolders(folderList)
      
      // Check for saved progress
      if (folderList.length > 0) {
        const progress = getFilteringProgress(sourceDir)
        if (progress) {
          const folderIndex = folderList.indexOf(progress.currentFolder)
          if (folderIndex >= 0) {
            setCurrentFolderIndex(folderIndex)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load folders:', err)
      alert('Failed to load folders. Please check the directory path.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadImages = async (folderPath: string) => {
    try {
      setIsLoading(true)
      const imageList = await window.clappper.filterGetImages(folderPath)
      setImages(imageList)
      
      // Check for saved progress
      const progress = getFilteringProgress(sourceDir)
      if (progress && progress.currentFolder === folderPath && progress.lastFile) {
        const imageIndex = imageList.findIndex(img => img.endsWith(progress.lastFile))
        if (imageIndex >= 0) {
          setCurrentImageIndex(imageIndex + 1) // Start after last processed
        } else {
          setCurrentImageIndex(0)
        }
      } else {
        setCurrentImageIndex(0)
      }
      
      setHistory([]) // Clear history when changing folders
    } catch (err) {
      console.error('Failed to load images:', err)
      alert('Failed to load images from folder.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeep = async () => {
    if (currentImageIndex >= images.length) return
    
    const currentImage = images[currentImageIndex]
    console.log(`✅ Kept: ${currentImage}`)
    
    // Save progress
    const folderPath = folders[currentFolderIndex]
    const fileName = currentImage.split(/[/\\]/).pop() || ''
    setFilteringProgress(sourceDir, {
      currentFolder: folderPath,
      currentIndex: currentImageIndex,
      lastFile: fileName
    })
    
    // Move to next image
    await advanceToNext()
  }

  const handleDelete = async () => {
    if (currentImageIndex >= images.length) return
    
    const currentImage = images[currentImageIndex]
    const folderPath = folders[currentFolderIndex]
    
    try {
      const badPath = await window.clappper.filterMoveToBad(currentImage, folderPath)
      console.log(`🗑️ Deleted: ${currentImage} -> ${badPath}`)
      
      // Add to history for undo
      setHistory(prev => [...prev.slice(-49), { imagePath: currentImage, badPath }])
      
      // Save progress
      const fileName = currentImage.split(/[/\\]/).pop() || ''
      setFilteringProgress(sourceDir, {
        currentFolder: folderPath,
        currentIndex: currentImageIndex,
        lastFile: fileName
      })
      
      // Remove from images list
      setImages(prev => prev.filter((_, idx) => idx !== currentImageIndex))
      
      // Don't advance index since we removed an item
    } catch (err) {
      console.error('Failed to delete image:', err)
      alert('Failed to delete image.')
    }
  }

  const handleUndo = async () => {
    if (history.length === 0) {
      console.log('⚠️ Nothing to undo')
      return
    }
    
    const lastEntry = history[history.length - 1]
    
    try {
      await window.clappper.filterRestoreImage(lastEntry.badPath, lastEntry.imagePath)
      console.log(`↩️ Restored: ${lastEntry.imagePath}`)
      
      // Remove from history
      setHistory(prev => prev.slice(0, -1))
      
      // Re-add to images list at current position
      setImages(prev => {
        const newImages = [...prev]
        newImages.splice(currentImageIndex, 0, lastEntry.imagePath)
        return newImages
      })
    } catch (err) {
      console.error('Failed to restore image:', err)
      alert('Failed to restore image.')
    }
  }

  const advanceToNext = async () => {
    if (currentImageIndex + 1 >= images.length) {
      // Finished this folder
      await handleFolderComplete()
    } else {
      setCurrentImageIndex(prev => prev + 1)
    }
  }

  const handleFolderComplete = async () => {
    const folderPath = folders[currentFolderIndex]
    
    if (destDir) {
      // Move completed folder to destination
      try {
        await window.clappper.filterMoveFolder(folderPath, destDir)
        console.log(`✅ Moved completed folder to: ${destDir}`)
      } catch (err) {
        console.error('Failed to move folder:', err)
        alert('Failed to move completed folder to destination.')
      }
    }
    
    // Move to next folder
    if (currentFolderIndex + 1 < folders.length) {
      setCurrentFolderIndex(prev => prev + 1)
    } else {
      // All folders complete!
      alert('🎉 All folders have been filtered!')
      handleExit()
    }
  }

  const handleExit = () => {
    if (confirm('Exit filtering mode? Progress has been saved.')) {
      setStep('setup')
      setCurrentImageIndex(0)
      setCurrentFolderIndex(0)
      setImages([])
      setFolders([])
      setHistory([])
      onClose()
    }
  }

  const handleStart = async () => {
    if (!sourceDir) {
      alert('Please select a source directory')
      return
    }
    
    setStep('filtering')
  }

  const selectSourceDir = async () => {
    const dir = await window.clappper.selectDirectory()
    if (dir) {
      setSourceDir(dir)
    }
  }

  const selectDestDir = async () => {
    const dir = await window.clappper.selectDirectory()
    if (dir) {
      setDestDir(dir)
    }
  }

  if (!isOpen) return null

  const currentImage = images[currentImageIndex]
  const currentFolder = folders[currentFolderIndex]
  const progress = images.length > 0 ? ((currentImageIndex + 1) / images.length * 100).toFixed(1) : 0
  const fileName = currentImage ? currentImage.split(/[/\\]/).pop() : ''

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.95)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      {step === 'setup' ? (
        <div style={{
          background: 'white',
          borderRadius: 8,
          padding: 32,
          maxWidth: 600,
          width: '90%'
        }}>
          <h2 style={{ margin: '0 0 24px 0', fontSize: 24, fontWeight: 'bold' }}>
            Image Filtering Setup
          </h2>
          
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
              Source Directory *
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={sourceDir}
                onChange={(e) => setSourceDir(e.target.value)}
                placeholder="Select folder containing image folders..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4
                }}
              />
              <button
                onClick={selectSourceDir}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Browse
              </button>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#666' }}>
              Directory containing folders of images to filter
            </p>
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
              Destination Directory (Optional)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={destDir}
                onChange={(e) => setDestDir(e.target.value)}
                placeholder="Where to move completed folders..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: 14,
                  border: '1px solid #ccc',
                  borderRadius: 4
                }}
              />
              <button
                onClick={selectDestDir}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Browse
              </button>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#666' }}>
              Completed folders will be moved here (leave empty to keep in place)
            </p>
          </div>

          <div style={{
            background: '#f8f9fa',
            padding: 16,
            borderRadius: 4,
            marginBottom: 24
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 'bold' }}>
              Keyboard Shortcuts
            </h3>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8 }}>
              <div><strong>K</strong> - Keep image and continue</div>
              <div><strong>D</strong> - Delete image (move to bad_images)</div>
              <div><strong>U</strong> - Undo last delete</div>
              <div><strong>ESC</strong> - Exit filtering mode</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                background: '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={!sourceDir}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                background: sourceDir ? '#27ae60' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: sourceDir ? 'pointer' : 'not-allowed',
                fontWeight: 'bold'
              }}
            >
              Start Filtering
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          {/* Header */}
          <div style={{
            position: 'absolute',
            top: 20,
            left: 20,
            right: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white'
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
                Folder {currentFolderIndex + 1} of {folders.length}
              </div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>
                {currentFolder}
              </div>
            </div>
            <button
              onClick={handleExit}
              style={{
                padding: '8px 16px',
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              ESC - Exit
            </button>
          </div>

          {/* Image Display */}
          {isLoading ? (
            <div style={{ color: 'white', fontSize: 18 }}>Loading...</div>
          ) : currentImage ? (
            <div style={{
              width: '90%',
              height: '70%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                ref={imageRef}
                src={`file://${currentImage}`}
                alt="Current"
                style={{
                  minWidth: '400px',
                  minHeight: '400px',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  imageRendering: 'pixelated', // Crisp scaling for small images
                  borderRadius: 4,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}
              />
            </div>
          ) : (
            <div style={{ color: 'white', fontSize: 18 }}>
              No more images in this folder
            </div>
          )}

          {/* Footer */}
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            color: 'white'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12
            }}>
              <div style={{ fontSize: 16 }}>
                Image {currentImageIndex + 1} of {images.length} ({progress}%)
              </div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>
                {fileName}
              </div>
            </div>

            {/* Progress Bar */}
            <div style={{
              width: '100%',
              height: 8,
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 16
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: '#27ae60',
                transition: 'width 0.3s ease'
              }} />
            </div>

            {/* Controls */}
            <div style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center'
            }}>
              <button
                onClick={handleKeep}
                disabled={!currentImage}
                style={{
                  padding: '12px 32px',
                  fontSize: 16,
                  background: currentImage ? '#27ae60' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: currentImage ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                K - Keep
              </button>
              <button
                onClick={handleDelete}
                disabled={!currentImage}
                style={{
                  padding: '12px 32px',
                  fontSize: 16,
                  background: currentImage ? '#e74c3c' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: currentImage ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                D - Delete
              </button>
              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                style={{
                  padding: '12px 32px',
                  fontSize: 16,
                  background: history.length > 0 ? '#f39c12' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: history.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                U - Undo ({history.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

