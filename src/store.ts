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
}

export const useStore = create<State>((set) => ({
  clips: [],
  playhead: 0,
  setClips: (c) => set({ clips: c }),
  addClips: (c) => set(s => ({ clips: [...s.clips, ...c] })),
  setTrim: (id, start, end) => set(s => ({
    clips: s.clips.map(cl => cl.id === id ? { ...cl, start, end } : cl)
  })),
  setPlayhead: (t) => set({ playhead: t }),
  select: (id) => set({ selectedId: id })
}))

