# Clappper - Full Submission PRD

**Target Deadline**: Tuesday, Oct 28, 2025, 10:59 PM CT  
**Time Available**: ~36 hours from start

---

## Executive Summary

Clappper is a lightweight desktop video editor targeting solo creators and educators who need to quickly splice, trim, and export video content without the complexity of professional NLEs. This PRD outlines the path from current scaffold to a fully-featured MVP that meets all submission requirements.

---

## Goals & Success Criteria

### Must-Have (Hard Requirements)
1. **Desktop app** launches in <5s, packaged for Windows/Mac
2. **Multi-clip timeline** with drag-to-reorder, split at playhead, delete
3. **2-track support** (main video track + overlay/PiP track)
4. **Import system** supporting MP4/MOV/WebM with metadata extraction
5. **Preview player** synchronized with timeline, smooth playback
6. **Trim controls** with visual handles for in/out points
7. **Export engine** with quality presets (720p/1080p/source)
8. **Thumbnails** for clips on timeline
9. **Stable export** for 2+ minute sequences without crashes

### Nice-to-Have (Stretch Goals)
- Keyboard shortcuts (space=play/pause, delete=remove clip, etc.)
- Undo/redo system
- Text overlays with customizable position/font
- Simple crossfade transitions
- Audio gain/fade controls
- Autosave project state

### Performance Targets
- Timeline responsive with 10+ clips
- Preview at ≥30fps on typical laptop
- Export progress updates smoothly
- No memory leaks during extended editing sessions

---

## User Flows

### Primary Flow: Import → Edit → Export
```
1. User launches app
2. User imports 3-6 video clips via drag-drop or file picker
3. Clips appear on timeline with thumbnails
4. User reorders clips by dragging
5. User selects a clip and trims start/end points
6. User splits a clip at playhead position
7. User adds a second clip to overlay track (PiP)
8. User previews composition in player
9. User selects export quality (1080p)
10. User exports → receives progress updates → gets output file path
```

### Secondary Flow: Screen Recording (Post-MVP)
```
1. User clicks "Record Screen"
2. Selects screen/window to capture
3. Records → stops → clip automatically added to timeline
4. Continue editing as normal
```

---

## Technical Architecture

### Core Stack
- **Desktop**: Electron 32
- **UI**: React 18 + TypeScript + Vite
- **State**: Zustand (clips, tracks, playhead, selection)
- **Media Processing**: fluent-ffmpeg + ffmpeg-static
- **Build**: electron-builder

### Data Models

#### Clip
```typescript
{
  id: string
  path: string              // File system path
  name: string              // Display name
  duration: number          // Total duration (seconds)
  start: number             // Trim in-point (seconds)
  end: number               // Trim out-point (seconds)
  width: number
  height: number
  thumbnail?: string        // Base64 or blob URL
  trackId: string           // Which track this belongs to
  order: number             // Position on track
}
```

#### Track
```typescript
{
  id: string
  name: string              // "Main" or "Overlay"
  type: 'video' | 'overlay'
  clips: Clip[]
  height: number            // Visual height in timeline (px)
}
```

#### Project State
```typescript
{
  tracks: Track[]
  selectedClipId?: string
  playhead: number          // Current time (seconds)
  zoomLevel: number         // Pixels per second
  exportSettings: {
    resolution: '720p' | '1080p' | 'source'
    preset: 'fast' | 'medium' | 'slow'
  }
}
```

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `dialog:openFiles` | Renderer → Main | Open file picker for video import |
| `ffprobe:metadata` | Renderer → Main | Extract video metadata (duration, resolution, etc.) |
| `ffmpeg:generateThumbnail` | Renderer → Main | Create thumbnail from video frame |
| `export:concatenate` | Renderer → Main | Export multi-clip sequence with filters |
| `export:progress` | Main → Renderer | Real-time export progress updates |
| `capture:startScreen` | Renderer → Main | Start screen recording (post-MVP) |
| `capture:stop` | Renderer → Main | Stop recording and get file path |

### Window API (Preload)

Exposed to renderer as `window.clappper`:
- `openFiles()` - Open file dialog
- `ffprobe(filePath)` - Get video metadata
- `exportTrim(payload)` - Export trimmed clip
- `onExportProgress(callback)` - Listen for export progress

