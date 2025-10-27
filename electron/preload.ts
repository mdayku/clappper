const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('clappper', {
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  ffprobe: (filePath: string) => ipcRenderer.invoke('ffprobe:metadata', filePath),
  exportTrim: (payload: { input: string; outPath: string; start: number; end: number }) => ipcRenderer.invoke('export:trim', payload),
  onExportProgress: (cb: (pct: number) => void) => {
    ipcRenderer.removeAllListeners('export:progress')
    ipcRenderer.on('export:progress', (_e: any, pct: number) => cb(pct))
  }
})

