# Room Detection Integration for Clappper

## What Was Added

1. **Python Inference Script**: `resources/room-detection/inference.py`
   - Detects rooms in blueprint images using YOLO models
   - Returns detections + annotated image with bounding boxes

2. **IPC Handler**: Added to `electron/main.ts`
   - `room:detect` handler that spawns Python process
   - Reads image file and passes to Python script

3. **Preload API**: Added to `electron/preload.ts`
   - Exposes `window.clappper.detectRooms(imagePath, modelId?)`

4. **TypeScript Types**: Updated `src/types/window.d.ts`
   - Type definitions for the new API

## Usage in Your UI

```typescript
// In any React component
const handleDetectRooms = async (imagePath: string) => {
  try {
    const result = await window.clappper.detectRooms(imagePath, 'yolo-v8l-200epoch');
    
    if (!result.success) {
      console.error('Detection failed:', result.error);
      return;
    }
    
    // Display annotated image
    if (result.annotated_image) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${result.annotated_image}`;
      // Add to your UI
    }
    
    // Use detections
    console.log(`Found ${result.detections?.length || 0} rooms`);
    result.detections?.forEach(room => {
      console.log(`Room ${room.id}: ${room.bounding_box}`);
    });
  } catch (error) {
    console.error('Room detection error:', error);
  }
};
```

## Setup Requirements

1. **Python Environment**: 
   - Python 3.8+ with `ultralytics`, `Pillow`, `numpy` installed
   - Or use the venv from Roomer repo: `C:\Users\marcu\Roomer\.venv`

2. **Model Files**:
   - Models are expected at: `C:\Users\marcu\Roomer\room_detection_training\local_training_output\yolo-v8l-200epoch\weights\best.pt`
   - Or set `ROOMER_PATH` environment variable to point to Roomer repo

3. **Rebuild Electron**:
   ```bash
   npm run build:electron
   ```

## How It Works

1. UI calls `window.clappper.detectRooms(imagePath)`
2. Main process reads image file
3. Spawns Python script with image data
4. Python script:
   - Loads YOLO model from Roomer repo
   - Runs inference
   - Draws bounding boxes
   - Returns JSON with detections + base64 image
5. Main process parses JSON and returns to UI

## Example UI Component

```tsx
import React, { useState } from 'react';

export function RoomDetectionButton() {
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleDetect = async () => {
    // Get image file path (you'd get this from file picker or drag-drop)
    const imagePath = '/path/to/blueprint.png';
    
    setDetecting(true);
    try {
      const result = await window.clappper.detectRooms(imagePath);
      setResult(result);
    } catch (error) {
      console.error('Detection failed:', error);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div>
      <button onClick={handleDetect} disabled={detecting}>
        {detecting ? 'Detecting...' : 'Detect Rooms'}
      </button>
      
      {result?.annotated_image && (
        <img src={`data:image/png;base64,${result.annotated_image}`} alt="Detected rooms" />
      )}
      
      {result?.detections && (
        <pre>{JSON.stringify(result.detections, null, 2)}</pre>
      )}
    </div>
  );
}
```

## Notes

- The Python script expects to run from the Roomer repo root (where models are)
- Models are NOT bundled with Electron - they stay in the Roomer repo
- Set `ROOMER_PATH` env var if Roomer is not at `C:\Users\marcu\Roomer`

