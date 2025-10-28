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

### Export Pipeline (Normalization Contract)

**Critical Requirements for Stable Exports:**

All exports MUST normalize to:
- **Video**: H.264 (libx264), yuv420p, CFR 30fps (or source fps rounded)
- **Audio**: AAC, 48kHz, stereo 2ch, async resampling
- **Timebase**: Frame-accurate trims use `-ss` after `-i` (slower but accurate)

**Export Decision Tree:**

1. **Single Clip Trim**:
```bash
ffmpeg -i input.mp4 -ss START -t DURATION \
  -c:v libx264 -preset veryfast -crf 23 \
  -pix_fmt yuv420p -vf "fps=30,format=yuv420p" \
  -c:a aac -ar 48000 -ac 2 -b:a 128k \
  -af "aresample=async=1:first_pts=0" \
  output.mp4
```

2. **Multi-Clip Concat (Decision)**:
   - **IF** all clips are H.264/AAC/yuv420p/CFR/48kHz → Use concat demuxer (`-c copy`)
   - **ELSE** → Normalize each segment first, then concat

**Normalization Path (Most Stable)**:
```bash
# Step 1: Normalize each segment to temp folder
for each clip:
  ffmpeg -i input.mp4 -ss START -t DURATION \
    -c:v libx264 -preset veryfast -crf 23 \
    -pix_fmt yuv420p -vf "fps=30,format=yuv420p" \
    -c:a aac -ar 48000 -ac 2 -b:a 128k \
    -af "aresample=async=1:first_pts=0" \
    temp/segment_N.mp4

# Step 2: Create concat list
echo "file 'segment_0.mp4'" > concat.txt
echo "file 'segment_1.mp4'" >> concat.txt

# Step 3: Concat with copy (fast, lossless)
ffmpeg -f concat -safe 0 -i concat.txt -c copy output.mp4
```

**PiP Overlay (Two Tracks)** - Phase 3:
```bash
# Bottom-right preset (25% size, 16px padding)
ffmpeg -i main.mp4 -i overlay.mp4 -filter_complex \
  "[1:v]scale=iw*0.25:-2[pip]; \
   [0:v][pip]overlay=W-w-16:H-h-16:eval=init,format=yuv420p[v]" \
  -map "[v]" -map 0:a \
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
  -c:a aac -ar 48000 -ac 2 -b:a 128k \
  -shortest \
  output.mp4

# Other presets:
# Top-left:    overlay=16:16
# Top-right:   overlay=W-w-16:16
# Bottom-left: overlay=16:H-h-16
# Center:      overlay=(W-w)/2:(H-h)/2
```

**VFR → CFR Handling**:
- Some phone videos are Variable Frame Rate (VFR)
- **Solution**: Normalize to CFR on export (recommended)
- **Note**: Preview may not be frame-exact without normalization
- Alternative: Normalize on import (slower, but preview matches export)

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
- [x] **2.1**: Update store to handle array of clips with `order` property, add `reorderClips()`, `splitClip()`, `deleteClip()` actions ✅
- [x] **2.2**: Add codec detection and automatic transcoding (H.265 → H.264) for unsupported formats ✅
- [x] **2.3**: Render multiple clips on timeline as sequential boxes ✅
- [x] **2.4**: Add "Save As" dialog for export (choose location/filename before exporting) ✅
- [x] **2.5**: Implement drag-to-reorder (update `order` on drop) ✅
- [x] **2.6**: Calculate total sequence duration from all clips ✅
- [x] **2.7**: Implement delete clip UI (button/keyboard shortcut) ✅
- [x] **2.8**: Update export to concatenate multiple clips ✅
- [x] **2.9**: Implement "split at playhead" (duplicate clip, adjust start/end) ✅
- [x] **2.10**: Update preview player to play sequence (switch video src as playhead crosses boundaries) ✅

**Status**: ✅ **PHASE 2 COMPLETE!** All 10 tasks implemented and tested.

**Components**:
- `Timeline.tsx`: Render clip boxes horizontally
- `ClipItem.tsx`: Individual draggable clip with thumbnail
- `store.ts`: ✅ Actions implemented (reorderClips, splitClip, deleteClip, getClipsSorted, getTotalDuration)

**Timeline Visual**:
```
┌─────────────────────────────────────────────────────────┐
│ [Clip 1: 5s] [Clip 2: 10s] [Clip 3: 8s]        ▶ 00:23│
│     |────trim─────|                                     │
└─────────────────────────────────────────────────────────┘
```

