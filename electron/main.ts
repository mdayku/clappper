const { app, BrowserWindow, ipcMain, dialog, protocol, Menu, desktopCapturer } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const ffmpeg = require('fluent-ffmpeg')

// Suppress Chromium's verbose WGC (Windows Graphics Capture) errors
// These are harmless warnings from the screen capture API
app.commandLine.appendSwitch('disable-logging')
app.commandLine.appendSwitch('log-level', '3') // Only show fatal errors

// --- FFMPEG / FFPROBE PATHS (dev vs packaged) -------------------------------
const ffprobeStatic = require('ffprobe-static');

const getFfmpegPath = () => {
  if (app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    return path.join(
      resourcesPath,
      'ffmpeg',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );
  } else {
    // dev: from node_modules
    return require('ffmpeg-static');
  }
};

const getFfprobePath = () => {
  if (app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    return path.join(
      resourcesPath,
      'ffprobe',
      process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    );
  } else {
    // dev: from node_modules
    return ffprobeStatic.path;
  }
};

// Register with fluent-ffmpeg BEFORE any ffprobe()/encode calls
ffmpeg.setFfmpegPath(getFfmpegPath());
ffmpeg.setFfprobePath(getFfprobePath());

// --- Real-ESRGAN PATH (dev vs packaged) -------------------------------------
const getRealesrganPath = () => {
  const binName =
    process.platform === 'win32'
      ? 'realesrgan-ncnn-vulkan.exe'
      : 'realesrgan-ncnn-vulkan'; // macOS/Linux have no .exe

  if (app.isPackaged) {
    // e.g. C:\Users\<you>\AppData\Local\clappper\resources\realesrgan\realesrgan-ncnn-vulkan.exe
    const resourcesPath = (process as any).resourcesPath;
    return path.join(resourcesPath, 'realesrgan', binName);
  } else {
    // dev: <repo>/resources/realesrgan/realesrgan-ncnn-vulkan(.exe)
    return path.join(__dirname, '..', 'resources', 'realesrgan', binName);
  }
};

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
      process.stdout.on('data', (data: Buffer) => {
        output += data.toString()
      })
      
      process.on('close', (code: number | null) => {
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

// Cache for hardware encoder availability (avoid repeated checks)
let hwEncoderCache: { codec: string; preset: string } | null = null
let hwEncoderChecked = false

// Detect available hardware encoder and return optimal settings
const getHardwareEncoder = async (): Promise<{ codec: string; preset: string; crf?: number }> => {
  // Return cached result if already checked
  if (hwEncoderChecked && hwEncoderCache) {
    return hwEncoderCache
  }
  
  if (hwEncoderChecked && !hwEncoderCache) {
    // Already checked and no HW encoder available, return CPU fallback
    return { codec: 'libx264', preset: 'veryfast' }
  }
  
  const ffmpegPath = getFfmpegPath()
  
  // Test encoders in order of preference: NVIDIA > Intel > AMD > CPU
  const encodersToTest = [
    { codec: 'h264_nvenc', preset: 'p4' },      // NVIDIA (p4 = medium speed)
    { codec: 'h264_qsv', preset: 'medium' },    // Intel QuickSync
    { codec: 'h264_amf', preset: 'speed' }      // AMD
  ]
  
  for (const encoder of encodersToTest) {
    try {
      // Test if encoder is available by attempting to get help for it
      await new Promise<void>((resolve, reject) => {
        const testProcess = spawn(ffmpegPath, ['-hide_banner', '-h', `encoder=${encoder.codec}`])
        
        testProcess.on('close', (code: number | null) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`Encoder ${encoder.codec} not available`))
          }
        })
        
        testProcess.on('error', () => {
          reject(new Error(`Failed to test encoder ${encoder.codec}`))
        })
        
        // Timeout after 2 seconds
        setTimeout(() => {
          testProcess.kill()
          reject(new Error('Encoder test timeout'))
        }, 2000)
      })
      
      // If we get here, encoder is available
      console.log(`Hardware encoder detected: ${encoder.codec}`)
      hwEncoderCache = encoder
      hwEncoderChecked = true
      return encoder
      
    } catch (err) {
      // This encoder not available, try next
      continue
    }
  }
  
  // No hardware encoder available, use CPU
  console.log('No hardware encoder available, using CPU (libx264)')
  hwEncoderChecked = true
  return { codec: 'libx264', preset: 'veryfast' }
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
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Change OpenAI API Key...',
          click: () => {
            // Send event to renderer to show API key dialog
            win?.webContents.send('menu:change-api-key')
          }
        }
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

