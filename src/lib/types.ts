export type Clip = {
  id: string
  path: string
  name: string  // Display name for the clip
  originalPath?: string  // Original file path (if transcoded)
  duration: number
  start: number // trim-in seconds
  end: number   // trim-out seconds
  order: number // Position in timeline sequence
  trackId: string // Which track this clip belongs to
  width?: number
  height?: number
  thumbnailPath?: string // Path to cached thumbnail image
}

export type Track = {
  id: string
  name: string  // "Main" or "Overlay"
  type: 'video' | 'overlay'
  clips: Clip[]
  height: number // Visual height in timeline (px)
}

export type PipPosition = 'bottom-right' | 'top-left' | 'top-right' | 'bottom-left' | 'center' | 'custom'

export type PipKeyframe = {
  time: number // Time in seconds
  x: number // X position (0-1, percentage of container width)
  y: number // Y position (0-1, percentage of container height)
  size: number // 0.15 to 0.5 (15% to 50% of main video width)
}

export type PipSettings = {
  position: PipPosition
  size: number // 0.15 to 0.5 (15% to 50% of main video width)
  keyframes: PipKeyframe[] // Position keyframes for animation
  customX?: number // Custom X position (0-1)
  customY?: number // Custom Y position (0-1)
}

// Phase 10: 3D Product Video Asset Packs
export type VideoAssetJobType = 'ai_video_pack' | '3d_render_pack'

export type VideoAssetJobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface VideoAssetShotResult {
  shotId: string
  provider: string
  url: string
  durationSec: number
  width?: number
  height?: number
}

export interface VideoAssetJob {
  id: string
  type: VideoAssetJobType
  productId?: string | null
  sourceImages: string[]
  shotPresetIds: string[]
  status: VideoAssetJobStatus
  createdAt: string
  updatedAt: string
  resultAssets: VideoAssetShotResult[]
  error?: string | null
}

