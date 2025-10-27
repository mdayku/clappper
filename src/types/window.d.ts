// Type definitions for Electron API exposed via preload
export {}

declare global {
  interface Window {
    clappper: {
      openFiles: () => Promise<string[]>
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
      exportTrim: (payload: {
        input: string
        outPath: string
        start: number
        end: number
      }) => Promise<{ ok: boolean; outPath: string }>
      onExportProgress: (callback: (percent: number) => void) => void
    }
  }
}

