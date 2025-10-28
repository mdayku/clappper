const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clappper', {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    savePath: (defaultName) => ipcRenderer.invoke('dialog:savePath', defaultName),
    ffprobe: (filePath) => ipcRenderer.invoke('ffprobe:metadata', filePath),
    generateThumbnail: (payload) => ipcRenderer.invoke('thumbnail:generate', payload),
    transcode: (payload) => ipcRenderer.invoke('transcode:h264', payload),
    exportTrim: (payload) => ipcRenderer.invoke('export:trim', payload),
    exportConcat: (payload) => ipcRenderer.invoke('export:concat', payload),
    exportPip: (payload) => ipcRenderer.invoke('export:pip', payload),
    onExportProgress: (cb) => {
        ipcRenderer.removeAllListeners('export:progress');
        ipcRenderer.on('export:progress', (_e, pct) => cb(pct));
    },
    onTranscodeProgress: (cb) => {
        ipcRenderer.removeAllListeners('transcode:progress');
        ipcRenderer.on('transcode:progress', (_e, pct) => cb(pct));
    },
    cancelExport: () => ipcRenderer.invoke('export:cancel'),
    saveProject: (filePath, state) => ipcRenderer.invoke('project:save', { filePath, state }),
    loadProject: (filePath) => ipcRenderer.invoke('project:load', filePath),
    getAutosavePath: () => ipcRenderer.invoke('project:autosave-path'),
    checkAutosave: () => ipcRenderer.invoke('project:check-autosave'),
    onMenuSaveProject: (callback) => {
        ipcRenderer.removeAllListeners('menu:save-project');
        ipcRenderer.on('menu:save-project', () => callback());
    },
    onMenuLoadProject: (callback) => {
        ipcRenderer.removeAllListeners('menu:load-project');
        ipcRenderer.on('menu:load-project', () => callback());
    },
    getScreenSources: () => ipcRenderer.invoke('screen:get-sources'),
    saveRecording: (filePath, base64Data) => ipcRenderer.invoke('screen:save-recording', { filePath, base64Data })
});
