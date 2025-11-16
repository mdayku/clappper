# Video Assets Integration Guide
## Migrating from Clappper (Electron) to ad-gen-ai (Web/Firebase)

**Last Updated:** November 16, 2025  
**Clappper Version:** v0.1.0

This guide explains how to port the Video Assets generation functionality from the Clappper Electron app to the ad-gen-ai web application.

---

## Overview

The Video Assets feature generates professional product video clips **and** logo animations using AI models (Google Veo 3.1 or Runway Gen-4 Turbo) via the Replicate API.

### Two Asset Types:

1. **Product Videos**: Multiple camera angles (pan, dolly, orbit, etc.) from a single product image
   - 7 cinematic shot types
   - 3 seconds each (actual: 4s for Veo, 5s for Runway)
   - Image-to-video generation

2. **Logo Animations**: Animated logo end cards for ads
   - 5 animation styles (fade, slide, glow, zoom, rotate)
   - 2 seconds each
   - Image-to-video generation

### Latest Features (November 2025)

**New in Clappper v0.1.0:**
- ✅ **Logo Animations**: 5 animation styles for branded end cards (2s each)
- ✅ **Tabbed UI**: Product Videos vs Logo Animations (mutually exclusive jobs)
- ✅ **Auto Image Conversion**: WebP, AVIF, SVG → PNG with one-click in-app conversion
- ✅ **Single Image Selection**: Enforced single-file picker (AI models use 1 image per prompt)
- ✅ **Filename Display**: Shows actual filename instead of count
- ✅ **Model Selector**: Choose between Google Veo 3.1 or Runway Gen-4 Turbo
- ✅ **Runway 4K Upscale**: Optional upscaling for generated videos
- ✅ **Real-time Progress**: 3s polling with expandable job list
- ✅ **Selective Import**: Preview and import specific videos to timeline

### Current Architecture (Clappper - Electron)
- **Storage**: Local filesystem (`Downloads/Video_Assets/`)
- **Backend**: Electron IPC handlers in `main.ts`
- **State**: In-memory job tracking via config file
- **UI**: React modal component

### Target Architecture (ad-gen-ai - Web)
- **Storage**: AWS S3
- **Backend**: Firebase Functions
- **State**: Firebase Firestore
- **UI**: Next.js/React web component

---

## Core Components to Port

### 1. **Replicate Client** (`electron/replicate-client.ts`)

**Purpose**: Handles API calls to Replicate for video generation.

**Key Methods**:
```typescript
class ReplicateClient {
  // Google Veo 3.1 - 4s clips, 720p/1080p, with audio
  async generateVideoVeo(
    imagePath: string,
    prompt: string,
    outputDir: string,
    onProgress?: (status: string) => void,
    duration: 4 | 6 | 8 = 4,
    aspectRatio: '16:9' | '9:16' = '16:9',
    resolution: '720p' | '1080p' = '720p'
  ): Promise<string>

  // Runway Gen-4 Turbo - 5s clips, 720p
  async generateVideo(
    imagePath: string,
    prompt: string,
    outputDir: string,
    onProgress?: (status: string) => void,
    duration: 5 | 10 = 5,
    aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
  ): Promise<string>

  // Runway Upscale - 4K upscaling
  async upscaleVideo(
    videoPath: string,
    outputDir: string,
    onProgress?: (status: string) => void
  ): Promise<string>
}
```

**Web Adaptation**:
- Move to Firebase Functions as a service
- Replace file system operations with S3 URLs
- Use Replicate Node.js SDK
- Store Replicate API key in Firebase environment config

