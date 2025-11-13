# AI Video Pipeline - Architecture Diagrams

This document contains Mermaid diagrams for the AI video generation pipeline. You can render these in GitHub, VS Code (with Mermaid extension), or any Mermaid-compatible viewer.

---

## 1. System Architecture (High-Level)

```mermaid
graph TB
    subgraph "Frontend (Next.js + React)"
        A[Prompt Builder UI]
        B[Brand Asset Manager]
        C[Gallery & Player]
        D[HITL Review Panel]
    end
    
    subgraph "Backend (Next.js API Routes)"
        E[/api/preflight]
        F[/api/generate]
        G[/api/webhook/*]
        H[/api/status/:id]
        I[/api/compose]
        J[/api/metrics]
    end
    
    subgraph "Job Queue"
        K[BullMQ Worker]
        L[Upstash Redis]
    end
    
    subgraph "Providers"
        M[Replicate API<br/>CogVideoX, SVD]
        N[AWS EC2<br/>Omniverse Kit]
        O[Cosmos API/NIM]
    end
    
    subgraph "Storage & Database"
        P[Neon Postgres]
        Q[S3/R2 Storage]
    end
    
    A --> E
    A --> F
    C --> H
    D --> J
    
    E --> P
    F --> K
    G --> P
    
    K --> M
    K --> N
    K --> O
    K --> I
    
    M --> Q
    N --> Q
    O --> Q
    
    I --> Q
    J --> P
    
    style M fill:#e1f5ff
    style N fill:#fff4e1
    style O fill:#f0e1ff
    style P fill:#e8f5e9
    style Q fill:#fff3e0
```

---

## 2. Request Flow (Scene Generation)

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Preflight
    participant API
    participant Queue
    participant Provider
    participant Composer
    participant Storage
    participant Metrics
    
    User->>Frontend: Submit AdBrief
    Frontend->>Preflight: Validate prompt
    
    alt Validation Fails
        Preflight-->>Frontend: Return errors
        Frontend-->>User: Show must-fix issues
    else Validation Passes
        Preflight->>API: Normalized brief
        API->>Queue: Enqueue job
        Queue-->>Frontend: Return job ID
        Frontend-->>User: Show status: queued
        
        loop For each scene
            Queue->>Provider: Generate scene
            Provider->>Storage: Upload video
            Provider-->>Queue: Scene complete
        end
        
        Queue->>Composer: Stitch + overlays
        Composer->>Storage: Upload final video
        Composer-->>Queue: Composition complete
        
        Queue->>Metrics: Compute scores
        Metrics->>Storage: Store metrics
        Metrics-->>Queue: Metrics complete
        
        Queue-->>Frontend: Job succeeded
        Frontend-->>User: Show video player
    end
```

---

## 3. Provider Selection Logic

```mermaid
flowchart TD
    Start[Scene Input] --> CheckHint{Provider<br/>hint set?}
    
    CheckHint -->|Yes: omniverse| CheckUSD{USD scene<br/>available?}
    CheckHint -->|Yes: cosmos| CheckControls{Structure<br/>controls available?}
    CheckHint -->|No/auto| CheckType{Scene type?}
    
    CheckUSD -->|Yes| UseOmni[Use Omniverse Provider]
    CheckUSD -->|No| Fallback1[Warn & fallback to T2V]
    
    CheckControls -->|Yes| UseCosmos[Use Cosmos Provider]
    CheckControls -->|No| Fallback2[Warn & fallback to T2V]
    
    CheckType -->|packshot| CheckUSD2{USD available?}
    CheckType -->|endcard| CheckUSD2
    CheckType -->|lifestyle| CheckControls2{Controls available?}
    CheckType -->|montage| UseReplicate[Use Replicate Provider]
    
    CheckUSD2 -->|Yes| UseOmni
    CheckUSD2 -->|No| UseReplicate
    
    CheckControls2 -->|Yes| UseCosmos
    CheckControls2 -->|No| UseReplicate
    
    Fallback1 --> UseReplicate
    Fallback2 --> UseReplicate
    
    UseOmni --> End[Generate Scene]
    UseCosmos --> End
    UseReplicate --> End
    
    style UseOmni fill:#fff4e1
    style UseCosmos fill:#f0e1ff
    style UseReplicate fill:#e1f5ff