### Export Pipeline

**Simple Trim (Single Clip)**:
```bash
ffmpeg -i input.mp4 -ss START -t DURATION -c:v libx264 -preset fast -crf 23 -c:a aac out.mp4
```

**Multi-Clip Concat (Same Codec)**:
```bash
# Create concat.txt with file list
ffmpeg -f concat -safe 0 -i concat.txt -c copy out.mp4
```

**Multi-Clip Concat (Different Codecs)**:
```bash
# Re-encode all segments to matching params, then concat
ffmpeg -i input1.mp4 -i input2.mp4 -filter_complex "[0:v][1:v]concat=n=2:v=1:a=1" out.mp4
```

**PiP Overlay (Two Tracks)**:
```bash
ffmpeg -i main.mp4 -i overlay.mp4 -filter_complex \
  "[1:v]scale=320:180[pip];[0:v][pip]overlay=W-w-10:H-h-10" \
  -c:a copy out.mp4
```

---

## Feature Breakdown

### Phase 1: MVP Foundation ✅ (Already Complete)
- [x] Project structure with Electron + React + Vite
- [x] Basic import via file picker
- [x] Single clip preview in video player
- [x] Simple trim with draggable handles
- [x] Export single clip (trim only)
- [x] Progress indicator during export

### Phase 2: Multi-Clip Timeline (Priority 1)
**Goal**: Support multiple clips on a single track with reordering

**Tasks**:
- [ ] Update store to handle array of clips with `order` property
- [ ] Render multiple clips on timeline as sequential boxes
- [ ] Implement drag-to-reorder (update `order` on drop)
- [ ] Calculate total sequence duration from all clips
- [ ] Update preview player to play sequence (switch video src as playhead crosses boundaries)
- [ ] Implement "split at playhead" (duplicate clip, adjust start/end)
- [ ] Implement delete clip (remove from array)
- [ ] Update export to concatenate multiple clips

**Components**:
- `Timeline.tsx`: Render clip boxes horizontally
- `ClipItem.tsx`: Individual draggable clip with thumbnail
- `store.ts`: Add `reorderClips()`, `splitClip()`, `deleteClip()`

**Timeline Visual**:
```
┌─────────────────────────────────────────────────────────┐
│ [Clip 1: 5s] [Clip 2: 10s] [Clip 3: 8s]        ▶ 00:23│
│     |────trim─────|                                     │
└─────────────────────────────────────────────────────────┘
```

### Phase 3: Two-Track System (Priority 2)
**Goal**: Add overlay/PiP track above main track

**Tasks**:
- [ ] Update store to use `tracks: Track[]` model
- [ ] Create track 0 (Main) and track 1 (Overlay) by default
- [ ] Render two horizontal lanes in Timeline component
- [ ] Allow dropping clips into either track
- [ ] Add visual indicator for track type (main=full height, overlay=PiP badge)
- [ ] Update export to handle overlay with ffmpeg filter_complex
- [ ] Add overlay position controls (bottom-right, top-left, etc.)

**Components**:
- `TrackLane.tsx`: Container for clips on a single track
- `Timeline.tsx`: Stack multiple TrackLane components

**Timeline Visual**:
```
┌─────────────────────────────────────────────────────────┐
│ Overlay: [Clip 4: 5s (PiP)]                            │
├─────────────────────────────────────────────────────────┤
│ Main:    [Clip 1] [Clip 2] [Clip 3]            ▶ 00:23│
└─────────────────────────────────────────────────────────┘
```

### Phase 4: Thumbnails (Priority 3)
**Goal**: Show preview thumbnails for each clip and trim points

