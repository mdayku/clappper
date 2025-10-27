import { create } from 'zustand'
import { Clip, Track, PipPosition } from './lib/types'

interface State {
  tracks: Track[]
  selectedId?: string
  playhead: number
  pipPosition: PipPosition
  
  // Track operations
  getTrack: (trackId: string) => Track | undefined
  getMainTrack: () => Track
  getOverlayTrack: () => Track
  
  // Clip operations (now track-aware)
  setClips: (c: Clip[]) => void
  addClips: (c: Clip[], trackId?: string) => void
  setTrim: (id: string, start: number, end: number) => void
  moveClipToTrack: (clipId: string, targetTrackId: string) => void
  
  // UI state
  setPlayhead: (t: number) => void
  select: (id?: string) => void
  setPipPosition: (pos: PipPosition) => void
  
  // Timeline operations
  reorderClips: (fromIndex: number, toIndex: number, trackId: string) => void
  splitClip: (id: string, splitTime: number) => void
  deleteClip: (id: string) => void
  
  // Helpers
  getClipsSorted: () => Clip[]
  getClipById: (id: string) => Clip | undefined
  getAllClips: () => Clip[]
  getTotalDuration: () => number
}

// Helper to keep clips sorted by order
const sortClips = (clips: Clip[]) => [...clips].sort((a, b) => a.order - b.order)

// Helper to reassign order values sequentially
const reassignOrders = (clips: Clip[]) => 
  clips.map((clip, index) => ({ ...clip, order: index }))

// Initialize default tracks
const createDefaultTracks = (): Track[] => [
  {
    id: 'main',
    name: 'Main',
    type: 'video',
    clips: [],
    height: 100
  },
  {
    id: 'overlay',
    name: 'Overlay',
    type: 'overlay',
    clips: [],
    height: 80
  }
]

export const useStore = create<State>((set, get) => ({
  tracks: createDefaultTracks(),
  playhead: 0,
  pipPosition: 'bottom-right',
  
  // Track getters
  getTrack: (trackId) => get().tracks.find(t => t.id === trackId),
  getMainTrack: () => get().tracks.find(t => t.type === 'video')!,
  getOverlayTrack: () => get().tracks.find(t => t.type === 'overlay')!,
  
  // Clip operations
  setClips: (c) => set(s => ({
    tracks: s.tracks.map(track => 
      track.id === 'main' 
        ? { ...track, clips: sortClips(c.map(clip => ({ ...clip, trackId: 'main' }))) }
        : track
    )
  })),
  
  addClips: (c, trackId = 'main') => set(s => {
    const tracks = s.tracks.map(track => {
      if (track.id !== trackId) return track
      
      const maxOrder = track.clips.length > 0 ? Math.max(...track.clips.map(cl => cl.order)) : -1
      const newClips = c.map((clip, i) => ({ 
        ...clip, 
        order: maxOrder + 1 + i,
        trackId: track.id
      }))
      
      return { ...track, clips: sortClips([...track.clips, ...newClips]) }
    })
    
    // Auto-select first clip if nothing selected
    const allClips = tracks.flatMap(t => t.clips)
    const selectedId = s.selectedId || (allClips.length > 0 ? allClips[0].id : undefined)
    
    return { tracks, selectedId }
  }),
  
  setTrim: (id, start, end) => set(s => ({
    tracks: s.tracks.map(track => ({
      ...track,
      clips: track.clips.map(cl => cl.id === id ? { ...cl, start, end } : cl)
    }))
  })),
  
  moveClipToTrack: (clipId, targetTrackId) => set(s => {
    let clipToMove: Clip | undefined
    
    // Remove from source track
    const tracks = s.tracks.map(track => {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        clipToMove = clip
        return { ...track, clips: track.clips.filter(c => c.id !== clipId) }
      }
      return track
    })
    
    // Add to target track
    if (!clipToMove) return s
    
    return {
      tracks: tracks.map(track => {
        if (track.id !== targetTrackId) return track
        
        const maxOrder = track.clips.length > 0 ? Math.max(...track.clips.map(cl => cl.order)) : -1
        const newClip = { ...clipToMove!, order: maxOrder + 1, trackId: track.id }
        
        return { ...track, clips: sortClips([...track.clips, newClip]) }
      })
    }
  }),
  
  setPlayhead: (t) => set({ playhead: t }),
  select: (id) => set({ selectedId: id }),
  setPipPosition: (pos) => set({ pipPosition: pos }),
  
  reorderClips: (fromIndex, toIndex, trackId) => set(s => ({
    tracks: s.tracks.map(track => {
      if (track.id !== trackId) return track
      
      const sorted = sortClips(track.clips)
      const [removed] = sorted.splice(fromIndex, 1)
      sorted.splice(toIndex, 0, removed)
      
      return { ...track, clips: reassignOrders(sorted) }
    })
  })),
  
  splitClip: (id, splitTime) => set(s => {
    let updated = false
    
    const tracks = s.tracks.map(track => {
      const clipIndex = track.clips.findIndex(c => c.id === id)
      if (clipIndex === -1) return track
      
      const clip = track.clips[clipIndex]
      
      // Validate split time
      if (splitTime <= clip.start || splitTime >= clip.end) {
        console.warn('Split time must be between start and end')
        return track
      }
      
      // Create two new clips
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
        order: clip.order + 0.5
      }
      
      // Replace original with both halves
      const newClips = [
        ...track.clips.slice(0, clipIndex),
        firstHalf,
        secondHalf,
        ...track.clips.slice(clipIndex + 1)
      ]
      
      updated = true
      return { ...track, clips: reassignOrders(sortClips(newClips)) }
    })
    
    return updated ? { tracks } : s
  }),
  
  deleteClip: (id) => set(s => ({
    tracks: s.tracks.map(track => ({
      ...track,
      clips: reassignOrders(track.clips.filter(c => c.id !== id))
    })),
    selectedId: s.selectedId === id ? undefined : s.selectedId
  })),
  
  // Helper methods (backward compatible)
  getClipsSorted: () => {
    // Return main track clips for backward compatibility
    const mainTrack = get().tracks.find(t => t.type === 'video')
    return mainTrack ? sortClips(mainTrack.clips) : []
  },
  
  getClipById: (id) => {
    for (const track of get().tracks) {
      const clip = track.clips.find(c => c.id === id)
      if (clip) return clip
    }
    return undefined
  },
  
  getAllClips: () => {
    return get().tracks.flatMap(t => t.clips)
  },
  
  getTotalDuration: () => {
    // Total duration is based on main track only
    const mainTrack = get().tracks.find(t => t.type === 'video')
    if (!mainTrack) return 0
    return mainTrack.clips.reduce((total, clip) => total + (clip.end - clip.start), 0)
  }
}))

