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
  cancelExport: () => ipcRenderer.invoke('export:cancel')
})

