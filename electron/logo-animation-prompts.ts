// Logo animation prompt templates for AI video generation
// These prompts guide the video generation models to create animated logo end cards

export interface LogoAnimationTemplate {
  id: string
  label: string
  description: string
  promptTemplate: string
  animationStyle: string
  duration: number // seconds
}

// Optimized for Google Veo 3.1 and Runway Gen-4 Turbo
// Focuses on elegant, professional brand animations suitable for ad end cards
export const LOGO_ANIMATION_TEMPLATES: LogoAnimationTemplate[] = [
  {
    id: 'fade_scale_in',
    label: 'Fade & Scale In',
    description: 'Logo fades in while gently scaling up',
    promptTemplate: 'Professional brand logo animation. {logo_description} gradually fades in from complete transparency while smoothly scaling from 80% to 100% size. Clean white or transparent background. Elegant, subtle animation with smooth easing. High-end corporate aesthetic. Logo centered perfectly in frame throughout.',
    animationStyle: 'fade_scale',
    duration: 2
  },
  {
    id: 'slide_from_left',
    label: 'Slide from Left',
    description: 'Logo slides in smoothly from the left',
    promptTemplate: 'Dynamic logo reveal. {logo_description} slides in smoothly from left side of frame, decelerating elegantly to center position. Clean minimalist background. Professional motion graphics aesthetic. Logo maintains perfect clarity and color fidelity. Cinematic brand presentation.',
    animationStyle: 'slide_left',
    duration: 2
  },
  {
    id: 'glow_reveal',
    label: 'Glow Reveal',
    description: 'Logo appears with glowing light effect',
    promptTemplate: 'Premium brand reveal with light effects. {logo_description} emerges from darkness with soft glowing rim light that gradually illuminates the logo. Subtle lens flare and ethereal glow. Dark to light transition. Luxury brand quality, dramatic yet refined. Logo becomes fully visible and sharp.',
    animationStyle: 'glow',
    duration: 2
  },
  {
    id: 'minimal_zoom',
    label: 'Minimal Zoom',
    description: 'Subtle zoom in with focus shift',
    promptTemplate: 'Refined logo presentation. {logo_description} starts slightly out of focus and small, then gradually comes into sharp focus while subtly zooming in. Clean white or neutral background. Apple-style minimalist aesthetic. Smooth focus pull. Professional product launch quality.',
    animationStyle: 'zoom_focus',
    duration: 2
  },
  {
    id: 'rotate_assemble',
    label: 'Rotate & Assemble',
    description: 'Logo elements rotate into place',
    promptTemplate: 'Modern brand assembly animation. {logo_description} appears with subtle 3D rotation effect, elements gently spinning and settling into final position. Smooth momentum and natural physics. Contemporary tech brand aesthetic. Clean background with soft shadows. Logo locks into perfect alignment.',
    animationStyle: 'rotate_3d',
    duration: 2
  }
]

export function getLogoAnimationTemplate(animationId: string): LogoAnimationTemplate | undefined {
  return LOGO_ANIMATION_TEMPLATES.find(t => t.id === animationId)
}

export function buildLogoAnimationPrompt(animationId: string, logoDescription: string): string {
  const template = getLogoAnimationTemplate(animationId)
  if (!template) {
    throw new Error(`Unknown logo animation preset: ${animationId}`)
  }
  return template.promptTemplate.replace('{logo_description}', logoDescription)
}

