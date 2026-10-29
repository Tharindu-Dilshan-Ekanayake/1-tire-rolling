import { ZONES } from '@shared/balance'
import { zoneIndexAt } from '@shared/logic'
import { mulberry32 } from '@shared/rng'
import { CANYON_HALF_WIDTH } from '@shared/world'

import { BlockSet } from '../blocks'
import { STYLE } from '../materials'
import { addTree } from '../world/terrain'
import { RAMP_HEIGHT, RAMP_LENGTH, rampLips, slopeBoxPlacement, SLOPE_EULER_X, surfaceY, zAt } from './path'

/**
 * The slide: a canyon running down the hill, generated in 60 m chunks on demand. Each
 * chunk is a BlockSet (one draw call); content is seeded by chunk index, so every
 * client builds an identical canyon and a chunk can be thrown away and rebuilt at will.
 *
 * Cross-section: a wide studded floor, walls leaning out on both sides up to a grassy
 * ledge WALL_H above the floor, and scenery along the ledges. Everything structural
 * lies on the slope; trees and props stand upright on it.
 */

export const CHUNK = 60
const HALF = CANYON_HALF_WIDTH
/** How far out the walls lean, and how high they rise above the floor. */
export const WALL_RUN = 18
export const WALL_H = 20
/** The walls' top edge, and how far the ledge beyond it runs. */
export const RIM_X = HALF + WALL_RUN
const LEDGE_NEAR = RIM_X + 6
const LEDGE_FAR = 130
/** The walls' lean from vertical. */
const LEAN = Math.atan2(WALL_RUN, WALL_H)
const PLATE_LENGTH = Math.hypot(WALL_RUN, WALL_H)
const PLATE_THICK = 12
/** No scenery on the first stretch, where the lobby's hills stand beside the canyon. */
const DECOR_START = 25

/** Per-zone look: floor, walls, ledge, gate and sky colours, and the HUD's name colour. */
export const ZONE_THEMES = {
  grassy: {
    floor: '#c68656',
    wall: '#bf7f4e',
    ledge: '#58cf3a',
    gate: '#3fd13f',
    sky: ['#2f8ff2', '#a6d6fb'],
    name: ['#e6ffb0', '#8dff4f', '#2fd12f'],
  },
  desert: {
    floor: '#ecdc93',
    wall: '#e4d088',
    ledge: '#f5e6a8',
    gate: '#ffb12a',
    sky: ['#3a9ff0', '#f3e1ae'],
    name: ['#fffaa8', '#ffd52a', '#ff9c00'],
  },
  frozen: {
    floor: '#bfe5ff',
    wall: '#a6d8fb',
    ledge: '#ffffff',
    gate: '#5cc8ff',
    sky: ['#57aef0', '#e4f4ff'],
    name: ['#ffffff', '#c9f1ff', '#5cc8ff'],
  },
  autumn: {
    floor: '#bb7a4c',
    wall: '#a86a40',
    ledge: '#f0952c',
    gate: '#ff7a1e',
    sky: ['#3d8fe0', '#f6d3a4'],
    name: ['#ffe2b0', '#ffa646', '#e8620c'],
  },
  candy: {
    floor: '#ffc2e2',
    wall: '#ffa8d6',
    ledge: '#fff2fa',
    gate: '#ff5fb8',
    sky: ['#7a8cff', '#ffd6f0'],
    name: ['#ffe6f6', '#ff9cd6', '#ff3fa8'],
  },
  volcano: {
    floor: '#433a3d',
    wall: '#352e31',
    ledge: '#5a4943',
    gate: '#ff4a1c',
    sky: ['#5a2a3a', '#d27a52'],
    name: ['#ffd0b0', '#ff7a3c', '#e2240c'],
  },
  crystal: {
    floor: '#5d44ad',
    wall: '#4a3394',
    ledge: '#8f6bff',
    gate: '#c08bff',
    sky: ['#2a1e6a', '#8a7ae0'],
    name: ['#f2e6ff', '#c69bff', '#8a3ee8'],
  },
  space: {
    floor: '#1b1f5c',
    floorStyle: STYLE.GALAXY,
    wall: '#262b70',
    wallStyle: STYLE.GALAXY,
    ledge: '#7a5cff',
    ledgeStyle: STYLE.GLOW,
    gate: '#8a63ff',
    sky: ['#05051a', '#241544'],
    name: ['#e6e0ff', '#a98bff', '#6a4cff'],
  },
}

