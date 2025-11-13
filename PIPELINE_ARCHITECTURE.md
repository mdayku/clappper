# AI Video Generation Pipeline - Architecture & Development Plan

**Project:** Web-based AI Ad Video Generator  
**Team Size:** 4 people  
**Timeline:** 10 days  
**Competition Track:** Ad Creative Pipeline (15-60 second videos)

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Core Components](#core-components)
4. [Data Models](#data-models)
5. [Provider Abstraction](#provider-abstraction)
6. [Development Stages](#development-stages)
7. [Team Coordination](#team-coordination)
8. [Risk Mitigation](#risk-mitigation)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 14 + React + TypeScript)                 │
│  ├── Prompt Builder (scene-by-scene editor)                 │
│  ├── Brand Asset Manager (logo, colors, style packs)        │
│  ├── Gallery & Player (status tracking, downloads)          │
│  └── HITL Review Panel (ratings, tags, metrics)             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓ tRPC or REST API
┌─────────────────────────────────────────────────────────────┐
│  Backend (Next.js API Routes)                               │
│  ├── /api/preflight      - Zod validation + lint + scoring  │
│  ├── /api/generate       - Job orchestration                │
│  ├── /api/webhook/*      - Provider callbacks               │
│  ├── /api/status/:id     - Poll job status                  │
│  ├── /api/compose        - FFmpeg composition               │
│  └── /api/metrics        - Auto-metrics worker              │
└────┬───────┬──────┬─────────┬───────────────────────────────┘
     │       │      │         │
     ↓       ↓      ↓         ↓
 Replicate  AWS   Cosmos   Storage
 (T2V/I2V)  EC2   (NIM)    (S3/R2)
            (Omni)
```

### Request Flow (Scene Generation)

```
User Input (AdBrief)
  ↓
Preflight Validation (schema + lint + rubric)
  ↓ [PASS]
Planner (split into scenes, assign providers)
  ↓
Job Queue (BullMQ + Redis)
  ↓
┌─────────────────────────────────────┐
│  Per-Scene Provider Selection       │
│  ├─ Packshot? → Omniverse           │
│  ├─ Structure controls? → Cosmos    │
│  └─ Default → Replicate T2V/I2V     │
└─────────────────────────────────────┘
  ↓
Generate Assets (parallel jobs)
  ↓
Download & Store (S3/R2)
  ↓
Composition (FFmpeg: stitch + overlays + audio sync)
  ↓
Auto-Metrics (CLIPScore, aesthetic, SSIM, flow jitter)
  ↓
HITL Review (human rating + tags)
  ↓
Gallery (playable, downloadable, shareable)
```

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI:** React 18 + TypeScript
- **Styling:** Tailwind CSS v3
- **State:** Zustand (lightweight global state)
- **Forms:** React Hook Form + Zod validation
- **Video Player:** Video.js or Plyr
- **Animations:** Framer Motion

### Backend
- **Runtime:** Node.js 20 (Next.js API Routes)
- **Validation:** Zod (schema + runtime checks)
- **Queue:** BullMQ + Redis (Upstash serverless)
- **ORM:** Prisma (type-safe DB client)
- **File Processing:** Fluent-ffmpeg
- **HTTP Client:** node-fetch or axios

### Database
- **Primary:** Neon Postgres (serverless, auto-scaling)
- **Schema:** Prisma migrations
- **Backup:** Automated via Neon

### Storage
- **Assets:** AWS S3 or Cloudflare R2 (R2 has cheaper egress)
- **Videos:** Same bucket, organized by job ID
- **Signed URLs:** For secure downloads

### Infrastructure
- **Hosting:** Vercel (frontend + API routes)
- **GPU Compute:** AWS EC2 g5.xlarge (Omniverse + Cosmos)
- **CDN:** Vercel Edge Network + R2/S3 CDN
- **Monitoring:** Vercel Analytics + Sentry (errors)

### AI/ML APIs
- **Primary:** Replicate (CogVideoX T2V/I2V, SVD, SDXL)
- **Secondary:** AWS EC2 (Omniverse Kit, Cosmos NIM)
- **Optional:** OpenAI GPT-4 (preflight rubric scoring)

---

## Core Components

### 1. Prompt Preflight System

**Purpose:** Gate bad prompts before spending GPU credits

**Implementation:**
```typescript
// lib/preflight/schema.ts
import { z } from 'zod';

export const SceneSchema = z.object({
  id: z.string(),
  start_s: z.number().nonnegative(),
  end_s: z.number().positive(),
  type: z.enum(['packshot', 'lifestyle', 'montage', 'endcard']),
  intent: z.string().min(3),
  camera: z.object({
    move: z.enum(['static', 'dolly_in', 'dolly_out', 'pan', 'orbit']),
    focal_length_mm: z.number().min(18).max(85).default(35)
  }).optional(),
  provider_hint: z.enum(['auto', 'omniverse', 'cosmos', 't2v']).default('auto')
});

export const AdBriefSchema = z.object({
  project: z.object({
    name: z.string().min(2),
    aspect: z.enum(['9:16', '16:9', '1:1']),
    duration_s: z.number().int().min(8).max(60),
    fps: z.number().int().min(24).max(30).default(30)
  }),
  product: z.object({
    name: z.string().min(2),
    brand_colors: z.array(z.string().regex(/^#?[0-9A-Fa-f]{6}$/)).min(1),
    logo_url: z.string().url().optional()
  }),
  cta: z.object({
    headline: z.string().min(2),
    button_text: z.string().default('Shop Now')
  }),
  audio: z.object({
    mode: z.enum(['music', 'voiceover', 'both']).default('music'),
    music_bpm: z.number().min(60).max(180).optional()
  }),
  scenes: z.array(SceneSchema).min(1)
});

// lib/preflight/lint.ts
export function lintPrompt(brief: AdBrief): LintIssue[] {
  const issues: LintIssue[] = [];
  
  // Check scene continuity
  const sorted = brief.scenes.sort((a, b) => a.start_s - b.start_s);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].end_s !== sorted[i + 1].start_s) {
      issues.push({
        level: 'block',
        code: 'scene_gap',
        message: `Gap between scene ${i} and ${i+1}`
      });
    }
  }
  
  // Check total duration
  const totalDuration = sorted[sorted.length - 1].end_s;
  if (totalDuration !== brief.project.duration_s) {
    issues.push({
      level: 'block',
      code: 'duration_mismatch',
      message: `Scenes total ${totalDuration}s but project is ${brief.project.duration_s}s`
    });
  }
  
  // Check provider feasibility
  brief.scenes.forEach((scene, idx) => {
    if (scene.provider_hint === 'omniverse' && !brief.assets?.usd_scene) {
      issues.push({
        level: 'warn',
        code: 'missing_usd',
        message: `Scene ${idx} wants Omniverse but no USD scene provided`,
        fix: 'Switch to t2v or upload USD'
      });
    }
  });
  
  return issues;
}

// lib/preflight/score.ts (optional LLM rubric)
export async function scorePrompt(brief: AdBrief): Promise<number> {
  // Call OpenAI GPT-4 to score on:
  // - Ambiguity (lower better)
  // - Specificity (higher better)
  // - Cinematic grammar (camera/lighting cues)
  // - Temporal coherence (beats match duration)
  // Return weighted score 0-100
  return 85; // stub
}
```

**API Route:**
```typescript
// app/api/preflight/route.ts
export async function POST(req: Request) {
  const input = await req.json();
  
  const parsed = AdBriefSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ 
      ok: false, 
      errors: parsed.error.issues 
    }, { status: 400 });
  }
  
  const brief = parsed.data;
  const lintIssues = lintPrompt(brief);
  const blocked = lintIssues.filter(i => i.level === 'block');
  
  if (blocked.length > 0) {
    return Response.json({ 
      ok: false, 
      must_fix: blocked,
      could_improve: lintIssues.filter(i => i.level === 'warn')
    });
  }
  
  const score = await scorePrompt(brief);
  
  return Response.json({
    ok: score >= 80,
    score,
    normalizedBrief: brief,
    suggestions: lintIssues.map(i => i.fix).filter(Boolean)
  });
}
```

---

### 2. Provider Abstraction Layer

**Purpose:** Uniform interface for Replicate, Omniverse, Cosmos

```typescript
// lib/providers/interface.ts
export interface Scene {
  id: string;
  type: 'packshot' | 'lifestyle' | 'montage' | 'endcard';
  duration: number;
  prompt: string;
  provider_hint?: 'omniverse' | 'cosmos' | 't2v';
  // ... other fields
}

export interface GenerationResult {
  success: boolean;
  outputPath?: string;
  costCents?: number;
  latencyMs?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Provider {
  name: string;
  generate(scene: Scene, brief: AdBrief): Promise<GenerationResult>;
  getStatus?(jobId: string): Promise<'queued' | 'running' | 'succeeded' | 'failed'>;
  cancel?(jobId: string): Promise<void>;
}

// lib/providers/replicate.ts
import Replicate from 'replicate';

export class ReplicateProvider implements Provider {
  name = 'replicate';
  private client: Replicate;
  
  constructor(apiKey: string) {
    this.client = new Replicate({ auth: apiKey });
  }
  
  async generate(scene: Scene, brief: AdBrief): Promise<GenerationResult> {
    const startTime = Date.now();
    
    try {
      const prediction = await this.client.predictions.create({
        model: 'thudm/cogvideox-t2v',
        input: {
          prompt: scene.prompt,
          duration: scene.duration,
          fps: brief.project.fps,
          aspect_ratio: brief.project.aspect
        }
      });
      
      // Poll until complete (or use webhook)
      let result = await this.client.predictions.get(prediction.id);
      while (result.status === 'starting' || result.status === 'processing') {
        await new Promise(r => setTimeout(r, 2000));
        result = await this.client.predictions.get(prediction.id);
      }
      
      if (result.status === 'succeeded') {
        const videoUrl = result.output;
        const localPath = await this.downloadVideo(videoUrl, scene.id);
        
        return {
          success: true,
          outputPath: localPath,
          costCents: this.estimateCost(scene.duration),
          latencyMs: Date.now() - startTime,
          metadata: { predictionId: prediction.id }
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    }
  }
  
  private async downloadVideo(url: string, sceneId: string): Promise<string> {
    // Download to temp, then upload to S3, return S3 URL
    // ... implementation
    return `s3://bucket/jobs/${sceneId}/video.mp4`;
  }
  
  private estimateCost(durationSec: number): number {
    // CogVideoX ~$0.05/sec
    return Math.ceil(durationSec * 5); // cents
  }
}

// lib/providers/omniverse.ts
export class OmniverseProvider implements Provider {
  name = 'omniverse';
  private ec2Endpoint: string;
  
  constructor(endpoint: string) {
    this.ec2Endpoint = endpoint; // e.g., http://3.85.123.45:8080
  }
  
  async generate(scene: Scene, brief: AdBrief): Promise<GenerationResult> {
    const startTime = Date.now();
    
    // Build scene recipe from brief
    const recipe = this.buildSceneRecipe(scene, brief);
    
    try {
      const response = await fetch(`${this.ec2Endpoint}/render/omniverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usd_content: recipe.usd,
          frames: scene.duration * brief.project.fps
        })
      });
      
      const result = await response.json();
      
      if (result.job_id) {
        // Wait for completion or poll status endpoint
        const outputPath = await this.pollJobCompletion(result.job_id);
        
        return {
          success: true,
          outputPath,
          costCents: this.estimateCost(scene.duration), // EC2 hourly rate
          latencyMs: Date.now() - startTime,
          metadata: { jobId: result.job_id }
        };
      } else {
        return { success: false, error: 'No job ID returned' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
  
  private buildSceneRecipe(scene: Scene, brief: AdBrief): any {
    // Convert scene intent into USD scene recipe
    // ... implementation
    return {
      usd: `#usda 1.0\n/* generated scene */`,
      camera: { /* ... */ },
      lighting: { /* ... */ }
    };
  }
  
  private estimateCost(durationSec: number): number {
    // g5.xlarge $1/hr, assume 10min render for 10s video
    const renderTimeMin = durationSec * 1.0;
    return Math.ceil((renderTimeMin / 60) * 100); // cents
  }
  
  private async pollJobCompletion(jobId: string): Promise<string> {
    // Poll EC2 endpoint until render complete
    // ... implementation
    return `s3://bucket/jobs/${jobId}/video.mp4`;
  }
}

// lib/providers/cosmos.ts (stub)
export class CosmosProvider implements Provider {
  name = 'cosmos';
  // Similar structure to Replicate
  // Calls NGC API or local NIM
}

// lib/providers/router.ts
export function selectProvider(scene: Scene, brief: AdBrief): Provider {
  if (scene.provider_hint === 'omniverse') {
    return new OmniverseProvider(process.env.EC2_RENDER_ENDPOINT!);
  }
  if (scene.provider_hint === 'cosmos' && brief.assets?.controls) {
    return new CosmosProvider(process.env.NGC_API_KEY!);
  }
  // Default to Replicate
  return new ReplicateProvider(process.env.REPLICATE_API_TOKEN!);
}
```

---

### 3. Job Orchestration (BullMQ)

```typescript
// lib/queue/generation.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null
});

export const generationQueue = new Queue('generation', { connection });

export interface GenerationJob {
  jobId: string;
  brief: AdBrief;
  sceneIds: string[];
}

export async function enqueueGeneration(brief: AdBrief): Promise<string> {
  const jobId = `gen_${Date.now()}`;
  
  await generationQueue.add('generate-scenes', {
    jobId,
    brief,
    sceneIds: brief.scenes.map(s => s.id)
  });
  
  return jobId;
}

// Worker (runs in separate process or serverless function)
export const generationWorker = new Worker('generation', async (job) => {
  const { jobId, brief, sceneIds } = job.data;
  
  // Update DB: status = 'running'
  await prisma.generation.update({
    where: { id: jobId },
    data: { status: 'running' }
  });
  
  const results: GenerationResult[] = [];
  
  for (const sceneId of sceneIds) {
    const scene = brief.scenes.find(s => s.id === sceneId)!;
    const provider = selectProvider(scene, brief);
    
    const result = await provider.generate(scene, brief);
    results.push(result);
    
    if (!result.success) {
      // Mark job as failed, stop processing
      await prisma.generation.update({
        where: { id: jobId },
        data: { 
          status: 'failed',
          error: result.error
        }
      });
      throw new Error(result.error);
    }
  }
  
  // All scenes done, now compose
  const finalVideoPath = await composeScenes(results, brief);
  
  // Update DB: status = 'succeeded'
  await prisma.generation.update({
    where: { id: jobId },
    data: {
      status: 'succeeded',
      outputPath: finalVideoPath,
      completedAt: new Date()
    }
  });
  
  // Trigger metrics worker
  await metricsQueue.add('compute-metrics', { jobId, videoPath: finalVideoPath });
  
  return { success: true, outputPath: finalVideoPath };
}, { connection });
```

---

### 4. Composition Engine (FFmpeg)

```typescript
// lib/compose/ffmpeg.ts
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';

export interface CompositionConfig {
  scenes: Array<{ path: string; duration: number }>;
  overlays: {
    logo?: { path: string; position: 'top-right' | 'top-left' };
    cta?: { text: string; position: 'lower-third' };
    price?: { text: string; position: 'bottom-center' };
  };
  audio?: {
    path: string;
    beats?: number[]; // timestamps for cuts
  };
  aspect: '9:16' | '16:9' | '1:1';
  fps: number;
}

export async function composeScenes(
  sceneResults: GenerationResult[],
  brief: AdBrief
): Promise<string> {
  const outputPath = `/tmp/composed_${Date.now()}.mp4`;
  
  // 1. Concatenate scene videos
  const concatList = sceneResults.map(r => `file '${r.outputPath}'`).join('\n');
  const concatListPath = '/tmp/concat.txt';
  await fs.writeFile(concatListPath, concatList);
  
  const tempConcat = '/tmp/concat_output.mp4';
  
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-c copy' // fast concat without re-encode
      ])
      .output(tempConcat)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
  
  // 2. Add overlays
  const command = ffmpeg(tempConcat);
  
  // Logo overlay
  if (brief.product.logo_url) {
    const logoPath = await downloadAsset(brief.product.logo_url);
    command.input(logoPath);
    // Complex filter for overlay (top-right, 10% size)
    command.complexFilter([
      '[1:v]scale=iw*0.1:-1[logo]',
      '[0:v][logo]overlay=W-w-20:20'
    ]);
  }
  
  // Text overlays (CTA, price)
  const filters = [];
  if (brief.cta.headline) {
    // Drawtext filter for CTA at bottom third
    filters.push(
      `drawtext=text='${brief.cta.headline}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h-th-100`
    );
  }
  
  // 3. Audio mix (if provided)
  if (brief.audio?.audio_url) {
    const audioPath = await downloadAsset(brief.audio.audio_url);
    command.input(audioPath);
    command.outputOptions([
      '-shortest', // trim audio to video length
      '-c:a aac',
      '-b:a 192k'
    ]);
  }
  
  // 4. Final encode
  command
    .outputOptions([
      '-c:v libx264',
      '-preset veryfast',
      '-crf 23',
      '-pix_fmt yuv420p',
      `-r ${brief.project.fps}`
    ])
    .output(outputPath);
  
  await new Promise((resolve, reject) => {
    command
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
  
  // 5. Upload to S3 and return URL
  const s3Url = await uploadToS3(outputPath, `final/${Date.now()}.mp4`);
  
  return s3Url;
}
```

---

## Data Models

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Generation {
  id           String   @id @default(cuid())
  
  // Input
  provider     String   // 'replicate', 'omniverse', 'cosmos'
  modelSlug    String?
  promptJson   Json     // Full AdBrief
  
  // Status
  status       String   // 'queued', 'running', 'succeeded', 'failed'
  error        String?
  
  // Output
  outputPath   String?
  costCents    Int?
  latencyMs    Int?
  
  // Timestamps
  createdAt    DateTime @default(now())
  completedAt  DateTime?
  
  // Relations
  metrics      AutoMetric?
  ratings      Rating[]
  
  @@index([status, createdAt])
}

model AutoMetric {
  id            String @id @default(cuid())
  generationId  String @unique
  generation    Generation @relation(fields: [generationId], references: [id])
  
  // CLIPScore (text-image alignment per frame)
  clipscoreMean Float
  clipscoreMin  Float
  clipscoreStd  Float
  
  // LAION Aesthetic (overall visual quality)
  aestheticMean Float
  aestheticStd  Float
  
  // Temporal stability
  ssimMean      Float  // Inter-frame similarity
  lpipsMean     Float  // Perceptual distance
  flowJitter    Float  // Optical flow consistency
  
  // Optional
  fvd           Float? // Frechet Video Distance
  
  createdAt     DateTime @default(now())
}

model Rating {
  id           String @id @default(cuid())
  generationId String
  generation   Generation @relation(fields: [generationId], references: [id])
  
  reviewer     String  // email or user ID
  overall      Int     // 1-5
  pass         Boolean
  
  // VBench-style tags
  tags         String[] // ["off_prompt", "flicker", "identity_drift", ...]
  notes        String?
  
  createdAt    DateTime @default(now())
  
  @@index([generationId])
}

model Asset {
  id        String @id @default(cuid())
  type      String // 'logo', 'reference_image', 'audio'
  url       String
  userId    String?
  createdAt DateTime @default(now())
}
```

---

## Development Stages

### Stage 0: Foundation (P0 - Critical Path)

**Goal:** Project scaffolding and core infrastructure

**Tasks:**
- [ ] Initialize Next.js 14 project with TypeScript + Tailwind
- [ ] Setup Vercel deployment (connect repo)
- [ ] Provision Neon Postgres database
- [ ] Setup Upstash Redis (serverless)
- [ ] Create Prisma schema and initial migration
- [ ] Setup environment variables (.env.local, Vercel secrets)
- [ ] Configure AWS S3 or Cloudflare R2 bucket
- [ ] Create basic API route structure
- [ ] Setup Sentry error tracking

**Deliverables:**
- Deployed skeleton app at `your-app.vercel.app`
- Database tables created
- S3/R2 bucket accessible
- Health check endpoint working

**Team Split:**
- Person A: Next.js setup, Vercel deploy
- Person B: Database schema, Prisma
- Person C: AWS/R2 setup, environment config
- Person D: Error tracking, logging

---

### Stage 1: Core Generation Pipeline (P0 - Critical Path)

**Goal:** End-to-end Replicate-only generation working

**Tasks:**
- [ ] Implement AdBrief Zod schema
- [ ] Build preflight lint rules (completeness, scene continuity, caps)
- [ ] Create Replicate provider class
- [ ] Setup BullMQ worker for job processing
- [ ] Implement webhook handler for Replicate callbacks
- [ ] Add video download and S3 upload logic
- [ ] Create basic composition (FFmpeg stitch without overlays)
- [ ] Build status polling API route
- [ ] Wire up database writes (generation status tracking)
- [ ] Test E2E: submit brief → generate 1 scene → download

**Deliverables:**
- `/api/preflight` working
- `/api/generate` creates jobs
- `/api/webhook/replicate` processes callbacks
- First test video generated and stored

**Team Split:**
- Person A: Zod schema, preflight UI
- Person B: Replicate provider, webhooks, queue worker
- Person C: FFmpeg composition script
- Person D: Integration testing, database writes

---

### Stage 2: MVP Features (P0 - Critical Path)

**Goal:** Usable web interface for creating ads

**Tasks:**
- [ ] Build prompt builder UI (form with scene editor)
- [ ] Implement brand asset uploader (logo, colors)
- [ ] Create CTA/overlay configuration form
- [ ] Build gallery page with status cards
- [ ] Add video player component
- [ ] Implement cost tracking and display
- [ ] Add beat detection (basic onset detection)
- [ ] Wire FFmpeg overlays (logo, text, CTA)
- [ ] Create download button with signed URLs
- [ ] Generate 2 sample ads (1 vertical 9:16, 1 horizontal 16:9)
- [ ] Write basic README with setup instructions

**Deliverables:**
- Functional UI for ad creation
- Logo/CTA overlays working
- Gallery with playback and download
- 2 polished sample ads

**Team Split:**
- Person A: Full frontend (prompt builder, gallery, player)
- Person B: FFmpeg overlay logic, beat detection
- Person C: S3 signed URLs, download flow
- Person D: Sample ad generation, cost tracking display

---

### Stage 3: AWS GPU Integration (P1 - High Value)

**Goal:** Omniverse rendering for hero shots

**Tasks:**
- [ ] Provision AWS EC2 g5.xlarge instance
- [ ] Install NVIDIA drivers, CUDA, Docker
- [ ] Setup Omniverse Kit container
- [ ] Configure Replicator for depth/seg export
- [ ] Create Flask or Node API wrapper on EC2
- [ ] Implement OmniverseProvider class
- [ ] Build scene recipe generator (intent → USD)
- [ ] Add provider routing logic (packshot → Omniverse)
- [ ] Create sample USD packshot scene
- [ ] Test E2E: web app → EC2 render → S3 upload
- [ ] Document EC2 setup and costs

**Deliverables:**
- EC2 instance operational
- Omniverse renders working
- At least 1 sample ad with Omniverse packshot
- Setup documentation

**Team Split:**
- Person C: EC2 setup, Omniverse Docker, API wrapper (primary)
- Person B: OmniverseProvider class, routing logic
- Person A: UI for provider selection hints
- Person D: Integration testing, sample scenes

---

### Stage 4: HITL & Metrics (P1 - High Value)

**Goal:** Automated quality scoring and human review

**Tasks:**
- [ ] Create auto-metrics worker (separate process)
- [ ] Implement CLIPScore computation (sampled frames)
- [ ] Add LAION aesthetic predictor
- [ ] Calculate SSIM/LPIPS for temporal stability
- [ ] Compute flow jitter (optical flow consistency)
- [ ] Build reviewer UI in gallery (rating, tags, notes)
- [ ] Add metrics display in gallery cards
- [ ] Create cost analysis dashboard
- [ ] Implement quality gating in preflight (warn if predicted low)
- [ ] Generate dataset export (prompts + metrics + ratings)

**Deliverables:**
- Auto-metrics computed for every generation
- Reviewer panel functional
- Metrics chips in gallery
- Cost breakdown per generation

**Team Split:**
- Person B: Metrics worker (CLIPScore, aesthetic, SSIM)
- Person A: Reviewer UI, metrics display
- Person D: Cost dashboard, dataset export
- Person C: Quality gating logic

---

### Stage 5: Advanced Composition (P1 - High Value)

**Goal:** Professional polish and variations

**Tasks:**
- [ ] Implement batch generation (3 variants from one brief)
- [ ] Add aspect ratio family generator (9:16, 16:9, 1:1)
- [ ] Create LUT preset system (color grading)
- [ ] Build advanced text overlay system (keyframe timing)
- [ ] Implement VO timing alignment (word → overlay sync)
- [ ] Create end card templates
- [ ] Add transition effects (fade, wipe, push)
- [ ] Implement speed ramping for emphasis
- [ ] Add audio ducking for VO

**Deliverables:**
- Batch generation working
- Multi-aspect from single brief
- Professional text overlays
- End card templates

**Team Split:**
- Person A: Batch UI, aspect controls
- Person B: FFmpeg advanced filters, LUTs
- Person C: VO alignment, audio processing
- Person D: End card templates, transitions

---

### Stage 6: Cosmos Integration (P2 - Stretch Goal)

**Goal:** Structure-guided generation with Cosmos

**Tasks:**
- [ ] Obtain NGC API key and test Cosmos access
- [ ] Setup Cosmos NIM on EC2 (if hosted API unavailable)
- [ ] Build CosmosProvider class
- [ ] Create controls pipeline (Omniverse seg/depth → Cosmos)
- [ ] Implement transfer request builder
- [ ] Add provider routing for structure-guided scenes
- [ ] Test photoreal variant generation
- [ ] (Optional) Implement FG/BG compositing with depth
- [ ] Generate sample ad using all 3 providers

**Deliverables:**
- Cosmos provider operational (API or NIM)
- At least 1 sample ad with Omniverse → Cosmos flow
- Documentation of controls pipeline

**Team Split:**
- Person C: Cosmos setup (NGC/NIM), EC2 config (primary)
- Person B: CosmosProvider class, controls builder
- Person A: UI for controls upload/preview
- Person D: Integration testing, sample generation

---

### Stage 7: Polish & Optimization (P2 - Stretch Goal)

**Goal:** Performance and reliability improvements

**Tasks:**
- [ ] Implement I/P-frame strategy (keyframe density controls)
- [ ] Add RIFE interpolation for frame expansion
- [ ] Build seam QC (flow jump + SSIM checks)
- [ ] Implement automatic fallback logic (Cosmos→T2V if controls missing)
- [ ] Add caching layer (reuse intros/outros/brand assets)
- [ ] Optimize parallel job processing (multiple scenes at once)
- [ ] Improve error recovery and retry logic
- [ ] Add rate limiting and abuse prevention
- [ ] Implement cost budget caps per user/project
- [ ] Load testing and performance tuning

**Deliverables:**
- I/P-frame mode functional
- Seam QC with fallbacks
- Caching reduces redundant generations
- System handles concurrent jobs reliably

**Team Split:**
- Person B: I/P-frame engine, RIFE integration
- Person C: Seam QC, fallback logic
- Person D: Caching, rate limiting
- Person A: UI for advanced controls

---

### Stage 8: Demo & Submission (P0 - Critical Path)

**Goal:** Competition-ready deliverables

**Tasks:**
- [ ] Generate 3 final polished ad samples
- [ ] Record 5-7 minute demo video (screen capture + narration)
- [ ] Write comprehensive README (setup, architecture, costs)
- [ ] Create architecture diagrams (Mermaid or draw.io)
- [ ] Write technical deep dive document (answer judging questions)
- [ ] Setup public URL with test credentials
- [ ] Add rate limiting for demo traffic
- [ ] Test submission requirements checklist
- [ ] Create GitHub release with tagged version
- [ ] Submit before deadline

**Deliverables:**
- 3 ads (1 vertical, 1 with overlays/CTA, 1 style-divergent)
- Demo video uploaded
- README with diagrams and cost analysis
- Technical deep dive
- Public URL live

**Team Split:**
- Person A: Demo video recording, README
- Person B: Technical deep dive, architecture diagrams
- Person C: Rate limiting, public URL setup
- Person D: Sample generation, submission checklist

---

## Team Coordination

### Suggested Workflow

**Daily Standup (15 min):**
- What did you ship yesterday?
- What are you shipping today?
- Any blockers?

**Tools:**
- **GitHub Projects:** Kanban board with Stage columns
- **Discord/Slack:** Async communication
- **Vercel Preview:** Deploy every PR for team review
- **Shared Docs:** Architecture decisions, API contracts

### Parallel Work Strategy

**Day 1-2 (Stage 0-1):**
- Person A + Person B: Core pipeline (preflight, generation, queue)
- Person C: AWS setup (begin EC2 provisioning)
- Person D: Testing harness, seed data

**Day 3-5 (Stage 2-3):**
- Person A: Frontend sprint (builder, gallery)
- Person B + Person C: AWS integration (Omniverse)
- Person D: Sample generation, cost tracking

**Day 6-8 (Stage 4-5):**
- Person A + Person D: HITL UI + metrics display
- Person B: Advanced composition (overlays, LUTs)
- Person C: Cosmos setup (if pursuing)

**Day 9-10 (Stage 8):**
- Person A: Demo video
- Person B: Technical docs
- Person C: Deployment polish
- Person D: Sample ads, submission

---

## Risk Mitigation

### Technical Risks

**Risk:** Cosmos API unavailable  
**Mitigation:** Make it fully optional; Replicate + Omniverse is already strong

**Risk:** Omniverse learning curve too steep  
**Mitigation:** Start with simple packshot scene; Person C focuses on this early

**Risk:** FFmpeg composition bugs  
**Mitigation:** Write unit tests for each overlay type; test on multiple aspect ratios

**Risk:** Cost overruns during development  
**Mitigation:** Enforce budget caps; use draft mode by default; monitor daily spend

### Timeline Risks

**Risk:** 10 days is aggressive  
**Mitigation:** P0 tasks only for first 7 days; P1/P2 are stretch goals

**Risk:** Integration delays between team members  
**Mitigation:** Define API contracts early; use feature flags; deploy often

**Risk:** Last-minute submission issues  
**Mitigation:** Freeze code 24h before deadline; reserve Day 10 for polish only

---

## Success Criteria

**Must-Have (P0):**
- [ ] Web app deployed and accessible via URL
- [ ] Replicate T2V/I2V generation working E2E
- [ ] Preflight validation prevents bad prompts
- [ ] 3 sample ads meeting competition specs
- [ ] Cost tracking visible in UI
- [ ] Demo video uploaded
- [ ] README + technical deep dive complete

**Should-Have (P1):**
- [ ] Omniverse packshot rendering operational
- [ ] HITL review panel with auto-metrics
- [ ] Batch generation (variants)
- [ ] Beat-aligned cuts

**Nice-to-Have (P2):**
- [ ] Cosmos integration
- [ ] I/P-frame optimization
- [ ] Advanced overlays and LUTs

---

## Appendix: Key Decision Log

**Why Next.js over Electron?**
- Cloud-first architecture (GPU, storage)
- Faster iteration (deploy in seconds)
- Judge accessibility (URL vs install)

**Why Replicate over self-hosted?**
- Faster time-to-MVP
- No model management overhead
- Competitive pricing for competition timeline

**Why Omniverse + Cosmos as P1/P2?**
- Differentiation ("deterministic + generative")
- Demonstrates technical depth
- Not required for competitive MVP

**Why BullMQ over AWS Step Functions?**
- Simpler for team (Node.js vs AWS config)
- Good enough for demo scale
- Can migrate later if needed

---

## Next Steps

1. **Review this architecture** with full team
2. **Assign Stage 0 tasks** and create GitHub issues
3. **Setup communication channels** (Discord, GitHub Projects)
4. **Provision infrastructure** (Vercel, Neon, Upstash, AWS)
5. **Begin Stage 0** immediately

Good luck building! 🚀

