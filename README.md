# Clappper

A lightweight desktop video editor for creators. MVP: import → preview → trim → export MP4.

## Quickstart
```bash
# Node 20+ recommended
npm i  # or pnpm i / yarn
npm run dev
```
- Electron opens after Vite dev server is ready.

## Build / Package
```bash
npm run build
npm run dist
```
Artifacts go to `dist/` (Vite) and `dist/`/`release` (electron-builder).

## Features (MVP)
- Import MP4/MOV/WebM
- Preview via HTML5 video
- Trim in/out on first clip
- Export to H.264/AAC MP4 using ffmpeg

## Next Up
- Multi-clip timeline with reorder + split
- Screen + webcam recording (Electron desktopCapturer + MediaRecorder)
- Export presets (720p/1080p/source)
- Progress UI + cancel

## Notes
- `ffmpeg-static` ships platform binaries. electron-builder copies them under `resources/ffmpeg`.
- If export fails, inspect console logs from Main process.

## Tech Stack
- **Desktop:** Electron 32 + electron-builder
- **UI:** React + TypeScript + Vite
- **State:** Zustand
- **Media:** ffmpeg-static + fluent-ffmpeg

## MVP Deadline
Target: **Tue Oct 28, 10:59 PM CT**