export const themeAt = (m) => ZONE_THEMES[ZONES[zoneIndexAt(m)].id]

/** A sign across the canyon at the start of every zone after the first. */
export const GATES = ZONES.slice(1).map((zone) => ({ zone, meter: zone.start }))

const pick = (rand, list) => list[Math.floor(rand() * list.length)]

/** A box lying on the slope: centred x across, h off the floor, metre m, lean about its length. */
function slab(b, m, x, h, sx, sy, sz, color, style = STYLE.STUDS, lean = 0) {
  const [px, py, pz, rotX] = slopeBoxPlacement(m, x, h)
  b.add(px, py, pz, sx, sy, sz, color, style, 0, rotX, lean)
}

/** Height of the ledge top under world z, for standing props on it. */
const ledgeY = (z) => surfaceY(z, WALL_H + 0.5)

// --- The canyon --------------------------------------------------------------------

/** Floor, leaning walls, ledges and the slope's chevrons for metres [a, c). */
function canyon(b, a, c, theme, wide) {
  const len = c - a
  const mid = (a + c) / 2
  const floorStyle = theme.floorStyle ?? STYLE.STUDS
  const wallStyle = theme.wallStyle ?? STYLE.STUDS
  const ledgeStyle = theme.ledgeStyle ?? STYLE.STUDS
  slab(b, mid, 0, -0.5, HALF * 2 + 2, 1, len, theme.floor, floorStyle)
  for (const side of [-1, 1]) {
    // The leaning wall: a thick plate whose inner face runs from the floor's edge up to
    // the rim, so there's no gap behind it to see into.
    const cx = side * (HALF + WALL_RUN / 2) + side * (PLATE_THICK / 2) * Math.cos(LEAN)
    const ch = WALL_H / 2 - (PLATE_THICK / 2) * Math.sin(LEAN)
    slab(b, mid, cx, ch, PLATE_THICK, PLATE_LENGTH, len, theme.wall, wallStyle, -side * LEAN)
    // Solid ground behind the rim, and the ledge on top of it.
    const far = wide ? LEDGE_FAR : LEDGE_NEAR
    const width = far - RIM_X + 0.5
    const bx = side * (RIM_X - 0.5 + width / 2)
    slab(b, mid, bx, (WALL_H - 4) / 2, width, WALL_H + 4, len, theme.wall, wallStyle)
    slab(b, mid, bx, WALL_H + 0.25, width, 0.5, len, theme.ledge, ledgeStyle)
  }
  // Chevrons down the middle every 40 m, pointing the way.
  for (let m = Math.ceil(a / 40) * 40 + 20; m < c; m += 40) {
    const [px, py, pz] = slopeBoxPlacement(m, 0, 0.04)
    for (const side of [-1, 1]) {
      b.add(px + side * 1.1, py, pz, 3, 0.08, 0.9, '#ffffff', STYLE.SMOOTH, -side * 0.7, SLOPE_EULER_X, 0)
    }
  }
  // Light strips along the foot of each wall.
  for (const side of [-1, 1]) slab(b, mid, side * (HALF - 1.2), 0.03, 0.5, 0.06, len, '#ffffff', STYLE.GLOW)
}

/** A sign across the canyon: striped posts at the floor's edges and a beam over the slide. */
function gate(b, meter, color) {
  const z = zAt(meter)
  const base = surfaceY(z, 0)
  const top = 15
  for (const x of [-HALF + 0.6, HALF - 0.6]) {
    b.addOn(x, base - 0.5, z, 2.2, 1.5, 2.2, '#e9eef5')
    b.addOn(x, base + 1, z, 1.6, top - 1, 1.6, color, STYLE.STRIPES)
    b.add(x, base + top + 1, z, 2.4, 2.4, 2.4, '#ffd21f', STYLE.GLOW)
  }
  b.addOn(0, base + top - 1.4, z, HALF * 2, 2.2, 1.4, color, STYLE.STRIPES)
  b.addOn(0, base + top - 1.7, z + 0.1, HALF * 2 - 1, 0.35, 1.5, '#ffffff', STYLE.GLOW)
}

