const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const ffmpegPath = require('ffmpeg-static')
const ffmpeg = require('fluent-ffmpeg')

ffmpeg.setFfmpegPath(ffmpegPath)

let win: typeof BrowserWindow.prototype | null = null

// Register custom protocol for serving local video files
app.whenReady().then(() => {
  protocol.registerFileProtocol('media', (request: any, callback: any) => {
    const url = request.url.substring('media://'.length)
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
  
  // Allow media:// protocol in the renderer
  win.webContents.session.protocol.registerFileProtocol('media', (request: any, callback: any) => {
    const url = request.url.substring('media://'.length)
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
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv'] }]
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

ipcMain.handle('export:trim', async (_e: any, args: { input: string; outPath: string; start: number; end: number }) => {
  const { input, outPath, start, end } = args
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(input)
      .setStartTime(start)
      .setDuration(Math.max(0, end - start))
      .outputOptions(['-c:v libx264', '-preset veryfast', '-crf 23', '-c:a aac', '-b:a 128k'])
      .output(outPath)
      .on('progress', (p: any) => { if (win) win.webContents.send('export:progress', p.percent || 0) })
      .on('end', () => resolve({ ok: true, outPath }))
      .on('error', (err: any) => reject(err))
      .run()
  })
})

ipcMain.handle('export:concat', async (_e: any, args: { clips: Array<{input: string; start: number; end: number}>; outPath: string }) => {
  const { clips: clipSegments, outPath } = args
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  
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
        ffmpeg(segment.input)
          .setStartTime(segment.start)
          .setDuration(Math.max(0, segment.end - segment.start))
          .outputOptions([
            '-c:v libx264',
            '-preset veryfast',
            '-crf 23',
            '-c:a aac',
            '-b:a 128k',
            '-movflags +faststart'
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
        .on('progress', (p: any) => { if (win) win.webContents.send('export:progress', p.percent || 0) })
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

