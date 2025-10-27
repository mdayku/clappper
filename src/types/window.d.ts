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
      transcode: (payload: {
        input: string
        output: string
      }) => Promise<{ ok: boolean; output: string }>
      exportTrim: (payload: {
        input: string
        outPath: string
        start: number
        end: number
      }) => Promise<{ ok: boolean; outPath: string }>
      exportConcat: (payload: {
        clips: Array<{input: string; start: number; end: number}>
        outPath: string
      }) => Promise<{ ok: boolean; outPath: string }>
      onExportProgress: (callback: (percent: number) => void) => void
      onTranscodeProgress: (callback: (percent: number) => void) => void
    }
  }
}