/**
 * A kicker across the floor in the zone's colour, rising RAMP_HEIGHT to its lip at
 * metre `lip` (path.js flies riders off it), with striped rails and a glowing lip.
 */
const RAMP_ANGLE = Math.atan2(RAMP_HEIGHT, RAMP_LENGTH)
const RAMP_FACE = Math.hypot(RAMP_LENGTH, RAMP_HEIGHT)
const RAMP_THICK = 1.4
function ramp(b, lip, color) {
  // The face's centre, then back from it by half the thickness, so the top surface runs
  // exactly from the floor at the foot to RAMP_HEIGHT at the lip.
  const m = lip - RAMP_LENGTH / 2 + (RAMP_THICK / 2) * Math.sin(RAMP_ANGLE)
  const h = RAMP_HEIGHT / 2 - (RAMP_THICK / 2) * Math.cos(RAMP_ANGLE)
  const [x, y, z, rotX] = slopeBoxPlacement(m, 0, h)
  b.add(x, y, z, HALF * 2 - 3, RAMP_THICK, RAMP_FACE, color, STYLE.STUDS, 0, rotX + RAMP_ANGLE)
  for (const side of [-1, 1]) {
    b.add(x + side * (HALF - 1.3), y + 0.12, z, 0.5, RAMP_THICK + 0.1, RAMP_FACE + 0.1, '#ff3b3b', STYLE.STRIPES, 0, rotX + RAMP_ANGLE)
  }
  const [lx, ly, lz] = slopeBoxPlacement(lip - 0.15, 0, RAMP_HEIGHT - 0.12)
  b.add(lx, ly, lz, HALF * 2 - 3.2, 0.3, 0.32, '#ffffff', STYLE.GLOW, 0, rotX)
}

const _lips = []

// --- Props -------------------------------------------------------------------------

function rock(b, x, y, z, s, color) {
  b.addOn(x, y - 0.3, z, 2.4 * s, 1.6 * s, 2 * s, color, STYLE.STUDS, s * 0.7)
  b.addOn(x + 0.5 * s, y + 0.9 * s, z, 1.3 * s, 0.9 * s, 1.2 * s, color, STYLE.STUDS, s * 1.3)
}

function bush(b, x, y, z, s, color) {
  b.addOn(x, y - 0.2, z, 2.2 * s, 1.3 * s, 2.2 * s, color)
  b.addOn(x + 0.3 * s, y + 0.8 * s, z - 0.2 * s, 1.4 * s, 0.9 * s, 1.4 * s, color)
}

function pine(b, x, y, z, s, rand, snowy = false) {
  b.addOn(x, y - 0.3, z, 0.8 * s, 2.7 * s, 0.8 * s, '#6b3f22')
  const green = pick(rand, snowy ? ['#2d7a45', '#24683a'] : ['#2e8b3a', '#237a31', '#33994a'])
  let top = y + 1.8 * s
  for (const w of [5, 4, 3, 2]) {
    b.addOn(x, top, z, w * s, 1.5 * s, w * s, green)
    if (snowy) b.addOn(x, top + 1.5 * s, z, (w - 0.6) * s, 0.25 * s, (w - 0.6) * s, '#ffffff')
    top += 1.4 * s
  }
}

/** A round-topped tree in autumn colours. */
function autumnTree(b, x, y, z, s, rand) {
  b.addOn(x, y - 0.3, z, 0.9 * s, 3.3 * s, 0.9 * s, '#6b3f22')
  const leaves = pick(rand, ['#ff8a1e', '#ff5a2a', '#ffc12a', '#e8452c'])
  b.addOn(x, y + 2.6 * s, z, 4.6 * s, 2.2 * s, 4.6 * s, leaves)
  b.addOn(x, y + 4.8 * s, z, 3.2 * s, 1.6 * s, 3.2 * s, leaves)
  b.addOn(x, y + 6.4 * s, z, 1.6 * s, 1 * s, 1.6 * s, leaves)
}

function pumpkin(b, x, y, z, s) {
  b.addOn(x, y - 0.1, z, 1.6 * s, 1.2 * s, 1.6 * s, '#ff8a1e')
  b.addOn(x, y - 0.1, z, 1.9 * s, 1 * s, 1.1 * s, '#ff7a14')
  b.addOn(x, y + 1.1 * s, z, 0.25 * s, 0.45 * s, 0.25 * s, '#3f7a2a')
}