**Example Firebase Function**:
```typescript
// functions/src/videoAssets/replicateService.ts
import Replicate from 'replicate';
import { storage } from '../firebase-admin';

export async function generateVideoVeo(
  imageUrl: string, // S3 URL instead of local path
  prompt: string,
  model: 'veo' | 'runway',
  userId: string,
  adId: string
): Promise<string> {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN!,
  });

  const prediction = await replicate.predictions.create({
    version: model === 'veo' 
      ? 'google/veo-3.1' 
      : 'runwayml/gen4-turbo',
    input: {
      prompt: prompt,
      image: imageUrl, // Direct URL (Replicate will fetch)
      duration: model === 'veo' ? 4 : 5,
      aspect_ratio: '16:9',
      resolution: '720p'
    }
  });

  // Poll for completion
  let result = prediction;
  while (result.status !== 'succeeded' && result.status !== 'failed') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    result = await replicate.predictions.get(result.id);
    
    // Update Firestore with progress
    await updateClipProgress(adId, result.id, result.status);
  }

  if (result.status === 'failed') {
    throw new Error(result.error);
  }

  // Download video from Replicate URL and upload to S3
  const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output;
  const s3Url = await uploadToS3(videoUrl, `ads/${adId}/clips/${result.id}.mp4`);
  
  return s3Url;
}
```

---

### 2. **Shot Prompt Templates** (`electron/video-asset-prompts.ts`)

**Purpose**: Defines cinematic prompts for each camera angle.

**Current Templates** (7 shot types, 3 seconds each):
- `slow_pan_lr`: Left-to-right pan
- `slow_pan_rl`: Right-to-left pan
- `slow_dolly_in`: Push-in toward product
- `slow_dolly_out`: Pull-back from product
- `orbit_360`: Full 360° orbit
- `hero_front`: Static hero shot
- `top_down`: Overhead flat-lay

**Web Adaptation**:
- Port as-is to shared utilities
- Can be stored in Firebase config for dynamic updates
- Example: `functions/src/videoAssets/shotTemplates.ts`

---

### 3. **Logo Animation Templates** (`electron/logo-animation-prompts.ts`)

**Purpose**: Defines animation prompts for logo end cards.

**Current Templates** (5 animation styles, 2 seconds each):
- `fade_scale_in`: Fade in with subtle scale
- `slide_from_left`: Slide in from left side
- `glow_reveal`: Glow effect reveal
- `minimal_zoom`: Minimal zoom and focus
- `rotate_assemble`: Rotate and assemble effect

**Example Template**:
```typescript
export interface LogoAnimationTemplate {
  id: string;
  label: string;
  description: string;
  promptTemplate: string;
  duration: number; // 2 seconds
}

export const LOGO_ANIMATION_TEMPLATES: LogoAnimationTemplate[] = [
  {
    id: 'fade_scale_in',
    label: 'Fade & Scale In',
    description: 'Elegant fade-in with subtle scale animation',
    promptTemplate: 'Professional logo animation. The {logo_description} fades in smoothly from 80% to 100% scale. Clean, elegant motion on a solid white background. Corporate and refined aesthetic. High-end branding commercial.',
    duration: 2
  },
  // ... other templates
];

export function buildLogoAnimationPrompt(
  animationId: string, 
  logoDescription: string
): string {
  const template = LOGO_ANIMATION_TEMPLATES.find(t => t.id === animationId);
  if (!template) throw new Error(`Unknown animation: ${animationId}`);
  return template.promptTemplate.replace('{logo_description}', logoDescription);
}
```

**Web Adaptation**:
- Port alongside shot templates
- Store in `functions/src/videoAssets/logoAnimationTemplates.ts`
- Use same processing logic as product videos

```typescript
export interface ShotTemplate {
  id: string;
  label: string;
  description: string;
  promptTemplate: string;
  cameraMotion: string;
  duration: number; // 3s (metadata only, API uses 4s for Veo, 5s for Runway)
}

export const SHOT_TEMPLATES: ShotTemplate[] = [
  {
    id: 'slow_pan_lr',
    label: 'Slow pan L → R',
    description: 'Camera moves left to right across the product',
    promptTemplate: 'Cinematic product commercial. Camera smoothly pans left to right, revealing {product_description} with elegant motion. Professional studio lighting with soft shadows. Clean white background. Product stays centered and in focus throughout. High-end advertising aesthetic, shallow depth of field.',
    cameraMotion: 'pan_left_to_right',
    duration: 3
  },
  // ... other templates
];

export function buildShotPrompt(shotId: string, productDescription: string): string {
  const template = SHOT_TEMPLATES.find(t => t.id === shotId);
  if (!template) throw new Error(`Unknown shot: ${shotId}`);
  return template.promptTemplate.replace('{product_description}', productDescription);
}
```

