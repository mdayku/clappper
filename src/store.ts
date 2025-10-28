import { create } from 'zustand'
import { Clip, Track, PipPosition, PipSettings } from './lib/types'

export type ExportResolution = '360p' | '480p' | '720p' | '1080p' | 'source'
export type ExportPreset = 'fast' | 'medium' | 'slow'

export interface ExportSettings {
  resolution: ExportResolution
  preset: ExportPreset
}

// History snapshot for undo/redo
interface HistorySnapshot {
  tracks: Track[]
  selectedId?: string
  pipSettings: PipSettings
  visibleOverlayCount: number
}

interface State {
  tracks: Track[]
  selectedId?: string
  playhead: number
  pipSettings: PipSettings
  visibleOverlayCount: number // How many overlay tracks to show (0-4)
  exportSettings: ExportSettings
  
  // Undo/Redo
  history: HistorySnapshot[]
  historyIndex: number
  undo: () => void
  redo: () => void
  pushHistory: () => void
  
  // Track operations
  getTrack: (trackId: string) => Track | undefined
  getMainTrack: () => Track
  getOverlayTrack: () => Track
  getOverlayTracks: () => Track[]
  setVisibleOverlayCount: (count: number) => void
  
  // Clip operations (now track-aware)
  setClips: (c: Clip[]) => void
  addClips: (c: Clip[], trackId?: string) => void
  setTrim: (id: string, start: number, end: number) => void
  moveClipToTrack: (clipId: string, targetTrackId: string) => void
  
