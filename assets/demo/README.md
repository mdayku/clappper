# Clappper AI Video Enhancement Demo

This directory contains demo assets for testing the Real-ESRGAN super-resolution feature.

## Demo Workflow

### 1. Prepare a Low-Resolution Video
- Place a low-resolution video file (preferably <720p) in this directory
- Recommended: 480p or 360p video, 10-30 seconds long
- Supported formats: MP4, MOV, WebM, AVI

Example filename: `demo_lowres.mp4`

### 2. Import and Select the Video
1. Launch Clappper
2. Click "Import" and select your low-resolution demo video
3. The video will appear on the timeline
4. Click on the clip to select it (you should see it highlighted)

### 3. Trigger Enhancement
1. Click the "Enhance" button in the toolbar (only enabled for clips <720p)
2. Review the enhancement settings in the modal:
   - Clip resolution and duration
   - **Auto-optimized output resolution** (2×/3×/4× scale automatically selected)
   - Target model: Real-ESRGAN x4plus
   - GPU detection and estimated processing time
3. Click "Enhance Video" to start processing

**Smart Scaling:** The app automatically selects the best upscale factor (2×, 3×, or 4×) to maximize quality while staying within the 1080p limit. No manual preset selection needed!

### 4. Monitor Progress
- The modal will show real-time progress through 3 stages:
  - **Extracting frames**: Converting video to individual PNG frames
  - **Processing frames**: Running Real-ESRGAN AI model (batch processing 4 frames in parallel)
  - **Reassembling video**: Combining enhanced frames back into video with audio
- Real-time stats displayed:
  - Frame progress (e.g., "545/2823")
  - Processing speed (FPS)
  - Estimated time remaining (ETA)

### 5. Review Results
- When enhancement completes, the enhanced video is automatically imported to the timeline
- Click **"Compare Before/After"** to toggle between original and enhanced versions
- The enhanced video will be upscaled using the optimal scale factor:
  - 360p (480×360) → 1080p (1440×1080) using 3× upscale
  - 480p (640×480) → 1080p (1280×960) using 2× upscale
  - 540p (720×540) → 1080p (1440×1080) using 2× upscale
- All outputs are automatically capped at 1080p for optimal performance

## Expected Performance (RTX 4060)

**With Batch Processing (4 frames in parallel):**

| Input Resolution | Duration | Frames | Auto Scale | Output Resolution | Processing Time |
|------------------|----------|--------|------------|-------------------|-----------------|
| 142×144 | 30s | 900 | 4× | 568×576 | ~50 minutes |
| 480×360 | 30s | 900 | 3× | 1440×1080 (1080p) | ~50 minutes |
| 640×480 | 30s | 900 | 2× | 1280×960 | ~50 minutes |
| 720×540 | 30s | 900 | 2× | 1440×1080 (1080p) | ~50 minutes |

**Performance Notes:**
- Batch processing provides ~75% speedup over sequential processing
- Processing speed: ~0.3 fps on RTX 4060 (varies by GPU)
- Time scales linearly with frame count (duration × 30 fps)
- **Scale factor (2×/3×/4×) doesn't affect processing time** - all use the same AI model
- Smart scaling automatically selects the highest scale that doesn't exceed 1080p
- All outputs automatically capped at 1920×1080 maximum resolution

## Troubleshooting

### Enhancement Button Disabled
- Ensure a clip is selected
- Clip must be <720p resolution
- No other export/enhancement operation in progress

### Enhancement Fails
- Check that Real-ESRGAN binary is present in `resources/realesrgan/`
- Verify GPU drivers are up to date
- Ensure sufficient disk space (enhanced videos are ~16x larger)

### Performance Issues
- Close other GPU-intensive applications
- Ensure RTX 4060 has adequate cooling
- Consider shorter test videos for initial validation

## Technical Details

The enhancement pipeline:
1. **FFmpeg frame extraction**: `ffmpeg -i input.mp4 -vf fps=30 frame_%06d.png`
2. **Real-ESRGAN batch processing**: Processes 4 frames in parallel
   - `realesrgan-ncnn-vulkan.exe -i frame.png -o enhanced.png -n realesrgan-x4plus -s [2|3|4]`
   - Scale factor (2/3/4) determined by preset and 1080p cap
3. **FFmpeg reassembly**: Combines enhanced frames with original audio at exact target resolution

**Optimizations:**
- **Batch processing**: 4 concurrent Real-ESRGAN processes for ~75% speedup
- **Smart scaling**: Automatically selects best scale factor (2×/3×/4×) that doesn't exceed 1080p
- **Resolution capping**: All outputs limited to 1920×1080 maximum
- **GPU detection**: Estimates processing time based on detected NVIDIA GPU

**Why Smart Scaling?** Real-ESRGAN processes at the *input* resolution, so 2×/3×/4× all take the same time. The scale factor only affects output quality, not speed. Smart scaling automatically picks the highest scale that fits within 1080p.

All processing happens locally using your RTX 4060 GPU for maximum performance and privacy.
