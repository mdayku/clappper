const { app, BrowserWindow, ipcMain, dialog, protocol, Menu, desktopCapturer } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const ffmpeg = require('fluent-ffmpeg')

// Suppress Chromium's verbose WGC (Windows Graphics Capture) errors in production
if (app.isPackaged) {
  app.commandLine.appendSwitch('disable-logging')
  app.commandLine.appendSwitch('log-level', '3') // Only show fatal errors
}

// Determine ffmpeg path based on whether app is packaged
const getFfmpegPath = () => {
  if (app.isPackaged) {
    // In production, ffmpeg is in resources/ffmpeg/
    const resourcesPath = (process as any).resourcesPath
    return path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe')
  } else {
    // In development, use ffmpeg-static from node_modules
    return require('ffmpeg-static')
  }
}

// Determine Real-ESRGAN path based on whether app is packaged
const getRealesrganPath = () => {
  if (app.isPackaged) {
    // In production, Real-ESRGAN is in resources/realesrgan/
    const resourcesPath = (process as any).resourcesPath
    return path.join(resourcesPath, 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
  } else {
    // In development, Real-ESRGAN is in project root resources/realesrgan/
    return path.join(__dirname, '..', 'resources', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
  }
}

ffmpeg.setFfmpegPath(getFfmpegPath())

// Track current export/enhancement commands for cancellation
let currentExportCommand: any = null
let currentEnhanceCommand: any = null

// Cancel export handler
ipcMain.handle('export:cancel', async () => {
  if (currentExportCommand) {
    currentExportCommand.kill('SIGKILL')
    currentExportCommand = null
    return { ok: true, cancelled: true }
  }
  return { ok: false, message: 'No export in progress' }
})

// Cancel enhancement handler
ipcMain.handle('ai:enhance:cancel', async () => {
  if (currentEnhanceCommand) {
    currentEnhanceCommand.kill('SIGKILL')
    currentEnhanceCommand = null
    return { ok: true, cancelled: true }
  }
  return { ok: false, message: 'No enhancement in progress' }
})

// GPU detection handler
ipcMain.handle('ai:detect-gpu', async () => {
  try {
    // Try to detect NVIDIA GPU using nvidia-smi
    const result = await new Promise<string>((resolve, reject) => {
      const process = spawn('nvidia-smi', [
        '--query-gpu=name,memory.total',
        '--format=csv,noheader'
      ])
      
      let output = ''
      process.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim())
        } else {
          reject(new Error('nvidia-smi not found'))
        }
      })
      
      process.on('error', () => {
        reject(new Error('nvidia-smi not available'))
      })
    })
    
    // Parse nvidia-smi output
    const [name, vram] = result.split(',').map(s => s.trim())
    
    // Estimate frames per second based on GPU
    let estimatedFps = 0.3 // Default conservative estimate
    
    if (name.includes('RTX 4090')) estimatedFps = 1.5
    else if (name.includes('RTX 4080')) estimatedFps = 1.2
    else if (name.includes('RTX 4070')) estimatedFps = 0.8
    else if (name.includes('RTX 4060')) estimatedFps = 0.5
    else if (name.includes('RTX 3090')) estimatedFps = 1.0
    else if (name.includes('RTX 3080')) estimatedFps = 0.9
    else if (name.includes('RTX 3070')) estimatedFps = 0.7
    else if (name.includes('RTX 3060')) estimatedFps = 0.4
    else if (name.includes('RTX')) estimatedFps = 0.5
    else if (name.includes('GTX')) estimatedFps = 0.2
    
    return {
      detected: true,
      name,
      vram,
      estimatedFps
    }
  } catch (err) {
    // GPU detection failed, return defaults
    return {
      detected: false,
      name: 'Unknown GPU',
      vram: 'Unknown',
      estimatedFps: 0.3 // Conservative default
    }
  }
})

// Project save/load handlers
ipcMain.handle('project:save', async (_e: any, args: { filePath: string; state: any }) => {
  const { filePath, state } = args
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
    return { ok: true }
  } catch (err) {
    console.error('Save project failed:', err)
    throw err
  }
})

ipcMain.handle('project:load', async (_e: any, filePath: string) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8')
    return { ok: true, state: JSON.parse(data) }
  } catch (err) {
    console.error('Load project failed:', err)
    throw err
  }
})

ipcMain.handle('project:autosave-path', async () => {
  const autosavePath = path.join(app.getPath('userData'), 'autosave.json')
  return autosavePath
})

ipcMain.handle('project:check-autosave', async () => {
  const autosavePath = path.join(app.getPath('userData'), 'autosave.json')
  try {
    await fs.promises.access(autosavePath)
    return { exists: true, path: autosavePath }
  } catch {
    return { exists: false }
  }
})

