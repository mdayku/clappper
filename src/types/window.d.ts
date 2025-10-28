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
        overlayClips: Array<{input: string; start: number; end: number}>
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
    }
  }
}