---

### 4. **Auto Image Format Conversion** (`electron/main.ts`)

**Purpose**: Automatically detects and converts unsupported image formats (WebP, AVIF, SVG, etc.) to PNG for AI model compatibility.

**Key Handlers**:
```typescript
// Format detection
ipcMain.handle('images:detectFormats', async (_event, filePaths: string[]) => {
  const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg']
  const CONVERTIBLE_FORMATS = ['.webp', '.avif', '.svg', '.gif', '.tiff', '.bmp']
  
  return {
    files: results,
    needsConversion: results.some(r => r.needsConversion),
    unsupportedCount: results.filter(r => r.needsConversion).length
  }
})

// Conversion (uses 'sharp' library)
ipcMain.handle('images:convertToPng', async (_event, filePaths: string[]) => {
  // Convert using sharp
  // SVG files rasterized at 2000px width
  // Output: {filename}_converted.png
})
```

**Web Adaptation**:
- **Option 1 (Recommended)**: Client-side conversion using WebAssembly
  - Use [`@squoosh/lib`](https://www.npmjs.com/package/@squoosh/lib) for browser-based conversion
  - Convert before upload to reduce server processing
  
- **Option 2**: Server-side conversion in Cloud Function
  - Accept all formats in upload
  - Convert to PNG in Firebase Function before passing to Replicate
  - Store both original and converted in S3

**Example Client-side Conversion**:
```typescript
// lib/imageConverter.ts
import { ImagePool } from '@squoosh/lib';

export async function convertToPng(file: File): Promise<File> {
  const imagePool = new ImagePool();
  const image = imagePool.ingestImage(await file.arrayBuffer());
  
  await image.encode({ png: {} });
  const pngFile = await image.encodedWith.png;
  
  return new File([pngFile.binary], file.name.replace(/\.\w+$/, '.png'), {
    type: 'image/png'
  });
}
```

---

### 5. **Job Processing Logic** (`electron/main.ts`)

**Current Flow** (supports both product videos AND logo animations):
1. User creates job → IPC handler creates job record
2. Background processor starts async job based on job type:

**For Product Videos:**
3. For each selected shot type:
   - Build prompt from shot template
   - Call Replicate API (parallel fan-out)
   - Download video locally
   - Update job status
4. Mark job complete/failed

**For Logo Animations:**
3. For each selected animation style:
   - Build prompt from logo animation template
   - Call Replicate API (parallel fan-out)
   - Download video locally
   - Update job status
4. Mark job complete/failed

**Important**: Jobs process EITHER product videos OR logo animations, not both simultaneously (controlled by active tab in UI).

**Web Adaptation** - Firebase Functions:

```typescript
// functions/src/videoAssets/processJob.ts
import { db } from '../firebase-admin';
import { generateVideoVeo } from './replicateService';
import { SHOT_TEMPLATES, buildShotPrompt } from './shotTemplates';

export async function processVideoAssetJob(
  adId: string,
  imageUrl: string, // Product image OR logo image
  shotIds: string[], // Empty if logo job
  logoAnimationIds: string[], // Empty if product job
  model: 'veo' | 'runway',
  description: string // Product description OR logo description
): Promise<void> {
  const adRef = db.collection('ad').doc(adId);
  
  try {
    // Update ad status to processing
    await adRef.update({ status: 'processing' });

    // Determine if this is a product video job or logo animation job
    const isLogoJob = logoAnimationIds.length > 0;
    const templateIds = isLogoJob ? logoAnimationIds : shotIds;
    const templateSet = isLogoJob ? LOGO_ANIMATION_TEMPLATES : SHOT_TEMPLATES;

    // Generate all clips in parallel
    const clipPromises = templateIds.map(async (templateId) => {
      const template = templateSet.find(t => t.id === templateId);
      if (!template) throw new Error(`Unknown template: ${templateId}`);

      const prompt = isLogoJob
        ? buildLogoAnimationPrompt(templateId, description)
        : buildShotPrompt(templateId, description);
      
      // Create clip record in Firestore
      const clipRef = adRef.collection('clip').doc();
      await clipRef.set({
        clipPrompt: prompt,
        shotType: templateId,
        assetType: isLogoJob ? 'logo_animation' : 'product_video',
        status: 'pending',
        createdAt: new Date()
      });

      try {
        // Generate video via Replicate
        const replicateUrl = await generateVideoVeo(
          imageUrl,
          prompt,
          model,
          adId,
          clipRef.id
        );

        // Update clip with result
        await clipRef.update({
          replicateUrl: replicateUrl,
          status: 'completed',
          duration: template.duration,
          completedAt: new Date()
        });

        return { clipId: clipRef.id, url: replicateUrl };
      } catch (err) {
        await clipRef.update({
          status: 'failed',
          error: err.message
        });
        throw err;
      }
    });

    await Promise.all(clipPromises);

    // Mark ad as complete
    await adRef.update({ 
      status: 'completed',
      completedAt: new Date()
    });

  } catch (error) {
    await adRef.update({ 
      status: 'failed',
      error: error.message 
    });
    throw error;
  }
}
```

**Trigger Function**:
```typescript
// functions/src/index.ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

export const onAdCreated = onDocumentCreated('ad/{adId}', async (event) => {
  const ad = event.data?.data();
  if (!ad || ad.status !== 'pending') return;

  const adId = event.params.adId;
  const productId = ad.productId;
  
  // Get product details
  const productDoc = await db.collection('product').doc(productId).get();
  const product = productDoc.data();

  // Process video asset job
  await processVideoAssetJob(
    adId,
    product.productImageUrl,
    ['slow_pan_lr', 'slow_dolly_in', 'hero_front'], // Default shots
    'veo', // Default model
    product.productDescription
  );
});
```

---

### 6. **UI Component** (`src/components/VideoAssetsModal.tsx`)

**Functional Requirements** (style-agnostic):

> ⚠️ **Important**: Do NOT copy Clappper's UI styling. The code examples below focus on **functionality, state management, and data flow**. Implement the UI using your existing ad-gen-ai design system (Tailwind, Shadcn, MUI, etc.).

The web implementation needs these functional UI elements:

#### Required UI Elements:

**1. Tab/Mode Selector**
- Two mutually exclusive modes: "Product Videos" and "Logo Animations"
- Only one can be active at a time (affects validation and API payload)

**2. AI Model Selector**
- Dropdown/radio: Google Veo 3.1 vs Runway Gen-4 Turbo
- Applies to both product and logo modes
- Optional: Show model details (resolution, speed, cost)

**3. Image Upload (Single File)**
- File picker accepting: PNG, JPG, WebP, AVIF, SVG, GIF, TIFF, BMP
- **Enforce single file selection** (AI models use 1 image per prompt)
- Display selected filename (e.g., "product-image.webp")
- Context-aware label: "Product Image" or "Logo Image" based on active tab

**4. Image Format Conversion (Conditional)**
- Detect unsupported formats (WebP, AVIF, SVG, etc.)
- Show alert/prompt: "This format needs to be converted to PNG"
- List files requiring conversion
- Action buttons: "Convert to PNG" and "Cancel"
- Loading state during conversion
- SVG info: "Will be rasterized at 2000px width"

**5. Preset Selection (Conditional by Tab)**
- **Product Videos Tab**: 7 checkboxes for shot types (pan, dolly, orbit, etc.)
- **Logo Animations Tab**: 5 checkboxes for animation styles (fade, glow, slide, etc.)
- Each preset shows: ID, Label, Description

**6. Generate Button**
- Disabled if: no image selected OR no presets checked
- Label: "Generate Videos" or "Generate Animations" (context-aware)
- Loading state during job creation

**7. Job List (Real-time Updates)**
- List of jobs with status badges: Pending / Processing / Completed / Failed
- Each job shows:
  - Job ID
  - Timestamp
  - Asset type (Product Videos or Logo Animations)
  - Model used (Veo or Runway)
  - Progress: "X of Y clips completed"
  - Error message (if failed)
- Expandable rows to show individual clips
- Auto-refresh every 3 seconds or use Firestore real-time listeners

**8. Video Preview & Selection (Completed Jobs)**
- Thumbnails or video previews for each generated clip
- Checkboxes for selective import/download
- Clip metadata: shot type, duration, file size
- Action button: "Import Selected" or "Download Selected"

#### Key User Flow:

```
1. User selects tab → "Product Videos" OR "Logo Animations"
2. User selects model → Veo or Runway
3. User uploads image → File picker (single file)
   ↓ (if unsupported format detected)
4. Conversion prompt → "Convert to PNG?" → User clicks "Convert"
   ↓
5. User selects presets → Check 1+ shot types or animation styles
6. User clicks "Generate" → API call creates job
   ↓
7. Real-time updates → Job list shows progress
   ↓
8. Job completes → User expands job, previews clips
9. User selects clips → "Import Selected" → Clips added to ad/timeline
```

**Web Adaptation** - Functional Component Structure:

```typescript
// app/components/VideoAssetsCreator.tsx
// NOTE: This is a functional/structural example. 
// Use your existing design system for actual UI styling.

'use client';

import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { detectImageFormat, convertToPng } from '@/lib/imageConverter'; // Your implementation

export default function VideoAssetsCreator({ 
  productId,
  companyId 
}: { 
  productId: string;
  companyId: string;
}) {
  // State management (adapt to your state management solution)
  const [activeTab, setActiveTab] = useState<'product' | 'logo'>('product');
  const [selectedShots, setSelectedShots] = useState<string[]>([]);
  const [selectedAnimations, setSelectedAnimations] = useState<string[]>([]);
  const [model, setModel] = useState<'veo' | 'runway'>('veo');
  const [image, setImage] = useState<File | null>(null);
  const [needsConversion, setNeedsConversion] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Handler: Image file selection
  const handleImageSelect = async (file: File) => {
    // Detect if format needs conversion
    const detection = await detectImageFormat(file);
    
    if (detection.needsConversion) {
      setNeedsConversion(true);
      // Show conversion UI (implement in your design system)
    } else {
      setImage(file);
      setNeedsConversion(false);
    }
  };

  // Handler: Convert image to PNG
  const handleConvert = async () => {
    if (!image) return;
    const pngFile = await convertToPng(image);
    setImage(pngFile);
    setNeedsConversion(false);
  };

  // Handler: Create video asset job
  const handleCreate = async () => {
    if (!image) return;
    
    // Validation
    const hasShots = activeTab === 'product' && selectedShots.length > 0;
    const hasAnimations = activeTab === 'logo' && selectedAnimations.length > 0;
    if (!hasShots && !hasAnimations) {
      // Show error: "Please select at least one preset"
      return;
    }
    
    setIsCreating(true);
    try {
      // 1. Upload image to Firebase Storage (product OR logo)
      const imagePath = activeTab === 'product' 
        ? `products/${productId}/image.jpg`
        : `logos/${companyId}/logo.png`;
      const imageRef = ref(storage, imagePath);
      await uploadBytes(imageRef, image);
      const imageUrl = await getDownloadURL(imageRef);

      // 2. Create ad document (triggers Cloud Function)
      const adRef = await addDoc(collection(db, 'ad'), {
        companyId,
        productId,
        status: 'pending',
        model,
        assetType: activeTab === 'product' ? 'product_video' : 'logo_animation',
        shotIds: activeTab === 'product' ? selectedShots : [],
        logoAnimationIds: activeTab === 'logo' ? selectedAnimations : [],
        imageUrl: imageUrl,
        createdAt: new Date()
      });

      console.log(`${activeTab} job created:`, adRef.id);
      // Success: Navigate to job detail page or show success message
    } catch (error) {
      console.error('Failed to create job:', error);
      // Error: Show error message in your UI
    } finally {
      setIsCreating(false);
    }
  };

  // Render UI using your design system
  // The component should render these elements (see "Required UI Elements" above):
  return (
    // 1. Tab selector: activeTab state, setActiveTab('product' | 'logo')
    // 2. Model selector: model state, setModel('veo' | 'runway')
    // 3. Image upload: handleImageSelect(file)
    // 4. Filename display: {image?.name}
    // 5. Conversion prompt (if needsConversion): handleConvert()
    // 6. Preset checkboxes:
    //    - Product: SHOT_TEMPLATES.map() with selectedShots
    //    - Logo: LOGO_ANIMATION_TEMPLATES.map() with selectedAnimations
    // 7. Generate button: handleCreate(), disabled={isCreating || !image}
    // 8. Job list: Use useVideoAssetJobs() hook (see below)
    null // Replace with your UI implementation
  );
}
```

**Data to Render:**
- **Shot Templates**: Import from shared utilities
- **Logo Animation Templates**: Import from shared utilities  
- **Job Status**: Real-time from Firestore (use listener hook)

---

## Firebase Schema Integration

### Ad Document Structure
```typescript
// /ad/{adId}
{
  s3Url: string;              // Final rendered output (after compositing all clips)
  companyId: string;
  productId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  model: 'veo' | 'runway';
  assetType: 'product_video' | 'logo_animation'; // NEW: Job type
  
  // Product video fields (empty if logo job)
  shotIds: string[];          // Selected shot presets ['slow_pan_lr', 'hero_front', ...]
  
  // Logo animation fields (empty if product job)
  logoAnimationIds: string[]; // Selected animation presets ['fade_scale_in', 'glow_reveal', ...]
  
  imageUrl: string;           // S3 URL of source image (product OR logo)
  createdAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
  
  // Nested collections:
  // - /clip/{clipId} - Individual video clips (product videos OR logo animations)
  // - /audio/{audioId} - Audio tracks (for final composite)
  // - /param/{paramId} - Rendering parameters
}
```

### Clip Subcollection
```typescript
// /ad/{adId}/clip/{clipId}
{
  clipPrompt: string;         // Generated prompt for this shot/animation
  replicateUrl: string;       // S3 URL of generated video
  assetType: 'product_video' | 'logo_animation'; // NEW: Type of asset
  shotType: string;           // Shot/animation template ID
                              // Product: 'slow_pan_lr', 'hero_front', etc.
                              // Logo: 'fade_scale_in', 'glow_reveal', etc.
  status: 'pending' | 'processing' | 'completed' | 'failed';
  duration: number;           // Product: 3s (metadata), actual 4-5s
                              // Logo: 2s (metadata), actual 2s
  order: number;              // Position in sequence
  createdAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}
```

---

## File Storage Strategy

### S3 Structure
```
s3://ad-gen-ai-bucket/
├── products/
│   └── {productId}/
│       └── image.jpg              # Original product image
├── logos/
│   └── {companyId}/
│       └── logo.png               # Logo image (converted to PNG if needed)
├── ads/
│   └── {adId}/
│       ├── clips/
│       │   ├── {clipId}_raw.mp4   # Generated clip from Replicate (product OR logo)
│       │   └── {clipId}_4k.mp4    # Upscaled version (if applicable)
│       └── final/
│           └── composite.mp4      # Final rendered ad
```

### Firebase Storage (Alternative)
If using Firebase Storage instead of S3:
```typescript
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

async function uploadVideoToStorage(videoBlob: Blob, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, videoBlob);
  return await getDownloadURL(storageRef);
}
```

---

## API Routes (Next.js API)

If you prefer REST API over Cloud Functions:

```typescript
// app/api/video-assets/create/route.ts
import { NextResponse } from 'next/server';
import { processVideoAssetJob } from '@/lib/videoAssets';

export async function POST(request: Request) {
  const { productId, shotIds, model } = await request.json();
  
  try {
    const adId = await processVideoAssetJob(productId, shotIds, model);
    return NextResponse.json({ adId, status: 'processing' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

```typescript
// app/api/video-assets/status/[adId]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { adId: string } }
) {
  const adDoc = await db.collection('ad').doc(params.adId).get();
  const clips = await adDoc.ref.collection('clip').get();
  
  return NextResponse.json({
    status: adDoc.data()?.status,
    clips: clips.docs.map(d => ({ id: d.id, ...d.data() }))
  });
}
```

---

## Environment Variables

### Firebase Functions Config
```bash
firebase functions:config:set replicate.api_token="r8_YOUR_TOKEN"
```

Or use `.env.local` for Next.js:
```
REPLICATE_API_TOKEN=r8_YOUR_TOKEN
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
```

---

## Real-time Status Updates

### Client-side Listener (Functional Hook)

Use Firestore real-time listeners to show live progress updates:

```typescript
// app/hooks/useVideoAssetJob.ts
import { useEffect, useState } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useVideoAssetJob(adId: string) {
  const [ad, setAd] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen to ad document for overall job status
    const unsubAd = onSnapshot(
      doc(db, 'ad', adId), 
      (snap) => {
        setAd(snap.data());
        setIsLoading(false);
      }
    );

    // Listen to clips subcollection for individual video progress
    const unsubClips = onSnapshot(
      collection(db, 'ad', adId, 'clip'),
      (snap) => {
        setClips(snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data() 
        })));
      }
    );

    return () => {
      unsubAd();
      unsubClips();
    };
  }, [adId]);

  // Computed properties for UI
  const totalClips = clips.length;
  const completedClips = clips.filter(c => c.status === 'completed').length;
  const failedClips = clips.filter(c => c.status === 'failed').length;
  const progressPercent = totalClips > 0 ? (completedClips / totalClips) * 100 : 0;

  return { 
    ad, 
    clips, 
    isLoading,
    totalClips,
    completedClips,
    failedClips,
    progressPercent
  };
}
```

**Use this hook in your UI to display:**
- Job status badge (pending/processing/completed/failed)
- Progress bar: `{completedClips} of {totalClips} clips generated`
- Individual clip status with thumbnails
- Error messages for failed clips

---

## Key Differences Summary

| Aspect | Clappper (Electron) | ad-gen-ai (Web) |
|--------|---------------------|-----------------|
| **Asset Types** | Product videos + Logo animations | Same (both types) |
| **Storage** | Local filesystem | AWS S3 / Firebase Storage |
| **Backend** | Electron IPC | Firebase Functions / Next.js API |
| **State** | JSON config file | Firestore real-time DB |
| **File Paths** | Absolute paths | S3 URLs |
| **Image Formats** | Auto-convert WebP/AVIF/SVG to PNG | Needs client or server conversion |
| **Job Processing** | In-process async | Cloud Function triggers |
| **Real-time Updates** | IPC polling (3s) | Firestore snapshots |
| **Auth** | N/A (local app) | Firebase Auth |
| **UI** | Electron modal with tabs | Web component with tabs |

---

## Migration Checklist

### Backend
- [ ] Set up Firebase project with Firestore + Storage
- [ ] Configure Replicate API token in environment
- [ ] Port `replicate-client.ts` → Firebase Function service (both Veo and Runway)
- [ ] Port `video-asset-prompts.ts` → shared utilities (7 shot types)
- [ ] Port `logo-animation-prompts.ts` → shared utilities (5 animation styles)
- [ ] Create Firestore schema with `assetType` field (`/ad/{adId}/clip/{clipId}`)
- [ ] Create Cloud Function trigger for job processing (handle both asset types)
- [ ] Add error handling and retry logic

### Frontend
- [ ] Build UI component with tabbed interface (Product Videos / Logo Animations)
- [ ] Implement model selector (Veo vs Runway)
- [ ] Add single-image file picker (not multi-select)
- [ ] Implement image format detection (WebP, AVIF, SVG, etc.)
- [ ] Add auto-conversion to PNG (client-side with @squoosh/lib or server-side)
- [ ] Display filename (not count) after selection
- [ ] Add shot/animation preset checkboxes
- [ ] Implement S3/Storage upload for images
- [ ] Add real-time status listeners (Firestore snapshots)
- [ ] Build job list with expandable entries
- [ ] Add video preview with selective import

### Testing
- [ ] Test end-to-end flow with Veo (product videos)
- [ ] Test end-to-end flow with Runway (product videos)
- [ ] Test logo animation generation (both models)
- [ ] Test image format conversion (WebP, AVIF, SVG → PNG)
- [ ] Test single-image selection enforcement
- [ ] Test tab-based job isolation (only one type at a time)
- [ ] Verify real-time progress updates
- [ ] Test error handling (API failures, timeout, etc.)

### Production
- [ ] Implement cost tracking (Replicate usage)
- [ ] Add rate limiting per user/company
- [ ] Set up usage quotas in Firebase
- [ ] Monitor job success rates
- [ ] Optimize S3 storage costs (compression, lifecycle rules)

---

## Cost Considerations

**Replicate Pricing** (as of 2024):
- Runway Gen-4 Turbo: ~$0.05 per second → $0.25 per 5s clip
- Google Veo 3.1: ~$0.10 per second → $0.40 per 4s clip

**Example Costs**:

| Job Type | Clips | Model | Duration | Cost per Job |
|----------|-------|-------|----------|--------------|
| Product Videos (7 shots) | 7 | Veo 3.1 | 4s each | **$2.80** |
| Product Videos (7 shots) | 7 | Runway | 5s each | **$1.75** |
| Logo Animations (5 styles) | 5 | Veo 3.1 | 2s each | **$1.00** |
| Logo Animations (5 styles) | 5 | Runway | 2s each | **$0.50** |
| **Full Ad (product + logo)** | 12 | Veo 3.1 | Mixed | **$3.80** |

**Additional Costs**:
- Runway 4K Upscale: ~$0.10/second → $0.40-$0.50 per clip
- Firebase Storage: $0.026/GB/month
- Firebase Functions: $0.40/million invocations + $0.0000025/GB-second

**Optimization Strategies**:
- Rate limiting per user/company (e.g., 10 jobs/day for free tier)
- Usage quotas in Firebase (hard cap at $100/month per user)
- Caching generated clips (same product/shot combo)
- Pre-generated logo packs for common brands
- Default to Runway (cheaper) unless user needs consistency
- Batch processing to reduce Function cold starts

---

## Testing Strategy

1. **Local Dev**: Use Firebase emulators for Firestore/Functions
2. **Staging**: Deploy to test Firebase project with test Replicate account
3. **Production**: Rate limit + monitoring

```bash
# Run emulators
firebase emulators:start

