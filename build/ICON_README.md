# Clappper App Icon

## Required Icon Files

For a complete cross-platform build, you need:

### Windows
- `icon.ico` - Multi-resolution ICO file (16x16, 32x32, 48x48, 64x64, 128x128, 256x256)

### macOS
- `icon.icns` - Apple Icon Image format (16x16 to 512x512 @1x and @2x)

### Linux
- `icon.png` - 512x512 PNG file

## Creating Icons

### Option 1: Use an Online Converter
1. Create or find a high-resolution clapper board icon (512x512 or larger PNG)
2. Use a service like:
   - https://www.icoconverter.com/ (for .ico)
   - https://cloudconvert.com/png-to-icns (for .icns)
   - Or use https://icon.kitchen/ for all formats

### Option 2: Use Command Line Tools

#### Windows ICO (using ImageMagick):
```bash
magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

#### macOS ICNS (using iconutil on Mac):
```bash
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

## Icon Design Guidelines

For a clapper board icon:
- Use a simple, recognizable clapper board silhouette
- High contrast colors (black/white or dark/light)
- Clean lines that work at small sizes (16x16)
- Consider adding a subtle accent color (e.g., blue or purple)
- Avoid too much detail that gets lost at small sizes

## Quick Setup

1. Place your source icon as `build/icon.png` (512x512 or larger)
2. Convert to required formats
3. Electron-builder will automatically use icons from the `build/` directory

## Current Status

- [ ] icon.png (512x512 source)
- [ ] icon.ico (Windows)
- [ ] icon.icns (macOS)

Place the generated icon files in this `build/` directory and electron-builder will automatically include them in your app builds.

