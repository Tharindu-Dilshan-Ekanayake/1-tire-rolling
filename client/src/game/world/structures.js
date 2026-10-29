import {
  BELT_FAR_X,
  BELT_HEIGHT,
  BELT_NEAR_X,
  BELT_WIDTH,
  CONSOLE_X,
  deckRect,
  SHOP_BOARD,
  SHOP_STAGES,
  TREADMILL_COUNT,
  treadmillCenterZ,
} from '@shared/world'

import { STYLE } from '../materials'

/**
 * Static lobby structures, added as plain boxes to the world's shared BlockSet so they
 * render in the same single draw call as the hills.
 */

/**
 * Per-treadmill look, in treadmill order (matches TREADMILLS in shared/balance.js): the
 * frame, its trim and the style of its deck, and the colour of its labels.
 */
export const TREADMILL_THEMES = [
  { frame: '#2f7fe6', trim: '#7fe2ff', style: STYLE.STUDS, text: '#5fd6ff' },
  { frame: '#1d9a2b', trim: '#8dff4f', style: STYLE.STUDS, text: '#8dff4f' },
  { frame: '#ff5a1e', trim: '#ffd23f', style: STYLE.LAVA, text: '#ff9a3c' },
  { frame: '#2fae3a', trim: '#c6ff3a', style: STYLE.STUDS, text: '#c6ff3a' },
  { frame: '#e5b318', trim: '#fff16c', style: STYLE.STUDS, text: '#ffe45c' },
  { frame: '#3fb8ff', trim: '#e0faff', style: STYLE.GLOW, text: '#9fe8ff' },
  { frame: '#1b2266', trim: '#c35cff', style: STYLE.GALAXY, text: '#d39bff' },
]

const BELT = '#1f2742'
const STEEL = '#e3e9f0'

/**
 * The treadmills: a deck in the machine's colour with the belt sunk into it, glowing
 * rails down both sides, and at the west end a console with handlebars and a screen
 * angled at the runner.
 */
export function buildTreadmills(blocks) {
  const beltLength = BELT_NEAR_X - BELT_FAR_X
  const beltX = (BELT_NEAR_X + BELT_FAR_X) / 2
  const deckTop = BELT_HEIGHT - 0.08

  for (let i = 0; i < TREADMILL_COUNT; i += 1) {
    const theme = TREADMILL_THEMES[i]
    const cz = treadmillCenterZ(i)
    const deck = deckRect(i)
    const deckW = deck.maxX - deck.minX
    const deckX = (deck.minX + deck.maxX) / 2

    blocks.addOn(deckX, -0.1, cz, deckW, deckTop + 0.1, deck.maxZ - deck.minZ, theme.frame, theme.style)
    blocks.addOn(beltX, deckTop, cz, beltLength, 0.08, BELT_WIDTH, BELT, STYLE.BELT)
    // Rails down both sides, and the roller cap at the entrance.
    for (const side of [-1, 1]) {
      blocks.addOn(deckX, deckTop, cz + side * (BELT_WIDTH / 2 + 0.36), deckW - 0.2, 0.16, 0.5, theme.trim, STYLE.GLOW)
    }
    blocks.addOn(BELT_NEAR_X + 0.2, deckTop, cz, 0.36, 0.12, BELT_WIDTH, STEEL, STYLE.SMOOTH)

    // The console: two uprights, handlebars reaching back over the belt, a screen.
    for (const side of [-1, 1]) {
      const z = cz + side * (BELT_WIDTH / 2 + 0.15)
      blocks.addOn(CONSOLE_X, 0, z, 0.4, 2.5, 0.4, theme.frame, STYLE.SMOOTH)
      blocks.addOn(CONSOLE_X + 1.1, 1.55, z, 1.9, 0.16, 0.16, STEEL, STYLE.SMOOTH)
    }
    blocks.addOn(CONSOLE_X + 0.25, 1.55, cz, 0.16, 0.16, BELT_WIDTH + 0.5, STEEL, STYLE.SMOOTH)
    blocks.addOn(CONSOLE_X, 0, cz, 1.2, 0.5, BELT_WIDTH + 0.9, theme.frame, theme.style)
    blocks.add(CONSOLE_X - 0.05, 2.75, cz, 0.3, 1.2, BELT_WIDTH + 0.4, '#141a2e', STYLE.SMOOTH, 0, 0, 0.35)
    blocks.add(CONSOLE_X + 0.13, 2.8, cz, 0.06, 0.8, BELT_WIDTH - 0.4, theme.trim, STYLE.GLOW, 0, 0, 0.35)
  }
}

const WHITE = '#f4f7fb'
const BLUE = '#2f7fe6'
const NAVY = '#1f3c96'
const SKY = '#7fe2ff'
const GOLD = '#ffd21f'

/**
 * The board shop: two open display stages (the stands on them are BoardShop's) and the
 * big sign behind, built like the start arch - white decks on a blue band with light
 * strips round the edges. `detail` (off on LOW) adds the sign's bulbs.
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
  const { x, minZ, maxZ, top } = SHOP_BOARD
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
