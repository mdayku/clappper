# Clappper

A lightweight desktop video editor for solo creators and educators. Quickly import, trim, reorder, and export video content without the complexity of professional NLEs.

## ✨ Features (Phase 2 Complete!)

### ✅ Multi-Clip Editing
- **Import multiple clips** - MP4/MOV/WebM/MKV with automatic codec detection
- **Auto-transcode** - H.265/HEVC → H.264 for universal compatibility
- **Timeline view** - All clips rendered as sequential boxes
- **Drag to reorder** - Intuitive drag-and-drop reordering
- **Trim controls** - Visual handles for precise in/out points
- **Split at playhead** - Split any clip into two segments
- **Delete clips** - Remove unwanted clips with confirmation

### 🎬 Playback & Preview
- **Sequence playback** - Automatically plays through all clips
- **Seamless transitions** - Auto-switches between clips during playback
- **Live preview** - HTML5 video player with controls
- **Playhead tracking** - Tracks position across entire sequence
- **Clip selection** - Click any clip to jump to it

### 💾 Export
- **Multi-clip concatenation** - Exports all clips as one seamless video
- **Save As dialog** - Choose location and filename before export
- **Progress tracking** - Real-time export progress updates
- **H.264/AAC output** - Universal MP4 format
- **Respects trims** - Only exports trimmed portions

### 📊 UI/UX
- **Clip counter** - Shows N clips in timeline
- **Total duration** - Displays sequence length (MM:SS.S)
- **Sequence info** - "Clip N of M | Playing: filename.mp4"
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
npm run dist         # Package for distribution (Windows NSIS / Mac DMG)
```

Artifacts: `dist/` (Vite), `release/` (electron-builder)

## 🛠️ Tech Stack

- **Desktop:** Electron 32 + electron-builder
- **UI:** React 18 + TypeScript + Vite
- **State:** Zustand (clips, playhead, selection)
- **Media:** ffmpeg-static + fluent-ffmpeg
- **CI/CD:** GitHub Actions (lint, typecheck, build)

## 📖 How to Use

1. **Import** - Click Import, select video files (multiple selection supported)
2. **Edit** - Drag clips to reorder, use trim handles, split or delete as needed
3. **Preview** - Press play to watch the sequence
4. **Export** - Click Export, choose save location, wait for progress → done!

## 🏗️ Architecture

```
src/
├── components/
│   ├── Toolbar.tsx      # Import/Export/Clear buttons
│   ├── Player.tsx       # Video player with sequence playback
│   ├── Timeline.tsx     # Clips timeline + trim controls
│   └── ClipItem.tsx     # Individual clip box (draggable)
├── store.ts             # Zustand state (clips, actions, selectors)
├── lib/
│   ├── types.ts         # TypeScript types (Clip, etc.)
│   └── ff.ts            # ffmpeg utilities
electron/
├── main.ts              # Electron main process (IPC, dialogs, ffmpeg)
└── preload.ts           # Context bridge (window.clappper API)
```

## 🧪 Testing

```bash
npm run dev              # Manual testing in development
npm run pack             # Test packaged app
```

**Test Checklist:**
- [ ] Import 3+ clips of different formats
- [ ] Reorder clips via drag-and-drop
- [ ] Trim each clip with handles
- [ ] Split a clip at playhead
- [ ] Delete a clip
- [ ] Play sequence (should auto-advance through clips)
- [ ] Export → verify concatenated output plays correctly

## 📝 Notes

- **ffmpeg-static** bundles platform-specific binaries (Windows/Mac/Linux)
- **Auto-transcoding** creates `.h264.mp4` files next to originals
- **Temp files** during export are cleaned up automatically
- **Refreshing** clears timeline (no persistence yet - Phase 7 feature)

## 🎯 Phase 2 Status: ✅ COMPLETE

All 10 tasks implemented:
1. ✅ Multi-clip store support
2. ✅ Auto-transcode codecs (H.265 → H.264)
3. ✅ Timeline rendering
4. ✅ Save As dialog
5. ✅ Drag-to-reorder
6. ✅ Total duration display
7. ✅ Delete clip UI
8. ✅ Export concatenate
9. ✅ Split at playhead
10. ✅ Sequence playback

## 🗺️ Roadmap

See [`PRD_FULL_SUBMISSION.md`](./PRD_FULL_SUBMISSION.md) for complete feature breakdown:
- **Phase 3:** Two-track system (main + overlay/PiP)
- **Phase 4:** Thumbnails (clip preview + trim point thumbnails)
- **Phase 5:** Export presets (360p/480p/720p/1080p/source)
- **Phase 6:** Polish & packaging (error handling, testing, distribution)
- **Phase 7:** Stretch goals (keyboard shortcuts, undo/redo, text overlays, screen recording)

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
