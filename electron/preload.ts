const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('clappper', {
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  savePath: (defaultName: string) => ipcRenderer.invoke('dialog:savePath', defaultName),
  ffprobe: (filePath: string) => ipcRenderer.invoke('ffprobe:metadata', filePath),
  generateThumbnail: (payload: { input: string; timestamp: number; clipId: string }) => ipcRenderer.invoke('thumbnail:generate', payload),
  transcode: (payload: { input: string; output: string }) => ipcRenderer.invoke('transcode:h264', payload),
  exportTrim: (payload: { input: string; outPath: string; start: number; end: number }) => ipcRenderer.invoke('export:trim', payload),
  exportConcat: (payload: { clips: Array<{input: string; start: number; end: number}>; outPath: string }) => ipcRenderer.invoke('export:concat', payload),
  exportPip: (payload: { 
    mainClip: {input: string; start: number; end: number}; 
    overlayClip: {input: string; start: number; end: number};
    outPath: string;
    pipPosition: string;
    pipSize: number;
    keyframes?: Array<{time: number; x: number; y: number; size: number}>;
    customX?: number;
    customY?: number;
  }) => ipcRenderer.invoke('export:pip', payload),
  onExportProgress: (cb: (pct: number) => void) => {
    ipcRenderer.removeAllListeners('export:progress')
    ipcRenderer.on('export:progress', (_e: any, pct: number) => cb(pct))
  },
  onTranscodeProgress: (cb: (pct: number) => void) => {
    ipcRenderer.removeAllListeners('transcode:progress')
    ipcRenderer.on('transcode:progress', (_e: any, pct: number) => cb(pct))
  },
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  saveProject: (filePath: string, state: any) => ipcRenderer.invoke('project:save', { filePath, state }),
  loadProject: (filePath: string) => ipcRenderer.invoke('project:load', filePath),
  getAutosavePath: () => ipcRenderer.invoke('project:autosave-path'),
  checkAutosave: () => ipcRenderer.invoke('project:check-autosave'),
  onMenuSaveProject: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu:save-project')
    ipcRenderer.on('menu:save-project', () => callback())
  },
  onMenuLoadProject: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu:load-project')
    ipcRenderer.on('menu:load-project', () => callback())
  },
  getScreenSources: () => ipcRenderer.invoke('screen:get-sources'),
  saveRecording: (filePath: string, base64Data: string) =>
    ipcRenderer.invoke('screen:save-recording', { filePath, base64Data }),
  enhanceVideo: (payload: { input: string; output: string }) => ipcRenderer.invoke('ai:enhance', payload),
  enhanceCancel: () => ipcRenderer.invoke('ai:enhance:cancel'),
  detectGPU: () => ipcRenderer.invoke('ai:detect-gpu'),
  onEnhanceProgress: (cb: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('ai:enhance:progress')
    ipcRenderer.on('ai:enhance:progress', (_e: any, progress: any) => cb(progress))
  },
  extractFrames: (payload: { videoPath: string; outputDir: string; format?: string; fps?: number }) => 
    ipcRenderer.invoke('video:extract-frames', payload),
  composeVideo: (payload: { frameDir: string; outputPath: string; fps?: number; pattern?: string; audioPath?: string }) => 
    ipcRenderer.invoke('video:compose-from-frames', payload),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  createTempDir: () => ipcRenderer.invoke('recording:createTempDir'),
  cleanupTempDir: (tempDir: string) => ipcRenderer.invoke('recording:cleanupTempDir', tempDir)
})

