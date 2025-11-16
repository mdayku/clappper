"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicateClient = void 0;
exports.getVideoAssetsDir = getVideoAssetsDir;
// Replicate API client for image-to-video generation
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
class ReplicateClient {
    apiToken;
    baseUrl = 'api.replicate.com';
    constructor(options) {
        this.apiToken = options.apiToken;
    }
    /**
     * Create a prediction (start video generation)
     */
    async createPrediction(model, input) {
        const data = JSON.stringify({
            version: model,
            input
        });
        const options = {
            hostname: this.baseUrl,
            path: '/v1/predictions',
            method: 'POST',
            headers: {
                'Authorization': `Token ${this.apiToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        return new Promise((resolve, reject) => {
            const req = https_1.default.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body));
                        }
                        catch (err) {
                            reject(new Error(`Failed to parse response: ${err}`));
                        }
                    }
                    else {
                        reject(new Error(`Replicate API error: ${res.statusCode} - ${body}`));
                    }
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }
    /**
     * Get prediction status
     */
    async getPrediction(predictionId) {
        const options = {
            hostname: this.baseUrl,
            path: `/v1/predictions/${predictionId}`,
            method: 'GET',
            headers: {
                'Authorization': `Token ${this.apiToken}`,
                'Content-Type': 'application/json'
            }
        };
        return new Promise((resolve, reject) => {
            const req = https_1.default.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body));
                        }
                        catch (err) {
                            reject(new Error(`Failed to parse response: ${err}`));
                        }
                    }
                    else {
                        reject(new Error(`Replicate API error: ${res.statusCode} - ${body}`));
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }
    /**
     * Poll prediction until completion
     */
    async waitForPrediction(predictionId, onProgress, maxWaitMs = 600000 // 10 minutes default
    ) {
        const startTime = Date.now();
        const pollInterval = 2000; // 2 seconds
        while (true) {
            const prediction = await this.getPrediction(predictionId);
            if (onProgress) {
                onProgress(prediction.status, prediction.logs);
            }
            if (prediction.status === 'succeeded') {
                return prediction;
            }
            if (prediction.status === 'failed' || prediction.status === 'canceled') {
                throw new Error(`Prediction ${prediction.status}: ${prediction.error || 'Unknown error'}`);
            }
            if (Date.now() - startTime > maxWaitMs) {
                throw new Error(`Prediction timeout after ${maxWaitMs}ms`);
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }
    /**
     * Download video from URL to local file
     */
    async downloadVideo(url, outputPath) {
        return new Promise((resolve, reject) => {
            https_1.default.get(url, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    // Follow redirect
                    if (res.headers.location) {
                        this.downloadVideo(res.headers.location, outputPath)
                            .then(resolve)
                            .catch(reject);
                    }
                    else {
                        reject(new Error('Redirect without location header'));
                    }
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed: ${res.statusCode}`));
                    return;
                }
                const file = fs_1.default.createWriteStream(outputPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(outputPath);
                });
                file.on('error', (err) => {
                    fs_1.default.unlink(outputPath, () => { }); // Delete partial file
                    reject(err);
                });
            }).on('error', reject);
        });
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
    async upscaleVideo(videoPath, outputDir, onProgress) {
        // Read video as base64 or use file URL
        // Note: For large videos, may need to use URL instead of base64
        const videoBuffer = fs_1.default.readFileSync(videoPath);
        const videoBase64 = `data:video/mp4;base64,${videoBuffer.toString('base64')}`;
        // Use Runway Upscale-v1
        // Reference: https://replicate.com/runwayml/upscale-v1
        const model = 'runwayml/upscale-v1';
        if (onProgress)
            onProgress('Uploading video for upscaling...');
        const prediction = await this.createPrediction(model, {
            video: videoBase64
        });
        if (onProgress)
            onProgress('Upscaling to 4K (this may take 2-5 minutes)...');
        const completed = await this.waitForPrediction(prediction.id, (status, logs) => {
            if (onProgress) {
                if (status === 'processing') {
                    onProgress(`Upscaling to 4K...`);
                }
                else {
                    onProgress(`Status: ${status}`);
                }
            }
        }, 600000 // 10 minute timeout
        );
        if (!completed.output) {
            throw new Error('No output URL in completed prediction');
        }
        const videoUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output;
        const outputPath = path_1.default.join(outputDir, `upscaled_${path_1.default.basename(videoPath)}`);
        if (onProgress)
            onProgress('Downloading 4K video...');
        await this.downloadVideo(videoUrl, outputPath);
        if (onProgress)
            onProgress('Complete!');
        return outputPath;
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
    async generateVideoVeo(imagePath, prompt, outputDir, onProgress, duration = 6, aspectRatio = '16:9', resolution = '720p') {
        // Read image as base64
        const imageBuffer = fs_1.default.readFileSync(imagePath);
        const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        // Use Google Veo 3.1
        const model = 'google/veo-3.1';
        if (onProgress)
            onProgress('Creating prediction with Veo 3.1...');
        const prediction = await this.createPrediction(model, {
            prompt: prompt,
            image: imageBase64,
            duration: duration,
            aspect_ratio: aspectRatio,
            resolution: resolution,
        });
        if (onProgress)
            onProgress('Generating video with Veo 3.1 (this may take 30-90 seconds)...');
        const completed = await this.waitForPrediction(prediction.id, (status, logs) => {
            if (onProgress) {
                if (status === 'processing') {
                    onProgress(`Processing with Veo 3.1...`);
                }
                else {
                    onProgress(`Status: ${status}`);
                }
            }
        }, 180000 // 3 minute timeout (Veo can be slower)
        );
        if (!completed.output) {
            throw new Error('No output URL in completed prediction');
        }
        // Veo output is a video URL
        const videoUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output;
        const outputPath = path_1.default.join(outputDir, `${prediction.id}.mp4`);
        if (onProgress)
            onProgress('Downloading video...');
        await this.downloadVideo(videoUrl, outputPath);
        if (onProgress)
            onProgress('Complete!');
        return outputPath;
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
    async generateVideo(imagePath, prompt, outputDir, onProgress, duration = 5, aspectRatio = '16:9') {
        // Read image as base64
        const imageBuffer = fs_1.default.readFileSync(imagePath);
        const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        // Use Runway Gen-4 Turbo for high-quality product videos
        // Reference: https://replicate.com/runwayml/gen4-turbo
        const model = 'runwayml/gen4-turbo';
        if (onProgress)
            onProgress('Creating prediction with Gen-4 Turbo...');
        const prediction = await this.createPrediction(model, {
            prompt: prompt,
            image: imageBase64,
            duration: duration,
            aspect_ratio: aspectRatio,
            // Optional parameters for quality control
            // seed: (optional) for reproducibility
            // watermark: false (if you have a paid plan)
        });
        if (onProgress)
            onProgress('Generating video (this may take 30-60 seconds)...');
        const completed = await this.waitForPrediction(prediction.id, (status, logs) => {
            if (onProgress) {
                if (status === 'processing') {
                    onProgress(`Processing with Gen-4 Turbo...`);
                }
                else {
                    onProgress(`Status: ${status}`);
                }
            }
        }, 600000 // 10 minute timeout (Gen-4 is usually faster than this)
        );
        if (!completed.output) {
            throw new Error('No output URL in completed prediction');
        }
        const videoUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output;
        const outputPath = path_1.default.join(outputDir, `${prediction.id}.mp4`);
        if (onProgress)
            onProgress('Downloading video...');
        await this.downloadVideo(videoUrl, outputPath);
        if (onProgress)
            onProgress('Complete!');
        return outputPath;
    }
}
exports.ReplicateClient = ReplicateClient;
/**
 * Helper to get output directory for video assets
 * Saves to Downloads for easy access
 */
function getVideoAssetsDir() {
    const downloadsPath = electron_1.app.getPath('downloads');
    const dir = path_1.default.join(downloadsPath, 'Video_Assets');
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
