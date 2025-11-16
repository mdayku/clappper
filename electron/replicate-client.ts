// Replicate API client for image-to-video generation
import https from 'https'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface ReplicateOptions {
  apiToken: string
}

interface PredictionInput {
  prompt?: string
  input_image?: string // base64 or URL
  image?: string // base64 or URL (alternative field name)
  [key: string]: any
}

interface Prediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string | string[] | null
  error?: string | null
  logs?: string
  metrics?: {
    predict_time?: number
  }
}

export class ReplicateClient {
  private apiToken: string
  private baseUrl = 'api.replicate.com'

  constructor(options: ReplicateOptions) {
    this.apiToken = options.apiToken
  }

  /**
   * Create a prediction (start video generation)
   */
  async createPrediction(model: string, input: PredictionInput): Promise<Prediction> {
    const data = JSON.stringify({
      version: model,
      input
    })

    const options = {
      hostname: this.baseUrl,
      path: '/v1/predictions',
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body))
            } catch (err) {
              reject(new Error(`Failed to parse response: ${err}`))
            }
          } else {
            reject(new Error(`Replicate API error: ${res.statusCode} - ${body}`))
          }
        })
      })

      req.on('error', reject)
      req.write(data)
      req.end()
    })
  }

  /**
   * Get prediction status
   */
  async getPrediction(predictionId: string): Promise<Prediction> {
    const options = {
      hostname: this.baseUrl,
      path: `/v1/predictions/${predictionId}`,
      method: 'GET',
      headers: {
        'Authorization': `Token ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body))
            } catch (err) {
              reject(new Error(`Failed to parse response: ${err}`))
            }
          } else {
            reject(new Error(`Replicate API error: ${res.statusCode} - ${body}`))
          }
        })
      })

      req.on('error', reject)
      req.end()
    })
  }

  /**
   * Poll prediction until completion
   */
  async waitForPrediction(
    predictionId: string,
    onProgress?: (status: string, logs?: string) => void,
    maxWaitMs: number = 600000 // 10 minutes default
  ): Promise<Prediction> {
    const startTime = Date.now()
    const pollInterval = 2000 // 2 seconds

    while (true) {
      const prediction = await this.getPrediction(predictionId)
      
      if (onProgress) {
        onProgress(prediction.status, prediction.logs)
      }

      if (prediction.status === 'succeeded') {
        return prediction
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(`Prediction ${prediction.status}: ${prediction.error || 'Unknown error'}`)
      }

      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Prediction timeout after ${maxWaitMs}ms`)
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  /**
   * Download video from URL to local file
   */
  async downloadVideo(url: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Follow redirect
          if (res.headers.location) {
            this.downloadVideo(res.headers.location, outputPath)
              .then(resolve)
              .catch(reject)
          } else {
            reject(new Error('Redirect without location header'))
          }
          return
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`))
          return
        }

        const file = fs.createWriteStream(outputPath)
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve(outputPath)
        })
        file.on('error', (err) => {
          fs.unlink(outputPath, () => {}) // Delete partial file
          reject(err)
        })
      }).on('error', reject)
    })
  }

  /**
   * Upscale video to 4K using Runway Upscale-v1
   * 
   * Upscale-v1 features:
   * - 4x resolution increase (capped at 4K)
   * - Temporal consistency (smooth between frames)
   * - Best for short videos (<30s)
   * - Works on any video resolution
   */
  async upscaleVideo(
    videoPath: string,
    outputDir: string,
    onProgress?: (status: string) => void
  ): Promise<string> {
    // Read video as base64 or use file URL
    // Note: For large videos, may need to use URL instead of base64
    const videoBuffer = fs.readFileSync(videoPath)
    const videoBase64 = `data:video/mp4;base64,${videoBuffer.toString('base64')}`

    // Use Runway Upscale-v1
    // Reference: https://replicate.com/runwayml/upscale-v1
    const model = 'runwayml/upscale-v1'

    if (onProgress) onProgress('Uploading video for upscaling...')
    
    const prediction = await this.createPrediction(model, {
      video: videoBase64
    })

    if (onProgress) onProgress('Upscaling to 4K (this may take 2-5 minutes)...')

    const completed = await this.waitForPrediction(
      prediction.id,
      (status, logs) => {
        if (onProgress) {
          if (status === 'processing') {
            onProgress(`Upscaling to 4K...`)
          } else {
            onProgress(`Status: ${status}`)
          }
        }
      },
      600000 // 10 minute timeout
    )

    if (!completed.output) {
      throw new Error('No output URL in completed prediction')
    }

    const videoUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output
    const outputPath = path.join(outputDir, `upscaled_${path.basename(videoPath)}`)

    if (onProgress) onProgress('Downloading 4K video...')

    await this.downloadVideo(videoUrl, outputPath)

    if (onProgress) onProgress('Complete!')

    return outputPath
  }

  /**
   * Generate video from image with prompt using Google Veo 3.1
   * 
   * Veo 3.1 supports:
   * - Image-to-video with synchronized audio
   * - Superior prompt understanding and character consistency
   * - 4s, 6s, or 8s duration
   * - 720p or 1080p output
   * - Landscape (16:9) or portrait (9:16)
   * 
   * Reference: https://replicate.com/google/veo-3.1
   */
  async generateVideoVeo(
    imagePath: string,
    prompt: string,
    outputDir: string,
    onProgress?: (status: string) => void,
    duration: 4 | 6 | 8 = 6,
    aspectRatio: '16:9' | '9:16' = '16:9',
    resolution: '720p' | '1080p' = '720p'
  ): Promise<string> {
    // Read image as base64
    const imageBuffer = fs.readFileSync(imagePath)
    const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`

    // Use Google Veo 3.1
    const model = 'google/veo-3.1'

    if (onProgress) onProgress('Creating prediction with Veo 3.1...')
    
    const prediction = await this.createPrediction(model, {
      prompt: prompt,
      image: imageBase64,
      duration: duration,
      aspect_ratio: aspectRatio,
      resolution: resolution,
    })

    if (onProgress) onProgress('Generating video with Veo 3.1 (this may take 30-90 seconds)...')

    const completed = await this.waitForPrediction(
      prediction.id,
      (status, logs) => {
        if (onProgress) {
          if (status === 'processing') {
            onProgress(`Processing with Veo 3.1...`)
          } else {
            onProgress(`Status: ${status}`)
          }
        }
      },
      180000 // 3 minute timeout (Veo can be slower)
    )

    if (!completed.output) {
      throw new Error('No output URL in completed prediction')
    }

    // Veo output is a video URL
    const videoUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output
    const outputPath = path.join(outputDir, `${prediction.id}.mp4`)

    if (onProgress) onProgress('Downloading video...')

    await this.downloadVideo(videoUrl, outputPath)

    if (onProgress) onProgress('Complete!')

    return outputPath
  }

  /**
   * Generate video from image with prompt using Runway Gen-4 Turbo
   * 
   * Gen-4 Turbo supports:
   * - Text prompts with image references
   * - Consistent characters/objects across scenes
   * - 5s or 10s duration
   * - 720p output
   * - Multiple aspect ratios
   */
  async generateVideo(
    imagePath: string,
    prompt: string,
    outputDir: string,
    onProgress?: (status: string) => void,
    duration: 5 | 10 = 5,
    aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
  ): Promise<string> {
    // Read image as base64
    const imageBuffer = fs.readFileSync(imagePath)
    const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`

    // Use Runway Gen-4 Turbo for high-quality product videos
    // Reference: https://replicate.com/runwayml/gen4-turbo
    const model = 'runwayml/gen4-turbo'

    if (onProgress) onProgress('Creating prediction with Gen-4 Turbo...')
    
    const prediction = await this.createPrediction(model, {
      prompt: prompt,
      image: imageBase64,
      duration: duration,
      aspect_ratio: aspectRatio,
      // Optional parameters for quality control
      // seed: (optional) for reproducibility
      // watermark: false (if you have a paid plan)
    })

    if (onProgress) onProgress('Generating video (this may take 30-60 seconds)...')

    const completed = await this.waitForPrediction(
      prediction.id,
      (status, logs) => {
        if (onProgress) {
          if (status === 'processing') {
            onProgress(`Processing with Gen-4 Turbo...`)
          } else {
            onProgress(`Status: ${status}`)
          }
        }
      },
      600000 // 10 minute timeout (Gen-4 is usually faster than this)
    )

    if (!completed.output) {
      throw new Error('No output URL in completed prediction')
    }

    const videoUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output
    const outputPath = path.join(outputDir, `${prediction.id}.mp4`)

    if (onProgress) onProgress('Downloading video...')

    await this.downloadVideo(videoUrl, outputPath)

    if (onProgress) onProgress('Complete!')

    return outputPath
  }
}

/**
 * Helper to get output directory for video assets
 * Saves to Downloads for easy access
 */
export function getVideoAssetsDir(): string {
  const downloadsPath = app.getPath('downloads')
  const dir = path.join(downloadsPath, 'Video_Assets')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

