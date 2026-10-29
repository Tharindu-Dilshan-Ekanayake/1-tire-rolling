import { HALLOWEEN_PROPS, PORTALS } from '@shared/world'

import { STYLE } from '../materials'

const ORANGE = '#ff7f1a'
const ORANGE_DARK = '#e8640f'
const STEM = '#4c8a2a'
const FLAME = '#ffcf33'
const STONE = '#9aa0aa'
const STONE_DARK = '#5c626c'
const DIRT = '#5a4632'
const BARK = '#3b2a20'

/** A jack-o'-lantern `s` across, grinning south at the plaza. */
function pumpkin(blocks, x, z, s) {
  blocks.addOn(x, 0, z, 1.3 * s, s, 1.2 * s, ORANGE, STYLE.SMOOTH)
  // Darker lobes bulging out of the sides, and a rounded-off top with its stem.
  for (const side of [-1, 1]) blocks.addOn(x + side * 0.5 * s, 0.05 * s, z, 0.5 * s, 0.9 * s, 1.1 * s, ORANGE_DARK, STYLE.SMOOTH)
  blocks.addOn(x, s, z, 0.9 * s, 0.12 * s, 0.8 * s, ORANGE_DARK, STYLE.SMOOTH)
  blocks.addOn(x, 1.12 * s, z, 0.16 * s, 0.3 * s, 0.16 * s, STEM, STYLE.SMOOTH)
  // The carved face, lit from inside: stands a little proud of the front.
  const fz = z + 0.6 * s + 0.04
  for (const side of [-1, 1]) blocks.add(x + side * 0.28 * s, 0.64 * s, fz, 0.24 * s, 0.2 * s, 0.1, FLAME, STYLE.GLOW)
  blocks.add(x, 0.46 * s, fz, 0.12 * s, 0.1 * s, 0.1, FLAME, STYLE.GLOW)
  blocks.add(x, 0.27 * s, fz, 0.7 * s, 0.12 * s, 0.1, FLAME, STYLE.GLOW)
  for (const side of [-1, 1]) blocks.add(x + side * 0.3 * s, 0.37 * s, fz, 0.12 * s, 0.1 * s, 0.1, FLAME, STYLE.GLOW)
}

/** A headstone with a cross on its face and a dirt mound in front. */
function grave(blocks, x, z) {
  blocks.addOn(x, 0, z + 1, 1.2, 0.15, 1.5, DIRT, STYLE.SMOOTH)
  blocks.addOn(x, 0, z, 1.2, 1.5, 0.4, STONE, STYLE.SMOOTH)
  blocks.addOn(x, 1.5, z, 0.8, 0.3, 0.36, STONE, STYLE.SMOOTH)
  blocks.add(x, 1, z + 0.23, 0.14, 0.62, 0.08, STONE_DARK, STYLE.SMOOTH)
  blocks.add(x, 1.12, z + 0.23, 0.44, 0.14, 0.08, STONE_DARK, STYLE.SMOOTH)
}

/** A bare, crooked tree; `detail` hangs a lantern from it. */
function deadTree(blocks, x, z, detail) {
  blocks.addOn(x, 0, z, 0.8, 5.5, 0.8, BARK, STYLE.SMOOTH)
  // [height, length, tilt up, heading]: each branch leaves the trunk at that height.
  const branches = [
    [4.2, 2.4, 0.55, 0],
    [3.4, 2, 0.7, Math.PI],
    [4.9, 1.8, 0.8, Math.PI / 2],
    [5.3, 1.6, 0.9, -Math.PI / 2 - 0.4],
  ]
  for (const [y, length, tilt, heading] of branches) {
    const reach = (length / 2) * Math.cos(tilt)
    blocks.add(x + reach * Math.cos(heading), y + (length / 2) * Math.sin(tilt), z - reach * Math.sin(heading), length, 0.3, 0.3, BARK, STYLE.SMOOTH, heading, 0, tilt)
  }
  if (detail) {
    // Hanging off the end of the first branch.
    const tipX = x + 2.4 * Math.cos(0.55)
    const tipY = 4.2 + 2.4 * Math.sin(0.55)
    blocks.add(tipX, tipY - 0.7, z, 0.06, 1, 0.06, BARK, STYLE.SMOOTH)
    blocks.add(tipX, tipY - 1.4, z, 0.42, 0.5, 0.42, FLAME, STYLE.GLOW)
  }
}

/**
 * World 3's Halloween dressing round its portal (HALLOWEEN_PROPS): jack-o'-lanterns,
 * graves and a dead tree, all boxes in the world's one block set, so no extra draw
 * calls. `detail` (off on LOW) adds candles on the portal's slab and a lantern.
 */
export function buildHalloween(blocks, { detail = true } = {}) {
  for (const prop of HALLOWEEN_PROPS) {
    if (prop.kind === 'pumpkin') pumpkin(blocks, prop.x, prop.z, prop.size)
    else if (prop.kind === 'grave') grave(blocks, prop.x, prop.z)
    else if (prop.kind === 'tree') deadTree(blocks, prop.x, prop.z, detail)
  }
  if (detail) {
    const portal = PORTALS.find((p) => p.id === 'world3')
    for (const side of [-1, 1]) {
      const cx = portal.x + side * 3.85
      blocks.addOn(cx, 0.5, portal.z + 0.85, 0.22, 0.45, 0.22, '#f2ead3', STYLE.SMOOTH)
      blocks.addOn(cx, 0.95, portal.z + 0.85, 0.12, 0.16, 0.12, FLAME, STYLE.GLOW)
    }
  }
}
