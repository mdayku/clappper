const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ffmpeg = require('fluent-ffmpeg')

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

ffmpeg.setFfmpegPath(getFfmpegPath())

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev  // Disable webSecurity ONLY in dev mode for local file access
    }
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
      .on('end', () => resolve({ ok: true, outPath }))
      .on('error', (err: any) => reject(err))
      .run()
  })
})

ipcMain.handle('export:concat', async (_e: any, args: { clips: Array<{input: string; start: number; end: number}>; outPath: string; resolution?: string; preset?: string }) => {
  const { clips: clipSegments, outPath, resolution = '1080p', preset = 'medium' } = args
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  
  const resFilter = getResolutionFilter(resolution)
  const { preset: ffmpegPreset, crf } = getPresetOptions(preset)
  
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
      ffmpeg()
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
        .on('end', () => resolve(null))
        .on('error', (err: any) => reject(err))
        .run()
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

// Export with Picture-in-Picture overlay
ipcMain.handle('export:pip', async (_e: any, args: { 
  mainClip: {input: string; start: number; end: number}; 
  overlayClip: {input: string; start: number; end: number};
  outPath: string;
  pipPosition: string;
  pipSize: number;
  keyframes?: Array<{time: number; x: number; y: number; size: number}>;
  customX?: number;
  customY?: number;
  resolution?: string;
  preset?: string;
}) => {
  const { mainClip, overlayClip, outPath, pipPosition, pipSize, keyframes, customX, customY, resolution = '1080p', preset = 'medium' } = args
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  
  const resFilter = getResolutionFilter(resolution)
  const { preset: ffmpegPreset, crf } = getPresetOptions(preset)
  
  let overlayX = ''
  let overlayY = ''
  // We need to pass main video dimensions to the scale filter
  // Use scale2ref to scale overlay relative to main video dimensions
  // scale2ref scales [1] based on [0]'s dimensions and outputs [scaled][ref]
  let scaleFilter = `[1:v][0:v]scale2ref='oh*mdar':'ih*${pipSize}'[pip][ref]`
  
  // If we have keyframes, generate animated position/size
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
  
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      // Main video input
      .input(mainClip.input)
      .inputOptions(['-ss', mainClip.start.toString()])
      .inputOptions(['-t', (mainClip.end - mainClip.start).toString()])
      
      // Overlay video input
      .input(overlayClip.input)
      .inputOptions(['-ss', overlayClip.start.toString()])
      .inputOptions(['-t', (overlayClip.end - overlayClip.start).toString()])
    
    // Build complex filter with resolution scaling and format normalization
    const filters = [
      `[0:v]${resFilter}[main]`, // Scale/normalize main video
      scaleFilter.replace('[0:v]', '[main]'), // Scale overlay relative to main (replace input with processed main)
      `[ref][pip]overlay=${overlayX}:${overlayY}:eval=frame[v]` // Overlay (ref is the main video output from scale2ref)
    ]
    
    console.log('PiP Export Filters:', filters)
    console.log('Main clip:', mainClip)
    console.log('Overlay clip:', overlayClip)
    console.log('PiP settings:', { pipPosition, pipSize, overlayX, overlayY })
    
    cmd.complexFilter(filters)
      
      // Map output streams
      // Note: FFmpeg will use the first available audio stream
      .outputOptions([
        '-map', '[v]',           // Use filtered video
        '-map', '0:a?',          // Try main audio first
        '-map', '1:a?',          // Fallback to overlay audio
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
      .on('end', () => resolve({ ok: true, outPath }))
      .on('error', (err: any) => reject(err))
    
    cmd.run()
  })
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

