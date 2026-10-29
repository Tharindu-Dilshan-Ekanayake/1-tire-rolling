import { WATERFALL } from '@shared/world'

import { STYLE } from '../materials'
import { terrainHeight } from './terrain'

/**
 * The waterfall pouring off the north cliff into its pool: a few blocks in the
 * animated water style, so it costs nothing beyond the world's one block draw call.
 */
export function buildWaterfall(blocks) {
  const { x, z } = WATERFALL
  const top = terrainHeight(x, z - 4)
  // The falling sheet hugs the cliff face, slightly proud of it.
  blocks.addOn(x, 0, z - 0.2, 5, top + 0.3, 1, '#59c8ff', STYLE.WATER)
  // A stream running back over the hilltop.
  blocks.addOn(x, top - 0.2, z - 6, 5, 0.6, 12, '#59c8ff', STYLE.WATER)
  // Splash at the bottom.
  blocks.addOn(x, 0, z + 1.4, 8, 0.4, 3, '#a8e4ff', STYLE.WATER)
}