**Tasks**:
- [ ] Add IPC handler to generate thumbnail using ffmpeg
- [ ] Extract frame at 1s mark (or first keyframe)
- [ ] Return as base64 or save to temp file
- [ ] Update Clip model to store thumbnail URL
- [ ] Render thumbnail as background in ClipItem
- [ ] Cache thumbnails (don't regenerate on every render)
- [ ] Add collapsible trim point preview thumbnails above timeline handles
  - Always visible above start/end handles (persistent)
  - Shows frame at exact trim point (~100px wide)
  - Collapsible UI control (minimize/restore/close)
  - Reuses ffmpeg thumbnail generation for specific timestamps
  - Position with absolute positioning and z-index layering

**Thumbnail Generation**:
```bash
ffmpeg -i input.mp4 -ss 1 -vframes 1 -vf scale=160:-1 thumb.jpg
# For trim point thumbnails:
ffmpeg -i input.mp4 -ss {timestamp} -vframes 1 -vf scale=100:-1 trim_thumb.jpg
```

### Phase 5: Export Presets (Priority 4)
**Goal**: Let user choose output quality

**Tasks**:
- [ ] Add export settings panel/modal in UI
- [ ] Add radio buttons: 720p / 1080p / Source
- [ ] Store selection in Zustand state
- [ ] Update ffmpeg command to include resolution scaling
- [ ] Add preset dropdown: Fast / Medium / Slow (maps to veryfast/medium/slow)

**Export Panel UI**:
```
┌──────────────────────────┐
│ Export Settings          │
├──────────────────────────┤
│ Resolution:              │
│  ○ 720p (HD)            │
│  ● 1080p (Full HD)      │
│  ○ Source (no scale)    │
│                          │
│ Quality:                 │
│  ○ Fast (larger file)   │
│  ● Medium (balanced)    │
│  ○ Slow (smaller file)  │
│                          │
│ [Cancel]  [Export Now]   │
└──────────────────────────┘
```

### Phase 6: Polish & Packaging (Priority 5)
**Goal**: Stable, distributable app

**Tasks**:
- [ ] Add error handling for import failures (unsupported codec, corrupt file)
- [ ] Add error handling for export failures (disk space, permissions)
- [ ] Show loading spinner during metadata extraction
- [ ] Add cancel button for exports
- [ ] Test on Windows (NSIS installer)
- [ ] Test on Mac (DMG)
- [ ] Add app icon (icon.png → icon.ico / icon.icns)
- [ ] Write user-facing README with screenshots
- [ ] Handle edge cases (empty timeline export, zero-duration clips)

### Phase 7: Stretch Features (If Time Permits)
**Goal**: Enhance UX with power-user features

**Tasks**:
- [ ] Keyboard shortcuts (space, delete, cmd/ctrl+z, etc.)
- [ ] Undo/redo with history stack
- [ ] Text overlay component with draggable positioning
- [ ] Crossfade transition between clips
- [ ] Audio waveform visualization
- [ ] Audio gain slider per clip
- [ ] Save/load project JSON to disk
- [ ] Screen recording with desktopCapturer + MediaRecorder

---

## Implementation Timeline

### Day 1 (Today): Core Features
- **Hours 0-4**: Phase 2 (Multi-clip timeline with reorder/split/delete)
- **Hours 4-8**: Phase 3 (Two-track system)
- **Hours 8-10**: Phase 4 (Thumbnails)
- **Hours 10-12**: Testing & bug fixes

### Day 2 (Tomorrow): Polish & Ship
- **Hours 0-2**: Phase 5 (Export presets)
- **Hours 2-6**: Phase 6 (Error handling, packaging, testing)
- **Hours 6-8**: Phase 7 (Stretch goals if ahead of schedule)
- **Hours 8-10**: Final testing, documentation, submission prep

---

## Testing Checklist

### Functional Tests
- [ ] Import 5+ clips of different formats (MP4, MOV, WebM)
- [ ] Reorder clips via drag-and-drop
- [ ] Split clip at playhead, verify both segments are correct
- [ ] Delete clip, verify timeline updates
- [ ] Add clip to overlay track, verify PiP in export
- [ ] Trim clip, verify export matches trimmed duration
- [ ] Export 720p, verify output resolution
- [ ] Export 1080p, verify output resolution
- [ ] Export source, verify no scaling
- [ ] Play preview, verify playhead syncs across clips
- [ ] Export long sequence (5+ minutes), verify no crash
- [ ] Export with audio, verify audio is preserved

### Edge Cases
- [ ] Import empty timeline → should warn before export
- [ ] Import zero-byte file → should show error
- [ ] Import unsupported codec → should show error or transcode
- [ ] Trim clip to zero duration → should prevent or warn
- [ ] Disk full during export → should show error
- [ ] Cancel export mid-process → should clean up temp files
- [ ] Resize window → timeline should adapt
- [ ] Close window during export → should prompt to cancel

### Performance Tests
- [ ] Timeline with 20+ clips should remain responsive
- [ ] Preview should play at ≥24fps (measure with devtools)
- [ ] Export should show progress updates every 1-2 seconds
- [ ] Memory usage should stay under 500MB during editing

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| FFmpeg concat fails with mixed codecs | High | Medium | Normalize all clips to H.264/AAC on import or during export |
| Large files cause OOM | Medium | Low | Stream processing, don't load entire video into memory |
| Export takes too long | Medium | Medium | Use fast preset by default, show accurate time estimates |
| PiP overlay misaligned | Low | Medium | Test with different aspect ratios, add position presets |
| Windows packaged app missing ffmpeg | High | Low | Verify extraResources in electron-builder config |
| Timeline drag-drop buggy | Medium | Medium | Use react-dnd or simple mouse event handlers with thorough testing |

---

## Dependencies & Resources

### Libraries (Already Installed)
- electron@32.1.0
- react@18.3.1
- zustand@4.5.2
- fluent-ffmpeg@2.1.2
- ffmpeg-static@5.2.0
- electron-builder@24.13.3

### Additional Libraries (May Need)
- `react-beautiful-dnd` or `@dnd-kit/core` - for drag-and-drop
- `react-hotkeys-hook` - for keyboard shortcuts (stretch)

### External Tools
- FFmpeg documentation: https://ffmpeg.org/ffmpeg-filters.html
- Electron IPC guide: https://www.electronjs.org/docs/latest/tutorial/ipc

---

## Deliverables

### Submission Package
1. **Source Code** (GitHub repo or ZIP)
   - All source files
   - package.json with deps
   - README with setup instructions
   
2. **Packaged Application**
   - Windows: `Clappper-Setup-0.1.0.exe` (NSIS installer)
   - Mac: `Clappper-0.1.0.dmg` (or .app bundle)
   
3. **Documentation**
   - README.md with screenshots
   - Feature list
   - Known limitations
   
4. **Demo Video** (Optional but Recommended)
   - 2-3 minute screencast showing:
     - Import multiple clips
     - Reorder and trim
     - Add PiP overlay
     - Export with quality selection
     - Open exported video

---

## Success Metrics

**Hard Requirements** (Must Pass):
- ✅ App launches and is fully functional
- ✅ Can import 5+ clips
- ✅ Timeline supports multi-clip sequence
- ✅ Can export concatenated video with correct duration
- ✅ Two tracks functional (main + overlay)
- ✅ Export presets available (720p/1080p/source)
- ✅ Packaged for at least one platform

**Quality Indicators** (Nice to Have):
- 🎯 No crashes during 5-minute export
- 🎯 Timeline responsive with 15+ clips
- 🎯 Preview plays smoothly without stuttering
- 🎯 Export completes in <2x real-time (5min video → 10min export)
- 🎯 Professional UI with consistent styling

---

## Appendix: Component Architecture

```
App.tsx
├── Toolbar.tsx
│   ├── Import button
│   ├── Export button (opens modal)
│   └── Progress indicator
├── Player.tsx
│   └── <video> element with controls
├── Timeline.tsx
│   ├── PlayheadIndicator
│   ├── TrackLane (Main)
│   │   ├── ClipItem
│   │   ├── ClipItem
│   │   └── ClipItem
│   └── TrackLane (Overlay)
│       └── ClipItem
└── ExportModal.tsx
    ├── Resolution picker
    ├── Quality preset picker
    └── Export button
```

---

## Notes for Implementation

- Start with **Phase 2** (multi-clip) since it's the foundation for everything else
- **Don't over-engineer**: Use simple mouse events instead of complex DnD libraries initially
- **Test incrementally**: After each phase, do a quick export to verify pipeline works
- **Commit frequently**: Git commits after each working feature
- **Profile if slow**: Use Chrome DevTools to identify performance bottlenecks
- **Ask for help**: If stuck on ffmpeg commands, test in terminal first before coding

---

## Ready to Build?

Run these commands to get started:

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run dist        # Package for distribution
```

**Next Step**: Implement Phase 2 (Multi-clip timeline) 🚀

