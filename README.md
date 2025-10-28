# Clappper

A lightweight desktop video editor for solo creators and educators. Quickly import, trim, reorder, and export video content without the complexity of professional NLEs.

## ✨ Features (Phase 4 Complete!)

### ✅ Multi-Track Editing
- **5-track system** - 1 Main track + 4 Overlay tracks
- **Import multiple clips** - MP4/MOV/WebM/MKV/AVI with automatic codec detection
- **Auto-transcode** - H.265/HEVC → H.264 for universal compatibility
- **Drag between tracks** - Move clips between main and overlay tracks
- **Configurable overlays** - Show 0-4 overlay tracks via dropdown
- **Timeline view** - All tracks rendered with scrollable layout
- **Beautiful thumbnails** - Auto-generated video previews on every clip
- **Trim controls** - Visual handles for precise in/out points
- **Split at playhead** - Split any clip into two segments
- **Delete clips** - Remove unwanted clips with confirmation

### 🎬 Picture-in-Picture (PiP)
- **Real-time preview** - See PiP effect live in player
- **4 simultaneous overlays** - Up to 4 PiP windows at once
- **Free dragging** - Click and drag PiP windows to any position
- **5 position presets** - Top-left, top-right, bottom-left, bottom-right, center
- **Adjustable size** - Scale overlays from 15% to 50% of main video
- **Keyframe animation** - Mark positions at different times for animated movement
- **Linear interpolation** - Smooth transitions between keyframes
- **Visual markers** - See keyframes on timeline

### 🎬 Playback & Preview
- **Multi-track playback** - Synchronized main + overlay videos
- **Live preview** - HTML5 video player with controls
- **Playhead tracking** - Tracks position across entire sequence
- **Clip selection** - Click any clip to jump to it
- **Aspect ratio handling** - Properly displays portrait/landscape videos

### 💾 Export
- **PiP export** - Exports main video with animated overlay(s)
- **Multi-clip concatenation** - Exports all clips as one seamless video
- **Save As dialog** - Choose location and filename before export
- **Progress tracking** - Real-time export progress updates
- **H.264/AAC output** - Universal MP4 format
- **Respects trims** - Only exports trimmed portions
- **FFmpeg filter_complex** - Advanced animated expressions for keyframes

### 📊 UI/UX
- **Track badges** - Color-coded track indicators
- **Overlay counter** - Shows active overlays in player
- **Total duration** - Displays sequence length (MM:SS.S)
- **Scrollable timeline** - Handles many tracks gracefully
- **Wrapping toolbar** - Responsive button layout
- **Video thumbnails** - Beautiful preview images on timeline clips
- **Smart caching** - Thumbnails cached locally for instant loading
- **Error recovery** - Remove failed clips, dismiss errors
- **Clear All** - Quick reset button

## 🚀 Quickstart

```bash
# Requirements: Node 20+
npm install
npm run dev
```

Electron opens after Vite dev server starts (port 5173-5177).

## 📦 Build & Package

```bash
npm run build        # Build Vite + Electron
npm run pack         # Package unpacked app (dist/win-unpacked/)
npm run dist         # Create installer (Windows NSIS / Mac DMG / Linux AppImage)
```

**Installer**: `dist/clappper Setup 0.1.0.exe` (201 MB)
**Unpacked**: `dist/win-unpacked/clappper.exe`

The installer includes FFmpeg and all dependencies - no external installs required.

## 🛠️ Tech Stack

- **Desktop:** Electron 32 + electron-builder
- **UI:** React 18 + TypeScript + Vite
- **State:** Zustand (clips, playhead, selection)
- **Media:** ffmpeg-static + fluent-ffmpeg
- **CI/CD:** GitHub Actions (lint, typecheck, build)

## 📖 How to Use

1. **Import** - Click Import, select video files (multiple selection supported)
2. **Organize** - Drag clips to reorder or move between tracks (main/overlay)
3. **Configure Overlays** - Use dropdown to show 0-4 overlay tracks
4. **Edit** - Use trim handles, split or delete clips as needed
5. **Position PiP** - Drag overlay videos in player, add keyframes for animation
6. **Adjust Size** - Use size slider (15-50%) in PiP controls panel
7. **Preview** - Press play to watch the sequence with PiP effect
8. **Export** - Click Export, choose save location, wait for progress → done!

