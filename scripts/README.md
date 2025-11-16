# Image Converter Scripts

## convert-to-png.js

A standalone script to convert AVIF, WebP, SVG, and other image formats to PNG for use in video asset generation.

### Installation

```bash
npm install sharp --save-dev
```

### Usage

**Convert single file (auto-generates output name):**
```bash
node scripts/convert-to-png.js image.webp
# Output: image.png
```

**Convert with custom output name:**
```bash
node scripts/convert-to-png.js logo.svg brand-logo.png
```

**Convert all images in a directory:**
```bash
node scripts/convert-to-png.js C:\Users\marcu\Downloads\
```

**Convert your specific files:**
```bash
node scripts/convert-to-png.js "C:\Users\marcu\Downloads\Brooklington+89''+Upholstered+Sofa-880809770.webp"

node scripts/convert-to-png.js "C:\Users\marcu\Downloads\smyga-bed-frame-with-storage-light-gray__1287535_pe933939_s5.avif"
```

### Supported Formats

**Input:** `.avif`, `.webp`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.tiff`, `.bmp`  
**Output:** `.png` (high quality, RGB)

### Features

- ✅ Batch conversion (entire directory)
- ✅ High-quality PNG output (100% quality, no compression artifacts)
- ✅ SVG rasterization at 2000px width (ideal for AI video generation)
- ✅ Automatic dimension detection and display
- ✅ File size comparison
- ✅ Progress reporting

### SVG Handling

SVG files are automatically rasterized at **2000px width** while maintaining aspect ratio. This ensures:
- High resolution for AI video models (Veo/Runway)
- No quality loss when scaled down
- Consistent output for video generation

### Why PNG?

The AI video generation models (Google Veo 3.1 and Runway Gen-4 Turbo) work best with:
- **PNG or JPG** (not SVG)
- **RGB color space** (not indexed/palette)
- **High resolution** (2000px+ for best results)

### Output Location

PNG files are saved in the **same directory** as the input file with `.png` extension:
```
C:\Users\marcu\Downloads\
  ├── image.webp
  ├── image.png          ← Generated
  ├── logo.svg
  └── logo.png           ← Generated
```

---

## Recommendation: SVG Logos

**Q: Should the app support SVG directly, or require PNG conversion?**

**A: Require PNG conversion first.** Here's why:

### 👍 Convert SVG → PNG before upload (Recommended)

**Pros:**
- AI models need raster images anyway (can't process vectors)
- User controls the output size/quality
- Faster processing (no server-side conversion)
- Consistent results
- Works with this script

**Workflow:**
```
User uploads SVG → Run converter script → Upload PNG to app
```

### 👎 Allow SVG upload + auto-convert in app

**Cons:**
- Requires adding `sharp` to Electron dependencies (~50MB)
- Slower job startup (conversion before API call)
- More complexity in error handling
- User can't preview final rasterization

**Verdict:** Keep it simple – use this standalone script for conversion, then upload PNG. Can always add auto-conversion later if users request it.

---

## Example Output

```
Converting: Brooklington+89''+Upholstered+Sofa-880809770.webp
  ✓ Saved: Brooklington+89''+Upholstered+Sofa-880809770.png
  ✓ Size: 148.23 KB → 892.45 KB
  ✓ Dimensions: 1200×800

Converting: smyga-bed-frame-with-storage-light-gray__1287535_pe933939_s5.avif
  ✓ Saved: smyga-bed-frame-with-storage-light-gray__1287535_pe933939_s5.png
  ✓ Size: 89.12 KB → 756.34 KB
  ✓ Dimensions: 1600×1067

─────────────────────────────────────────
✓ Successfully converted: 2
─────────────────────────────────────────
```

