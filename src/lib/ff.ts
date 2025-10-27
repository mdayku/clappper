export const toHHMMSS = (t: number) => new Date(t * 1000).toISOString().substring(11, 19)
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

