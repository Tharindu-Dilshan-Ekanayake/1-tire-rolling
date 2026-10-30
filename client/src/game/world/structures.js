import { CylinderGeometry, TorusGeometry } from 'three'

import { PAD_COUNT, PAD_HEIGHT, PAD_RADIUS, PAD_X, padCenterZ, SHOP_SIGN, SHOP_STAGES } from '@shared/world'

import { STYLE } from '../materials'

/**
 * Static lobby structures, added to the world's shared BlockSet and prop builder so they
 * render in the same few draw calls as the hills.
 */

/**
 * Per-pad look, in pad order (matches PADS in shared/balance.js): the base, the top,
 * the glowing ring, the centre emblem and the colour of its labels. Nothing floats over
 * a pad: the tire you train with is your own, lying flat on it (Player.jsx).
 */
export const PAD_THEMES = [
  { base: '#1f5fc8', top: '#3f9cff', ring: '#9fe8ff', emblem: '#ffffff', text: '#5fd6ff' },
  { base: '#b8222e', top: '#ff3b3b', ring: '#ffd21f', emblem: '#1d1f22', text: '#ff7a6a' },
  { base: '#d64a9a', top: '#ff8fd0', ring: '#ffffff', emblem: '#ffd23f', text: '#ff9cd6' },
  { base: '#1d3f8a', top: '#2f6fe0', ring: '#7fe2ff', emblem: '#ffd21f', text: '#7fb8ff' },
  { base: '#5a2a9a', top: '#8a4cff', ring: '#ff7ad9', emblem: '#ffffff', text: '#c69bff' },
  { base: '#1a8ab8', top: '#7ff0ff', ring: '#ffffff', emblem: '#9b6bff', text: '#9fe8ff', style: STYLE.GLOW },
  { base: '#1b2266', top: '#2a1450', ring: '#c35cff', emblem: '#ffd21f', text: '#d39bff', style: STYLE.GALAXY },
]

const DISC = new CylinderGeometry(1, 1, 1, 32)
const RING = new TorusGeometry(1, 0.08, 6, 40)

/**
 * The training pads: round two-tier platforms in the pad's colours, a glowing ring
 * round the top and a star emblem in the middle, as in the reference. The rounded parts
 * go into the world's props, the trim into its blocks: no draw calls of their own.
 */
export function buildPads(blocks, props) {
  for (let i = 0; i < PAD_COUNT; i += 1) {
    const theme = PAD_THEMES[i]
    const z = padCenterZ(i)
    const r = PAD_RADIUS
    props.add(DISC, { position: [PAD_X, PAD_HEIGHT * 0.4, z], scale: [r + 0.45, PAD_HEIGHT * 0.8, r + 0.45], color: theme.base })
    props.add(DISC, { position: [PAD_X, PAD_HEIGHT - 0.06, z], scale: [r, 0.14, r], color: theme.top, style: theme.style ?? STYLE.STUDS })
    props.add(RING, { position: [PAD_X, PAD_HEIGHT + 0.02, z], rotation: [Math.PI / 2, 0, 0], scale: [r - 0.25, r - 0.25, 1], color: theme.ring, style: STYLE.GLOW })
    // A four-point star in the middle, two crossed slabs turned 45 degrees.
    for (const turn of [0, Math.PI / 4]) {
      blocks.add(PAD_X, PAD_HEIGHT + 0.03, z, 1.8, 0.05, 0.4, theme.emblem, STYLE.SMOOTH, turn)
      blocks.add(PAD_X, PAD_HEIGHT + 0.03, z, 0.4, 0.05, 1.8, theme.emblem, STYLE.SMOOTH, turn)
    }
    // Two short posts at the back, like the reference's handles.
    for (const side of [-1, 1]) {
      blocks.addOn(PAD_X - r * 0.75, PAD_HEIGHT, z + side * r * 0.6, 0.35, 1.3, 0.35, theme.ring, STYLE.GLOW)
    }
  }
}

const WHITE = '#f4f7fb'
const BLUE = '#2f7fe6'
const NAVY = '#1f3c96'
const SKY = '#7fe2ff'
const GOLD = '#ffd21f'

/**
 * The tire showroom: two open display stages (the stands on them are TireShop's) and
 * the big sign behind, built like the start arch - white decks on a blue band with
 * light strips round the edges. `detail` (off on LOW) adds the sign's bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on.
 */
export function buildShop(blocks, { detail = true } = {}) {
  for (const s of SHOP_STAGES) {
    const w = s.maxX - s.minX
    const d = s.maxZ - s.minZ
    const cx = (s.minX + s.maxX) / 2
    const cz = (s.minZ + s.maxZ) / 2
    blocks.addOn(cx, -0.1, cz, w, s.height + 0.1, d, WHITE)
    blocks.addOn(cx, 0, cz, w + 0.3, s.height * 0.5, d + 0.3, BLUE)
    // Light strips along all four top edges, and a gold post at each corner.
    for (const side of [-1, 1]) {
      blocks.addOn(cx + side * (w / 2 - 0.25), s.height, cz, 0.35, 0.08, d - 1.4, SKY, STYLE.GLOW)
      blocks.addOn(cx, s.height, cz + side * (d / 2 - 0.25), w - 1.4, 0.08, 0.35, SKY, STYLE.GLOW)
      for (const end of [-1, 1]) {
        blocks.addOn(cx + side * (w / 2 - 0.35), s.height, cz + end * (d / 2 - 0.35), 0.6, 0.7, 0.6, GOLD, STYLE.GLOW)
      }
    }
  }

  // The sign: two striped legs, a navy panel in a blue frame, a gold cap.
  const { x, minZ, maxZ, top } = SHOP_SIGN
  const length = maxZ - minZ
  const midZ = (minZ + maxZ) / 2
  const bottom = top - 8.2
  for (const z of [minZ + 1.5, maxZ - 1.5]) blocks.addOn(x + 0.1, 0, z, 0.9, bottom + 0.3, 0.9, BLUE, STYLE.STRIPES)
  blocks.addOn(x, bottom, midZ, 0.6, top - bottom, length, BLUE)
  blocks.addOn(x - 0.1, bottom + 0.5, midZ, 0.6, top - bottom - 1, length - 1, NAVY, STYLE.SMOOTH)
  blocks.addOn(x, top, midZ, 0.9, 0.4, length + 0.4, GOLD, STYLE.GLOW)
  if (detail) {
    for (let z = minZ + 1; z <= maxZ - 0.99; z += 1.5) {
      blocks.add(x - 0.42, bottom + 0.25, z, 0.16, 0.3, 0.3, Math.round(z) % 2 ? '#ffffff' : GOLD, STYLE.GLOW)
      blocks.add(x - 0.42, top - 0.25, z + 0.75, 0.16, 0.3, 0.3, Math.round(z) % 2 ? GOLD : '#ffffff', STYLE.GLOW)
    }
  }
}
