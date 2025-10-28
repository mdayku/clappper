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