```

---

## 4. Database Schema (Entity Relationship)

```mermaid
erDiagram
    Generation ||--o| AutoMetric : has
    Generation ||--o{ Rating : receives
    
    Generation {
        string id PK
        string provider
        string modelSlug
        json promptJson
        string status
        string error
        string outputPath
        int costCents
        int latencyMs
        datetime createdAt
        datetime completedAt
    }
    
    AutoMetric {
        string id PK
        string generationId FK
        float clipscoreMean
        float clipscoreMin
        float clipscoreStd
        float aestheticMean
        float aestheticStd
        float ssimMean
        float lpipsMean
        float flowJitter
        float fvd
        datetime createdAt
    }
    
    Rating {
        string id PK
        string generationId FK
        string reviewer
        int overall
        boolean pass
        string[] tags
        string notes
        datetime createdAt
    }
    
    Asset {
        string id PK
        string type
        string url
        string userId
        datetime createdAt
    }
```

---

## 5. Composition Pipeline (FFmpeg)

```mermaid
flowchart LR
    subgraph Input
        S1[Scene 1 Video]
        S2[Scene 2 Video]
        S3[Scene 3 Video]
        Audio[Background Music]
        Logo[Logo Asset]
    end
    
    subgraph Processing
        Concat[Concatenate Scenes]
        Overlay[Apply Overlays]
        AudioMix[Mix Audio]
        Encode[Final Encode]
    end
    
    subgraph Overlays
        O1[Logo - Top Right]
        O2[CTA Text - Lower Third]
        O3[Price - Bottom Center]
    end
    
    subgraph Output
        Final[Final Video MP4]
        S3Storage[Upload to S3/R2]
    end
    
    S1 --> Concat
    S2 --> Concat
    S3 --> Concat
    
    Concat --> Overlay
    
    Logo --> O1
    O1 --> Overlay
    O2 --> Overlay
    O3 --> Overlay
    
    Overlay --> AudioMix
    Audio --> AudioMix
    
    AudioMix --> Encode
    Encode --> Final
    Final --> S3Storage
    
    style Concat fill:#e3f2fd
    style Overlay fill:#f3e5f5
    style AudioMix fill:#e8f5e9
    style Encode fill:#fff3e0
```

---

## 6. Preflight Validation Flow

```mermaid
flowchart TD
    Start[User Submits AdBrief] --> Schema{Zod Schema<br/>Validation}
    
    Schema -->|Fail| ReturnErrors[Return Schema Errors]
    Schema -->|Pass| Lint[Run Lint Rules]
    
    Lint --> CheckScenes{Scenes<br/>continuous?}
    Lint --> CheckDuration{Duration<br/>matches?}
    Lint --> CheckAssets{Required<br/>assets present?}
    
    CheckScenes -->|Gap found| Block1[Block: Scene Gap]
    CheckDuration -->|Mismatch| Block2[Block: Duration Error]
    CheckAssets -->|Missing| Warn1[Warn: Missing Assets]
    
    Block1 --> MustFix[Collect Must-Fix Issues]
    Block2 --> MustFix
    Warn1 --> Suggestions[Collect Suggestions]
    
    CheckScenes -->|OK| Score[LLM Rubric Scoring]
    CheckDuration -->|OK| Score
    CheckAssets -->|OK| Score
    
    MustFix --> HasBlocks{Any blocking<br/>issues?}
    
    HasBlocks -->|Yes| Reject[Reject: Show Fixes]
    HasBlocks -->|No| Score
    
    Score --> CheckScore{Score >= 80?}
    
    CheckScore -->|No| Warn[Warn: Low Quality Score]
    CheckScore -->|Yes| Accept[Accept & Normalize]
    
    Warn --> AllowOverride{User<br/>overrides?}
    AllowOverride -->|Yes| Accept
    AllowOverride -->|No| ReturnWarning[Return Warnings]
    
    Accept --> Queue[Enqueue Generation Job]
    
    ReturnErrors --> End[End]
    Reject --> End
    ReturnWarning --> End
    Queue --> End
    
    style Reject fill:#ffcdd2
    style Warn fill:#fff9c4
    style Accept fill:#c8e6c9
```

---

## 7. HITL & Metrics Pipeline

```mermaid
flowchart TB
    Start[Video Generated] --> AutoMetrics[Auto-Metrics Worker]
    
    AutoMetrics --> CLIP[CLIPScore<br/>Text-Image Alignment]
    AutoMetrics --> Aesthetic[LAION Aesthetic<br/>Visual Quality]
    AutoMetrics --> Temporal[Temporal Stability<br/>SSIM + LPIPS]
    AutoMetrics --> Flow[Flow Jitter<br/>Optical Flow]
    
    CLIP --> Store[Store in Database]
    Aesthetic --> Store
    Temporal --> Store
    Flow --> Store
    
    Store --> Display[Display in Gallery]
    
    Display --> Review{Human<br/>Review?}
    
    Review -->|Yes| Reviewer[Reviewer Panel]
    Review -->|No| Complete[Mark Complete]
    
    Reviewer --> Rate[1-5 Rating]
    Reviewer --> PassFail[Pass/Fail Flag]
    Reviewer --> Tags[Apply Tags<br/>off_prompt, flicker,<br/>identity_drift, etc.]
    Reviewer --> Notes[Written Notes]
    
    Rate --> SaveRating[Save Rating to DB]
    PassFail --> SaveRating
    Tags --> SaveRating
    Notes --> SaveRating
    
    SaveRating --> CheckQuality{Overall < 3<br/>OR unsafe tag?}
    
    CheckQuality -->|Yes| Flag[Flag for Regen]
    CheckQuality -->|No| Export[Export to Dataset]
    
    Flag --> Dataset[Training Dataset]
    Export --> Dataset
    
    Dataset --> Future[Future: Train<br/>Prompt→Success Model]
    
    style AutoMetrics fill:#e1f5ff
    style Reviewer fill:#fff4e1
    style Dataset fill:#e8f5e9
```

---

## 8. Development Stages (Priority & Dependencies)

```mermaid
graph TD
    subgraph "Stage 0: Foundation (P0)"
        S0A[Next.js Setup]
        S0B[Database Schema]
        S0C[AWS/R2 Config]
        S0D[Vercel Deploy]
    end
    
    subgraph "Stage 1: Core Pipeline (P0)"
        S1A[Zod Schema]
        S1B[Preflight Lint]
        S1C[Replicate Provider]
        S1D[BullMQ Queue]
        S1E[Webhooks]
        S1F[Basic Composition]
    end
    
    subgraph "Stage 2: MVP Features (P0)"
        S2A[Prompt Builder UI]
        S2B[Asset Uploader]
        S2C[Gallery & Player]
        S2D[Cost Tracking]
        S2E[Overlays: Logo/CTA]
        S2F[2 Sample Ads]
    end
    
    subgraph "Stage 3: AWS GPU (P1)"
        S3A[EC2 Setup]
        S3B[Omniverse Docker]
        S3C[Omniverse Provider]
        S3D[Scene Routing]
        S3E[USD Scene Creation]
    end
    
    subgraph "Stage 4: HITL & Metrics (P1)"
        S4A[Auto-Metrics Worker]
        S4B[Reviewer UI]
        S4C[Metrics Display]
        S4D[Dataset Export]
    end
    
    subgraph "Stage 5: Advanced Comp (P1)"
        S5A[Batch Generation]
        S5B[Multi-Aspect]
        S5C[LUTs & Color]
        S5D[VO Alignment]
    end
    
    subgraph "Stage 6: Cosmos (P2)"
        S6A[Cosmos Setup]
        S6B[Cosmos Provider]
        S6C[Controls Pipeline]
        S6D[3-Provider Sample]
    end
    
    subgraph "Stage 7: Polish (P2)"
        S7A[I/P-Frame Mode]
        S7B[RIFE Interpolation]
        S7C[Seam QC]
        S7D[Caching]
    end
    
    subgraph "Stage 8: Submission (P0)"
        S8A[3 Final Samples]
        S8B[Demo Video]
        S8C[README & Docs]
        S8D[Public URL]
    end
    
    S0A --> S1A
    S0B --> S1A
    S0C --> S1C
    S0D --> S1A
    
    S1A --> S1B
    S1B --> S1C
    S1C --> S1D
    S1D --> S1E
    S1E --> S1F
    
    S1F --> S2A
    S1F --> S2E
    S2A --> S2B
    S2B --> S2C
    S2E --> S2D
    
    S1D --> S3A
    S3A --> S3B
    S3B --> S3C
    S3C --> S3D
    S3D --> S3E
    
    S1E --> S4A
    S4A --> S4B
    S4B --> S4C
    S4C --> S4D
    
    S1F --> S5A
    S5A --> S5B
    S5B --> S5C
    S5C --> S5D
    
    S3E --> S6A
    S6A --> S6B
    S6B --> S6C
    S6C --> S6D
    
    S1D --> S7A
    S7A --> S7B
    S7B --> S7C
    S7C --> S7D
    
    S2F --> S8A
    S2C --> S8A
    S8A --> S8B
    S8B --> S8C
    S8C --> S8D
    
    style S0A fill:#ffebee
    style S1A fill:#e3f2fd
    style S2A fill:#e8f5e9
    style S3A fill:#fff3e0
    style S4A fill:#f3e5f5
    style S5A fill:#e0f2f1
    style S6A fill:#fce4ec
    style S7A fill:#f1f8e9
    style S8A fill:#c8e6c9
```

---

## 9. Cost Flow & Tracking

```mermaid
flowchart TB
    Start[User Submits Job] --> Estimate[Preflight Cost Estimate]
    
    Estimate --> Scene1[Scene 1: Replicate<br/>$0.25]
    Estimate --> Scene2[Scene 2: Omniverse<br/>$0.15]
    Estimate --> Scene3[Scene 3: Replicate<br/>$0.25]
    
    Scene1 --> Track1[Track: Provider API Cost]
    Scene2 --> Track2[Track: EC2 Runtime Cost]
    Scene3 --> Track3[Track: Provider API Cost]
    
    Track1 --> Compose[Composition<br/>Free: Local FFmpeg]
    Track2 --> Compose
    Track3 --> Compose
    
    Compose --> Storage[S3/R2 Storage<br/>$0.02/GB]
    
    Storage --> Metrics[Auto-Metrics<br/>Free: Compute included]
    
    Metrics --> Total[Total: $0.67]
    
    Total --> Display[Display in Gallery UI]
    Total --> Dashboard[Cost Dashboard<br/>Per-job, Per-day, Per-user]
    
    Dashboard --> Budget{Exceeds<br/>budget?}
    
    Budget -->|Yes| Alert[Alert User<br/>Block Future Jobs]
    Budget -->|No| Continue[Allow More Jobs]
    
    style Estimate fill:#fff9c4
    style Total fill:#c8e6c9
    style Alert fill:#ffcdd2
```

---

## 10. Team Parallel Workflow

```mermaid
gantt
    title 10-Day Development Timeline (Parallel Work)
    dateFormat  YYYY-MM-DD
    section Person A (Frontend)
    Stage 0: Foundation          :a1, 2024-01-01, 1d
    Stage 1: Preflight UI        :a2, 2024-01-02, 1d
    Stage 2: Prompt Builder      :a3, 2024-01-03, 2d
    Stage 2: Gallery & Player    :a4, 2024-01-05, 1d
    Stage 4: Reviewer UI         :a5, 2024-01-06, 2d
    Stage 8: Demo Video          :a6, 2024-01-09, 2d
    
    section Person B (Backend)
    Stage 0: Prisma Setup        :b1, 2024-01-01, 1d
    Stage 1: Replicate Provider  :b2, 2024-01-02, 2d
    Stage 1: Queue & Webhooks    :b3, 2024-01-04, 1d
    Stage 2: FFmpeg Composition  :b4, 2024-01-05, 2d
    Stage 4: Metrics Worker      :b5, 2024-01-07, 2d
    Stage 8: Tech Deep Dive      :b6, 2024-01-09, 2d
    
    section Person C (AWS/DevOps)
    Stage 0: AWS/R2 Setup        :c1, 2024-01-01, 1d
    Stage 3: EC2 Provision       :c2, 2024-01-02, 1d
    Stage 3: Omniverse Setup     :c3, 2024-01-03, 2d
    Stage 3: Omniverse Provider  :c4, 2024-01-05, 2d
    Stage 6: Cosmos Setup        :c5, 2024-01-07, 2d
    Stage 8: Public URL Setup    :c6, 2024-01-09, 2d
    
    section Person D (Testing/Integration)
    Stage 0: Testing Harness     :d1, 2024-01-01, 1d
    Stage 1: Integration Tests   :d2, 2024-01-02, 2d
    Stage 2: Cost Tracking       :d3, 2024-01-04, 1d
    Stage 2: Sample Generation   :d4, 2024-01-05, 2d
    Stage 4: Dataset Export      :d5, 2024-01-07, 2d
    Stage 8: Final Samples       :d6, 2024-01-09, 2d
```

---

## How to Use These Diagrams

### In GitHub
Simply view this markdown file - GitHub renders Mermaid automatically.

### In VS Code
1. Install "Markdown Preview Mermaid Support" extension
2. Open this file
3. Press `Ctrl+Shift+V` for preview

### Online Editors
- [Mermaid Live Editor](https://mermaid.live/)
- Copy any diagram code block and paste there

### In Documentation Sites
- These diagrams work in GitBook, Docusaurus, VitePress, etc.

### Export as Images
- Use Mermaid CLI: `mmdc -i ARCHITECTURE_DIAGRAMS.md -o diagrams/`
- Or use the Mermaid Live Editor export feature

---

## Diagram Summary

1. **System Architecture** - Overall component layout
2. **Request Flow** - End-to-end sequence for scene generation
3. **Provider Selection** - Decision tree for routing scenes
4. **Database Schema** - Entity relationships
5. **Composition Pipeline** - FFmpeg processing flow
6. **Preflight Validation** - Quality gating logic
7. **HITL & Metrics** - Review and scoring workflow
8. **Development Stages** - Task dependencies and priorities
9. **Cost Flow** - Budget tracking and alerts
10. **Team Workflow** - Parallel work Gantt chart

---

## Notes

- All diagrams are live-editable - update as architecture evolves
- Use `style` commands to color-code by priority or component type
- Export to PNG/SVG for presentations or pitch decks
- Keep diagrams in sync with `PIPELINE_ARCHITECTURE.md`