// Screen recording handlers
ipcMain.handle('screen:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 150, height: 150 },
    fetchWindowIcons: true
  })
  
  // Include ALL sources, including the Clappper window itself
  // This allows recording the app for demo purposes
  return sources.map((source: any) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }))
})

ipcMain.handle('screen:save-recording', async (_e: any, args: { filePath: string; base64Data: string }) => {
  const { filePath, base64Data } = args
  try {
    // Remove data URL prefix (data:video/webm;base64,)
    const base64 = base64Data.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')
    
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, buffer)
    
    return { ok: true }
  } catch (err) {
    console.error('Save recording failed:', err)
    throw err
  }
})

// Helper functions for export quality settings
const getResolutionFilter = (resolution: string): string | null => {
  switch (resolution) {
    case '360p': return 'scale=-2:360,format=yuv420p'
    case '480p': return 'scale=-2:480,format=yuv420p'
    case '720p': return 'scale=-2:720,format=yuv420p'
    case '1080p': return 'scale=-2:1080,format=yuv420p'
    case 'source': return 'format=yuv420p' // Still normalize pixel format
    default: return 'format=yuv420p'
  }
}

const getPresetOptions = (preset: string): { preset: string; crf: number } => {
  switch (preset) {
    case 'fast': return { preset: 'veryfast', crf: 28 }
    case 'medium': return { preset: 'medium', crf: 23 }
    case 'slow': return { preset: 'slow', crf: 20 }
    default: return { preset: 'medium', crf: 23 }
  }
}

let win: typeof BrowserWindow.prototype | null = null

// Register custom protocols for serving local files
app.whenReady().then(() => {
  protocol.registerFileProtocol('media', (request: any, callback: any) => {
    const url = request.url.substring('media://'.length)
    const decodedPath = decodeURIComponent(url)
    callback({ path: decodedPath })
  })
  
  protocol.registerFileProtocol('thumb', (request: any, callback: any) => {
    const url = request.url.substring('thumb://'.length)
    const decodedPath = decodeURIComponent(url)
    callback({ path: decodedPath })
  })
})

const createWindow = async () => {
  const isDev = !app.isPackaged
  
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev  // Disable webSecurity ONLY in dev mode for local file access
    }
  })
  
  // Set CSP - in dev mode, remove restrictive CSP from Vite
  win.webContents.session.webRequest.onHeadersReceived((details: any, callback: any) => {
    const responseHeaders = { ...details.responseHeaders }
    
    if (isDev) {
      // In dev mode, completely remove CSP to avoid conflicts with Vite
      delete responseHeaders['Content-Security-Policy']
      delete responseHeaders['content-security-policy']
    } else {
      // In production, set a permissive CSP that allows data: URLs
      responseHeaders['Content-Security-Policy'] = [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' blob: file: app: media: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
      ]
    }
    
    callback({ responseHeaders })
  })
  
  // Allow media:// and thumb:// protocols in the renderer
  win.webContents.session.protocol.registerFileProtocol('media', (request: any, callback: any) => {
    const url = request.url.substring('media://'.length)
    const decodedPath = decodeURIComponent(url)
    callback({ path: decodedPath })
  })
  
  win.webContents.session.protocol.registerFileProtocol('thumb', (request: any, callback: any) => {
    const url = request.url.substring('thumb://'.length)
    const decodedPath = decodeURIComponent(url)
    callback({ path: decodedPath })
  })

  // In dev mode, connect to Vite server (check multiple ports)
  if (isDev) {
    // Try common Vite ports
    const ports = [5173, 5174, 5175, 5176, 5177]
    let loaded = false
    for (const port of ports) {
      try {
        await win.loadURL(`http://localhost:${port}`)
        loaded = true
        console.log(`Loaded from Vite dev server on port ${port}`)
        break
      } catch (err) {
        // Try next port
      }
    }
    if (!loaded) {
      console.error('Could not connect to Vite dev server')
    }
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  
  // Open DevTools in development
  if (isDev) {
    win.webContents.openDevTools()
  }
  
  // Create application menu
  const menuTemplate: any = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Project...',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            win?.webContents.send('menu:save-project')
          }
        },
        {
          label: 'Load Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            win?.webContents.send('menu:load-project')
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  
  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

ipcMain.handle('dialog:openFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] }]
  })
  return canceled ? [] : filePaths
})

ipcMain.handle('dialog:savePath', async (_e: any, defaultName: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    defaultPath: defaultName,
    filters: [{ name: 'Video', extensions: ['mp4'] }]
  })
  return canceled ? null : filePath
})