  // UI state
  setPlayhead: (t: number) => void
  select: (id?: string) => void
  setPipSettings: (settings: Partial<PipSettings>) => void
  setExportSettings: (settings: Partial<ExportSettings>) => void
  
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

// Initialize default tracks (1 main + 4 overlay tracks)
const createDefaultTracks = (): Track[] => [
  {
    id: 'main',
    name: 'Main',
    type: 'video',
    clips: [],
    height: 100
  },
  {
    id: 'overlay-1',
    name: 'Overlay 1',
    type: 'overlay',
    clips: [],
    height: 80
  },
  {
    id: 'overlay-2',
    name: 'Overlay 2',
    type: 'overlay',
    clips: [],
    height: 80
  },
  {
    id: 'overlay-3',
    name: 'Overlay 3',
    type: 'overlay',
    clips: [],
    height: 80
  },
  {
    id: 'overlay-4',
    name: 'Overlay 4',
    type: 'overlay',
    clips: [],
    height: 80
  }
]

export const useStore = create<State>((set, get) => ({
  tracks: createDefaultTracks(),
  playhead: 0,
  
  // Undo/Redo state
  history: [],
  historyIndex: -1,
  
  // Create a snapshot of current state
  pushHistory: () => set(s => {
    const snapshot: HistorySnapshot = {
      tracks: JSON.parse(JSON.stringify(s.tracks)), // Deep clone
      selectedId: s.selectedId,
      pipSettings: JSON.parse(JSON.stringify(s.pipSettings)),
      visibleOverlayCount: s.visibleOverlayCount
    }
    
    // Remove any future history if we're not at the end
    const newHistory = s.history.slice(0, s.historyIndex + 1)
    newHistory.push(snapshot)
    
    // Limit history to 50 snapshots
    if (newHistory.length > 50) {
      newHistory.shift()
      return { history: newHistory, historyIndex: newHistory.length - 1 }
    }
    
    return { history: newHistory, historyIndex: newHistory.length - 1 }
  }),
  
  // Undo to previous state
  undo: () => set(s => {
    if (s.historyIndex <= 0) {
      console.log('Nothing to undo')
      return s
    }
    
    const newIndex = s.historyIndex - 1
    const snapshot = s.history[newIndex]
    
    console.log('Undo to index', newIndex)
    return {
      tracks: JSON.parse(JSON.stringify(snapshot.tracks)),
      selectedId: snapshot.selectedId,
      pipSettings: JSON.parse(JSON.stringify(snapshot.pipSettings)),
      visibleOverlayCount: snapshot.visibleOverlayCount,
      historyIndex: newIndex
    }
  }),
  
  // Redo to next state
  redo: () => set(s => {
    if (s.historyIndex >= s.history.length - 1) {
      console.log('Nothing to redo')
      return s
    }
    
    const newIndex = s.historyIndex + 1
    const snapshot = s.history[newIndex]
    
    console.log('Redo to index', newIndex)
    return {
      tracks: JSON.parse(JSON.stringify(snapshot.tracks)),
      selectedId: snapshot.selectedId,
      pipSettings: JSON.parse(JSON.stringify(snapshot.pipSettings)),
      visibleOverlayCount: snapshot.visibleOverlayCount,
      historyIndex: newIndex
    }
  }),
  visibleOverlayCount: 4, // Show all 4 by default
  pipSettings: {
    position: 'bottom-right',
    size: 0.25, // 25% default
    keyframes: [],
    customX: undefined,
    customY: undefined
  },
  exportSettings: {
    resolution: '1080p',
    preset: 'medium'
  },
  
  // Track getters
  getTrack: (trackId) => get().tracks.find(t => t.id === trackId),
  getMainTrack: () => get().tracks.find(t => t.type === 'video')!,
  getOverlayTrack: () => get().tracks.find(t => t.type === 'overlay')!, // Returns first overlay for backward compatibility
  getOverlayTracks: () => get().tracks.filter(t => t.type === 'overlay'),
  
  // Clip operations
  setClips: (c) => {
    get().pushHistory() // Save state before change
    set(s => ({
      tracks: s.tracks.map(track => 
        track.id === 'main' 
          ? { ...track, clips: sortClips(c.map(clip => ({ ...clip, trackId: 'main' }))) }
          : track
      )
    }))
  },
  
  addClips: (c, trackId = 'main') => {
    get().pushHistory() // Save state before change
    set(s => {
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
    })
  },
  
  setTrim: (id, start, end) => {
    get().pushHistory() // Save state before change
    set(s => ({
      tracks: s.tracks.map(track => ({
        ...track,
        clips: track.clips.map(cl => cl.id === id ? { ...cl, start, end } : cl)
      }))
    }))
  },
  
  moveClipToTrack: (clipId, targetTrackId) => {
    get().pushHistory() // Save state before change
    set(s => {
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
    })
  },
  
  setPlayhead: (t) => set({ playhead: t }),
  select: (id) => set({ selectedId: id }),
  setPipSettings: (settings) => set(s => ({ 
    pipSettings: { ...s.pipSettings, ...settings } 
  })),
  setExportSettings: (settings) => set(s => ({
    exportSettings: { ...s.exportSettings, ...settings }
  })),
  setVisibleOverlayCount: (count) => set({ visibleOverlayCount: Math.max(0, Math.min(4, count)) }),
  
  reorderClips: (fromIndex, toIndex, trackId) => {
    get().pushHistory() // Save state before change
    set(s => ({
      tracks: s.tracks.map(track => {
        if (track.id !== trackId) return track
        
        const sorted = sortClips(track.clips)
        const [removed] = sorted.splice(fromIndex, 1)
        sorted.splice(toIndex, 0, removed)
        
        return { ...track, clips: reassignOrders(sorted) }
      })
    }))
  },
  
  splitClip: (id, splitTime) => {
    get().pushHistory() // Save state before change
    set(s => {
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
    })
  },
  
  deleteClip: (id) => {
    get().pushHistory() // Save state before change
    set(s => ({
      tracks: s.tracks.map(track => ({
        ...track,
        clips: reassignOrders(track.clips.filter(c => c.id !== id))
      })),
      selectedId: s.selectedId === id ? undefined : s.selectedId
    }))
  },
  
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
    // Total duration is the longest track duration (for timeline scaling)
    const tracks = get().tracks
    const durations = tracks.map(track => 
      track.clips.reduce((total, clip) => total + (clip.end - clip.start), 0)
    )
    return Math.max(...durations, 0)
  }
}))