function cactus(b, x, y, z, h, rand) {
  b.addOn(x, y - 0.3, z, 0.9, h + 0.3, 0.9, '#3fa34d')
  const armY = y + h * (0.4 + rand() * 0.2)
  b.addOn(x + 0.9, armY, z, 1, 0.6, 0.6, '#3fa34d')
  b.addOn(x + 1.2, armY, z, 0.6, 1.8, 0.6, '#3fa34d')
  if (rand() < 0.6) {
    b.addOn(x - 0.9, armY + 0.8, z, 1, 0.6, 0.6, '#3fa34d')
    b.addOn(x - 1.2, armY + 0.8, z, 0.6, 1.4, 0.6, '#3fa34d')
  }
  if (rand() < 0.4) b.addOn(x, y + h, z, 0.5, 0.35, 0.5, '#ff6fa8')
}

function pyramid(b, x, y, z, size) {
  for (let i = 0; i < 6; i += 1) {
    const w = size * (1 - i / 6)
    b.addOn(x, y - 1 + i * size * 0.14, z, w, size * 0.14, w, i % 2 ? '#e6be72' : '#dcb162')
  }
}

function sandPile(b, x, y, z, s) {
  b.addOn(x, y - 0.2, z, 3.2 * s, 0.8 * s, 2.4 * s, '#f0c674')
  b.addOn(x, y + 0.6 * s, z, 2 * s, 0.6 * s, 1.6 * s, '#e8b85c')
}

function snowman(b, x, y, z) {
  b.addOn(x, y - 0.2, z, 2.2, 2.2, 2.2, '#ffffff')
  b.addOn(x, y + 2, z, 1.6, 1.5, 1.6, '#ffffff')
  b.addOn(x, y + 3.5, z, 1.1, 1.1, 1.1, '#ffffff')
  b.addOn(x, y + 3.95, z + 0.75, 0.25, 0.25, 0.6, '#ff8a1e', STYLE.SMOOTH)
  b.addOn(x, y + 4.6, z, 1.3, 0.2, 1.3, '#1d1f24', STYLE.SMOOTH)
  b.addOn(x, y + 4.8, z, 0.8, 0.8, 0.8, '#1d1f24', STYLE.SMOOTH)
}

function iceCrystal(b, x, y, z, s) {
  b.add(x, y + 1.4 * s, z, 1 * s, 3.4 * s, 1 * s, '#9fdcff', STYLE.GLOW, 0.4, 0, 0.25)
  b.add(x + 0.8 * s, y + 0.9 * s, z, 0.7 * s, 2.2 * s, 0.7 * s, '#c9eeff', STYLE.GLOW, 1.1, 0, -0.35)
}

function lollipop(b, x, y, z, s, rand) {
  b.addOn(x, y - 0.3, z, 0.3 * s, 4.3 * s, 0.3 * s, '#ffffff', STYLE.SMOOTH)
  const c = pick(rand, ['#ff4f9a', '#4fd2ff', '#ffd23f', '#7dff6a', '#b86bff'])
  b.add(x, y + 4.6 * s, z, 2.6 * s, 2.6 * s, 0.5 * s, c, STYLE.SMOOTH, rand() * 3)
  b.add(x, y + 4.6 * s, z, 1.6 * s, 1.6 * s, 0.6 * s, '#ffffff', STYLE.SMOOTH, rand() * 3)
}

function candyCane(b, x, y, z, s) {
  b.addOn(x, y - 0.3, z, 0.6 * s, 5.3 * s, 0.6 * s, '#ff3b5c', STYLE.STRIPES)
  b.addOn(x + 0.7 * s, y + 5 * s, z, 2 * s, 0.6 * s, 0.6 * s, '#ff3b5c', STYLE.STRIPES)
  b.addOn(x + 1.4 * s, y + 4 * s, z, 0.6 * s, 1.2 * s, 0.6 * s, '#ff3b5c', STYLE.STRIPES)
}

