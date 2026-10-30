import { EGG_STANDS, FREE_REWARD, SPHINX_STAND } from '@shared/world'

import { STYLE } from '../materials'

/**
 * Egg stands: a blue-and-white pedestal ringed in light, plus the big Volcano Egg's
 * rocky plinth (with its lava pool and smoking vents) and the Sphinx showcase. Blocks and merged props,
 * riding along in the world's existing draw calls; the eggs themselves float above in
 * EggDisplays.
 */

/** Each stand's light ring, in its egg's colour. */
const RING = { basic: '#7fe2ff', meadow: '#5cff6a', sunset: '#ffb347', unicorn: '#ff9cf4' }

/** Height of an egg's centre above the ground. */
export const eggHeight = (stand) => (stand.big ? 3.4 : 2.6)

export function buildEggStands(blocks) {
  for (const stand of EGG_STANDS) {
    if (stand.big) {
      // Volcano Egg: a rocky stepped plinth round a pool of lava, with craggy rocks.
      blocks.addOn(stand.x, 0, stand.z, 4.2, 0.7, 4.2, '#3a3337')
      blocks.addOn(stand.x, 0.7, stand.z, 3.6, 0.35, 3.6, '#ff6a14', STYLE.LAVA)
      blocks.addOn(stand.x, 1.05, stand.z, 3.2, 0.3, 3.2, '#2f2a2d')
      for (const [dx, dz, s] of [[-1.9, -1.6, 1.1], [1.8, -1.4, 0.9], [-1.6, 1.8, 0.8], [1.9, 1.7, 1.2]]) {
        blocks.addOn(stand.x + dx, 0, stand.z + dz, 1.1 * s, 1.6 * s, 1.1 * s, '#433a3d', STYLE.STUDS, s)
        blocks.add(stand.x + dx, 1.7 * s, stand.z + dz, 0.4 * s, 0.4 * s, 0.4 * s, '#ff8a1e', STYLE.GLOW)
      }
      continue
    }
    blocks.addOn(stand.x, 0, stand.z, 3.2, 0.55, 3.2, '#2f7fe6')
    blocks.addOn(stand.x, 0.55, stand.z, 2.8, 0.35, 2.8, '#f4f7fb')
    // A ring of light on the top, in the egg's colour, and gold studs at its corners.
    const ring = RING[stand.eggId] || RING.basic
    for (const side of [-1, 1]) {
      blocks.addOn(stand.x, 0.9, stand.z + side * 1.05, 2.1, 0.06, 0.2, ring, STYLE.GLOW)
      blocks.addOn(stand.x + side * 1.05, 0.9, stand.z, 0.2, 0.06, 1.9, ring, STYLE.GLOW)
      for (const end of [-1, 1]) blocks.addOn(stand.x + side * 1.25, 0.9, stand.z + end * 1.25, 0.3, 0.16, 0.3, '#ffd21f', STYLE.GLOW)
    }
  }

  // Free Reward stand by spawn; its crab is drawn by RewardCrab.
  blocks.addOn(FREE_REWARD.x, 0, FREE_REWARD.z, 3, 0.6, 3, '#6a1420')
  blocks.addOn(FREE_REWARD.x, 0.6, FREE_REWARD.z, 2.6, 0.3, 2.6, '#ff3b3b', STYLE.GLOW)
  blocks.addOn(FREE_REWARD.x, 0.9, FREE_REWARD.z, 2.2, 0.2, 2.2, '#f4f7fb')

  // Sphinx showcase plinth: gold-trimmed and taller, the pet itself is added by Showcase.
  const { x, z } = SPHINX_STAND
  blocks.addOn(x, 0, z, 5.6, 0.8, 5.6, '#2f6fe0')
  blocks.addOn(x, 0.8, z, 5, 0.5, 5, '#ffcf3a', STYLE.GLOW)
  blocks.addOn(x, 1.3, z, 4.4, 0.4, 4.4, '#f4f7fb')
}
