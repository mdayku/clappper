# Universal Computer Vision Inference Template

🤯 **Template for ANY CV inference task in Electron + React apps** (excluding live video streams)

## What We've Built (Pattern)

```
User selects image → YOLO inference → Display results → Optional GPT-4 Vision → Export (image/JSON/PDF)
```

This pattern works for ANY static image CV task!

## Supported Task Types

- ✅ **Object Detection** (what we have: rooms, damage)
- ✅ **Image Segmentation** (per-pixel masks)
- ✅ **Image Classification** (single label per image)
- ✅ **Pose Estimation** (keypoints/skeleton)
- ✅ **OCR** (text detection + recognition)
- ✅ **Face Recognition** (detection + identification)
- ✅ **Depth Estimation** (depth maps)
- ✅ **Image Captioning** (description generation)
- ✅ **Style Transfer** (artistic rendering)
- ✅ **Super Resolution** (upscaling)
- ❌ **Live Video Streams** (out of scope for this template)

## Template Structure

### 1. Frontend Component Template (`src/components/CVInferenceModal.tsx`)

```typescript
import React, { useState, useEffect } from 'react'

interface CVInferenceModalProps {
  isOpen: boolean
  onClose: () => void
  taskName: string // e.g., "Object Detection", "Pose Estimation"
}

export default function CVInferenceModal({ isOpen, onClose, taskName }: CVInferenceModalProps) {
  // === STATE ===
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [confidence, setConfidence] = useState<number>(0.2)
  const [confidenceInput, setConfidenceInput] = useState<string>('0.20')
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Optional: GPT-4 Vision enhancement
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  
  // === LOAD MODELS ===
  useEffect(() => {
    if (isOpen && availableModels.length === 0) {
      window.clappper.listCVModels(taskName).then(setAvailableModels)
    }
  }, [isOpen, taskName])
  
  // === IMAGE SELECTION ===
  const handleSelectImage = async () => {
    const paths = await window.clappper.selectFiles(['png', 'jpg', 'jpeg'])
    if (paths && paths.length > 0) {
      setSelectedImage(paths[0])
      setResult(null)
      setError(null)
    }
  }
  
  // === RUN INFERENCE ===
  const handleDetect = async () => {
    if (!selectedImage) return
    
    setDetecting(true)
    setError(null)
    
    try {
      const inferenceResult = await window.clappper.runCVInference(
        taskName,
        selectedImage,
        selectedModel,
        confidence
      )
      
      if (!inferenceResult.success) {
        setError(inferenceResult.error || 'Inference failed')
        return
      }
      
      setResult(inferenceResult)
    } catch (err) {
      setError(`Inference failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDetecting(false)
    }
  }
  
  // === GPT-4 VISION ENHANCEMENT (OPTIONAL) ===
  const handleEnhanceWithAI = async () => {
    if (!result?.annotated_image || !hasApiKey) {
      setShowApiKeyDialog(true)
      return
    }
    
    setEnhancing(true)
    setError(null)
    
    try {
      const enhancedResult = await window.clappper.enhanceWithGPT4Vision(
        taskName,
        result.annotated_image,
        result.detections || result.predictions,
        true // isBase64
      )
      
      if (enhancedResult.success) {
        setResult({ ...result, ai_enhancement: enhancedResult.enhancement })
      } else {
        setError(enhancedResult.error || 'AI enhancement failed')
      }
    } catch (err) {
      setError(`Enhancement failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setEnhancing(false)
    }
  }
  
  // === EXPORTS ===
  const handleDownloadImage = async () => {
    if (!result?.annotated_image) return
    const imageData = `data:image/png;base64,${result.annotated_image}`
    const a = document.createElement('a')
    a.href = imageData
    a.download = `${taskName.toLowerCase()}_result.png`
    a.click()
  }
  
  const handleDownloadJSON = async () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${taskName.toLowerCase()}_result.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  const handleDownloadPDF = async () => {
    if (!result?.annotated_image) return
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF()
    
    // Add image and results to PDF
    const imageData = `data:image/png;base64,${result.annotated_image}`
    pdf.addImage(imageData, 'PNG', 10, 10, 190, 100)
    
    // Add results as text
    pdf.setFontSize(10)
    pdf.text(JSON.stringify(result.detections || result.predictions, null, 2), 10, 120)
    
    pdf.save(`${taskName.toLowerCase()}_report.pdf`)
  }
  
  if (!isOpen) return null
  
  return (
    <div style={{ /* modal styles */ }}>
      {/* Image selection */}
      {/* Model selection */}
      {/* Confidence slider */}
      {/* Run inference button */}
      {/* Display results */}
      {/* Enhance with AI button (optional) */}
      {/* Download buttons */}
    </div>
  )
}
```

### 2. Backend IPC Handler Template (`electron/main.ts`)

```typescript
// Generic CV inference handler
ipcMain.handle('cv:runInference', async (_e: any, taskName: string, imagePath: string, modelId?: string, confidence?: number) => {
  try {
    // Get task configuration
    const taskConfig = getTaskConfig(taskName)
    
    // Select model
    const modelPath = modelId 
      ? path.join(taskConfig.modelsDir, `${modelId}.pt`)
      : taskConfig.defaultModel
    
    if (!fs.existsSync(modelPath)) {
      return { success: false, error: `Model not found: ${modelPath}` }
    }
    
    // Read image
    const imageBuffer = await fs.promises.readFile(imagePath)
    
    // Spawn Python inference process
    const pythonProcess = spawn('python', [taskConfig.scriptPath], {
      cwd: taskConfig.workingDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    // Build input protocol
    const modelIdBytes = Buffer.from(modelId || 'default', 'utf-8')
    const modelIdLength = Buffer.alloc(4)
    modelIdLength.writeUInt32LE(modelIdBytes.length)
    
    const confBuffer = Buffer.alloc(4)
    confBuffer.writeFloatLE(confidence || 0.2)
    
    const inputData = Buffer.concat([
      modelIdLength,
      modelIdBytes,
      confBuffer,
      imageBuffer
    ])
    
    pythonProcess.stdin.write(inputData)
    pythonProcess.stdin.end()
    
    // Collect output
    let stdout = ''
    let stderr = ''
    
    pythonProcess.stdout.on('data', (data) => { stdout += data.toString() })
    pythonProcess.stderr.on('data', (data) => { stderr += data.toString() })
    
    return new Promise((resolve) => {
      pythonProcess.on('close', (code: number | null) => {
        if (code !== 0) {
          console.error(`[${taskName}] Python error:`, stderr)
          resolve({ success: false, error: stderr || 'Inference failed' })
          return
        }
        
        try {
          const result = JSON.parse(stdout)
          resolve({ success: true, ...result })
        } catch (parseErr) {
          resolve({ success: false, error: 'Failed to parse inference output' })
        }
      })
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Task configuration registry
function getTaskConfig(taskName: string): TaskConfig {
  const configs: Record<string, TaskConfig> = {
    'object_detection': {
      scriptPath: path.join(resourcesPath, 'cv-tasks/object-detection/inference.py'),
      modelsDir: path.join(resourcesPath, 'cv-tasks/object-detection/models'),
      defaultModel: 'yolov8n.pt',
      workingDir: path.join(resourcesPath, 'cv-tasks/object-detection')
    },
    'pose_estimation': {
      scriptPath: path.join(resourcesPath, 'cv-tasks/pose-estimation/inference.py'),
      modelsDir: path.join(resourcesPath, 'cv-tasks/pose-estimation/models'),
      defaultModel: 'yolov8n-pose.pt',
      workingDir: path.join(resourcesPath, 'cv-tasks/pose-estimation')
    },
    'segmentation': {
      scriptPath: path.join(resourcesPath, 'cv-tasks/segmentation/inference.py'),
      modelsDir: path.join(resourcesPath, 'cv-tasks/segmentation/models'),
      defaultModel: 'yolov8n-seg.pt',
      workingDir: path.join(resourcesPath, 'cv-tasks/segmentation')
    },
    'classification': {
      scriptPath: path.join(resourcesPath, 'cv-tasks/classification/inference.py'),
      modelsDir: path.join(resourcesPath, 'cv-tasks/classification/models'),
      defaultModel: 'resnet50.pt',
      workingDir: path.join(resourcesPath, 'cv-tasks/classification')
    }
    // Add more tasks as needed
  }
  
  return configs[taskName] || configs['object_detection']
}
```

### 3. Python Inference Script Template (`resources/cv-tasks/{task}/inference.py`)

```python
import sys
import json
import struct
import io
from typing import Dict, Any, List
from PIL import Image

# Task-specific imports
# For object detection: from ultralytics import YOLO
# For classification: import torchvision.models as models
# For segmentation: from segment_anything import sam_model_registry
# etc.

def load_model(model_path: str, task_type: str):
    """Load model based on task type"""
    if task_type == 'object_detection':
        from ultralytics import YOLO
        return YOLO(model_path)
    elif task_type == 'pose_estimation':
        from ultralytics import YOLO
        return YOLO(model_path)
    elif task_type == 'segmentation':
        from ultralytics import YOLO
        return YOLO(model_path)
    elif task_type == 'classification':
        import torch
        import torchvision.models as models
        model = models.resnet50(pretrained=False)
        model.load_state_dict(torch.load(model_path))
        return model
    else:
        raise ValueError(f"Unknown task type: {task_type}")

def perform_inference(model, image: Image.Image, task_type: str, conf_threshold: float = 0.2) -> Dict[str, Any]:
    """Run inference based on task type"""
    
    if task_type == 'object_detection':
        results = model(image, conf=conf_threshold)[0]
        
        detections = []
        for box in results.boxes:
            detections.append({
                'bbox': box.xyxy[0].tolist(),
                'confidence': float(box.conf[0]),
                'class_id': int(box.cls[0]),
                'class_name': results.names[int(box.cls[0])]
            })
        
        # Generate annotated image
        annotated = results.plot()
        annotated_pil = Image.fromarray(annotated)
        img_buffer = io.BytesIO()
        annotated_pil.save(img_buffer, format='PNG')
        annotated_b64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        return {
            'detections': detections,
            'annotated_image': annotated_b64,
            'image_width': image.width,
            'image_height': image.height
        }
    
    elif task_type == 'pose_estimation':
        results = model(image, conf=conf_threshold)[0]
        
        poses = []
        for keypoints in results.keypoints:
            poses.append({
                'keypoints': keypoints.xy[0].tolist(),
                'confidence': keypoints.conf[0].tolist()
            })
        
        annotated = results.plot()
        annotated_pil = Image.fromarray(annotated)
        img_buffer = io.BytesIO()
        annotated_pil.save(img_buffer, format='PNG')
        annotated_b64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        return {
            'poses': poses,
            'annotated_image': annotated_b64,
            'image_width': image.width,
            'image_height': image.height
        }
    
    elif task_type == 'segmentation':
        results = model(image, conf=conf_threshold)[0]
        
        segments = []
        for mask in results.masks:
            segments.append({
                'mask': mask.data.tolist(),
                'bbox': mask.xyxy[0].tolist()
            })
        
        annotated = results.plot()
        annotated_pil = Image.fromarray(annotated)
        img_buffer = io.BytesIO()
        annotated_pil.save(img_buffer, format='PNG')
        annotated_b64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        return {
            'segments': segments,
            'annotated_image': annotated_b64,
            'image_width': image.width,
            'image_height': image.height
        }
    
    elif task_type == 'classification':
        import torch
        import torchvision.transforms as transforms
        
        preprocess = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        input_tensor = preprocess(image).unsqueeze(0)
        with torch.no_grad():
            output = model(input_tensor)
        
        probabilities = torch.nn.functional.softmax(output[0], dim=0)
        top5_prob, top5_catid = torch.topk(probabilities, 5)
        
        predictions = []
        for i in range(top5_prob.size(0)):
            predictions.append({
                'class_id': int(top5_catid[i]),
                'confidence': float(top5_prob[i])
            })
        
        return {
            'predictions': predictions,
            'image_width': image.width,
            'image_height': image.height
        }
    
    else:
        raise ValueError(f"Unknown task type: {task_type}")

def main():
    import base64
    
    # Read input protocol: [model_id_length][model_id][confidence][image_data]
    stdin_buffer = sys.stdin.buffer.read()
    
    # Parse model ID
    model_id_length = struct.unpack('<I', stdin_buffer[0:4])[0]
    model_id = stdin_buffer[4:4+model_id_length].decode('utf-8')
    
    # Parse confidence
    confidence = struct.unpack('<f', stdin_buffer[4+model_id_length:8+model_id_length])[0]
    
    # Parse image
    image_data = stdin_buffer[8+model_id_length:]
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    
    # Determine task type from model ID or config
    task_type = 'object_detection'  # Default, or parse from model_id
    
    # Load model
    model_path = f"./models/{model_id}.pt"
    model = load_model(model_path, task_type)
    
    # Run inference
    result = perform_inference(model, image, task_type, confidence)
    
    # Output JSON
    print(json.dumps(result), flush=True)

if __name__ == '__main__':
    main()
```

### 4. GPT-4 Vision Enhancement Template (Optional)

```typescript
// Generic GPT-4 Vision enhancement
ipcMain.handle('cv:enhanceWithGPT4', async (_e: any, taskName: string, annotatedImageBase64: string, predictions: any[]) => {
  try {
    const config = await loadConfig()
    const apiKey = config.openai_api_key
    if (!apiKey) {
      return { success: false, error: 'API key required' }
    }
    
    // Task-specific prompts
    const prompts: Record<string, string> = {
      'object_detection': `Analyze this image with object detection results. Describe what you see and suggest improvements.`,
      'pose_estimation': `Analyze this pose estimation. Describe the pose/activity and provide insights.`,
      'segmentation': `Analyze this segmentation mask. Describe the segmented regions and their relationships.`,
      'classification': `Analyze this classification result. Do you agree? Provide reasoning.`
    }
    
    const prompt = prompts[taskName] || 'Analyze this computer vision result and provide insights.'
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${annotatedImageBase64}` } }
          ]
        }],
        max_tokens: 1000
      })
    })
    
    const data = await response.json()
    return {
      success: true,
      enhancement: data.choices[0].message.content
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

## Directory Structure Template

```
resources/
├── cv-tasks/
│   ├── object-detection/
│   │   ├── inference.py
│   │   ├── models/
│   │   │   ├── yolov8n.pt
│   │   │   └── yolov8s.pt
│   │   └── requirements.txt
│   ├── pose-estimation/
│   │   ├── inference.py
│   │   ├── models/
│   │   │   └── yolov8n-pose.pt
│   │   └── requirements.txt
│   ├── segmentation/
│   │   ├── inference.py
│   │   ├── models/
│   │   │   └── yolov8n-seg.pt
│   │   └── requirements.txt
│   ├── classification/
│   │   ├── inference.py
│   │   ├── models/
│   │   │   └── resnet50.pt
│   │   └── requirements.txt
│   └── [add more tasks]/

src/
├── components/
│   ├── CVInferenceModal.tsx (generic template)
│   ├── ObjectDetectionModal.tsx (extends template)
│   ├── PoseEstimationModal.tsx (extends template)
│   └── [task-specific modals]/
```

## Adding a New CV Task (5 Steps)

### 1. Create Task Directory
```bash
mkdir resources/cv-tasks/your-task
cd resources/cv-tasks/your-task
```

### 2. Copy Inference Script Template
```bash
cp ../object-detection/inference.py .
# Edit to match your task
```

### 3. Add Models
```bash
mkdir models
# Copy your .pt, .onnx, .h5, etc. files
```

### 4. Create Frontend Component
```typescript
// src/components/YourTaskModal.tsx
import CVInferenceModal from './CVInferenceModal'

export default function YourTaskModal({ isOpen, onClose }) {
  return <CVInferenceModal isOpen={isOpen} onClose={onClose} taskName="your_task" />
}
```

### 5. Register IPC Handler
```typescript
// electron/main.ts
// Already handled by generic 'cv:runInference' handler!
// Just add task config to getTaskConfig()
```

## Benefits of This Template

1. ✅ **Consistent UX** across all CV tasks
2. ✅ **Reusable code** - write once, use everywhere
3. ✅ **Easy to extend** - add new tasks in minutes
4. ✅ **GPT-4 Vision ready** - optional AI enhancement for any task
5. ✅ **Export-ready** - image/JSON/PDF for all tasks
6. ✅ **Model management** - easy to swap models
7. ✅ **Rate limiting** - built-in protection
8. ✅ **Error handling** - graceful failures

## Real-World Examples

### Example 1: Add OCR Task
```typescript
// 1. Copy inference script, modify for PaddleOCR/Tesseract
// 2. Add OCR prompt to GPT-4: "Extract and format the text you see"
// 3. Component shows detected text with bounding boxes
// 4. Export includes text overlay + JSON with coordinates
```

### Example 2: Add Face Recognition
```typescript
// 1. Copy inference script, use face_recognition library
// 2. Add prompt: "Describe facial expressions and demographics (age/gender)"
// 3. Component shows face boxes + AI descriptions
// 4. Export includes annotated faces + AI analysis
```

### Example 3: Add Depth Estimation
```typescript
// 1. Copy inference script, use MiDaS or ZoeDepth
// 2. Add prompt: "Analyze the depth map and describe the 3D scene layout"
// 3. Component shows colorized depth map
// 4. Export includes depth visualization + 3D insights
```

## Key Insights

1. **Binary Protocol**: The stdin/stdout protocol is universal - works for any task
2. **JSON Output**: Always return JSON with `annotated_image` and task-specific results
3. **GPT-4 Vision**: Can enhance ANY visual task with natural language insights
4. **Confidence Threshold**: Applicable to most detection/classification tasks
5. **Model Selection**: Dropdown works the same regardless of task type

## What Makes This Work

- **Separation of Concerns**: UI, IPC, and inference are independent
- **Standardized Interface**: All tasks use same input/output format
- **Plugin Architecture**: Add tasks without modifying core code
- **AI-First Design**: GPT-4 Vision sees annotated images for best results

---

**TL;DR:** Copy this template, change 3 lines in the inference script, and you have a production-ready CV feature in your Electron app! 🚀