function gumdrop(b, x, y, z, s, rand) {
  const c = pick(rand, ['#7dff9a', '#ff8fd0', '#8fd8ff', '#ffe066'])
  b.addOn(x, y - 0.2, z, 2.4 * s, 1 * s, 2.4 * s, c, STYLE.SMOOTH)
  b.addOn(x, y + 0.8 * s, z, 1.7 * s, 0.8 * s, 1.7 * s, c, STYLE.SMOOTH)
  b.addOn(x, y + 1.6 * s, z, 0.9 * s, 0.5 * s, 0.9 * s, c, STYLE.SMOOTH)
}

function volcano(b, x, y, z, size) {
  for (let i = 0; i < 6; i += 1) {
    const w = size * (1 - i / 7.5)
    b.addOn(x, y - 1 + i * size * 0.12, z, w, size * 0.12, w, i % 2 ? '#2f2a2d' : '#3a3337')
  }
  b.addOn(x, y - 1 + size * 0.72, z, size * 0.22, 0.4, size * 0.22, '#ff6a14', STYLE.LAVA)
}

function lavaPool(b, x, y, z, s) {
  b.addOn(x, y - 0.4, z, 5 * s, 0.5, 3.5 * s, '#ff6a14', STYLE.LAVA)
}

function crystal(b, x, y, z, s, rand) {
  const c = pick(rand, ['#c08bff', '#7fe2ff', '#ff7ad9', '#9b6bff'])
  b.add(x, y + 1.8 * s, z, 1.2 * s, 4.2 * s, 1.2 * s, c, STYLE.GLOW, rand() * 3, 0, 0.2)
  b.add(x + 1 * s, y + 1 * s, z + 0.4 * s, 0.8 * s, 2.6 * s, 0.8 * s, c, STYLE.GLOW, rand() * 3, 0, -0.4)
  b.add(x - 0.9 * s, y + 0.8 * s, z - 0.3 * s, 0.7 * s, 2 * s, 0.7 * s, c, STYLE.GLOW, rand() * 3, 0.3, 0.3)
}

function asteroid(b, x, y, z, s, rand) {
  b.add(x, y, z, 2.4 * s, 2 * s, 2.2 * s, pick(rand, ['#8a8a99', '#6f6f80', '#9a8f86']), STYLE.STUDS, rand() * 3, rand() * 3, rand() * 3)
}

function planet(b, x, y, z, r, color, ring) {
  b.add(x, y, z, r * 2, r * 1.4, r * 1.4, color, STYLE.GLOW)
  b.add(x, y, z, r * 1.4, r * 2, r * 1.4, color, STYLE.GLOW)
  b.add(x, y, z, r * 1.4, r * 1.4, r * 2, color, STYLE.GLOW)
  if (ring) b.add(x, y, z, r * 3.6, 0.3, r * 3.6, ring, STYLE.GLOW, 0.3, 0.2, 0)
}

// --- Scenery -----------------------------------------------------------------------

/**
 * Calls `place(m, side, y)` along metres [m0, m1) about every `spacing` metres, on one
 * or both ledges. `y` is the ledge height there.
 */
function along(m0, m1, spacing, rand, density, place) {
  for (let m = m0 + spacing * rand(); m < m1; m += spacing * (0.8 + rand() * 0.6)) {
    if (m < DECOR_START || rand() > density) continue
    for (const side of [-1, 1]) if (rand() < 0.85) place(m, side)
  }
}

/** A spot on the ledge at metre m, `out` metres beyond the rim. */
const spot = (m, side, out) => {
  const z = zAt(m)
  return [side * (RIM_X + out), ledgeY(z), z]
}

