import { TRAIN_INTERVAL } from '@shared/balance'

/**
 * Training on a pad, as asked for: your tire lies flat on the pad like a trampoline and
 * you bounce on top of it. One bounce per training step (TRAIN_INTERVAL), so every
 * landing is a "+N" Health. Shared by your character and everyone else's, so they all
 * bounce the same.
 */

/** The flat tire's radius on a pad, and how high a bounce goes. */
export const PAD_TIRE_SIZE = 1.3
const BOUNCE_HEIGHT = 0.85
/**
 * Lying on a pad a tire is squashed to this much of its thickness: a low, wide
 * trampoline you land right on, not a thick puck you float above.
 */
export const PAD_FLAT = 0.5

/** Height of the top of a tire of `width` (tire.js tireWidth) lying flat: where feet land. */
export const padTireTop = (width) => 0.6 * width * PAD_TIRE_SIZE * PAD_FLAT

/**
 * The bounce `time` seconds in: `height` of the feet above the tire's top, vertical
 * speed `vy`, and `squash` (0-1, the tire flattening as you land). Writes into `out`.
 */
export function padBounce(time, out) {
  const phase = (time / TRAIN_INTERVAL) % 1
  const s = Math.sin(Math.PI * phase)
  out.height = BOUNCE_HEIGHT * s
  out.vy = ((BOUNCE_HEIGHT * Math.PI) / TRAIN_INTERVAL) * Math.cos(Math.PI * phase)
  // Squashed most at the moment of landing (phase 0), springing back as you leave it.
  out.squash = Math.max(0, 1 - Math.min(phase, 1 - phase) / 0.12)
  return out
}
