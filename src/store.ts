import { create } from 'zustand'
import { Clip } from './lib/types'

interface State {
  clips: Clip[]
  selectedId?: string
  playhead: number
  setClips: (c: Clip[]) => void
  addClips: (c: Clip[]) => void
  setTrim: (id: string, start: number, end: number) => void
  setPlayhead: (t: number) => void
  select: (id?: string) => void
  reorderClips: (fromIndex: number, toIndex: number) => void
  splitClip: (id: string, splitTime: number) => void
  deleteClip: (id: string) => void
  getClipsSorted: () => Clip[]
  getTotalDuration: () => number
}

// Helper to keep clips sorted by order
const sortClips = (clips: Clip[]) => [...clips].sort((a, b) => a.order - b.order)

// Helper to reassign order values sequentially
const reassignOrders = (clips: Clip[]) => 
  clips.map((clip, index) => ({ ...clip, order: index }))

export const useStore = create<State>((set, get) => ({
  clips: [],
  playhead: 0,
  
  setClips: (c) => set({ clips: sortClips(c) }),
  
  addClips: (c) => set(s => {
    const maxOrder = s.clips.length > 0 ? Math.max(...s.clips.map(cl => cl.order)) : -1
    const newClips = c.map((clip, i) => ({ ...clip, order: maxOrder + 1 + i }))
    return { clips: sortClips([...s.clips, ...newClips]) }
  }),
  
  setTrim: (id, start, end) => set(s => ({
    clips: s.clips.map(cl => cl.id === id ? { ...cl, start, end } : cl)
  })),
  
  setPlayhead: (t) => set({ playhead: t }),
  
  select: (id) => set({ selectedId: id }),
  
  reorderClips: (fromIndex, toIndex) => set(s => {
    const sorted = sortClips(s.clips)
    const [removed] = sorted.splice(fromIndex, 1)
    sorted.splice(toIndex, 0, removed)
    return { clips: reassignOrders(sorted) }
  }),
  
  splitClip: (id, splitTime) => set(s => {
    const clipIndex = s.clips.findIndex(c => c.id === id)
    if (clipIndex === -1) return s
    
    const clip = s.clips[clipIndex]
    
    // Validate split time is within clip bounds
    if (splitTime <= clip.start || splitTime >= clip.end) {
      console.warn('Split time must be between start and end')
      return s
    }
    
    // Create two new clips from the split
    const firstHalf: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      name: `${clip.name} (1)`,
      end: splitTime,
      order: clip.order
    }
    
    const secondHalf: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      name: `${clip.name} (2)`,
      start: splitTime,
      order: clip.order + 0.5 // Temporary order for insertion
    }
    
    // Replace original with both halves
    const newClips = [
      ...s.clips.slice(0, clipIndex),
      firstHalf,
      secondHalf,
      ...s.clips.slice(clipIndex + 1)
    ]
    
    // Reassign orders to maintain sequence
    return { clips: reassignOrders(sortClips(newClips)) }
  }),
  
  deleteClip: (id) => set(s => {
    const filtered = s.clips.filter(c => c.id !== id)
    return { 
      clips: reassignOrders(filtered),
      selectedId: s.selectedId === id ? undefined : s.selectedId
    }
  }),
  
  getClipsSorted: () => sortClips(get().clips),
  
  getTotalDuration: () => {
    const clips = get().clips
    return clips.reduce((total, clip) => total + (clip.end - clip.start), 0)
  }
}))

