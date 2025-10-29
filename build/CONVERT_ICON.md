# Converting the Clappper Icon

I've created a clapper board SVG icon in `build/icon.svg`. Here's how to convert it to the formats needed:

## Quick Option: Use Online Tools

### 1. Convert SVG to PNG (512x512)
- Go to https://svgtopng.com/ or https://cloudconvert.com/svg-to-png
- Upload `build/icon.svg`
- Set output size to 512x512
- Download as `icon.png` and save to `build/` folder

### 2. Convert PNG to ICO (Windows)
- Go to https://www.icoconverter.com/ or https://convertico.com/
- Upload the `icon.png` (512x512)
- Select multi-size ICO (16, 32, 48, 64, 128, 256)
- Download as `icon.ico` and save to `build/` folder

### 3. Convert PNG to ICNS (macOS) - Optional
- Go to https://cloudconvert.com/png-to-icns
- Upload the `icon.png`
- Download as `icon.icns` and save to `build/` folder

## Alternative: Use icon.kitchen (All-in-One)

1. Go to https://icon.kitchen/
2. Upload `build/icon.svg`
3. Adjust colors/padding if needed
4. Download the "Electron" package
5. Extract and copy the icon files to `build/`

## After Conversion

Once you have the icon files in `build/`, electron-builder will automatically use them:
- `build/icon.ico` → Windows installer icon
- `build/icon.icns` → macOS app icon  
- `build/icon.png` → Linux app icon

Then rebuild your app:
```bash
npm run dist
```

## Verify Icon in Dev Mode

To see the icon in development mode, you can also set it in the BrowserWindow options in `electron/main.ts`:

```typescript
const win = new BrowserWindow({
  width: 1280,
  height: 800,
  icon: path.join(__dirname, '../build/icon.png'), // Add this line
  webPreferences: {
    // ...
  }
})
```