ipcMain.handle('dialog:selectDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory', 'createDirectory']
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('ffprobe:metadata', async (_e: any, filePath: string) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: any, data: any) => {
      if (err) reject(err)
      else resolve({
        format: { duration: data.format.duration, size: data.format.size, format_name: data.format.format_name },
        streams: data.streams.map((s: any) => ({ codec_type: s.codec_type, codec_name: s.codec_name, width: s.width, height: s.height }))
      })
    })
  })
})

// Generate thumbnail for a clip at a specific timestamp
ipcMain.handle('thumbnail:generate', async (_e: any, args: { input: string; timestamp: number; clipId: string }) => {
  const { input, timestamp, clipId } = args
  
  // Create cache directory if it doesn't exist
  const cacheDir = path.join(app.getPath('userData'), 'thumbs')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  
  // Generate cache filename
  const thumbFilename = `${clipId}-${timestamp.toFixed(2)}.jpg`
  const thumbPath = path.join(cacheDir, thumbFilename)
  
  // Check if thumbnail already exists in cache
  if (fs.existsSync(thumbPath)) {
    return thumbPath
  }
  
  // Generate thumbnail using ffmpeg
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .seekInput(timestamp)
      .frames(1)
      .videoFilters('scale=160:-1')
      .output(thumbPath)
      .on('end', () => resolve(thumbPath))
      .on('error', (err: any) => reject(err))
      .run()
  })
})

ipcMain.handle('transcode:h264', async (_e: any, args: { input: string; output: string }) => {
  const { input, output } = args
  await fs.promises.mkdir(path.dirname(output), { recursive: true })
  
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        '-c:v libx264',      // H.264 codec (universally supported)
        '-preset fast',       // Faster encoding
        '-crf 23',           // Good quality
        '-c:a aac',          // AAC audio
        '-b:a 128k',         // Audio bitrate
        '-movflags +faststart' // Enable streaming/seeking
      ])
      .output(output)
      .on('progress', (p: any) => {
        if (win) win.webContents.send('transcode:progress', p.percent || 0)
      })
      .on('end', () => resolve({ ok: true, output }))
      .on('error', (err: any) => reject(err))
      .run()
  })
})

ipcMain.handle('export:trim', async (_e: any, args: { input: string; outPath: string; start: number; end: number; resolution?: string; preset?: string }) => {
  const { input, outPath, start, end, resolution = '1080p', preset = 'medium' } = args
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  
  const resFilter = getResolutionFilter(resolution)
  const { preset: ffmpegPreset, crf } = getPresetOptions(preset)
  
  console.log('=== Trim Export ===')
  console.log('Input:', input)
  console.log('Trim:', start, 'to', end, `(${(end - start).toFixed(2)}s)`)
  console.log('Resolution:', resolution, '| Preset:', preset)
  console.log('Output:', outPath)
  console.log('===================')
  
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(input)
      .setStartTime(start)
      .setDuration(Math.max(0, end - start))
      .videoFilters(resFilter) // Always apply filter (includes format normalization)
      .outputOptions([
        `-c:v libx264`,
        `-preset ${ffmpegPreset}`,
        `-crf ${crf}`,
        `-c:a aac`,
        `-b:a 128k`,
        `-movflags +faststart`
      ])
      .output(outPath)
      .on('progress', (p: any) => { 
        if (win) {
          const progress = Math.min(100, Math.max(0, p.percent || 0))
          win.webContents.send('export:progress', progress)
        }
      })
      .on('end', () => {
        currentExportCommand = null
        resolve({ ok: true, outPath })
      })
      .on('error', (err: any) => {
        currentExportCommand = null
        reject(err)
      })
    
    currentExportCommand = cmd
    cmd.run()
  })
})

