// Type definitions for Electron API exposed via preload
export {}

declare global {
  interface Window {
    clappper: {
      openFiles: () => Promise<string[]>
      savePath: (defaultName: string) => Promise<string | null>
      ffprobe: (filePath: string) => Promise<{
        format: {
          duration: number
          size: number
          format_name: string
        }
        streams: Array<{
          codec_type: string
          codec_name: string
          width?: number
          height?: number
        }>
      }>
      generateThumbnail: (payload: {
        input: string
        timestamp: number
        clipId: string
      }) => Promise<string>
      transcode: (payload: {
        input: string
        output: string
      }) => Promise<{ ok: boolean; output: string }>
      exportTrim: (payload: {
        input: string
        outPath: string
        start: number
        end: number
        resolution?: string
        preset?: string
      }) => Promise<{ ok: boolean; outPath: string }>
      exportConcat: (payload: {
        clips: Array<{input: string; start: number; end: number}>
        outPath: string
        resolution?: string
        preset?: string
      }) => Promise<{ ok: boolean; outPath: string }>
      exportPip: (payload: {
        mainClip: {input: string; start: number; end: number}
        overlayClips: Array<{input: string; start: number; end: number; position?: string; size?: number}>
        outPath: string
        pipPosition: string
        pipSize: number
        keyframes?: Array<{time: number; x: number; y: number; size: number}>
        customX?: number
        customY?: number
        resolution?: string
        preset?: string
      }) => Promise<{ ok: boolean; outPath: string }>
      onExportProgress: (callback: (percent: number) => void) => void
      onTranscodeProgress: (callback: (percent: number) => void) => void
      cancelExport: () => Promise<{ ok: boolean; cancelled?: boolean; message?: string }>
      saveProject: (filePath: string, state: any) => Promise<{ ok: boolean }>
      loadProject: (filePath: string) => Promise<{ ok: boolean; state: any }>
      getAutosavePath: () => Promise<string>
      checkAutosave: () => Promise<{ exists: boolean; path?: string }>
      onMenuSaveProject: (callback: () => void) => void
      onMenuLoadProject: (callback: () => void) => void
      getScreenSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>
      saveRecording: (filePath: string, base64Data: string) => Promise<{ ok: boolean }>
      enhanceVideo: (payload: { input: string; output: string }) => Promise<{ ok: boolean; outPath: string; outputWidth?: number; outputHeight?: number; scale?: number }>
      enhanceCancel: () => Promise<{ ok: boolean; cancelled?: boolean; message?: string }>
      detectGPU: () => Promise<{ detected: boolean; name: string; vram: string; estimatedFps: number }>
      onEnhanceProgress: (callback: (progress: { stage: string; frame: number; totalFrames: number; percent: number; eta: string; outputResolution?: string; scale?: number; fps?: string }) => void) => void
      extractFrames: (payload: { videoPath: string; outputDir: string; format?: string; fps?: number }) => Promise<{ ok: boolean; frameCount: number; outputDir: string } | { ok: false; message: string }>
      composeVideo: (payload: { frameDir: string; outputPath: string; fps?: number; pattern?: string; audioPath?: string }) => Promise<{ ok: boolean; outPath: string } | { ok: false; message: string }>
      selectDirectory: () => Promise<string | null>
      createTempDir: () => Promise<string>
      cleanupTempDir: (tempDir: string) => Promise<{ ok: boolean; message?: string }>
    }
  }
}

