export type Clip = {
  id: string
  path: string
  name: string  // Display name for the clip
  duration: number
  start: number // trim-in seconds
  end: number   // trim-out seconds
  order: number // Position in timeline sequence
  width?: number
  height?: number
}