ipcMain.handle('export:concat', async (_e: any, args: { clips: Array<{input: string; start: number; end: number}>; outPath: string; resolution?: string; preset?: string }) => {
  const { clips: clipSegments, outPath, resolution = '1080p', preset = 'medium' } = args
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  
  const resFilter = getResolutionFilter(resolution)
  const { preset: ffmpegPreset, crf } = getPresetOptions(preset)
  
  console.log('=== Concat Export ===')
  console.log(`Concatenating ${clipSegments.length} clips`)
  clipSegments.forEach((clip, i) => {
    console.log(`  ${i + 1}. ${clip.input} (${clip.start}s - ${clip.end}s)`)
  })
  console.log('Resolution:', resolution, '| Preset:', preset)
  console.log('Output:', outPath)
  console.log('=====================')
  
  // Create temp directory for intermediate files
  const tempDir = path.join(path.dirname(outPath), '.clappper_temp_' + Date.now())
  await fs.promises.mkdir(tempDir, { recursive: true })
  
  try {
    // Step 1: Create trimmed segments for each clip
    const segmentFiles: string[] = []
    
    for (let i = 0; i < clipSegments.length; i++) {
      const segment = clipSegments[i]
      const segmentPath = path.join(tempDir, `segment_${i}.mp4`)
      
      await new Promise((resolve, reject) => {
        const cmd = ffmpeg(segment.input)
          .setStartTime(segment.start)
          .setDuration(Math.max(0, segment.end - segment.start))
          .videoFilters(resFilter) // Always apply filter (includes format normalization)
          .outputOptions([
            `-c:v libx264`,
            `-preset ${ffmpegPreset}`,
            `-crf ${crf}`,
            `-c:a aac`,
            `-b:a 128k`,
            `-movflags +faststart`
          ])
          .output(segmentPath)
          .on('end', () => resolve(null))
          .on('error', (err: any) => reject(err))
          .run()
      })
      
      segmentFiles.push(segmentPath)
    }
    
    // Step 2: Create concat file list
    const concatListPath = path.join(tempDir, 'concat.txt')
    const concatList = segmentFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n')
    await fs.promises.writeFile(concatListPath, concatList, 'utf8')
    
    // Step 3: Concatenate all segments
    await new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outPath)
        .on('progress', (p: any) => { 
          if (win) {
            const progress = Math.min(100, Math.max(0, p.percent || 0))
            win.webContents.send('export:progress', progress)
          }
        })
        .on('end', () => {
          currentExportCommand = null
          resolve(null)
        })
        .on('error', (err: any) => {
          currentExportCommand = null
          reject(err)
        })
      
      currentExportCommand = cmd
      cmd.run()
    })
    
    // Step 4: Cleanup temp files
    await fs.promises.rm(tempDir, { recursive: true, force: true })
    
    return { ok: true, outPath }
  } catch (err) {
    // Cleanup on error
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr)
    }
    throw err
  }
})

