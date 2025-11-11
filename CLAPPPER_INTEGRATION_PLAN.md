# TipTop → Clappper Integration Plan

**Status:** Ready for 2-Day Demo Implementation  
**Target:** Roof damage detection integrated into existing Electron app  
**Pattern:** Follow room detection (`RoomDetection.tsx` + `inference.py`)

---

## 🚀 Quick Start: Setup Before Integration

### Step 0: Copy Files to Clappper Repo

Run these commands to prepare the clappper repo:

```bash
# 1. Copy this integration plan
copy C:\users\marcu\tiptop\CLAPPPER_INTEGRATION_PLAN.md C:\users\marcu\clappper\

# 2. Create directories
mkdir C:\users\marcu\clappper\resources\roof-detection
mkdir C:\users\marcu\clappper\resources\roof-models

# 3. Copy inference script
copy C:\users\marcu\tiptop\training\inference_roof.py C:\users\marcu\clappper\resources\roof-detection\

# 4. Copy trained model (20-epoch version for testing)
copy C:\users\marcu\tiptop\training\runs\detect\roof_damage_nano_20ep3\weights\best.pt C:\users\marcu\clappper\resources\roof-models\
```

### Current Model Status

**Working Model (Available Now):**
- **File:** `resources/roof-models/best.pt` 
- **Source:** `roof_damage_nano_20ep3` (20 epochs, 2,520 images)
- **Performance:** F1: 0.483, Precision: 75.7%, Recall: 35.5%
- **Status:** ✅ Good enough for initial testing and demo

**Better Model (Training Now):**
- **Training:** 100 epochs on 4,708 images (1.9x more data!)
- **Expected:** F1: ~0.60+, Precision: ~70%, Recall: 55-65%
- **ETA:** 3-4 hours
- **When Ready:** Just swap `best.pt` file - no code changes needed!
- **Location:** `C:\users\marcu\tiptop\training\runs\detect\roof_damage_nano_100ep\weights\best.pt`

### 💡 Integration Strategy

1. **Start Now:** Use the 20-epoch model to build the integration
2. **Test Pipeline:** Get everything working end-to-end
3. **Swap Model Later:** When 100-epoch training finishes, simply replace `best.pt`
4. **Demo Ready:** Either model works for demo - better one is just a bonus!

---

## ✅ What's Been Built

### 1. **TipTop Core Project** (`C:\users\marcu\tiptop\`)
- ✅ Complete documentation (PRD, Architecture, API Spec, Cost Model)
- ✅ FastAPI server backend (for future cloud deployment)
- ✅ Mobile docs (Android/iOS edge inference)
- ✅ Model conversion scripts (ONNX/TFLite/CoreML)
- ✅ Training infrastructure (adapted from Roomer)

### 2. **Training Scripts** (`C:\users\marcu\tiptop\training\`)
- ✅ `inference_roof.py` — **Simple CLI for clappper** (key file!)
- ✅ `rebuild_roof_dataset.py` — Dataset preparation
- ✅ Requirements & documentation

---

## 🎯 2-Day Demo Integration Plan

### **Day 1: Backend Integration** (4-6 hours)

#### Step 1: Copy Inference Script to Clappper
```bash
# Copy from TipTop to clappper
copy C:\users\marcu\tiptop\training\inference_roof.py C:\users\marcu\clappper\resources\roof-detection\

# Or create symlink if you want to keep them in sync
```

#### Step 2: Add IPC Handler to Electron Main Process

**File:** `C:\users\marcu\clappper\electron\main.ts`

Add after existing `detectRooms` handler:

```typescript
// Roof Damage Detection Handler
ipcMain.handle('detect-roof-damage', async (event, imagePath: string) => {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(
      app.getPath('userData'),
      'resources',
      'roof-detection',
      'inference_roof.py'
    );
    
    const modelPath = path.join(
      app.getPath('userData'),
      'resources',
      'roof-models',
      'best.pt'  // Your trained YOLO model
    );
    
    const args = [pythonScript, imagePath, modelPath, '0.5'];
    const pythonProcess = spawn('python', args);
    
    let stdoutData = '';
    let stderrData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdoutData);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err}`));
        }
      } else {
        reject(new Error(`Python process exited with code ${code}: ${stderrData}`));
      }
    });
  });
});
```

#### Step 3: Update Preload Script

**File:** `C:\users\marcu\clappper\electron\preload.ts`

Add to `window.clappper` API:

```typescript
detectRoofDamage: (imagePath: string) => ipcRenderer.invoke('detect-roof-damage', imagePath),
```

#### Step 4: Update TypeScript Definitions

**File:** `C:\users\marcu\clappper\src\types\window.d.ts`

```typescript
interface RoofDetectionResult {
  detections: Array<{
    cls: string;
    bbox: number[];  // [x, y, w, h]
    conf: number;
    severity: number;
    affected_area_pct: number;
  }>;
  cost_estimate: {
    labor_usd: number;
    materials_usd: number;
    disposal_usd: number;
    contingency_usd: number;
    total_usd: number;
    assumptions: string;
  };
  image_width: number;
  image_height: number;
}

