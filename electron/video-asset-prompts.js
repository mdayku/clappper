"use strict";
// Shot prompt templates for AI video generation
// These prompts guide the video generation models to create product videos
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHOT_PROMPT_TEMPLATES = void 0;
exports.getShotTemplate = getShotTemplate;
exports.buildShotPrompt = buildShotPrompt;
// Optimized for Runway Gen-4 Turbo's advanced understanding and cinematic quality
exports.SHOT_PROMPT_TEMPLATES = [
    {
        id: 'slow_pan_lr',
        label: 'Slow pan L → R',
        description: 'Camera moves left to right across the product',
        promptTemplate: 'Cinematic product commercial. Camera smoothly pans left to right, revealing {product_description} with elegant motion. Professional studio lighting with soft shadows. Clean white background. Product stays centered and in focus throughout. High-end advertising aesthetic, shallow depth of field.',
        cameraMotion: 'pan_left_to_right',
        duration: 5
    },
    {
        id: 'slow_pan_rl',
        label: 'Slow pan R → L',
        description: 'Camera moves right to left across the product',
        promptTemplate: 'Cinematic product commercial. Camera smoothly pans right to left, showcasing {product_description} with graceful movement. Professional studio lighting creates beautiful highlights. Pristine white backdrop. Product remains sharp and perfectly lit. Luxury brand quality.',
        cameraMotion: 'pan_right_to_left',
        duration: 5
    },
    {
        id: 'slow_dolly_in',
        label: 'Slow dolly in',
        description: 'Slow push-in toward the product',
        promptTemplate: 'Premium product reveal. Camera slowly pushes forward toward {product_description}, drawing viewer attention to key details. Dramatic studio lighting with soft key light. Neutral background gradually blurs. Product becomes more prominent and detailed. Apple-style commercial aesthetic.',
        cameraMotion: 'dolly_in',
        duration: 5
    },
    {
        id: 'slow_dolly_out',
        label: 'Slow dolly out',
        description: 'Slow pull-back from the product',
        promptTemplate: 'Elegant product presentation. Camera smoothly pulls back from close-up of {product_description}, revealing full product in context. Three-point studio lighting. Clean minimalist background. Product maintains perfect focus. High-end commercial production value.',
        cameraMotion: 'dolly_out',
        duration: 5
    },
    {
        id: 'orbit_360',
        label: '360° orbit',
        description: 'Full orbit around the product',
        promptTemplate: 'Dynamic 360-degree showcase. Camera orbits smoothly around {product_description} in a complete circle, displaying all angles. Consistent studio lighting from all sides. Seamless white cyclorama background. Product rotates on invisible turntable. Professional e-commerce quality.',
        cameraMotion: 'orbit_360',
        duration: 5
    },
    {
        id: 'hero_front',
        label: 'Hero front shot',
        description: 'Straight-on hero shot',
        promptTemplate: 'Hero product shot. {product_description} centered perfectly in frame with subtle focus pull and slight scale adjustment. Dramatic rim lighting and key light from 45 degrees. Pure white background. Product appears to float. Magazine cover quality, ultra-detailed.',
        cameraMotion: 'static_front',
        duration: 5
    },
    {
        id: 'top_down',
        label: 'Top-down',
        description: 'Overhead view of the product',
        promptTemplate: 'Overhead flat-lay perspective. Camera looks directly down at {product_description} from above with subtle push-in movement. Soft even lighting eliminates shadows. Crisp white surface. Perfect symmetry and composition. Instagram-worthy lifestyle aesthetic.',
        cameraMotion: 'top_down',
        duration: 5
    }
];
function getShotTemplate(shotId) {
    return exports.SHOT_PROMPT_TEMPLATES.find(t => t.id === shotId);
}
function buildShotPrompt(shotId, productDescription) {
    const template = getShotTemplate(shotId);
    if (!template) {
        throw new Error(`Unknown shot preset: ${shotId}`);
    }
    return template.promptTemplate.replace('{product_description}', productDescription);
}