// Export with Picture-in-Picture overlay(s)
ipcMain.handle('export:pip', async (_e: any, args: { 
  mainClip: {input: string; start: number; end: number}; 
  overlayClips: Array<{input: string; start: number; end: number}>;
  outPath: string;
  pipPosition: string;
  pipSize: number;
  keyframes?: Array<{time: number; x: number; y: number; size: number}>;
  customX?: number;
  customY?: number;
  resolution?: string;
  preset?: string;
}) => {
  const { mainClip, overlayClips, outPath, pipPosition, pipSize, keyframes, customX, customY, resolution = '1080p', preset = 'medium' } = args
  
  if (overlayClips.length === 0) {
    throw new Error('No overlay clips provided')
  }
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  
  const resFilter = getResolutionFilter(resolution)
  const { preset: ffmpegPreset, crf } = getPresetOptions(preset)
  
  // For multi-overlay, we'll use simplified positioning (no keyframes for now)
  // TODO: Support keyframes per overlay in future
  const useSimplePositioning = overlayClips.length > 1
  
  let overlayX = ''
  let overlayY = ''
  let scaleFilter = ''
  
  if (!useSimplePositioning) {
    // Single overlay with full keyframe support
    // Use scale2ref to scale overlay relative to main video dimensions
    // scale2ref scales [1] based on [0]'s dimensions and outputs [scaled][ref]
    scaleFilter = `[1:v][0:v]scale2ref='oh*mdar':'ih*${pipSize}'[pip][ref]`
  }
  
  // Single overlay: support keyframes and custom positioning
  if (!useSimplePositioning) {
    if (keyframes && keyframes.length > 0) {
      // Build expression for animated X position
      const xExpr = buildKeyframeExpression(keyframes, 'x', 'W', 'w')
      const yExpr = buildKeyframeExpression(keyframes, 'y', 'H', 'h')
      const sizeExpr = buildKeyframeSizeExpression(keyframes)
      
      overlayX = xExpr
      overlayY = yExpr
      scaleFilter = `[1:v][0:v]scale2ref='oh*mdar':'ih*${sizeExpr}'[pip][ref]`
    } else if (pipPosition === 'custom' && customX !== undefined && customY !== undefined) {
      // Use custom position (percentage to pixels)
      overlayX = `W*${customX}`
      overlayY = `H*${customY}`
    } else {
      // Use preset positions
      const padding = 16
      
      switch (pipPosition) {
        case 'top-left':
          overlayX = `${padding}`
          overlayY = `${padding}`
          break
        case 'top-right':
          overlayX = `W-w-${padding}`
          overlayY = `${padding}`
          break
        case 'bottom-left':
          overlayX = `${padding}`
          overlayY = `H-h-${padding}`
          break
        case 'center':
          overlayX = '(W-w)/2'
          overlayY = '(H-h)/2'
          break
        default: // bottom-right
          overlayX = `W-w-${padding}`
          overlayY = `H-h-${padding}`
      }
    }
  }
  
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      // Main video input (input 0)
      .input(mainClip.input)
      .inputOptions(['-ss', mainClip.start.toString()])
      .inputOptions(['-t', (mainClip.end - mainClip.start).toString()])
    
    // Add all overlay inputs (inputs 1, 2, 3, ...)
    overlayClips.forEach((overlayClip) => {
      cmd.input(overlayClip.input)
        .inputOptions(['-ss', overlayClip.start.toString()])
        .inputOptions(['-t', (overlayClip.end - overlayClip.start).toString()])
    })
    
    // Build complex filter with resolution scaling and format normalization
    let filters: string[] = []
    
    if (useSimplePositioning) {
      // Multi-overlay: chain overlays with automatic positioning
      filters.push(`[0:v]${resFilter}[base0]`) // Scale/normalize main video
      
      // Position overlays in corners with slight offset
      const positions = [
        { x: 16, y: 16 }, // top-left
        { x: 'W-w-16', y: 16 }, // top-right
        { x: 16, y: 'H-h-16' }, // bottom-left
        { x: 'W-w-16', y: 'H-h-16' } // bottom-right
      ]
      
      overlayClips.forEach((_, index) => {
        const inputIdx = index + 1 // overlay inputs start at 1
        const baseLabel = index === 0 ? 'base0' : `base${index}`
        const outLabel = index === overlayClips.length - 1 ? 'v' : `base${index + 1}`
        const pipLabel = `pip${index}`
        const refLabel = `ref${index}`
        const pos = positions[index % 4]
        
        // Scale overlay relative to current base
        filters.push(`[${inputIdx}:v][${baseLabel}]scale2ref='oh*mdar':'ih*${pipSize}'[${pipLabel}][${refLabel}]`)
        // Overlay on base
        filters.push(`[${refLabel}][${pipLabel}]overlay=${pos.x}:${pos.y}:eval=frame[${outLabel}]`)
      })
      
      console.log('=== Multi-PiP Export ===')
      console.log(`Exporting ${overlayClips.length} overlays`)
      console.log('Filters:', JSON.stringify(filters, null, 2))
    } else {
      // Single overlay with full keyframe support
      filters = [
        `[0:v]${resFilter}[main]`, // Scale/normalize main video
        scaleFilter.replace('[0:v]', '[main]'), // Scale overlay relative to main
        `[ref][pip]overlay=${overlayX}:${overlayY}:eval=frame[v]` // Overlay with positioning
      ]
      
      console.log('=== Single PiP Export ===')
      console.log('Filters:', JSON.stringify(filters, null, 2))
      console.log('Main clip:', mainClip)
      console.log('Overlay clip:', overlayClips[0])
      console.log('PiP settings:', { pipPosition, pipSize, overlayX, overlayY })
    }
    
    console.log('Resolution:', resolution, '| Preset:', preset)
    console.log('Output path:', outPath)
    console.log('=========================')
    
    cmd.complexFilter(filters)
      
      // Map output streams
      // Note: FFmpeg will use the first available audio stream
      .outputOptions([
        '-map', '[v]',           // Use filtered video
        '-map', '0:a?',          // Try main audio first
        ...(overlayClips.length === 1 ? ['-map', '1:a?'] : []), // Fallback to overlay audio (single overlay only)
        '-map_metadata', '0',    // Use main video's metadata
        '-c:v', 'libx264',       // H.264 codec
        `-preset`, `${ffmpegPreset}`,
        `-crf`, `${crf}`,
        '-pix_fmt', 'yuv420p',   // Compatibility
        '-c:a', 'aac',           // AAC audio
        '-ar', '48000',          // 48kHz sample rate
        '-ac', '2',              // Stereo
        '-b:a', '128k',          // Audio bitrate
        '-shortest',             // Match shortest input
        '-movflags', '+faststart' // Enable streaming
      ])
      .output(outPath)
      .on('progress', (p: any) => { 
        if (win) {
          // Clamp progress between 0 and 100
          const progress = Math.min(100, Math.max(0, p.percent || 0))
          win.webContents.send('export:progress', progress)
        }
      })
      .on('end', () => {
        currentExportCommand = null
        resolve({ ok: true, outPath })
      })
      .on('error', (err: any) => {
        currentExportCommand = null
        reject(err)
      })
    
    currentExportCommand = cmd
    cmd.run()
  })
})