### Phase 3: Multi-Track PiP System (Priority 2)
**Goal**: Advanced multi-track system with animated Picture-in-Picture

**Tasks**:
- [x] **3.1**: Update store to use `tracks: Track[]` model ✅
- [x] **3.2**: Create track 0 (Main) and track 1 (Overlay) by default ✅
- [x] **3.3**: Render two horizontal lanes in Timeline component ✅
- [x] **3.4**: Allow dropping clips into either track ✅
- [x] **3.5**: Add visual indicator for track type (main=full height, overlay=PiP badge) ✅
- [x] **3.5.1**: Fix timeline scaling to handle longest track (main or overlay) ✅
- [x] **3.5.2**: Update Player to composite both tracks with PiP preview ✅
- [x] **3.5.3**: Fix Player aspect ratio handling (contain video properly) ✅
- [x] **3.5.4**: Sync playback between main and overlay videos ✅
- [x] **3.5.5**: Add visual selection indicators (border highlights) ✅
- [x] **3.6**: Update export to handle overlay with ffmpeg filter_complex ✅
- [x] **3.7**: Add overlay position AND size controls (5 positions + adjustable 15-50%) ✅
- [x] **3.8**: Add FREE DRAGGING of PiP window to custom positions ✅
- [x] **3.9**: Implement KEYFRAME ANIMATION system for PiP movement ✅
- [x] **3.10**: Generate FFmpeg expressions for animated overlay (position + size interpolation) ✅
- [x] **3.11**: Extend to 4 OVERLAY TRACKS for multiple simultaneous PiP windows ✅

**Status**: ✅ **PHASE 3 COMPLETE!** Advanced multi-track PiP system with keyframe animation fully implemented and tested.

**PiP Export Specs** (Lock Down Implementation):
- **Overlay Size**: 25% of main video width (maintain aspect ratio)
- **Positions**: 
  - Bottom-right: `overlay=W-w-16:H-h-16` (default)
  - Top-left: `overlay=16:16`
  - Top-right: `overlay=W-w-16:16`
  - Bottom-left: `overlay=16:H-h-16`
  - Center: `overlay=(W-w)/2:(H-h)/2`
- **Audio**: Main track audio only (overlay muted by default)
  - Future: Mix overlay at -12dB with toggle
- **Duration**: Use `-shortest` to match shortest clip
- **Filter Graph**: `[1:v]scale=iw*0.25:-2[pip];[0:v][pip]overlay=X:Y:eval=init,format=yuv420p`

**Components**:
- `TrackLane.tsx`: Container for clips on a single track
- `Timeline.tsx`: Stack multiple TrackLane components

**Timeline Visual**:
```
┌─────────────────────────────────────────────────────────┐
│ Main:    [Clip 1] [Clip 2] [Clip 3]            ▶ 00:23│
├─────────────────────────────────────────────────────────┤
│ Overlay: [Clip 4: 5s (PiP)]                            │
└─────────────────────────────────────────────────────────┘
```

**Status**: ✅ **PHASE 3 COMPLETE!** Advanced multi-track PiP system:
- ✅ **4 OVERLAY TRACKS** - support up to 4 simultaneous PiP windows
- ✅ Drag-and-drop between all tracks (1 main + 4 overlay)
- ✅ PiP preview with synchronized playback (all overlays sync to main)
- ✅ **FREE DRAGGING** of PiP windows to any position
- ✅ Adjustable position (5 presets + custom) and size (15-50%)
- ✅ **KEYFRAME ANIMATION** - animate PiP position and size over time
- ✅ Interpolated movement between keyframes (linear)
- ✅ Visual keyframe markers on preview
- ✅ Color-coded overlay badges (Purple, Blue, Green, Orange)
- ✅ Automatic offset positioning to prevent complete overlap
- ✅ PiP export with ffmpeg filter_complex + animated expressions

---

### Phase 3.5: Build & Package Native App (Priority: CRITICAL)
**Goal**: Package app for distribution to verify it works outside dev mode