# Test function locally
npm run test:functions
```

---

## Additional Resources

- [Replicate Node.js Client](https://github.com/replicate/replicate-javascript)
- [Firebase Functions v2](https://firebase.google.com/docs/functions)
- [Google Veo 3.1 API Docs](https://replicate.com/google/veo-3.1)
- [Runway Gen-4 Turbo API Docs](https://replicate.com/runwayml/gen4-turbo)

---

## Questions / Next Steps

For questions about implementation, refer to the Clappper source code:

**Core Files:**
- **UI Component**: `src/components/VideoAssetsModal.tsx` (tabbed interface, image selection, job tracking)
- **Replicate Client**: `electron/replicate-client.ts` (Veo & Runway integration, upscaling)
- **Product Shot Templates**: `electron/video-asset-prompts.ts` (7 shot types, 3s each)
- **Logo Animation Templates**: `electron/logo-animation-prompts.ts` (5 animation styles, 2s each)
- **Job Processor**: `electron/main.ts` (search for `processAIVideoPack` and `processLogoAnimations`)
- **Image Conversion**: `electron/main.ts` (search for `images:detectFormats` and `images:convertToPng`)

**Key Features to Port:**
1. ✅ Tabbed interface (Product Videos vs Logo Animations)
2. ✅ Single-image selection with filename display
3. ✅ Auto image format detection & conversion (WebP, AVIF, SVG → PNG)
4. ✅ Model selector (Veo vs Runway)
5. ✅ Parallel API calls for all clips/animations
6. ✅ Real-time job progress tracking
7. ✅ Expandable job list with selective video import
8. ✅ Duration mapping (3s → 4s Veo, 5s Runway; 2s → 2s logos)

**Reference Documentation:**
- `IMAGE_CONVERSION_FEATURE.md` - Auto format conversion details
- `scripts/convert-to-png.js` - Standalone conversion script (reference for logic)
- `VIDEO_ASSETS_INTEGRATION_GUIDE.md` - This document