// Helper to calculate optimal scale factor (cap at 1080p)
const calculateOptimalScale = (width: number, height: number): { scale: number; outputWidth: number; outputHeight: number } => {
  const maxWidth = 1920
  const maxHeight = 1080
  
  // Try 4× first
  let scale = 4
  let outputWidth = width * scale
  let outputHeight = height * scale
  
  // If 4× exceeds 1080p, try 3×
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    scale = 3
    outputWidth = width * scale
    outputHeight = height * scale
  }
  
  // If 3× still exceeds, try 2×
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    scale = 2
    outputWidth = width * scale
    outputHeight = height * scale
  }
  
  // If 2× still exceeds, scale to fit within 1080p bounds
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    const scaleX = maxWidth / width
    const scaleY = maxHeight / height
    const finalScale = Math.min(scaleX, scaleY)
    scale = Math.max(1, Math.floor(finalScale)) // Round down to nearest integer, clamp to at least 1
    outputWidth = width * scale
    outputHeight = height * scale
  }
  
  return { scale, outputWidth, outputHeight }
}

// AI Video Enhancement with Real-ESRGAN
ipcMain.handle('ai:enhance', async (_e: any, args: { input: string; output: string }) => {
  const { input, output } = args

  // Check if Real-ESRGAN is available
  const realesrganPath = getRealesrganPath()
  try {
    await fs.promises.access(realesrganPath)
  } catch {
    throw new Error('Real-ESRGAN not found. Please ensure the application is properly installed.')
  }

  // Get video resolution first
  const videoInfo: any = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err: any, data: any) => {
      if (err) reject(err)
      else {
        const videoStream = data.streams.find((s: any) => s.codec_type === 'video')
        resolve({
          width: videoStream?.width || 0,
          height: videoStream?.height || 0
        })
      }
    })
  })

  const { width, height } = videoInfo
  if (width === 0 || height === 0) {
    throw new Error('Could not determine video resolution')
  }

  // Calculate optimal scale factor (automatically capped at 1080p)
  const { scale: finalScale, outputWidth: finalOutputWidth, outputHeight: finalOutputHeight } = calculateOptimalScale(width, height)
  
  console.log(`=== AI Enhancement: Resolution Calculation ===`)
  console.log(`Input: ${width}×${height}`)
  console.log(`Auto-selected scale: ${finalScale}×`)
  console.log(`Output: ${finalOutputWidth}×${finalOutputHeight}`)

  await fs.promises.mkdir(path.dirname(output), { recursive: true })

  // Create temp directory for frames
  const tempDir = path.join(path.dirname(output), '.enhance_temp_' + Date.now())
  await fs.promises.mkdir(tempDir, { recursive: true })

  const frameDir = path.join(tempDir, 'frames')
  const enhancedDir = path.join(tempDir, 'enhanced')
  await fs.promises.mkdir(frameDir, { recursive: true })
  await fs.promises.mkdir(enhancedDir, { recursive: true })

  try {
    // Step 1: Extract frames from video
    console.log('=== AI Enhancement: Extracting Frames ===')
    console.log('Input:', input)
    console.log('Frame dir:', frameDir)

    const framePattern = path.join(frameDir, 'frame_%06d.png')

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(input)
        .outputOptions(['-vf', 'fps=30']) // Force 30fps extraction
        .output(framePattern)
        .on('progress', (p: any) => {
          if (win) win.webContents.send('ai:enhance:progress', {
            stage: 'extract',
            frame: p.frames || 0,
            totalFrames: 0, // Will be calculated after extraction
            percent: 0,
            eta: 'Extracting frames...'
          })
        })
        .on('end', () => resolve())
        .on('error', (err: any) => reject(err))

      currentEnhanceCommand = cmd
      cmd.run()
    })

    // Count extracted frames
    const frameFiles = await fs.promises.readdir(frameDir)
    const pngFiles = frameFiles.filter(f => f.endsWith('.png')).sort()
    const totalFrames = pngFiles.length

    console.log(`Extracted ${totalFrames} frames`)

    if (totalFrames === 0) {
      throw new Error('No frames extracted from video')
    }

    // Step 2: Process frames through Real-ESRGAN (with batch processing)
    console.log('=== AI Enhancement: Processing Frames ===')
    console.log(`Model: realesrgan-x4plus (${finalScale}× upscale)`)
    console.log(`Output resolution: ${finalOutputWidth}×${finalOutputHeight}`)
    console.log('Enhanced dir:', enhancedDir)

    // Send initial info to UI
    if (win) win.webContents.send('ai:enhance:progress', {
      stage: 'info',
      frame: 0,
      totalFrames,
      percent: 0,
      eta: `Processing ${totalFrames} frames with ${finalScale}× upscale to ${finalOutputWidth}×${finalOutputHeight}`,
      outputResolution: `${finalOutputWidth}×${finalOutputHeight}`,
      scale: finalScale
    })

    const batchSize = 4 // Process 4 frames in parallel
    const startTime = Date.now()
    
    for (let i = 0; i < pngFiles.length; i += batchSize) {
      const batch = pngFiles.slice(i, Math.min(i + batchSize, pngFiles.length))
      
      // Process batch in parallel
      await Promise.all(batch.map(async (frameFile, batchIndex) => {
        const globalIndex = i + batchIndex
        const inputFrame = path.join(frameDir, frameFile)
        const outputFrame = path.join(enhancedDir, frameFile)

        return new Promise<void>((resolve, reject) => {
          const modelsPath = path.join(path.dirname(realesrganPath), 'models')
          const process = spawn(realesrganPath, [
            '-i', inputFrame,
            '-o', outputFrame,
            '-n', 'realesrgan-x4plus',
            '-s', finalScale.toString(),
            '-m', modelsPath,
            '-v' // verbose output
          ], { cwd: path.dirname(realesrganPath) })

          // Note: Only track last process for cancellation (simplified)
          if (globalIndex === pngFiles.length - 1) {
            currentEnhanceCommand = process
          }

          process.on('close', (code) => {
            if (code === 0) {
              resolve()
            } else {
              reject(new Error(`Real-ESRGAN failed on frame ${frameFile} with code ${code}`))
            }
          })

          process.on('error', (err) => reject(err))
        })
      }))

      // Calculate ETA based on progress so far
      const elapsed = (Date.now() - startTime) / 1000 // seconds
      const framesProcessed = Math.min(i + batchSize, totalFrames)
      const framesPerSecond = framesProcessed / elapsed
      const remainingFrames = totalFrames - framesProcessed
      const etaSeconds = remainingFrames / framesPerSecond
      const etaMinutes = Math.floor(etaSeconds / 60)
      const etaSecs = Math.floor(etaSeconds % 60)
      const etaString = etaMinutes > 0 ? `${etaMinutes}m ${etaSecs}s remaining` : `${etaSecs}s remaining`

      // Send progress update
      const percent = Math.round((framesProcessed / totalFrames) * 100)

      if (win) win.webContents.send('ai:enhance:progress', {
        stage: 'process',
        frame: framesProcessed,
        totalFrames,
        percent,
        eta: etaString,
        fps: framesPerSecond.toFixed(2)
      })
    }

    // Step 3: Reassemble enhanced frames into video with audio passthrough
    console.log('=== AI Enhancement: Reassembling Video ===')
    console.log('Output:', output)
    console.log('Output resolution:', `${finalOutputWidth}×${finalOutputHeight}`)

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg()
        .input(path.join(enhancedDir, 'frame_%06d.png'))
        .inputOptions(['-framerate', '30'])
        .input(input) // For audio passthrough
        .videoFilters(`scale=${finalOutputWidth}:${finalOutputHeight}`) // Ensure exact resolution
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '20',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-map', '0:v', // Video from enhanced frames
          '-map', '1:a?', // Audio from original (optional)
          '-shortest',
          '-movflags', '+faststart'
        ])
        .output(output)
        .on('progress', (p: any) => {
          if (win) win.webContents.send('ai:enhance:progress', {
            stage: 'reassemble',
            frame: p.frames || 0,
            totalFrames,
            percent: Math.min(100, Math.max(0, p.percent || 0)),
            eta: 'Reassembling video...'
          })
        })
        .on('end', () => resolve())
        .on('error', (err: any) => reject(err))

      currentEnhanceCommand = cmd
      cmd.run()
    })

    // Cleanup temp files
    await fs.promises.rm(tempDir, { recursive: true, force: true })

    console.log('=== AI Enhancement Complete ===')
    console.log('Output file:', output)
    console.log('Final resolution:', `${finalOutputWidth}×${finalOutputHeight}`)

    currentEnhanceCommand = null
    return { 
      ok: true, 
      outPath: output,
      outputWidth: finalOutputWidth,
      outputHeight: finalOutputHeight,
      scale: finalScale
    }

  } catch (err) {
    currentEnhanceCommand = null

    // Cleanup on error
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr)
    }

    throw err
  }
})