**Tasks**:
- [x] **3.5.1**: Run production build (`npm run build`) ✅
- [x] **3.5.2**: Verify bundled files in `dist/` directory ✅
- [x] **3.5.3**: Package for Windows (`npm run pack`) ✅
- [x] **3.5.4**: Verify ffmpeg-static binary is included in packaged app ✅
- [x] **3.5.5**: Test packaged app (import, edit, export) ✅
- [x] **3.5.6**: Fix ffmpeg path resolution for production (process.resourcesPath) ✅
- [x] **3.5.7**: Fix package.json metadata (description, author, electron in devDeps) ✅
- [x] **3.5.8**: Create full installer with `npm run dist` (Windows NSIS) ✅
- [ ] **3.5.9**: Test installer on clean machine (no dev environment)

**Status**: ✅ **PHASE 3.5 COMPLETE!** Full Windows installer created successfully (201 MB NSIS installer).

**Packaging Checks**:
- ✅ App launches without dev server
- ✅ FFmpeg binary is accessible (fixed path resolution)
- ✅ File dialogs work (import, save as)
- ✅ Video preview works (media:// protocol)
- ✅ Export works (trim, concat, PiP)
- ✅ No missing dependencies errors
- ⚠️ App icon displays correctly (using default Electron icon)

**Key Fixes Implemented**:
- **FFmpeg Path Resolution**: Dynamic path based on `app.isPackaged`
  - Production: `process.resourcesPath/ffmpeg/ffmpeg.exe`
  - Development: `require('ffmpeg-static')`
- **Package.json**: Moved electron to devDependencies, added description/author
- **Code Signing**: Disabled for development builds
  - Environment variable: `CSC_IDENTITY_AUTO_DISCOVERY=false`
  - Build config: `signAndEditExecutable: false`
- **extraResources**: FFmpeg binary correctly extracted to resources folder
- **NSIS Installer**: Successfully created `clappper Setup 0.1.0.exe` (201 MB)

**Electron Builder Config Verify**:
```json
"build": {
  "appId": "com.clappper.app",
  "files": ["dist/**", "electron/**", "node_modules/**", "assets/**", "package.json"],
  "extraResources": [
    {
      "from": "node_modules/ffmpeg-static/",
      "to": "ffmpeg/",
      "filter": ["**/*"]
    }
  ],
  "win": {
    "target": "nsis",
    "signAndEditExecutable": false
  },
  "mac": {
    "category": "public.app-category.video"
  },
  "linux": {
    "target": "AppImage"
  }
}
```

**Known Packaging Gotchas**:
- FFmpeg path resolution (use `app.isPackaged` to detect prod vs dev)
- Windows long paths (keep temp paths short)
- ASAR unpacking for native binaries
- CSP must allow media:// protocol in production

---

### Phase 4: Thumbnails (Priority 3)
**Goal**: Show preview thumbnails for each clip and trim points

**Tasks**:
- [ ] **4.1**: Add IPC handler to generate thumbnail using ffmpeg
- [ ] **4.2**: Create cache directory: `{appData}/Clappper/thumbs/`
- [ ] **4.3**: Generate thumbs to cache: `thumbs/{hash}-{t}.jpg` (not base64)
- [ ] **4.4**: Update Clip model to store thumbnail path
- [ ] **4.5**: Render thumbnail as background in ClipItem
- [ ] **4.6**: Throttle & dedupe thumbnail requests (one job per clip+timestamp)
- [ ] **4.7**: Add collapsible trim point preview thumbnails above timeline handles
  - Shows frame at exact trim point (~100px wide)
  - Collapsible UI control (minimize/restore/close)
  - Reuses cached thumbnails
  - Position with absolute positioning and z-index layering

**Thumbnail Generation (No Jank)**:
```bash
# Clip thumbnail (at 1s or first keyframe)
ffmpeg -i input.mp4 -ss 1 -vframes 1 -vf scale=160:-1 \
  {appData}/Clappper/thumbs/{clipId}-main.jpg

# Trim point thumbnail (specific timestamp)
ffmpeg -i input.mp4 -ss {timestamp} -vframes 1 -vf scale=100:-1 \
  {appData}/Clappper/thumbs/{clipId}-{timestamp}.jpg
```

**Cache Strategy**:
- Hash clip path + timestamp for cache key
- Check if cached file exists before generating
- Auto-clean cache on startup (delete files > 7 days old)

### Phase 5: Export Presets (Priority 4)
**Goal**: Let user choose output quality

**Tasks**:
- [ ] **5.1**: Add export settings panel/modal in UI
- [ ] **5.2**: Add radio buttons: 360p / 480p / 720p / 1080p / Source
- [ ] **5.3**: Store selection in Zustand state
- [ ] **5.4**: Update ffmpeg command to include resolution scaling
- [ ] **5.5**: Add preset dropdown: Fast / Medium / Slow (maps to veryfast/medium/slow)

**Resolution Mapping (Preserve Aspect Ratio)**:
- **360p**: `-vf "scale=-2:360,fps=30,format=yuv420p"`
- **480p**: `-vf "scale=-2:480,fps=30,format=yuv420p"`
- **720p**: `-vf "scale=-2:720,fps=30,format=yuv420p"`
- **1080p**: `-vf "scale=-2:1080,fps=30,format=yuv420p"`
- **Source**: No scaling, but still normalize: `-vf "fps=30,format=yuv420p"`

**Preset Mapping**:
- **Fast**: `-preset veryfast -crf 28` (larger file, faster encode)
- **Medium**: `-preset medium -crf 23` (balanced)
- **Slow**: `-preset slow -crf 20` (smaller file, slower encode)

**Color Matrix**:
- Assume BT.709 for all HD content
- Enforce: `-pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709`

**Audio Edge Cases**:
- Mono sources: `-ac 2` (upmix to stereo)
- Missing audio: Generate silent track with `-f lavfi -i anullsrc=r=48000:cl=stereo`

**Export Panel UI**:
```
┌──────────────────────────┐
│ Export Settings          │
├──────────────────────────┤
│ Resolution:              │
│  ○ 360p (Low)           │
│  ○ 480p (SD)            │
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

**6.0: Additional Format Support**
- [x] Add .avi to file picker filters (dialog:openFiles) ✅
- [ ] Test AVI import with various codecs (DivX, Xvid, etc.)
- [x] AVI files transcode automatically via existing H.264 pipeline ✅
- [ ] Add format detection and codec warnings for unsupported AVI variants (future enhancement)

**6.1: Cancelable Exports + Temp Hygiene**
- [ ] Track spawned ffmpeg PID
- [ ] Add Cancel button that kills process and removes partial files
- [ ] Use dedicated temp dir: `{appData}/Clappper/tmp/`
- [ ] Auto-clean temp dir on startup/shutdown
- [ ] Clean up temp files even on error/crash

**6.2: Error Handling + Actions**
- [ ] Surface meaningful errors: disk full, permissions, unknown codec
- [ ] Add actionable buttons: "Open temp folder", "Retry with transcode"
- [ ] Add error handling for import failures (unsupported codec, corrupt file)
- [ ] Add error handling for export failures
- [ ] Show loading spinner during metadata extraction
- [ ] Block export on empty timeline
- [ ] Block export on zero-duration clips

**6.3: Memory Safety + Performance**
- [ ] Revoke object URLs when clips change (avoid leaks)
- [ ] Virtualize Timeline list if clips > 30 (windowing)
- [ ] Add dynamic player zoom/canvas resizing for low-resolution videos

**6.4: CSP & Security**
- [ ] Production CSP: remove `'unsafe-inline'`, restrict file:/blob: properly
- [ ] Dev CSP can stay relaxed

**6.5: Packaging Invariants**
- [ ] Verify electron-builder extraResources includes ffmpeg-static binary
- [ ] Windows long paths: use `\\?\` prefix or keep temp paths short
- [ ] Add preflight check: "ffmpeg present & executable" with friendly error
- [ ] Test on Windows (NSIS installer)
- [ ] Test on Mac (DMG)
- [ ] Add app icon (icon.png → icon.ico / icon.icns)

**6.6: QA Smoke Tests**
- [ ] Mixed codecs: HEVC → H.264 transcode path
- [ ] PiP: 1080p main + 720p overlay, different aspect ratios
- [ ] Long export: 5-8 minutes, cancel + resume
- [ ] Edge cases: zero-duration trim blocked, empty timeline export blocked
- [ ] Document in README: "How We Tested"

**6.7: Metrics & Logging**
- [ ] Track export success rate
- [ ] Measure median encode speed (x real-time)
- [ ] Add log file: `{appData}/Clappper/logs/clappper.log`
- [ ] Log ffmpeg commands and errors for debugging

### Phase 7: Stretch Features (If Time Permits)
**Goal**: Enhance UX with power-user features

**Tasks**:

**7.0: UI Improvements**
- [x] Add overlay track count selector dropdown (0-4 tracks) ✅
- [x] Make timeline scrollable for many tracks ✅
- [x] Toolbar wraps on small screens ✅

**7.1: Keyboard Shortcuts (Cheap Win)**
- [ ] **Space**: Play/pause
- [ ] **Delete/Backspace**: Delete selected clip
- [ ] **S**: Split at playhead
- [ ] **←/→**: Nudge playhead ±0.1s (Shift = ±1s)
- [ ] **Cmd/Ctrl+Z**: Undo (requires undo stack)
- [ ] **Cmd/Ctrl+Shift+Z**: Redo

**7.2: Autosave & Crash Recovery**
- [ ] Autosave every 5s to `{appData}/Clappper/autosave.json`
- [ ] On launch, offer to restore autosave if present
- [ ] Define project.json schema (versioned):
```json
{
  "version": 1,
  "clips": [...],
  "tracks": [...],
  "selectedId": "...",
  "exportSettings": {...}
}
```
- [ ] Add Save Project / Load Project menu items

**7.3: Additional Features**
- [ ] Undo/redo with history stack
- [ ] Text overlay component with draggable positioning
- [ ] Crossfade transition between clips
- [ ] Audio waveform visualization
- [ ] Audio gain slider per clip
- [ ] Screen recording with desktopCapturer + MediaRecorder
- [x] **AVI format support** - Add .avi to import filters and transcode pipeline ✅

---

### Phase 8: AI Video Enhancement (Future Feature)
**Goal**: Local GPU-accelerated video upscaling using Real-ESRGAN

**Target Hardware**: NVIDIA GeForce RTX 4060 (user's GPU)
- **VRAM**: 8GB
- **CUDA Cores**: 3072
- **Performance**: ~2-4 seconds per frame @ 2x upscaling

**Tasks**:

**8.1: Real-ESRGAN Integration** (Priority 1)
- [ ] Research Real-ESRGAN models (x2, x4, anime variants)
- [ ] Choose optimal model for RTX 4060 (balance quality/speed)
- [ ] Test ONNX Runtime vs Python subprocess approach
- [ ] Benchmark performance on sample videos

**8.2: Local Inference Setup** (Priority 2)
- [ ] Install Real-ESRGAN Python package or ONNX model
- [ ] Create IPC handler: `ai:enhance`
- [ ] Implement frame extraction from video
- [ ] Process frames through Real-ESRGAN
- [ ] Reassemble enhanced frames to video
- [ ] Add progress tracking (frame N of M)
- [ ] Implement cancellation support

**8.3: GPU Detection & Setup** (Priority 3)
- [ ] Detect NVIDIA GPU presence (nvidia-smi)
- [ ] Check CUDA availability
- [ ] Verify VRAM capacity (need 4GB+ for 1080p)
- [ ] Graceful fallback if GPU unavailable
- [ ] Show GPU info in UI ("Using: RTX 4060")

**8.4: UI/UX** (Priority 4)
- [ ] Add "Enhance Video" button in Toolbar
- [ ] Enhancement settings modal:
  - Source resolution detection
  - Target resolution selector (720p, 1080p, 4K)
  - Model selector (Fast/Balanced/Quality)
  - Denoise toggle
  - Face enhancement toggle
- [ ] Before/After preview comparison
- [ ] Progress bar with:
  - Current frame / Total frames
  - Estimated time remaining
  - GPU utilization %
- [ ] Cancel button (kills process, cleans temp files)

**8.5: Enhancement Pipeline** (Priority 5)
- [ ] Extract frames: `ffmpeg -i input.mp4 frame_%04d.png`
- [ ] Process frames: `realesrgan-ncnn-vulkan -i frame_%04d.png -o enhanced_%04d.png -s 2`
- [ ] Reassemble: `ffmpeg -i enhanced_%04d.png -c:v libx264 output.mp4`
- [ ] Audio passthrough from original
- [ ] Temp file cleanup
- [ ] Memory management for long videos

**8.6: Presets & Optimization** (Priority 6)
- [ ] **Fast Preset**: Real-ESRGAN-x2 (2x upscale, ~2s/frame)
- [ ] **Balanced Preset**: Real-ESRGAN-x2 + denoise (~3s/frame)
- [ ] **Quality Preset**: Real-ESRGAN-x4 (4x upscale, ~6s/frame)
- [ ] **Anime Preset**: RealESRGAN-anime (optimized for animation)
- [ ] Batch processing optimization
- [ ] GPU memory pooling
- [ ] Multi-threaded frame I/O

**8.7: Smart Features** (Priority 7)
- [ ] Auto-detect low resolution videos (<720p)
- [ ] Suggest enhancement on import
- [ ] Side-by-side comparison before committing
- [ ] "Enhance All Clips" batch operation
- [ ] Save enhancement settings per project
- [ ] Estimate processing time before starting

**Enhancement Specs**:

**Performance Estimates (RTX 4060)**:
```
480p → 1080p (2.25x upscale):
- Fast: ~2.5s/frame → 30s clip = 37 minutes
- Balanced: ~3.5s/frame → 30s clip = 52 minutes
- Quality: ~5s/frame → 30s clip = 75 minutes

720p → 1080p (1.5x upscale):
- Fast: ~2s/frame → 30s clip = 30 minutes
- Balanced: ~3s/frame → 30s clip = 45 minutes
- Quality: ~4s/frame → 30s clip = 60 minutes

360p → 1080p (3x upscale):
- Fast: ~3s/frame → 30s clip = 45 minutes
- Balanced: ~4s/frame → 30s clip = 60 minutes
- Quality: ~7s/frame → 30s clip = 105 minutes
```

**Model Files**:
- Real-ESRGAN-x2: ~17MB
- Real-ESRGAN-x4: ~17MB
- RealESRGAN-anime: ~17MB
- Total bundle size: ~50MB

**Dependencies**:
```json
{
  "realesrgan-ncnn-vulkan": "^0.2.0",  // Vulkan-based (faster than CUDA for inference)
  "python": "^3.9",                     // For Real-ESRGAN Python version
  "torch": "^2.0",                      // PyTorch with CUDA support
  "opencv-python": "^4.8"               // Frame processing
}
```

**Alternative: ONNX Runtime** (Recommended for Electron):
```typescript
import * as ort from 'onnxruntime-node'

// Load model
const session = await ort.InferenceSession.create('realesrgan-x2.onnx', {
  executionProviders: ['cuda', 'cpu']
})

// Process frame
const tensor = new ort.Tensor('float32', frameData, [1, 3, height, width])
const results = await session.run({ input: tensor })
```

**IPC API**:
```typescript
// Preload
window.clappper.enhanceVideo({
  input: string,
  output: string,
  model: 'x2' | 'x4' | 'anime',
  denoise: boolean,
  faceEnhance: boolean
}) => Promise<{ ok: boolean; outPath: string }>

window.clappper.onEnhanceProgress((data: {
  frame: number,
  totalFrames: number,
  percent: number,
  eta: number,
  gpu: string
}) => void)
```

**User Flow**:
```
1. User imports 480p video
2. App shows badge: "Low Resolution - Enhance to 1080p?"
3. User clicks "Enhance"
4. Modal opens:
   - Detected: 480p (640x480)
   - Target: 1080p (1920x1080)
   - Model: Fast (2x upscale)
   - Estimated time: 37 minutes
   - GPU: NVIDIA RTX 4060
5. User clicks "Start Enhancement"
6. Progress: "Frame 450/900 (50%) - 18 min remaining"
7. Complete! Original saved, enhanced version added to timeline
8. User can compare before/after in player
```

**Future Enhancements**:
- [ ] Frame interpolation (30fps → 60fps) using RIFE
- [ ] Denoising without upscaling
- [ ] Colorization for black & white videos
- [ ] Stabilization using AI motion prediction
- [ ] Cloud API fallback for non-NVIDIA GPUs

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

## Known Limitations

**Current Limitations** (as of Phase 2):
- **No keyframe-aware preview trims**: Trim handles work on time, not keyframes (export may shift slightly)
- **No transitions**: Hard cuts only between clips
- **No text overlays**: Video-only editing
- **No audio mixing**: Single audio track from main video
- **No project persistence**: Clips cleared on refresh (until Phase 7)
- **No undo/redo**: Single timeline state (until Phase 7)
- **Single track**: Only one video track (until Phase 3)
- **Limited codec support in preview**: H.264 only (others transcoded on import)
- **VFR videos**: Preview may not match export frame-exactly

**Planned Fixes**:
- Phase 3: Two-track support (PiP overlay)
- Phase 4: Thumbnails for visual reference
- Phase 5: Export presets for quality control
- Phase 6: Cancel exports, better error handling
- Phase 7: Autosave, keyboard shortcuts, undo/redo

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