## 🏗️ Architecture

```
src/
├── components/
│   ├── Toolbar.tsx      # Import/Export/Clear + overlay track selector
│   ├── Player.tsx       # Video player with PiP preview + keyframe controls
│   ├── Timeline.tsx     # Multi-track timeline (main + overlays)
│   ├── TrackLane.tsx    # Individual track with drag-drop support
│   └── ClipItem.tsx     # Individual clip box (draggable)
├── store.ts             # Zustand state (tracks, clips, pipSettings, actions)
├── lib/
│   ├── types.ts         # TypeScript types (Clip, Track, PipSettings, etc.)
│   └── ff.ts            # ffmpeg utilities
electron/
├── main.ts              # Electron main process (IPC, dialogs, ffmpeg, PiP export)
└── preload.ts           # Context bridge (window.clappper API)
```

## 🧪 Testing

```bash
npm run dev              # Manual testing in development
npm run pack             # Test packaged app
```

**Test Checklist:**
- [ ] Import 3+ clips of different formats (MP4, MOV, AVI)
- [ ] Drag clips between main and overlay tracks
- [ ] Configure overlay track visibility (0-4)
- [ ] Trim clips with handles
- [ ] Split a clip at playhead
- [ ] Delete a clip
- [ ] Drag PiP overlay to different positions
- [ ] Add keyframes at different times
- [ ] Adjust PiP size slider
- [ ] Play sequence with PiP preview
- [ ] Export → verify PiP animation in output

## 📝 Notes

- **ffmpeg-static** bundles platform-specific binaries (Windows/Mac/Linux)
- **Auto-transcoding** creates `.h264.mp4` files next to originals
- **Temp files** during export are cleaned up automatically
- **Refreshing** clears timeline (no persistence yet - Phase 7 feature)
- **Keyframe interpolation** uses linear interpolation for smooth animation
- **Multi-overlay export** currently exports first overlay only (multi-overlay coming in Phase 6)

## 🎯 Phase 3 Status: ✅ COMPLETE

All tasks implemented:
1. ✅ Multi-track store (main + 4 overlays)
2. ✅ Track lanes with drag-drop
3. ✅ Timeline scaling for all tracks
4. ✅ Player displays selected clip
5. ✅ Player aspect ratio handling
6. ✅ PiP export with FFmpeg filter_complex
7. ✅ PiP position/size controls
8. ✅ Free dragging of PiP windows
9. ✅ Keyframe animation system
10. ✅ FFmpeg animated expressions
11. ✅ 4 overlay tracks support
12. ✅ AVI format support
13. ✅ Overlay track selector + scrollable timeline

## 🗺️ Roadmap

See [`PRD_FULL_SUBMISSION.md`](./PRD_FULL_SUBMISSION.md) for complete feature breakdown:
- **Phase 3:** ✅ Multi-track PiP system (COMPLETE)
- **Phase 4:** Thumbnails (clip preview + trim point thumbnails)
- **Phase 5:** Export presets (360p/480p/720p/1080p/source)
- **Phase 6:** Polish & packaging (error handling, testing, distribution, multi-overlay export)
- **Phase 7:** UI improvements (keyboard shortcuts, undo/redo)
- **Phase 8:** AI video enhancement (Real-ESRGAN super-resolution)

## 🐛 Troubleshooting

**Video won't load:**
- Check console for codec errors
- App auto-transcodes unsupported codecs, but this takes time
- Try a different video file

**Export fails:**
- Ensure disk space available
- Check console for ffmpeg errors
- Verify all clips still exist at their file paths

**App won't start:**
- Kill any existing Electron processes
- Delete `node_modules`, run `npm install` again
- Ensure Node 20+ is installed

## 📄 License

MIT

## 🙏 Acknowledgments

- FFmpeg for video processing
- Electron team for desktop framework
- Vite for blazing fast dev experience