// Helper to build FFmpeg expression for keyframe animation
function buildKeyframeExpression(keyframes: Array<{time: number; x: number; y: number; size: number}>, axis: 'x' | 'y', mainDim: string, pipDim: string): string {
  if (keyframes.length === 0) return '0'
  if (keyframes.length === 1) {
    return `${mainDim}*${keyframes[0][axis]}`
  }
  
  // Build piecewise linear interpolation expression
  // Format: if(lt(t,T1), V0, if(lt(t,T2), V0+(V1-V0)*(t-T0)/(T1-T0), ...))
  
  let expr = ''
  for (let i = 0; i < keyframes.length - 1; i++) {
    const k0 = keyframes[i]
    const k1 = keyframes[i + 1]
    const v0 = k0[axis]
    const v1 = k1[axis]
    const t0 = k0.time
    const t1 = k1.time
    
    if (i === 0) {
      // Before first keyframe
      expr += `if(lt(t,${t1}),${mainDim}*${v0}+(${mainDim}*${v1}-${mainDim}*${v0})*(t-${t0})/(${t1}-${t0}),`
    } else if (i === keyframes.length - 2) {
      // Last segment
      expr += `${mainDim}*${v0}+(${mainDim}*${v1}-${mainDim}*${v0})*(t-${t0})/(${t1}-${t0})`
      expr += ')'.repeat(keyframes.length - 1)
    } else {
      // Middle segments
      expr += `if(lt(t,${t1}),${mainDim}*${v0}+(${mainDim}*${v1}-${mainDim}*${v0})*(t-${t0})/(${t1}-${t0}),`
    }
  }
  
  return expr
}

