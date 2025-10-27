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

export type PipPosition = 'bottom-right' | 'top-left' | 'top-right' | 'bottom-left' | 'center'

