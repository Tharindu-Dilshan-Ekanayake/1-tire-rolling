import { CylinderGeometry, TorusGeometry } from 'three'

import { SLIDE_ARCH, SLIDE_ZONE } from '@shared/world'

import { STYLE } from '../materials'

const WHITE = '#f4f7fb'
const BLUE = '#2f7fe6'
const NAVY = '#1f3c96'
const SKY = '#7fe2ff'
const GOLD = '#ffd21f'

const DISC = new CylinderGeometry(1, 1, 1, 28)
const RIM = new TorusGeometry(1, 0.1, 8, 36)

/** Height of the arch's beam, and the SLIDE! sign hung on its face. */
const ARCH_TOP = 11
export const ARCH_SIGN = { width: 12, height: 3, y: ARCH_TOP - 1.6, faceZ: SLIDE_ARCH.z + 1.05 }

/**
 * The top of the hill: the yellow SLIDE ZONE across the canyon's mouth (painted with
 * its name, see signs.js), a glowing blue pad at each end, and a big start arch over
 * it with a SLIDE! sign, crowned by a giant board.
 *
 * Boxes go into the world's block set and the round parts into its props, so the whole
 * thing rides in those two draw calls. `detail` (off on LOW) adds the bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on (flush faces flicker, worst on phones' coarser depth buffers).
 */
export function buildSlideZone(blocks, props, { detail = true } = {}) {
  const { minX, maxX, minZ, maxZ } = SLIDE_ZONE
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const w = maxX - minX
  const d = maxZ - minZ

  // The strip: an orange border with the yellow fill raised on it, running right up to
  // the canyon's edge.
  blocks.addOn(cx, 0, cz + 0.3, w + 1.2, 0.05, d + 0.6, '#ff9a1f')
  blocks.addOn(cx, 0.05, cz + 0.3, w, 0.05, d - 0.2, '#ffd54a')
  // Chevrons on the strip, pointing down the hill.
  for (const x of [-9, 9]) {
    for (const side of [-1, 1]) {
      blocks.add(x + side * 0.7, 0.12, cz, 2.2, 0.04, 0.6, '#ff8a00', STYLE.SMOOTH, side * 0.75)
    }
  }
  // Glowing blue pads at both ends, like the reference's.
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 2.2)
    props.add(DISC, { position: [x, 0.08, cz + 0.3], scale: [2, 0.12, 2.6], color: '#e6f6ff' })
    props.add(DISC, { position: [x, 0.15, cz + 0.3], scale: [1.6, 0.06, 2.2], color: '#3fd0ff', style: STYLE.GLOW })
  }

  // The start arch: striped pillars either side, a beam across the top carrying the
  // SLIDE! sign and a rainbow crest, and a glowing orb on each pillar.
  const archZ = SLIDE_ARCH.z
  const span = SLIDE_ARCH.x * 2
  for (const side of [-1, 1]) {
    const x = side * SLIDE_ARCH.x
    blocks.addOn(x, 0, archZ, 2.2, 0.8, 2.2, NAVY)
    blocks.addOn(x, 0.8, archZ, 1.6, ARCH_TOP - 0.8, 1.6, BLUE, STYLE.STRIPES)
    blocks.addOn(x, ARCH_TOP + 1.3, archZ, 2.1, 2.1, 2.1, GOLD, STYLE.GLOW)
    if (detail) {
      for (let y = 1.8; y < ARCH_TOP - 0.6; y += 1.1) {
        blocks.add(x, y, archZ + 0.88, 0.3, 0.3, 0.16, Math.round(y) % 2 ? '#ffffff' : GOLD, STYLE.GLOW)
      }
    }
  }
  blocks.addOn(0, ARCH_TOP - 0.2, archZ, span + 1, 1.5, 1.3, BLUE, STYLE.STRIPES)
  blocks.addOn(0, ARCH_TOP - 0.45, archZ, span - 1.4, 0.25, 1.4, SKY, STYLE.GLOW)
  blocks.addOn(0, ARCH_TOP + 1.3, archZ, span - 4, 0.3, 1, '#ffffff', STYLE.RAINBOW)
  // The SLIDE! sign: a navy panel in a blue frame, lettering painted on (signs.js).
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2 - 0.15, archZ + 0.75, ARCH_SIGN.width + 0.6, ARCH_SIGN.height + 0.3, 0.3, BLUE)
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.8, ARCH_SIGN.width, ARCH_SIGN.height, 0.3, NAVY, STYLE.SMOOTH)
  if (detail) {
    for (let x = -SLIDE_ARCH.x + 1.5; x <= SLIDE_ARCH.x - 1.49; x += 1) {
      if (Math.abs(x) < ARCH_SIGN.width / 2 + 0.7) continue
      blocks.add(x, ARCH_TOP + 0.95, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? GOLD : '#ffffff', STYLE.GLOW)
      blocks.add(x + 0.5, ARCH_TOP + 0.15, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? '#ffffff' : GOLD, STYLE.GLOW)
    }
  }

  // The crown: a giant red sled standing on the beam, nose up, leaning back to face
  // the lobby.
  const boardY = ARCH_TOP + 5
  blocks.addOn(0, ARCH_TOP + 1.5, archZ, 0.6, 1.6, 0.6, NAVY)
  blocks.add(0, boardY, archZ - 0.2, 3, 5.4, 0.4, '#ff3b3b', STYLE.SMOOTH, 0, -0.25)
  blocks.add(0, boardY + 3.1, archZ - 0.95, 3, 1.4, 0.4, '#ff3b3b', STYLE.SMOOTH, 0, -0.85)
  for (const side of [-1, 1]) blocks.add(side * 1.45, boardY, archZ + 0.05, 0.3, 5, 0.3, WHITE, STYLE.SMOOTH, 0, -0.25)
  blocks.add(0, boardY, archZ + 0.02, 1, 3.6, 0.1, GOLD, STYLE.GLOW, 0, -0.25)
  props.add(RIM, { position: [0, boardY, archZ - 0.3], rotation: [-0.25, 0, 0], scale: [3.3, 3.3, 3], color: GOLD, style: STYLE.GLOW })
}
