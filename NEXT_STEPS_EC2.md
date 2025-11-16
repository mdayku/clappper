# Next Steps on EC2 Instance

Complete guide for running the asset catalog and video compilation on your Windows EC2 Omniverse instance.

---

## Prerequisites Check

Make sure your 240-frame render is complete before proceeding!

---

## Step 1: Download Scripts from S3

```powershell
# Download all scripts
aws s3 cp s3://clappper-assets/scripts/catalog_assets.py C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py
aws s3 cp s3://clappper-assets/scripts/compile_sequence.py C:\Users\Administrator\Documents\clappper-assets\scripts\compile_sequence.py
aws s3 cp s3://clappper-assets/scripts/requirements_catalog.txt C:\Users\Administrator\Documents\clappper-assets\scripts\requirements_catalog.txt
aws s3 cp s3://clappper-assets/scripts/README_CATALOG.md C:\Users\Administrator\Documents\clappper-assets\scripts\README_CATALOG.md
```

---

## Step 2: Install FFmpeg (for video compilation)

### Option A: Download FFmpeg (Recommended)

1. Download from: https://www.gyan.dev/ffmpeg/builds/
2. Choose: **ffmpeg-release-essentials.zip**
3. Extract to: `C:\ffmpeg\`
4. Add to PATH:
   ```powershell
   $env:Path += ";C:\ffmpeg\bin"
   # Make permanent:
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\ffmpeg\bin", "Machine")
   ```

### Option B: Use Chocolatey (if installed)

```powershell
choco install ffmpeg
```

### Verify Installation

```powershell
ffmpeg -version
```

---

## Step 3: Compile Your 240-Frame Sequence to MP4

```powershell
# Navigate to renders directory
cd C:\Users\Administrator\Documents\clappper-assets\renders

# Find your frame sequence directory (replace with actual name)
# Example: if frames are in "warehouse_scene_01" folder

# Compile to MP4 (auto-detects frame pattern)
python C:\Users\Administrator\Documents\clappper-assets\scripts\compile_sequence.py <frames_directory> output.mp4 --fps 30

# Example:
python C:\Users\Administrator\Documents\clappper-assets\scripts\compile_sequence.py warehouse_scene_01 warehouse_scene_01.mp4 --fps 30
```

**Parameters:**
- `--fps 30`: Set to your capture FPS (24, 30, 60, etc.)
- `--crf 18`: Quality (default: 18 = visually lossless, 23 = standard, lower = better)
- `--pattern "frame_%04d.png"`: Manually specify pattern if auto-detect fails

---

## Step 4: Sync Video to S3

```powershell
# Sync the compiled MP4 to S3
aws s3 cp warehouse_scene_01.mp4 s3://clappper-assets/renders/warehouse_scene_01.mp4

# Or sync entire renders directory
aws s3 sync C:\Users\Administrator\Documents\clappper-assets\renders s3://clappper-assets/renders/
```

---

## Step 5: Install Python Dependencies (for asset catalog)

```powershell
# Install PyTorch and CLIP dependencies
pip install -r C:\Users\Administrator\Documents\clappper-assets\scripts\requirements_catalog.txt
```

**Note:** This will download ~2GB for PyTorch and CLIP model. It may take a few minutes.

---

## Step 6: Generate Asset Catalog

### Option A: Metadata Only (Fast, no embeddings)

```powershell
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --no-thumbnails --no-embeddings
```

This will:
- ✅ Scan all USD files in `Z:\packs\`
- ✅ Extract USD metadata (cameras, lights, meshes, bbox, etc.)
- ✅ Generate tags for each asset
- ✅ Create `master_index.json` for LLM querying
- ⏭️ Skip thumbnail generation (requires Kit runtime)
- ⏭️ Skip visual embeddings (requires thumbnails)

**Time:** ~10-30 minutes depending on number of assets

### Option B: With Visual Embeddings (Slower, enables semantic search)

```powershell
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --no-thumbnails
```

This adds:
- ✅ CLIP visual embeddings for semantic search
- Enables queries like: "Find assets that look like a loading dock"

**Time:** ~30-60 minutes (first run downloads CLIP model)

---

## Step 7: Sync Catalog to S3

```powershell
aws s3 sync C:\Users\Administrator\Documents\clappper-assets\asset_catalog s3://clappper-assets/omniverse_assets/asset_catalog/
```

---

## Step 8: Test Visual Search (Optional)

```powershell
# Search for assets matching a description
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --search "industrial forklift"
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --search "warehouse shelving"
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --search "modern office desk"
```

---

## Summary of What You'll Have

After completing these steps:

1. ✅ **Compiled MP4 video** from your 240-frame sequence
2. ✅ **Asset catalog** with metadata for all ~45,000 USD assets
3. ✅ **Master index JSON** for LLM-based scene generation
4. ✅ (Optional) **Visual embeddings** for semantic search
5. ✅ Everything synced to S3

---

## Next: LLM-Based Scene Generation Workflow

Once the catalog is ready, you can:

1. **Describe a scene** in natural language
2. **LLM queries the catalog** to check asset availability
3. **LLM generates USD Python script** using confirmed assets
4. **Run script in Kit** → Scene generated automatically
5. **Movie Capture** → Frames exported
6. **compile_sequence.py** → MP4 video ready!

---

## Troubleshooting

### "FFmpeg not found"
- Make sure FFmpeg is in PATH: `$env:Path += ";C:\ffmpeg\bin"`
- Restart PowerShell after adding to PATH

### "No PNG files found"
- Check the frames directory path
- Verify frames were actually captured by Movie Capture

### "CLIP not available"
- Run with `--no-embeddings` flag
- Or install dependencies: `pip install torch transformers pillow numpy`

### "USD Python bindings not available"
- Use Kit's Python: `cd C:\Windows\System32\kit-app-template` then `.\repo.bat python <script>`
- Or install: `pip install usd-core`

---

## Quick Reference Commands

```powershell
# Compile frames to video
python scripts/compile_sequence.py <frames_dir> output.mp4 --fps 30

# Generate catalog (metadata only)
python scripts/catalog_assets.py --no-thumbnails --no-embeddings

# Generate catalog (with embeddings)
python scripts/catalog_assets.py --no-thumbnails

# Visual search
python scripts/catalog_assets.py --search "your search query"

# Sync to S3
aws s3 sync renders s3://clappper-assets/renders/
aws s3 sync asset_catalog s3://clappper-assets/omniverse_assets/asset_catalog/
```