ipcMain.handle('dialog:openImageFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
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

// Create temp directory for multi-source recording
ipcMain.handle('recording:createTempDir', async () => {
  const tempDir = path.join(app.getPath('temp'), `clappper_recording_${Date.now()}`)
  await fs.promises.mkdir(tempDir, { recursive: true })
  return tempDir
})

// Cleanup temp directory
ipcMain.handle('recording:cleanupTempDir', async (_e: any, tempDir: string) => {
  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    console.error('Failed to cleanup temp dir:', err)
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
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
  overlayClips: Array<{input: string; start: number; end: number; position?: string; size?: number}>;
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
  
  // Detect hardware encoder for faster compositing
  const hwEncoder = await getHardwareEncoder()
  const isHwAccel = hwEncoder.codec !== 'libx264'
  console.log(`Using encoder: ${hwEncoder.codec} (Hardware: ${isHwAccel})`)
  
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
      // Multi-overlay: chain overlays with user-specified positioning
      filters.push(`[0:v]${resFilter}[base0]`) // Scale/normalize main video
      
      // Helper to get position coordinates from position string
      const getPositionCoords = (position: string) => {
        const padding = 16
        switch (position) {
          case 'top-left':
            return { x: padding, y: padding }
          case 'top-right':
            return { x: 'W-w-16', y: padding }
          case 'bottom-left':
            return { x: padding, y: 'H-h-16' }
          case 'bottom-right':
          default:
            return { x: 'W-w-16', y: 'H-h-16' }
        }
      }
      
      overlayClips.forEach((overlayClip, index) => {
        const inputIdx = index + 1 // overlay inputs start at 1
        const baseLabel = index === 0 ? 'base0' : `base${index}`
        const outLabel = index === overlayClips.length - 1 ? 'v' : `base${index + 1}`
        const pipLabel = `pip${index}`
        const refLabel = `ref${index}`
        
        // Use per-overlay position and size if provided, otherwise use defaults
        const overlayPosition = overlayClip.position || pipPosition
        const overlaySize = overlayClip.size !== undefined ? overlayClip.size : pipSize
        const pos = getPositionCoords(overlayPosition)
        
        // Scale overlay relative to current base
        filters.push(`[${inputIdx}:v][${baseLabel}]scale2ref='oh*mdar':'ih*${overlaySize}'[${pipLabel}][${refLabel}]`)
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
        '-c:v', hwEncoder.codec, // Use detected encoder (HW or CPU)
        ...(isHwAccel ? [
          // Hardware encoder settings
          `-preset`, hwEncoder.preset,
          '-rc', 'vbr',          // Variable bitrate for better quality
          '-cq', '23',           // Quality level (lower = better)
          '-b:v', '0',           // Let encoder decide bitrate
          '-threads', '0'        // Use all available threads
        ] : [
          // CPU encoder settings
          `-preset`, `${ffmpegPreset}`,
          `-crf`, `${crf}`,
          '-threads', '0'        // Use all available CPU threads
        ]),
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
    const pngFiles = frameFiles.filter((f: string) => f.endsWith('.png')).sort()
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
      await Promise.all(batch.map(async (frameFile: string, batchIndex: number) => {
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

          process.on('close', (code: number | null) => {
            if (code === 0) {
              resolve()
            } else {
              reject(new Error(`Real-ESRGAN failed on frame ${frameFile} with code ${code}`))
            }
          })

          process.on('error', (err: Error) => reject(err))
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
        .on('progress', (progress: any) => {
          if (progress.frames) {
            frameCount = progress.frames
          }
        })
        .on('end', () => {
          console.log(`Extracted ${frameCount} frames to ${outputDir}`)
          resolve({ ok: true, frameCount, outputDir })
        })
        .on('error', (err: Error) => {
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
  const { frameDir, outputPath, fps = 30, pattern, audioPath } = args
  
  try {
    // Ensure output directory exists
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    
    // Auto-detect pattern if not provided
    let inputPattern = pattern ? path.join(frameDir, pattern) : null
    
    if (!inputPattern) {
      // Read directory and find images
      const files = await fs.promises.readdir(frameDir)
      const imageFiles = files
        .filter((f: string) => /\.(png|jpg|jpeg)$/i.test(f))
        .sort()
      
      if (imageFiles.length === 0) {
        throw new Error('No image files found in directory')
      }
      
      // Check if files follow frame_%06d pattern
      if (imageFiles[0].match(/^frame_\d{6}\.(png|jpg|jpeg)$/i)) {
        // Standard frame pattern
        const ext = path.extname(imageFiles[0])
        inputPattern = path.join(frameDir, `frame_%06d${ext}`)
      } else {
        // Arbitrary filenames - create a concat file list
        const concatFilePath = path.join(frameDir, 'concat_list.txt')
        const concatContent = imageFiles.map((f: string) => `file '${f}'\nduration ${1/fps}`).join('\n')
        // Add the last image again without duration (required by concat demuxer)
        const finalContent = concatContent + `\nfile '${imageFiles[imageFiles.length - 1]}'`
        await fs.promises.writeFile(concatFilePath, finalContent, 'utf8')
        
        return new Promise<{ ok: boolean; outPath: string }>((resolve, reject) => {
          const cmd = ffmpeg()
            .input(concatFilePath)
            .inputOptions([
              '-f', 'concat',
              '-safe', '0'
            ])
          
          // Add audio if provided
          if (audioPath) {
            cmd.input(audioPath)
              .outputOptions([
                '-c:a', 'aac',
                '-shortest'
              ])
          }
          
          cmd
            .outputOptions([
              '-c:v', 'libx264',
              '-preset', 'medium',
              '-crf', '20',
              '-pix_fmt', 'yuv420p',
              '-r', fps.toString() // Set output framerate
            ])
            .output(outputPath)
            .on('end', async () => {
              // Clean up concat file
              try {
                await fs.promises.unlink(concatFilePath)
              } catch (e) {
                console.warn('Failed to delete concat file:', e)
              }
              console.log(`Composed video: ${outputPath}`)
              resolve({ ok: true, outPath: outputPath })
            })
            .on('error', async (err: Error) => {
              // Clean up concat file on error
              try {
                await fs.promises.unlink(concatFilePath)
              } catch (e) {
                console.warn('Failed to delete concat file:', e)
              }
              console.error('Video composition error:', err)
              reject(err)
            })
            .run()
        })
      }
    }
    
    // Standard pattern-based approach
    return new Promise<{ ok: boolean; outPath: string }>((resolve, reject) => {
      const cmd = ffmpeg()
        .input(inputPattern!)
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
        .on('error', (err: Error) => {
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

// ========== IMAGE FILTERING HANDLERS ==========

// List folders containing images in a directory
ipcMain.handle('filter:listFolders', async (_e: any, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const folders: string[] = []
    
    // First, check if the directory itself contains images
    const filesInRoot = await fs.promises.readdir(dirPath)
    const hasImagesInRoot = filesInRoot.some((f: string) => /\.(png|jpg|jpeg)$/i.test(f))
    
    if (hasImagesInRoot) {
      // If the source directory itself contains images, treat it as a single folder
      return [dirPath]
    }
    
    // Otherwise, look for subdirectories containing images
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderPath = path.join(dirPath, entry.name)
        // Check if folder contains images
        const files = await fs.promises.readdir(folderPath)
        const hasImages = files.some((f: string) => /\.(png|jpg|jpeg)$/i.test(f))
        if (hasImages) {
          folders.push(folderPath)
        }
      }
    }
    
    return folders.sort()
  } catch (err) {
    console.error('Failed to list folders:', err)
    throw err
  }
})

// Get all images in a folder
ipcMain.handle('filter:getImages', async (_e: any, folderPath: string) => {
  try {
    const files = await fs.promises.readdir(folderPath)
    const imageFiles = files
      .filter((f: string) => /\.(png|jpg|jpeg)$/i.test(f))
      .map((f: string) => path.join(folderPath, f))
      .sort()
    
    return imageFiles
  } catch (err) {
    console.error('Failed to get images:', err)
    throw err
  }
})

// Move image to bad_images folder
ipcMain.handle('filter:moveToBad', async (_e: any, imagePath: string, folderPath: string) => {
  try {
    const parentDir = path.dirname(folderPath)
    const badDir = path.join(parentDir, 'bad_images')
    
    // Create bad_images directory if it doesn't exist
    await fs.promises.mkdir(badDir, { recursive: true })
    
    const fileName = path.basename(imagePath)
    let destPath = path.join(badDir, fileName)
    
    // Handle filename conflicts with unique naming
    let counter = 1
    while (await fs.promises.access(destPath).then(() => true).catch(() => false)) {
      const ext = path.extname(fileName)
      const base = path.basename(fileName, ext)
      destPath = path.join(badDir, `${base}_${counter}${ext}`)
      counter++
    }
    
    // Move the file
    await fs.promises.rename(imagePath, destPath)
    
    return destPath
  } catch (err) {
    console.error('Failed to move to bad:', err)
    throw err
  }
})

// Restore image from bad_images folder
ipcMain.handle('filter:restoreImage', async (_e: any, badPath: string, originalPath: string) => {
  try {
    await fs.promises.rename(badPath, originalPath)
    return { ok: true }
  } catch (err) {
    console.error('Failed to restore image:', err)
    throw err
  }
})

// Move completed folder to destination
ipcMain.handle('filter:moveFolder', async (_e: any, sourcePath: string, destPath: string) => {
  try {
    const folderName = path.basename(sourcePath)
    const newPath = path.join(destPath, folderName)
    
    // Check if destination already exists
    let finalPath = newPath
    let counter = 1
    while (await fs.promises.access(finalPath).then(() => true).catch(() => false)) {
      finalPath = path.join(destPath, `${folderName}_${counter}`)
      counter++
    }
    
    // Move the entire folder
    await fs.promises.rename(sourcePath, finalPath)
    
    return { ok: true, newPath: finalPath }
  } catch (err) {
    console.error('Failed to move folder:', err)
    throw err
  }
})

// ========== ROOM DETECTION HANDLER ==========

const getRoomDetectionPythonPath = () => {
  if (app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    return path.join(resourcesPath, 'room-detection', 'inference.py');
  } else {
    return path.join(__dirname, '..', 'resources', 'room-detection', 'inference.py');
  }
};

const getRoomDetectionModelPath = () => {
  // Models should be in the Roomer repo, not bundled with Electron
  // User needs to point to the Roomer repo location
  const roomerPath = process.env.ROOMER_PATH || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Roomer');
  return path.join(roomerPath, 'room_detection_training', 'local_training_output', 'yolo-v8l-200epoch', 'weights', 'best.pt');
};

const getRoomDetectionModelsPath = () => {
  // Optional: Check for local training output if user has Roomer repo
  // But don't require it - bundled models are primary
  const roomerPath = process.env.ROOMER_PATH || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Roomer');
  return path.join(roomerPath, 'room_detection_training', 'local_training_output');
};

const getBundledModelsPath = () => {
  if (app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    return path.join(resourcesPath, 'room-models');
  } else {
    return path.join(__dirname, '..', 'resources', 'room-models');
  }
};

// Damage Detection Helper Functions
const getDamageDetectionPythonPath = () => {
  if (app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    return path.join(resourcesPath, 'damage-detection', 'inference_roof.py');
  } else {
    return path.join(__dirname, '..', 'resources', 'damage-detection', 'inference_roof.py');
  }
};

const getBundledDamageModelsPath = () => {
  if (app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    return path.join(resourcesPath, 'damage-models');
  } else {
    return path.join(__dirname, '..', 'resources', 'damage-models');
  }
};

// Helper to check if a model exists and add it to the list
const checkAndAddModel = async (
  models: Array<{ id: string; name: string; path: string }>,
  modelId: string,
  basePath: string
) => {
  const weightsPath = path.join(basePath, modelId, 'weights', 'best.pt');
  if (await fs.promises.access(weightsPath).then(() => true).catch(() => false)) {
    // Check if we already added this model (avoid duplicates)
    if (!models.find(m => m.id === modelId)) {
      models.push({
        id: modelId,
        name: modelId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        path: weightsPath
      });
    }
    return true;
  }
  
  // Check alternative structure: modelId/room_detection/weights/best.pt
  const altWeightsPath = path.join(basePath, modelId, 'room_detection', 'weights', 'best.pt');
  if (await fs.promises.access(altWeightsPath).then(() => true).catch(() => false)) {
    if (!models.find(m => m.id === modelId)) {
      models.push({
        id: modelId,
        name: modelId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        path: altWeightsPath
      });
    }
    return true;
  }
  
  return false;
};

// List available models from both bundled resources and local_training_output folder
ipcMain.handle('room:listModels', async () => {
  try {
    const models: Array<{ id: string; name: string; path: string }> = [];
    
    // First, check bundled models (included with the app)
    const bundledModelsPath = getBundledModelsPath();
    if (await fs.promises.access(bundledModelsPath).then(() => true).catch(() => false)) {
      const entries = await fs.promises.readdir(bundledModelsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await checkAndAddModel(models, entry.name, bundledModelsPath);
        }
      }
    }
    
    // Then, check local training output (user's trained models)
    const localModelsPath = getRoomDetectionModelsPath();
    if (await fs.promises.access(localModelsPath).then(() => true).catch(() => false)) {
      const entries = await fs.promises.readdir(localModelsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await checkAndAddModel(models, entry.name, localModelsPath);
        }
      }
    }
    
    // Sort models by name
    models.sort((a, b) => a.name.localeCompare(b.name));
    
    return models;
  } catch (err) {
    console.error('Failed to list models:', err);
    return [];
  }
});

ipcMain.handle('room:detect', async (_e: any, imagePath: string, modelId?: string, confidence?: number) => {
  try {
    // Read image file
    const imageBuffer = await fs.promises.readFile(imagePath);
    
    // Find Python executable
    const venvPython = process.platform === 'win32'
      ? path.join(process.cwd(), '.venv', 'Scripts', 'python.exe')
      : path.join(process.cwd(), '.venv', 'bin', 'python3');
    
    const pythonPath = (await fs.promises.access(venvPython).then(() => true).catch(() => false))
      ? venvPython
      : (process.platform === 'win32' ? 'python' : 'python3');
    
    // Get inference script path
    const inferenceScriptPath = getRoomDetectionPythonPath();
    
    // Check if script exists
    if (!(await fs.promises.access(inferenceScriptPath).then(() => true).catch(() => false))) {
      throw new Error(`Room detection script not found at: ${inferenceScriptPath}`);
    }
    
    // Set working directory - use current directory (app directory)
    // No longer requires Roomer repo - models are bundled with the app
    const cwd = process.cwd();
    
    // Get bundled models path for Python script
    const bundledModelsPath = getBundledModelsPath();
    
    return new Promise((resolve, reject) => {
      const modelIdStr = modelId || 'default';
      const modelIdBytes = Buffer.from(modelIdStr, 'utf-8');
      const confidenceValue = confidence !== undefined ? confidence : 0.2;
      
      // Send: [4 bytes: model ID length][model ID bytes][4 bytes: confidence][image buffer]
      const modelIdLength = Buffer.allocUnsafe(4);
      modelIdLength.writeUInt32BE(modelIdBytes.length, 0);
      
      // Write confidence as 4-byte float (big-endian)
      const confidenceBuffer = Buffer.allocUnsafe(4);
      confidenceBuffer.writeFloatBE(confidenceValue, 0);

      // Pass bundled models path as environment variable
      const env = {
        ...process.env,
        BUNDLED_MODELS_PATH: bundledModelsPath
      };

      const pythonProcess = spawn(pythonPath, [inferenceScriptPath], {
        cwd: cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        console.error(`[ROOM DETECTION STDERR] ${data.toString()}`);
      });

      pythonProcess.on('close', (code: number | null) => {
        if (code !== 0) {
          console.error(`[ROOM DETECTION] Python process exited with code ${code}`);
          console.error(`[ROOM DETECTION] stderr: ${stderr}`);
          reject(new Error(`Room detection failed: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          // YOLO prints progress messages to stdout, so extract only the JSON
          const lines = stdout.trim().split('\n');
          let jsonLine = '';
          
          // Find the last line that starts with '{' (our JSON response)
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{')) {
              jsonLine = lines.slice(i).join('\n');
              break;
            }
          }
          
          const jsonText = jsonLine || stdout;
          const result = JSON.parse(jsonText);
          
          if (result.error) {
            reject(new Error(result.error));
            return;
          }
          
          resolve({
            success: true,
            detections: result.detections || [],
            annotated_image: result.annotated_image || null
          });
        } catch (parseError) {
          console.error(`[ROOM DETECTION] Failed to parse output`);
          console.error(`[ROOM DETECTION] stdout (first 500): ${stdout.substring(0, 500)}`);
          reject(new Error(`Failed to parse detection result: ${parseError}`));
        }
      });

      // Write binary data: model ID length + model ID + confidence + image buffer
      pythonProcess.stdin.write(modelIdLength);
      pythonProcess.stdin.write(modelIdBytes);
      pythonProcess.stdin.write(confidenceBuffer);
      pythonProcess.stdin.write(imageBuffer);
      pythonProcess.stdin.end();
    });
  } catch (error) {
    console.error('[ROOM DETECTION] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
})

// Damage Detection IPC Handlers

// List available damage detection models
ipcMain.handle('damage:listModels', async () => {
  try {
    const models: Array<{ id: string; name: string; path: string }> = []
    const bundledPath = getBundledDamageModelsPath()
    
    // Check if bundled path exists
    if (!(await fs.promises.access(bundledPath).then(() => true).catch(() => false))) {
      console.log(`[DAMAGE DETECTION] Bundled models path not found: ${bundledPath}`)
      return []
    }
    
    // Scan for models in bundled path
    const entries = await fs.promises.readdir(bundledPath, { withFileTypes: true })
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await checkAndAddModel(models, entry.name, bundledPath)
      }
    }
    
    console.log(`[DAMAGE DETECTION] Found ${models.length} models`)
    return models
  } catch (err) {
    console.error('[DAMAGE DETECTION] Failed to list models:', err)
    return []
  }
})

// Damage detection handler
ipcMain.handle('damage:detect', async (_e: any, imagePath: string, modelId?: string, confidence?: number) => {
  try {
    // Read image file
    const imageBuffer = await fs.promises.readFile(imagePath)
    
    // Find Python executable
    const venvPython = process.platform === 'win32'
      ? path.join(process.cwd(), '.venv', 'Scripts', 'python.exe')
      : path.join(process.cwd(), '.venv', 'bin', 'python3')
    
    const pythonPath = (await fs.promises.access(venvPython).then(() => true).catch(() => false))
      ? venvPython
      : (process.platform === 'win32' ? 'python' : 'python3')
    
    // Get inference script path
    const inferenceScriptPath = getDamageDetectionPythonPath()
    
    // Check if script exists
    if (!(await fs.promises.access(inferenceScriptPath).then(() => true).catch(() => false))) {
      throw new Error(`Damage detection script not found at: ${inferenceScriptPath}`)
    }
    
    // Set working directory - use current directory (app directory)
    const cwd = process.cwd()
    
    // Get bundled models path for Python script
    const bundledModelsPath = getBundledDamageModelsPath()
    
    return new Promise((resolve, reject) => {
      const modelIdStr = modelId || 'default'
      const confidenceValue = confidence !== undefined ? confidence : 0.2
      
      // Prepare model ID as buffer
      const modelIdBytes = Buffer.from(modelIdStr, 'utf-8')
      const modelIdLength = Buffer.alloc(4)
      modelIdLength.writeUInt32BE(modelIdBytes.length, 0)
      
      // Prepare confidence as buffer (4-byte float, big-endian)
      const confidenceBuffer = Buffer.allocUnsafe(4)
      confidenceBuffer.writeFloatBE(confidenceValue, 0)
      
      // Spawn Python process
      const pythonProcess = spawn(pythonPath, [inferenceScriptPath], {
        cwd,
        env: {
          ...process.env,
          BUNDLED_MODELS_PATH: bundledModelsPath
        }
      })
      
      let stdout = ''
      let stderr = ''
      
      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      
      pythonProcess.stderr.on('data', (data: Buffer) => {
        console.error(`[DAMAGE DETECTION STDERR] ${data.toString()}`)
      })

      pythonProcess.on('close', (code: number | null) => {
        if (code !== 0) {
          console.error(`[DAMAGE DETECTION] Python process exited with code ${code}`)
          console.error(`[DAMAGE DETECTION] stderr: ${stderr}`)
          reject(new Error(`Damage detection failed: ${stderr || 'Unknown error'}`))
          return
        }

        try {
          // YOLO prints progress messages to stdout, so extract only the JSON
          const lines = stdout.trim().split('\n')
          let jsonLine = ''
          
          // Find the last line that starts with '{' (our JSON response)
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim()
            if (line.startsWith('{')) {
              jsonLine = lines.slice(i).join('\n')
              break
            }
          }
          
          const jsonText = jsonLine || stdout
          const result = JSON.parse(jsonText)
          
          if (result.error) {
            reject(new Error(result.error))
            return
          }
          
          resolve({
            success: true,
            detections: result.detections || [],
            cost_estimate: result.cost_estimate || null,
            annotated_image: result.annotated_image || null,
            image_width: result.image_width || 0,
            image_height: result.image_height || 0
          })
        } catch (parseError) {
          console.error(`[DAMAGE DETECTION] Failed to parse output`)
          console.error(`[DAMAGE DETECTION] stdout (first 500): ${stdout.substring(0, 500)}`)
          reject(new Error(`Failed to parse detection result: ${parseError}`))
        }
      })

      // Write binary data: model ID length + model ID + confidence + image buffer
      pythonProcess.stdin.write(modelIdLength)
      pythonProcess.stdin.write(modelIdBytes)
      pythonProcess.stdin.write(confidenceBuffer)
      pythonProcess.stdin.write(imageBuffer)
      pythonProcess.stdin.end()
    })
  } catch (error) {
    console.error('[DAMAGE DETECTION] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Settings storage helpers
const getConfigPath = () => {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'config.json')
}

const loadConfig = async (): Promise<any> => {
  try {
    const configPath = getConfigPath()
    const data = await fs.promises.readFile(configPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return {}
  }
}

const saveConfig = async (config: any): Promise<void> => {
  const configPath = getConfigPath()
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

// Rate limiting for GPT-4 Vision API calls
const apiCallTimestamps: number[] = []
const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
const MAX_CALLS_PER_MINUTE = 10

const checkRateLimit = (): { allowed: boolean; remainingCalls: number; resetInSeconds: number } => {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  
  // Remove old timestamps outside the window
  while (apiCallTimestamps.length > 0 && apiCallTimestamps[0] < windowStart) {
    apiCallTimestamps.shift()
  }
  
  const remainingCalls = MAX_CALLS_PER_MINUTE - apiCallTimestamps.length
  const resetInSeconds = apiCallTimestamps.length > 0 
    ? Math.ceil((apiCallTimestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)
    : 0
  
  return {
    allowed: apiCallTimestamps.length < MAX_CALLS_PER_MINUTE,
    remainingCalls: Math.max(0, remainingCalls),
    resetInSeconds
  }
}

const recordApiCall = () => {
  apiCallTimestamps.push(Date.now())
}

const incrementUsageStats = async (tokensUsed: { prompt: number; completion: number; total: number }) => {
  const config = await loadConfig()
  if (!config.usage_stats) {
    config.usage_stats = {
      total_calls: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      first_call: new Date().toISOString(),
      last_call: null
    }
  }
  
  config.usage_stats.total_calls += 1
  config.usage_stats.total_prompt_tokens += tokensUsed.prompt
  config.usage_stats.total_completion_tokens += tokensUsed.completion
  config.usage_stats.total_tokens += tokensUsed.total
  config.usage_stats.last_call = new Date().toISOString()
  
  await saveConfig(config)
}

// Settings IPC handlers
ipcMain.handle('settings:getOpenAIKey', async () => {
  const config = await loadConfig()
  return config.openai_api_key || null
})

ipcMain.handle('settings:setOpenAIKey', async (_e: any, apiKey: string) => {
  const config = await loadConfig()
  config.openai_api_key = apiKey
  await saveConfig(config)
  return { success: true }
})

ipcMain.handle('settings:getUsageStats', async () => {
  const config = await loadConfig()
  const rateLimit = checkRateLimit()
  
  return {
    usage: config.usage_stats || {
      total_calls: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      first_call: null,
      last_call: null
    },
    rate_limit: rateLimit
  }
})

// Find contractors by opening Google search
ipcMain.handle('contractors:find', async (_e: any, zipCode: string, category: string) => {
  try {
    const { shell } = require('electron')
    
    // Construct Google search URL
    const searchQuery = `${category} contractors near ${zipCode}`
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`
    
    console.log(`[CONTRACTORS] Opening Google search: "${searchQuery}"`)
    
    // Open in default browser
    await shell.openExternal(googleUrl)
    
    return {
      success: true,
      opened_browser: true
    }
    
  } catch (error) {
    console.error('[CONTRACTORS] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Identify rooms using GPT-4 Vision
ipcMain.handle('room:identifyRooms', async (_e: any, imagePath: string, detections: any[]) => {
  try {
    // Check rate limit first
    const rateLimit = checkRateLimit()
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${rateLimit.resetInSeconds} seconds before trying again. (Max ${MAX_CALLS_PER_MINUTE} calls per minute)`
      }
    }
    
    const imageBuffer = await fs.promises.readFile(imagePath)
    const imageBase64 = imageBuffer.toString('base64')
    
    // Check for OpenAI API key (from config or env)
    const config = await loadConfig()
    const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return {
        success: false,
        error: 'OpenAI API key not configured. Please set your API key in settings.'
      }
    }
    
    console.log('[ROOM IDENTIFICATION] Calling GPT-4 Vision to identify rooms...')
    console.log(`[ROOM IDENTIFICATION] Rate limit: ${rateLimit.remainingCalls} calls remaining`)
    
    // Build prompt with detection info
    const roomsInfo = detections.map((det: any, idx: number) => 
      `Room ${idx + 1} (ID: ${det.id}): Bounding box at [${det.bounding_box.join(', ')}]`
    ).join('\n')
    
    const prompt = `You are analyzing a floor plan image with detected room boundaries marked by colored boxes.

Detected Rooms:
${roomsInfo}

For each room, analyze its:
- Shape and proportions
- Location relative to other rooms
- Typical fixtures or features visible
- Common architectural patterns

Identify the room type for each detected room. Common types include: kitchen, bathroom, bedroom, living room, dining room, hallway, closet, laundry room, garage, office, etc.

Respond ONLY with valid JSON in this exact format:
{
  "room_labels": {
    "${detections[0]?.id || 'room_id'}": "room_type",
    "${detections[1]?.id || 'room_id'}": "room_type"
  }
}

Use the actual room IDs provided above. Be specific with room types (e.g., "master bedroom" vs "bedroom", "powder room" vs "full bathroom").`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.3
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ROOM IDENTIFICATION] OpenAI API error:', errorText)
      return {
        success: false,
        error: `OpenAI API error: ${response.status} ${response.statusText}`
      }
    }
    
    // Record the API call for rate limiting
    recordApiCall()
    
    const data = await response.json()
    let content = data.choices[0].message.content
    
    // Track usage stats
    if (data.usage) {
      await incrementUsageStats({
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
        total: data.usage.total_tokens || 0
      })
      console.log(`[ROOM IDENTIFICATION] Tokens used - Prompt: ${data.usage.prompt_tokens}, Completion: ${data.usage.completion_tokens}, Total: ${data.usage.total_tokens}`)
    }
    
    console.log('[ROOM IDENTIFICATION] GPT-4 Vision response received')
    console.log('[ROOM IDENTIFICATION] Raw content:', content)
    
    // Try to extract JSON from markdown code blocks if present
    if (content.includes('```json')) {
      content = content.split('```json')[1].split('```')[0].trim()
    } else if (content.includes('```')) {
      content = content.split('```')[1].split('```')[0].trim()
    }
    
    const parsedData = JSON.parse(content)
    
    if (parsedData.room_labels) {
      console.log('[ROOM IDENTIFICATION] ✅ Room labels identified:', parsedData.room_labels)
      return {
        success: true,
        room_labels: parsedData.room_labels
      }
    } else {
      return {
        success: false,
        error: 'GPT-4 Vision response missing room_labels field'
      }
    }
    
  } catch (error) {
    console.error('[ROOM IDENTIFICATION] ❌ Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Estimate damage cost using GPT-4 Vision
ipcMain.handle('damage:estimateCost', async (_e: any, imagePath: string, detections: any[]) => {
  try {
    // Check rate limit first
    const rateLimit = checkRateLimit()
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${rateLimit.resetInSeconds} seconds before trying again. (Max ${MAX_CALLS_PER_MINUTE} calls per minute)`
      }
    }
    
    const imageBuffer = await fs.promises.readFile(imagePath)
    const imageBase64 = imageBuffer.toString('base64')
    
    // Check for OpenAI API key (from config or env)
    const config = await loadConfig()
    const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return {
        success: false,
        error: 'OpenAI API key not configured. Please set your API key in settings.'
      }
    }
    
    console.log('[DAMAGE COST] Calling GPT-4 Vision for cost estimation...')
    console.log(`[DAMAGE COST] Rate limit: ${rateLimit.remainingCalls} calls remaining`)
    
    // Calculate total affected area
    const totalAreaPct = detections.reduce((sum: number, d: any) => sum + (d.affected_area_pct || 0), 0)
    
    const prompt = `You are an experienced roofing contractor. Analyze this roof damage image with YOLO detection annotations (green boxes).

Detected damage areas: ${detections.length}
Total affected area: ${totalAreaPct.toFixed(2)}% of image

Provide a realistic repair cost estimate for this roof damage including:
1. Labor costs (hourly rate × estimated hours)
2. Materials costs (shingles, underlayment, nails, etc.)
3. Disposal/dump fees for old materials
4. Contingency buffer (10-15%)

Respond ONLY with valid JSON in this exact format:
{
  "labor_usd": <number>,
  "materials_usd": <number>,
  "disposal_usd": <number>,
  "contingency_usd": <number>,
  "total_usd": <number>,
  "assumptions": "<brief explanation of your estimate>"
}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.3
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[DAMAGE COST] OpenAI API error:', errorText)
      return {
        success: false,
        error: `OpenAI API error: ${response.status} ${response.statusText}`
      }
    }
    
    // Record the API call for rate limiting
    recordApiCall()
    
    const data = await response.json()
    let content = data.choices[0].message.content
    
    // Track usage stats
    if (data.usage) {
      await incrementUsageStats({
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
        total: data.usage.total_tokens || 0
      })
      console.log(`[DAMAGE COST] Tokens used - Prompt: ${data.usage.prompt_tokens}, Completion: ${data.usage.completion_tokens}, Total: ${data.usage.total_tokens}`)
    }
    
    console.log('[DAMAGE COST] GPT-4 Vision response received')
    console.log('[DAMAGE COST] Raw content:', content)
    
    // Try to extract JSON from markdown code blocks if present
    if (content.includes('```json')) {
      content = content.split('```json')[1].split('```')[0].trim()
      console.log('[DAMAGE COST] Extracted from ```json block')
    } else if (content.includes('```')) {
      content = content.split('```')[1].split('```')[0].trim()
      console.log('[DAMAGE COST] Extracted from ``` block')
    }
    
    console.log('[DAMAGE COST] Content to parse:', content)
    
    const costData = JSON.parse(content)
    console.log('[DAMAGE COST] Parsed cost data:', JSON.stringify(costData, null, 2))
    
    // Validate required fields
    const requiredFields = ['labor_usd', 'materials_usd', 'disposal_usd', 'contingency_usd', 'total_usd', 'assumptions']
    const missingFields = requiredFields.filter(field => !(field in costData))
    
    if (missingFields.length === 0) {
      console.log('[DAMAGE COST] ✅ All fields validated, returning cost estimate')
      return {
        success: true,
        cost_estimate: costData
      }
    } else {
      console.error('[DAMAGE COST] ❌ Missing fields:', missingFields)
      console.error('[DAMAGE COST] Available fields:', Object.keys(costData))
      return {
        success: false,
        error: `GPT-4 Vision response missing required fields: ${missingFields.join(', ')}`
      }
    }
    
  } catch (error) {
    console.error('[DAMAGE COST] ❌ Error:', error)
    if (error instanceof SyntaxError) {
      console.error('[DAMAGE COST] JSON parsing failed - content was not valid JSON')
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