const DECOR = {
  grassy(b, m0, m1, rand, density) {
    along(m0, m1, 9, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 30)
      addTree(b, x, y - 0.3, z, 0.9 + rand() * 0.5, rand)
    })
    along(m0, m1, 14, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 1.5 + rand() * 6)
      if (rand() < 0.5) rock(b, x, y, z, 0.6 + rand() * 0.6, '#9aa1a8')
      else bush(b, x, y, z, 0.8 + rand() * 0.5, '#3fbf3a')
    })
  },
  desert(b, m0, m1, rand, density) {
    along(m0, m1, 8, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 26)
      cactus(b, x, y, z, 3 + rand() * 3, rand)
    })
    along(m0, m1, 18, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 12)
      sandPile(b, x, y, z, 0.8 + rand() * 0.6)
    })
    along(m0, m1, 70, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 35 + rand() * 40)
      pyramid(b, x, y, z, 16 + rand() * 12)
    })
  },
  frozen(b, m0, m1, rand, density) {
    along(m0, m1, 7, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 32)
      pine(b, x, y, z, 0.8 + rand() * 0.6, rand, true)
    })
    along(m0, m1, 26, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 6)
      snowman(b, x, y, z)
    })
    along(m0, m1, 16, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 18)
      iceCrystal(b, x, y, z, 0.8 + rand() * 0.7)
    })
  },
  autumn(b, m0, m1, rand, density) {
    along(m0, m1, 8, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 30)
      autumnTree(b, x, y, z, 0.9 + rand() * 0.5, rand)
    })
    along(m0, m1, 15, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 1.5 + rand() * 8)
      pumpkin(b, x, y, z, 0.8 + rand() * 0.6)
    })
  },
  candy(b, m0, m1, rand, density) {
    along(m0, m1, 9, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 28)
      lollipop(b, x, y, z, 0.9 + rand() * 0.6, rand)
    })
    along(m0, m1, 14, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 10)
      if (rand() < 0.5) candyCane(b, x, y, z, 0.9 + rand() * 0.4)
      else gumdrop(b, x, y, z, 0.8 + rand() * 0.6, rand)
    })
  },
  volcano(b, m0, m1, rand, density) {
    along(m0, m1, 12, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 24)
      rock(b, x, y, z, 0.8 + rand() * 0.8, '#2a2427')
    })
    along(m0, m1, 20, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 4 + rand() * 14)
      lavaPool(b, x, y, z, 0.8 + rand() * 0.6)
    })
    along(m0, m1, 70, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 40 + rand() * 40)
      volcano(b, x, y, z, 20 + rand() * 12)
    })
  },
  crystal(b, m0, m1, rand, density) {
    along(m0, m1, 8, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 28)
      crystal(b, x, y, z, 0.8 + rand() * 0.8, rand)
    })
    along(m0, m1, 16, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 10)
      rock(b, x, y, z, 0.7 + rand() * 0.6, '#3b2a6a')
    })
  },
  space(b, m0, m1, rand, density) {
    along(m0, m1, 8, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 4 + rand() * 40)
      asteroid(b, x, y + 4 + rand() * 20, z, 0.6 + rand() * 1.2, rand)
    })
    if (rand() < 0.5 * density) {
      const m = m0 + rand() * CHUNK
      const z = zAt(m)
      const color = pick(rand, ['#ff7ad9', '#7fe2ff', '#ffb14a', '#9b6bff'])
      planet(b, (rand() < 0.5 ? -1 : 1) * (70 + rand() * 40), ledgeY(z) + 25 + rand() * 30, z, 6 + rand() * 6, color, rand() < 0.5 ? '#ffe45c' : null)
    }
  },
}

/**
 * Builds chunk `index` (metres [index*CHUNK, (index+1)*CHUNK)).
 * @param {{ density?: number }} options 0-1 scenery density (quality and speed)
 */
export function buildChunk(index, { density = 1 } = {}) {
  const b = new BlockSet()
  const rand = mulberry32(index * 7919 + 13)
  const m0 = index * CHUNK
  const m1 = m0 + CHUNK
  // The first chunk sits beside the lobby's hills; past it the ledges run out wide.
  const wide = index > 0

  // Split the chunk at zone boundaries so each part gets its own colours and scenery.
  const cuts = [m0]
  for (const zone of ZONES) if (zone.start > m0 && zone.start < m1) cuts.push(zone.start)
  cuts.push(m1)

  for (let i = 0; i < cuts.length - 1; i += 1) {
    const a = cuts[i]
    const c = cuts[i + 1]
    const zone = ZONES[zoneIndexAt(a)]
    canyon(b, a, c, ZONE_THEMES[zone.id], wide)
    DECOR[zone.id](b, a, c, rand, density)
  }

  for (const g of GATES) {
    if (g.meter >= m0 && g.meter < m1) gate(b, g.meter, ZONE_THEMES[g.zone.id].gate)
  }
  for (const lip of rampLips(m0, m1, _lips)) ramp(b, lip, themeAt(lip).gate)
  return b
}
