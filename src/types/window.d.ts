// Type definitions for Electron API exposed via preload
export {}

declare global {
  interface Window {
    clappper: {
      openFiles: () => Promise<string[]>
      openImageFiles: () => Promise<string[]>
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
      onMenuChangeApiKey: (callback: () => void) => void
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
      
      // Image Filtering
      filterListFolders: (dirPath: string) => Promise<string[]>
      filterGetImages: (folderPath: string) => Promise<string[]>
      filterMoveToBad: (imagePath: string, folderPath: string) => Promise<string>
      filterRestoreImage: (badPath: string, originalPath: string) => Promise<{ ok: boolean }>
      filterMoveFolder: (sourcePath: string, destPath: string) => Promise<{ ok: boolean; newPath: string }>,
      
      // Room Detection
      detectRooms: (imagePath: string, modelId?: string, confidence?: number) => Promise<{
        success: boolean;
        detections?: Array<{ id: string; bounding_box: [number, number, number, number]; name_hint: string }>;
        annotated_image?: string | null;
        error?: string;
      }>
      listRoomModels: () => Promise<Array<{ id: string; name: string; path: string }>>
    identifyRooms: (imagePathOrBase64: string, detections: any[], isBase64?: boolean) => Promise<{
      success: boolean;
      room_labels?: Record<string, string>;
      error?: string;
    }>
      
      // Damage Detection
      detectDamage: (imagePath: string, modelId?: string, confidence?: number) => Promise<{
        success: boolean;
        detections?: Array<{
          cls: string;
          bbox: number[];
          conf: number;
          severity: number;
          affected_area_pct: number;
        }>;
        cost_estimate?: {
          labor_usd: number;
          materials_usd: number;
          disposal_usd: number;
          contingency_usd: number;
          total_usd: number;
          assumptions: string;
        };
        annotated_image?: string | null;
        image_width?: number;
        image_height?: number;
        error?: string;
      }>
      listDamageModels: () => Promise<Array<{ id: string; name: string; path: string }>>
      estimateDamageCost: (imagePathOrBase64: string, detections: any[], isBase64?: boolean) => Promise<{
        success: boolean;
        cost_estimate?: {
          labor_usd: number;
          materials_usd: number;
          disposal_usd: number;
          contingency_usd: number;
          total_usd: number;
          assumptions: string;
        };
        error?: string;
      }>
      
      // Settings
      getOpenAIKey: () => Promise<string | null>
      setOpenAIKey: (apiKey: string) => Promise<{ success: boolean }>
      getUsageStats: () => Promise<{
        usage: {
          total_calls: number
          total_prompt_tokens: number
          total_completion_tokens: number
          total_tokens: number
          first_call: string | null
          last_call: string | null
        }
        rate_limit: {
          allowed: boolean
          remainingCalls: number
          resetInSeconds: number
        }
      }>
      
      // Contractor Search
      findContractors: (zipCode: string, category: string) => Promise<{
        success: boolean
        opened_browser?: boolean
        error?: string
      }>
    }
  }
}

