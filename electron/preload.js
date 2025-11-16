const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clappper', {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    openImageFiles: () => ipcRenderer.invoke('dialog:openImageFiles'),
    detectImageFormats: (filePaths) => ipcRenderer.invoke('images:detectFormats', filePaths),
    convertImagesToPng: (filePaths) => ipcRenderer.invoke('images:convertToPng', filePaths),
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
    onMenuChangeApiKey: (callback) => {
        ipcRenderer.removeAllListeners('menu:change-api-key');
        ipcRenderer.on('menu:change-api-key', () => callback());
    },
    getScreenSources: () => ipcRenderer.invoke('screen:get-sources'),
    saveRecording: (filePath, base64Data) => ipcRenderer.invoke('screen:save-recording', { filePath, base64Data }),
    getDownloadsPath: () => ipcRenderer.invoke('system:getDownloadsPath'),
    enhanceVideo: (payload) => ipcRenderer.invoke('ai:enhance', payload),
    upscaleRunway: (payload) => ipcRenderer.invoke('ai:upscale-runway', payload),
    enhanceCancel: () => ipcRenderer.invoke('ai:enhance:cancel'),
    detectGPU: () => ipcRenderer.invoke('ai:detect-gpu'),
    onEnhanceProgress: (cb) => {
        ipcRenderer.removeAllListeners('ai:enhance:progress');
        ipcRenderer.on('ai:enhance:progress', (_e, progress) => cb(progress));
    },
    extractFrames: (payload) => ipcRenderer.invoke('video:extract-frames', payload),
    composeVideo: (payload) => ipcRenderer.invoke('video:compose-from-frames', payload),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    createTempDir: () => ipcRenderer.invoke('recording:createTempDir'),
    cleanupTempDir: (tempDir) => ipcRenderer.invoke('recording:cleanupTempDir', tempDir),
    // Image Filtering
    filterListFolders: (dirPath) => ipcRenderer.invoke('filter:listFolders', dirPath),
    filterGetImages: (folderPath) => ipcRenderer.invoke('filter:getImages', folderPath),
    filterMoveToBad: (imagePath, folderPath) => ipcRenderer.invoke('filter:moveToBad', imagePath, folderPath),
    filterRestoreImage: (badPath, originalPath) => ipcRenderer.invoke('filter:restoreImage', badPath, originalPath),
    filterMoveFolder: (sourcePath, destPath) => ipcRenderer.invoke('filter:moveFolder', sourcePath, destPath),
    // Room Detection
    detectRooms: (imagePath, modelId, confidence) => ipcRenderer.invoke('room:detect', imagePath, modelId, confidence),
    listRoomModels: () => ipcRenderer.invoke('room:listModels'),
    identifyRooms: (imagePathOrBase64, detections, isBase64) => ipcRenderer.invoke('room:identifyRooms', imagePathOrBase64, detections, isBase64),
    // Damage Detection
    detectDamage: (imagePath, modelId, confidence) => ipcRenderer.invoke('damage:detect', imagePath, modelId, confidence),
    listDamageModels: () => ipcRenderer.invoke('damage:listModels'),
    estimateDamageCost: (imagePathOrBase64, detections, isBase64) => ipcRenderer.invoke('damage:estimateCost', imagePathOrBase64, detections, isBase64),
    // Settings - Multi-Provider Key Manager
    getApiKeys: () => ipcRenderer.invoke('settings:getApiKeys'),
    setApiKey: (provider, key) => ipcRenderer.invoke('settings:setApiKey', { provider, key }),
    removeApiKey: (provider) => ipcRenderer.invoke('settings:removeApiKey', provider),
    // Legacy compatibility
    getOpenAIKey: () => ipcRenderer.invoke('settings:getOpenAIKey'),
    setOpenAIKey: (apiKey) => ipcRenderer.invoke('settings:setOpenAIKey', apiKey),
    getUsageStats: () => ipcRenderer.invoke('settings:getUsageStats'),
    // Contractor Search
    findContractors: (zipCode, category) => ipcRenderer.invoke('contractors:find', zipCode, category),
    // Video asset jobs (Phase 10)
    createVideoAssetsJob: (payload) => ipcRenderer.invoke('videoAssets:createJob', payload),
    listVideoAssetsJobs: () => ipcRenderer.invoke('videoAssets:listJobs')
});
