const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clappper', {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    ffprobe: (filePath) => ipcRenderer.invoke('ffprobe:metadata', filePath),
    transcode: (payload) => ipcRenderer.invoke('transcode:h264', payload),
    exportTrim: (payload) => ipcRenderer.invoke('export:trim', payload),
    onExportProgress: (cb) => {
        ipcRenderer.removeAllListeners('export:progress');
        ipcRenderer.on('export:progress', (_e, pct) => cb(pct));
    },
    onTranscodeProgress: (cb) => {
        ipcRenderer.removeAllListeners('transcode:progress');
        ipcRenderer.on('transcode:progress', (_e, pct) => cb(pct));
    }
});
