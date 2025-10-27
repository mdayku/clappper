export type Clip = {
  id: string
  path: string
  duration: number
  start: number // trim-in seconds
  end: number   // trim-out seconds
  width?: number
  height?: number
}