// Helper to build size expression for keyframe animation
function buildKeyframeSizeExpression(keyframes: Array<{time: number; x: number; y: number; size: number}>): string {
  if (keyframes.length === 0) return '0.25'
  if (keyframes.length === 1) {
    return keyframes[0].size.toString()
  }
  
  let expr = ''
  for (let i = 0; i < keyframes.length - 1; i++) {
    const k0 = keyframes[i]
    const k1 = keyframes[i + 1]
    const s0 = k0.size
    const s1 = k1.size
    const t0 = k0.time
    const t1 = k1.time
    
    if (i === 0) {
      expr += `if(lt(t,${t1}),${s0}+(${s1}-${s0})*(t-${t0})/(${t1}-${t0}),`
    } else if (i === keyframes.length - 2) {
      expr += `${s0}+(${s1}-${s0})*(t-${t0})/(${t1}-${t0})`
      expr += ')'.repeat(keyframes.length - 1)
    } else {
      expr += `if(lt(t,${t1}),${s0}+(${s1}-${s0})*(t-${t0})/(${t1}-${t0}),`
    }
  }
  
  return expr
}

// Extract Frames: Export video to image sequence
ipcMain.handle('video:extract-frames', async (_e: any, args: { videoPath: string; outputDir: string; format?: string; fps?: number }) => {
  const { videoPath, outputDir, format = 'png', fps } = args
  
  try {
    // Create output directory
    await fs.promises.mkdir(outputDir, { recursive: true })
    
    // Build output pattern
    const outputPattern = path.join(outputDir, `frame_%06d.${format}`)
    
    return new Promise<{ ok: boolean; frameCount: number; outputDir: string }>((resolve, reject) => {
      let frameCount = 0
      
      const cmd = ffmpeg(videoPath)
      
      // Set FPS if specified (otherwise use source FPS)
      if (fps) {
        cmd.outputOptions(['-vf', `fps=${fps}`])
      }
      
      cmd
        .output(outputPattern)
        .outputOptions(['-q:v', '2']) // High quality for JPEG, ignored for PNG
        .on('progress', (progress) => {
          if (progress.frames) {
            frameCount = progress.frames
          }
        })
        .on('end', () => {
          console.log(`Extracted ${frameCount} frames to ${outputDir}`)
          resolve({ ok: true, frameCount, outputDir })
        })
        .on('error', (err) => {
          console.error('Frame extraction error:', err)
          reject(err)
        })
        .run()
    })
  } catch (err: any) {
    console.error('Extract frames failed:', err)
    return { ok: false, message: err.message }
  }
})

// Compose Video: Create video from image sequence
ipcMain.handle('video:compose-from-frames', async (_e: any, args: { 
  frameDir: string; 
  outputPath: string; 
  fps?: number;
  pattern?: string;
  audioPath?: string;
}) => {
  const { frameDir, outputPath, fps = 30, pattern = 'frame_%06d.png', audioPath } = args
  
  try {
    // Ensure output directory exists
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    
    const inputPattern = path.join(frameDir, pattern)
    
    return new Promise<{ ok: boolean; outPath: string }>((resolve, reject) => {
      const cmd = ffmpeg()
        .input(inputPattern)
        .inputOptions(['-framerate', fps.toString()])
      
      // Add audio if provided
      if (audioPath) {
        cmd.input(audioPath)
          .outputOptions([
            '-c:a', 'aac',
            '-shortest' // End when shortest stream ends
          ])
      }
      
      cmd
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '20',
          '-pix_fmt', 'yuv420p'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`Composed video: ${outputPath}`)
          resolve({ ok: true, outPath: outputPath })
        })
        .on('error', (err) => {
          console.error('Video composition error:', err)
          reject(err)
        })
        .run()
    })
  } catch (err: any) {
    console.error('Compose video failed:', err)
    return { ok: false, message: err.message }
  }
})

