# Quick Image Conversion Guide

## Convert Your Images to PNG

Use this script to convert AVIF, WebP, SVG, and other formats to PNG for video generation.

### Quick Start

**Convert your two files:**
```bash
npm run convert "C:\Users\marcu\Downloads\Brooklington+89''+Upholstered+Sofa-880809770.webp"

npm run convert "C:\Users\marcu\Downloads\smyga-bed-frame-with-storage-light-gray__1287535_pe933939_s5.avif"
```

**Or convert entire Downloads folder:**
```bash
npm run convert C:\Users\marcu\Downloads\
```

### Other Usage

```bash
# Single file (auto-generates output name)
npm run convert image.webp

# Custom output name
npm run convert logo.svg brand-logo.png

# Directory (converts all supported images)
npm run convert ./my-images/
```

### What Gets Converted?

**Supported formats:** `.avif`, `.webp`, `.svg`, `.jpg`, `.jpeg`, `.gif`, `.tiff`, `.bmp`

**Output:** High-quality PNG files (saved in same directory as input)

### Example Output

```
Converting: Brooklington+89''+Upholstered+Sofa-880809770.webp
  ✓ Saved: Brooklington+89''+Upholstered+Sofa-880809770.png
  ✓ Size: 148.23 KB → 892.45 KB
  ✓ Dimensions: 1200×800
```

---

## SVG Logos: Should You Convert?

**Yes, convert SVG → PNG before uploading to the app.**

### Why?

✅ AI video models (Veo/Runway) need raster images (PNG/JPG), not vectors  
✅ You control the output size (script uses 2000px width for high quality)  
✅ Faster processing (no server-side conversion needed)  
✅ Preview exactly what the AI will see  

### Workflow

```
1. Download SVG logo
2. Run: npm run convert logo.svg
3. Upload the generated logo.png to Video Assets modal
4. Generate logo animations
```

### Alternative: Keep SVG as-is?

**Not recommended** because:
- You'd need to add SVG → PNG conversion to the Electron app
- Adds ~50MB to app size (`sharp` dependency)
- Slower job startup
- More error handling complexity

**Verdict:** Use the standalone converter script! It's faster, simpler, and gives you more control.

---

## Next Steps

1. **Run the converter** on your images
2. **Open Clappper** → Video Assets modal
3. **Switch to Logo Animations tab** 🏷️
4. **Upload the PNG logo**
5. **Select animation styles** (Fade, Glow, Slide, etc.)
6. **Generate** → 2-second animated end cards!