interface Window {
  clappper: {
    // ... existing methods ...
    detectRoofDamage: (imagePath: string) => Promise<RoofDetectionResult>;
  };
}
```

---

### **Day 2: UI Component** (4-6 hours)

#### Step 5: Create Roof Damage Component

**File:** `C:\users\marcu\clappper\src\components\RoofDamageDetector.tsx`

Copy structure from `RoomDetection.tsx` and adapt:

```typescript
import React, { useState } from 'react';
import { useStore } from '../store';

export function RoofDamageDetector() {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [detections, setDetections] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const handleSelectImage = async () => {
    const result = await window.clappper.openFileDialog({
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }]
    });
    
    if (result && result.length > 0) {
      setImagePath(result[0]);
    }
  };
  
  const handleDetect = async () => {
    if (!imagePath) return;
    
    setLoading(true);
    try {
      const result = await window.clappper.detectRoofDamage(imagePath);
      setDetections(result);
    } catch (error) {
      console.error('Detection failed:', error);
      alert(`Detection failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{ padding: '20px' }}>
      <h2>🏠 Roof Damage Detector</h2>
      
      {/* Upload Button */}
      <button onClick={handleSelectImage} disabled={loading}>
        📸 Select Roof Image
      </button>
      
      {imagePath && (
        <>
          {/* Image Preview */}
          <div style={{ margin: '20px 0' }}>
            <img 
              src={`file://${imagePath}`} 
              alt="Roof" 
              style={{ maxWidth: '800px', maxHeight: '600px' }}
            />
          </div>
          
          {/* Detect Button */}
          <button onClick={handleDetect} disabled={loading}>
            {loading ? '🔍 Detecting...' : '🔍 Detect Damage'}
          </button>
        </>
      )}
      
      {/* Results */}
      {detections && (
        <div style={{ marginTop: '20px' }}>
          <h3>📊 Detection Results</h3>
          
          {/* Detections List */}
          <div>
            <h4>Found {detections.detections.length} damage areas:</h4>
            {detections.detections.map((det: any, i: number) => (
              <div key={i} style={{ 
                padding: '10px', 
                margin: '10px 0', 
                border: '1px solid #ccc',
                borderRadius: '5px'
              }}>
                <strong>{det.cls.replace('_', ' ')}</strong> 
                <span style={{ marginLeft: '10px', color: '#666' }}>
                  Confidence: {(det.conf * 100).toFixed(1)}%
                </span>
                <br />
                Severity: {(det.severity * 100).toFixed(1)}% 
                ({det.affected_area_pct.toFixed(1)}% of image)
              </div>
            ))}
          </div>
          
          {/* Cost Estimate */}
          <div style={{ 
            marginTop: '20px', 
            padding: '15px', 
            backgroundColor: '#f0f0f0',
            borderRadius: '5px'
          }}>
            <h4>💰 Cost Estimate</h4>
            <table>
              <tbody>
                <tr><td>Labor:</td><td>${detections.cost_estimate.labor_usd.toFixed(2)}</td></tr>
                <tr><td>Materials:</td><td>${detections.cost_estimate.materials_usd.toFixed(2)}</td></tr>
                <tr><td>Disposal:</td><td>${detections.cost_estimate.disposal_usd.toFixed(2)}</td></tr>
                <tr><td>Contingency:</td><td>${detections.cost_estimate.contingency_usd.toFixed(2)}</td></tr>
                <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000' }}>
                  <td>Total:</td>
                  <td>${detections.cost_estimate.total_usd.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              {detections.cost_estimate.assumptions}
            </p>
          </div>
          
          {/* Export Buttons */}
          <div style={{ marginTop: '20px' }}>
            <button onClick={() => {/* Export JSON */}}>
              📄 Export JSON
            </button>
            <button onClick={() => {/* Export CSV */}} style={{ marginLeft: '10px' }}>
              📊 Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

#### Step 6: Add to Toolbar

**File:** `C:\users\marcu\clappper\src\components\Toolbar.tsx`

Add button after existing modes:

```typescript
<button onClick={() => setMode('roof-damage')}>
  🏠 Roof Damage
</button>
```

#### Step 7: Conditional Rendering in App.tsx

**File:** `C:\users\marcu\clappper\src\App.tsx`

```typescript
import { RoofDamageDetector } from './components/RoofDamageDetector'

// ...

{mode === 'roof-damage' && <RoofDamageDetector />}
```

---

## 📦 Model Deployment

### Quick MVP (Use Pretrained YOLO)
For initial demo, use pretrained YOLOv8n on sample roof images:

```bash
# Download pretrained model
curl -L https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt \
  -o C:\users\marcu\clappper\resources\roof-models\best.pt
```

Note: This won't detect roof damage specifically, but will show the pipeline works.

### Production (Train Custom Model)
```bash
# 1. Collect dataset (Kaggle/Roboflow)
# 2. Train with your adapted scripts:
cd C:\users\marcu\tiptop\training
python rebuild_roof_dataset.py
yolo detect train data=yolo_roof_damage/data.yaml model=yolov8l.pt epochs=200

# 3. Copy trained model to clappper
copy runs\detect\train\weights\best.pt C:\users\marcu\clappper\resources\roof-models\
```

---

## 🎨 Enhanced Features (Optional)

### Draw Bounding Boxes on Image
Use Canvas API to overlay detections:

```typescript
const drawDetections = (canvas: HTMLCanvasElement, detections: any[], imgWidth: number, imgHeight: number) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  detections.forEach((det) => {
    const [x, y, w, h] = det.bbox;
    
    // Color by severity
    const color = det.severity < 0.3 ? '#00ff00' : 
                  det.severity < 0.6 ? '#ffff00' : '#ff0000';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    
    // Label
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 25, 150, 25);
    ctx.fillStyle = '#000';
    ctx.font = '14px Arial';
    ctx.fillText(`${det.cls} ${(det.conf * 100).toFixed(0)}%`, x + 5, y - 7);
  });
};
```

### Review Workflow
Add Accept/Reject buttons per detection (similar to image filtering mode):

```typescript
const [reviewedDetections, setReviewedDetections] = useState<{[key: number]: 'accepted' | 'rejected'}>({});

// For each detection:
<button onClick={() => handleReview(i, 'accepted')}>✅ Accept</button>
<button onClick={() => handleReview(i, 'rejected')}>❌ Reject</button>
```

---

## 🚀 Testing Checklist

- [ ] Python inference script runs standalone
- [ ] Electron IPC handler returns JSON
- [ ] UI component renders detections
- [ ] Cost estimate displays correctly
- [ ] Export functions work (JSON/CSV)
- [ ] Works with sample images
- [ ] Handles errors gracefully (no model, bad image, etc.)

---

## 📊 Demo Script

**For Wednesday presentation:**

1. **Open clappper app**
2. **Click "🏠 Roof Damage" button** in toolbar
3. **Upload sample roof photo** (show damaged roof)
4. **Click "Detect Damage"**
5. **Show results:**
   - Detected damage types
   - Bounding boxes on image
   - Cost breakdown
6. **Export report** (JSON/CSV)
7. **Explain:** "This is MVP using YOLO. For production, we'd train on 1000+ roof images from Kaggle/Roboflow datasets"

**Talking points:**
- Edge inference (can run offline)
- Cost estimation (heuristic, but tunable)
- Scales to cloud API (FastAPI backend already built)
- Mobile apps (Android/iOS docs already written)

---

## 🛠 Troubleshooting

**Issue:** Python not found
```bash
# Ensure python is in PATH, or use full path:
const pythonPath = 'C:\\Python311\\python.exe';
```

**Issue:** Module 'ultralytics' not found
```bash
# Install in system Python or clappper venv:
pip install ultralytics torch opencv-python pillow
```

**Issue:** Model file not found
```bash
# Check path in IPC handler matches actual file location
console.log('Model path:', modelPath);
```

---

## 📁 Final Directory Structure

```
C:\users\marcu\tiptop\
├── training\
│   ├── inference_roof.py          ← KEY FILE FOR CLAPPPER
│   ├── rebuild_roof_dataset.py
│   └── requirements.txt
└── [all other docs/server code]

C:\users\marcu\clappper\
├── resources\
│   ├── roof-detection\
│   │   └── inference_roof.py      ← COPIED FROM TIPTOP
│   └── roof-models\
│       └── best.pt                ← TRAINED MODEL (or pretrained YOLOv8n for demo)
├── electron\
│   ├── main.ts                    ← ADD IPC HANDLER
│   └── preload.ts                 ← ADD API METHOD
└── src\
    ├── components\
    │   └── RoofDamageDetector.tsx ← NEW COMPONENT
    ├── types\
    │   └── window.d.ts            ← ADD TYPES
    └── App.tsx                    ← CONDITIONAL RENDER
```

---

## ✅ Success Criteria

By end of 2 days:
- [x] Inference script working
- [ ] IPC handler functional
- [ ] UI component displays detections
- [ ] Cost estimate calculated
- [ ] Exports JSON report
- [ ] Demo-ready with sample images

---

## 🎯 Ready to Integrate?

**After running the setup commands above:**

1. **Switch to clappper repo** in Cursor
2. **Open this file** (`CLAPPPER_INTEGRATION_PLAN.md`)
3. **Tell the AI:**
   > "I need to integrate roof damage detection following this integration plan. The inference script and model are already in `resources/`. Start with Day 1 (Backend Integration) - add the IPC handler to `electron/main.ts` following the existing `detectRooms` pattern."

**The AI will:**
- ✅ Read the existing clappper codebase
- ✅ Follow the room detection pattern
- ✅ Implement step-by-step with your approval
- ✅ Test each component as it's built

**Training Status:**
- 🔄 100-epoch model training in progress (3-4 hours)
- ✅ 20-epoch model ready for immediate use
- 📊 Dataset: 4,708 images (expanded from 2,520)
- 🎯 Integration can start immediately!

---

**Next Steps:** Run the setup commands, then start Day 1 (Backend Integration) in the clappper repo!
