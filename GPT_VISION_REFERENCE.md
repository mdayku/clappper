# GPT-4 Vision Implementation Reference

This document shows how we use GPT-4 Vision for roof damage cost estimation and room identification.

## Key Files

1. **`electron/main.ts`** - Main IPC handlers (lines 2129-2345)
2. **`src/components/DamageDetector.tsx`** - Cost estimation UI
3. **`src/components/RoomDetection.tsx`** - Room identification UI

## Pattern Overview

### 1. Rate Limiting (10 calls/minute)

```typescript
// Check rate limit before API call
const rateLimit = checkRateLimit()
if (!rateLimit.allowed) {
  return {
    success: false,
    error: `Rate limit exceeded. Wait ${rateLimit.resetInSeconds}s`
  }
}
```

### 2. API Key Management

```typescript
// Load API key from config or environment
const config = await loadConfig()
const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY
if (!apiKey) {
  return {
    success: false,
    error: 'OpenAI API key not configured'
  }
}
```

### 3. Image Encoding

**IMPORTANT:** We send **ANNOTATED images** (with YOLO-drawn bounding boxes) to GPT-4 Vision, not raw images!

```typescript
// Handle base64 (annotated) or file path (raw)
let imageBase64: string
if (isBase64) {
  // Annotated image with visible bounding boxes (PREFERRED)
  imageBase64 = imagePathOrBase64
  console.log('[ROOM IDENTIFICATION] Using annotated image with visible bounding boxes')
} else {
  // Raw image from file path
  const imageBuffer = await fs.promises.readFile(imagePathOrBase64)
  imageBase64 = imageBuffer.toString('base64')
  console.log('[ROOM IDENTIFICATION] Using raw image from file path')
}
```

**Why annotated images?**
- GPT can SEE the detection boxes, not just read coordinates
- Better spatial understanding of room/damage locations
- More accurate estimates with visual context
- More confident identifications

### 4. API Call Structure

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`
            }
          }
        ]
      }
    ],
    max_tokens: 4096,
    temperature: 0.3
  })
})
```

### 5. Response Handling

```typescript
// Record API call for rate limiting
recordApiCall()

const data = await response.json()
let content = data.choices[0].message.content

// Track token usage
if (data.usage) {
  await incrementUsageStats({
    prompt: data.usage.prompt_tokens || 0,
    completion: data.usage.completion_tokens || 0,
    total: data.usage.total_tokens || 0
  })
}

// Extract JSON from markdown code blocks
if (content.includes('```json')) {
  content = content.split('```json')[1].split('```')[0].trim()
} else if (content.includes('```')) {
  content = content.split('```')[1].split('```')[0].trim()
}

const parsedData = JSON.parse(content)
```

## Example Prompts

### Room Identification Prompt

```
You are analyzing a floor plan image with detected room boundaries. The image shows colored bounding boxes around each detected room - you can see these boxes visually in the image.

Detected Rooms:
Room 1 (ID: room_abc123): Bounding box at [100, 200, 300, 400]
Room 2 (ID: room_def456): Bounding box at [320, 200, 500, 400]

For each room, analyze its:
- Shape and proportions
- Location relative to other rooms
- Typical fixtures or features visible
- Common architectural patterns

Identify the room type for each detected room. Common types include: kitchen, bathroom, bedroom, living room, dining room, hallway, closet, laundry room, garage, office, etc.

IMPORTANT: If you cannot confidently identify a room type (e.g., the room is unclear, too small, or lacks distinguishing features), use "unknown" as the room type. Only provide specific room types when you have reasonable confidence.

Respond ONLY with valid JSON in this exact format:
{
  "room_labels": {
    "room_abc123": "master bedroom",
    "room_def456": "full bathroom"
  }
}

Use the actual room IDs provided above. Be specific with room types when confident (e.g., "master bedroom" vs "bedroom", "powder room" vs "full bathroom"), but use "unknown" when uncertain.
```

### Cost Estimation Prompt

```
You are an experienced roofing contractor. Analyze this roof damage image. The image shows damage areas marked with colored bounding boxes - you can see these boxes visually overlaid on the roof.

Detection 1: Class=missing_shingle, Confidence=0.89, BBox=[...]
Detection 2: Class=crack, Confidence=0.76, BBox=[...]

Based on the visual damage and detection data, estimate repair costs in USD. Consider:
- Labor costs (typical hourly rate for roofing professionals)
- Materials (shingles, underlayment, flashing, nails, etc.)
- Disposal fees (for old/damaged materials)
- 10% contingency buffer for unforeseen work

Respond ONLY with valid JSON in this format:
{
  "labor_usd": 500,
  "materials_usd": 350,
  "disposal_usd": 100,
  "contingency_usd": 95,
  "total_usd": 1045,
  "assumptions": "Assumes X square feet of affected area, Y hours of labor at $Z/hour..."
}

Be realistic and conservative in your estimates. This is a demo, but should be plausible.
```

## Key Insights

1. **Temperature**: We use `0.3` for more consistent, factual responses
2. **Max Tokens**: `4096` allows for detailed analysis (cost doesn't matter for demos)
3. **JSON Extraction**: Always try to extract from markdown blocks before parsing
4. **Error Handling**: Gracefully handle rate limits, missing keys, and parsing errors
5. **"Unknown" Values**: Encourage model to admit uncertainty rather than guess

## Usage Stats Tracking

```typescript
interface UsageStats {
  total_calls: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_tokens: number
  first_call: string | null
  last_call: string | null
}
```

Track everything for demo insights and cost monitoring!

## Full Implementation

See `electron/main.ts` lines:
- **Room Identification**: 2129-2256
- **Damage Cost Estimation**: 2258-2345
- **Helper Functions**: 1967-2014 (rate limiting, usage tracking)

