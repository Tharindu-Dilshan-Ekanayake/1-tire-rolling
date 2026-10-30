import { zoneIndexAt } from '@shared/logic'

import { perWorld, zones } from '../worldLook'
import { mulberry32 } from '@shared/rng'
import { CANYON_HALF_WIDTH } from '@shared/world'

import { BlockSet } from '../blocks'
import { STYLE } from '../materials'
import { addTree } from '../world/terrain'
import { RAMP_HEIGHT, RAMP_LENGTH, rampLips, slopeBoxPlacement, SLOPE_EULER_X, surfaceY, zAt } from './path'

/**
 * The track: a canyon running north from the plaza, generated in 60 m chunks on
 * demand. Each chunk is a BlockSet (one draw call); content is seeded by chunk index,
 * so every client builds an identical canyon and a chunk can be thrown away and rebuilt
 * at will.
 *
 * Cross-section: a wide studded floor, walls leaning out on both sides up to a grassy
 * ledge WALL_H above the floor, and scenery along the ledges. Every stage starts at a
 * gate with a wooden wall across the canyon: both are Walls.jsx's, so they're there
 * even when the track is rushing past too fast to build its scenery.
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

/** Per-theme look (each stage names one in its `theme`): floor, walls, ledge, accent (wall posts, ramps) and sky colours, and the HUD's name colour. */
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
  beach: {
    floor: '#f6e3a6',
    wall: '#e9cf8a',
    ledge: '#ffe8a8',
    gate: '#2fc6ff',
    sky: ['#1f9cf5', '#bdf0ff'],
    name: ['#e0fbff', '#5fe0ff', '#1a9cf0'],
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
  sky: {
    floor: '#f2f7ff',
    wall: '#dbe9ff',
    ledge: '#ffffff',
    gate: '#ffd84a',
    sky: ['#5fb8ff', '#fff4d6'],
    name: ['#ffffff', '#ffe98a', '#ffb21e'],
  },
  jungle: {
    floor: '#7a9a4a',
    wall: '#5f7a3a',
    ledge: '#2f9a3a',
    gate: '#3fd16a',
    sky: ['#2f9ad8', '#cfeec0'],
    name: ['#e6ffd0', '#7dff7a', '#1fa83a'],
  },
  cherry: {
    floor: '#f6d6e4',
    wall: '#e8b8cc',
    ledge: '#ffe0ee',
    gate: '#ff7ab8',
    sky: ['#7ab4ff', '#ffe4f0'],
    name: ['#fff0f8', '#ffa8d4', '#ff4f9a'],
  },
  mushroom: {
    floor: '#8a6a9a',
    wall: '#6f5280',
    ledge: '#7ad05a',
    gate: '#c46bff',
    sky: ['#5a6ad8', '#e0c8ff'],
    name: ['#f4e6ff', '#d29bff', '#9a3be8'],
  },
  swamp: {
    floor: '#6a8a5a',
    wall: '#4f6a44',
    ledge: '#5fb04a',
    gate: '#8ae04a',
    sky: ['#4a9ab8', '#d8f0c8'],
    name: ['#f0ffd8', '#b8f05a', '#5ab82a'],
  },
  ocean: {
    floor: '#f2e2b0',
    wall: '#3f9ac8',
    ledge: '#5fd0e8',
    gate: '#ff7a8a',
    sky: ['#1a6ad0', '#8ae8ff'],
    name: ['#e0fbff', '#7fe8ff', '#1a9cd8'],
  },
  neon: {
    floor: '#1d1d2e',
    floorStyle: STYLE.ROAD,
    wall: '#26263a',
    ledge: '#39ff88',
    ledgeStyle: STYLE.GLOW,
    gate: '#ff3bd8',
    sky: ['#120a30', '#5a2a8a'],
    name: ['#e6fff0', '#39ff88', '#1ab85a'],
  },
  rainbow: {
    floor: '#ffffff',
    floorStyle: STYLE.RAINBOW,
    wall: '#f4f0ff',
    ledge: '#ffffff',
    gate: '#ffd84a',
    sky: ['#6a8aff', '#ffe8f8'],
    name: ['#ffffff', '#ffb8f0', '#ff5fd2'],
  },
  moon: {
    floor: '#b8bcc8',
    wall: '#9a9eac',
    ledge: '#d8dce6',
    gate: '#5fc8ff',
    sky: ['#0a0a24', '#3a3a5a'],
    name: ['#ffffff', '#cfd8ea', '#7f8aa8'],
  },
  aurora: {
    floor: '#d8f0ff',
    wall: '#9ac8e8',
    ledge: '#ffffff',
    gate: '#5fffc8',
    sky: ['#0f2a5a', '#5ad8b8'],
    name: ['#e0fff4', '#7fffd0', '#2fc89a'],
  },
  cosmic: {
    floor: '#2a0f4a',
    floorStyle: STYLE.GALAXY,
    wall: '#3a1a6a',
    wallStyle: STYLE.GALAXY,
    ledge: '#ff5bd8',
    ledgeStyle: STYLE.GLOW,
    gate: '#ff5bd8',
    sky: ['#0a0018', '#3a0a4a'],
    name: ['#ffe6fb', '#ff9cf0', '#d43bc8'],
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

export const themeAt = (m) => ZONE_THEMES[zones()[zoneIndexAt(m)].theme]

/**
 * The gate (and its wooden wall) at the start of every stage after the first, in the
 * world you're in: `index` into its stages. Every world's gates stand at the same metres.
 */
export const walls = perWorld((zs) => zs.slice(1).map((zone, i) => ({ zone, index: i + 1, meter: zone.start })))
export const WALL_COUNT = walls().length

/** How high the walls' planks stand (Walls.jsx), right up to the gate's beam. */
export const WALL_PLANK_TOP = 9
/** The gate's beam over the wall: the stage's name sign sits on its face. */
export const GATE_BEAM_Y = WALL_PLANK_TOP + 0.6
export const GATE_BEAM_H = 4.4

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
  // Light strips along the foot of each wall, in the stage's colour.
  for (const side of [-1, 1]) slab(b, mid, side * (HALF - 1.2), 0.03, 0.5, 0.06, len, theme.gate, STYLE.GLOW)
}


/**
 * A kicker across the floor in the zone's colour, rising RAMP_HEIGHT to its lip at
 * metre `lip` (path.js flies tires off it), with striped rails and a glowing lip.
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
const AUTUMN_LEAVES = ['#ff8a1e', '#ff5a2a', '#ffc12a', '#e8452c']
const BLOSSOM = ['#ffb8d8', '#ff9cc8', '#ffd6e8', '#ff8ac0']

/** A round-topped tree, autumn colours unless given `leaves`. */
function autumnTree(b, x, y, z, s, rand, leaves = pick(rand, AUTUMN_LEAVES)) {
  b.addOn(x, y - 0.3, z, 0.9 * s, 3.3 * s, 0.9 * s, '#6b3f22')
  b.addOn(x, y + 2.6 * s, z, 4.6 * s, 2.2 * s, 4.6 * s, leaves)
  b.addOn(x, y + 4.8 * s, z, 3.2 * s, 1.6 * s, 3.2 * s, leaves)
  b.addOn(x, y + 6.4 * s, z, 1.6 * s, 1 * s, 1.6 * s, leaves)
}

/** A red-capped mushroom with white spots. */
function mushroom(b, x, y, z, s) {
  b.addOn(x, y - 0.2, z, 0.6 * s, 1.4 * s, 0.6 * s, '#f4ead6')
  b.addOn(x, y + 1.1 * s, z, 1.9 * s, 0.6 * s, 1.9 * s, '#e8452c')
  b.addOn(x, y + 1.7 * s, z, 1.2 * s, 0.35 * s, 1.2 * s, '#e8452c')
  b.add(x + 0.5 * s, y + 1.75 * s, z + 0.3 * s, 0.3 * s, 0.12 * s, 0.3 * s, '#ffffff', STYLE.SMOOTH)
  b.add(x - 0.4 * s, y + 1.5 * s, z - 0.5 * s, 0.25 * s, 0.12 * s, 0.25 * s, '#ffffff', STYLE.SMOOTH)
}

/** A round hay bale lying in the leaves. */
function hayBale(b, x, y, z, s) {
  b.addOn(x, y - 0.2, z, 1.8 * s, 1.4 * s, 1.4 * s, '#e8c25a')
  b.addOn(x, y - 0.2, z, 1.82 * s, 0.2 * s, 1.42 * s, '#c99a3a')
}

function palm(b, x, y, z, s, rand) {
  let top = y - 0.3
  const lean = (rand() - 0.5) * 0.8
  for (let i = 0; i < 6; i += 1) {
    b.addOn(x + lean * i * 0.35 * s, top, z, 0.7 * s, 1.1 * s, 0.7 * s, i % 2 ? '#a8743f' : '#8a5a32')
    top += 1.05 * s
  }
  const cx = x + lean * 2.1 * s
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2
    b.add(cx + Math.cos(a) * 1.6 * s, top + 0.1 * s, z + Math.sin(a) * 1.6 * s, 3.4 * s, 0.25 * s, 0.9 * s, '#3fbf3a', STYLE.STUDS, -a, 0, 0.35)
  }
  b.addOn(cx, top - 0.4 * s, z, 0.6 * s, 0.6 * s, 0.6 * s, '#6b4428')
}

function umbrella(b, x, y, z, s, rand) {
  b.addOn(x, y - 0.3, z, 0.18 * s, 3 * s, 0.18 * s, '#ffffff', STYLE.SMOOTH)
  const c = pick(rand, ['#ff4f6a', '#2fb8ff', '#ffd23f', '#7dff6a'])
  b.add(x, y + 2.8 * s, z, 3 * s, 0.35 * s, 3 * s, c, STYLE.STRIPES, rand() * 3)
  b.addOn(x + 1.4 * s, y - 0.25, z + 0.6 * s, 1.6 * s, 0.15 * s, 2.6 * s, pick(rand, ['#ffffff', '#ff8fd0', '#8fd8ff']))
}

function sandCastle(b, x, y, z, s) {
  b.addOn(x, y - 0.2, z, 3 * s, 1.2 * s, 3 * s, '#f0d080')
  for (const dx of [-1.1, 1.1]) for (const dz of [-1.1, 1.1]) b.addOn(x + dx * s, y + 1 * s, z + dz * s, 0.8 * s, 1.2 * s, 0.8 * s, '#e8c46e')
  b.addOn(x, y + 1 * s, z, 1.2 * s, 2 * s, 1.2 * s, '#f0d080')
  b.add(x, y + 3.3 * s, z, 0.08 * s, 0.9 * s, 0.08 * s, '#ffffff', STYLE.SMOOTH)
  b.add(x + 0.25 * s, y + 3.55 * s, z, 0.5 * s, 0.3 * s, 0.05 * s, '#ff3b5c', STYLE.SMOOTH)
}

/** A tumbledown temple: mossy stone blocks, a doorway, a creeper or two. */
function ruin(b, x, y, z, s, rand) {
  const stone = pick(rand, ['#9a9a88', '#8a8c7a', '#a8a690'])
  b.addOn(x, y - 0.3, z, 5 * s, 1 * s, 4 * s, stone)
  for (const dx of [-1.8, 1.8]) b.addOn(x + dx * s, y + 0.7 * s, z, 1.2 * s, (3 + rand() * 2) * s, 1.2 * s, stone)
  b.addOn(x, y + 4.4 * s, z, 5 * s, 0.9 * s, 1.6 * s, stone)
  b.addOn(x - 1.2 * s, y + 5.3 * s, z, 1.6 * s, 0.4 * s, 1.6 * s, '#3fa83a')
  b.add(x + 1.8 * s, y + 2.5 * s, z + 0.65 * s, 0.25 * s, 3 * s, 0.1 * s, '#2e8b3a', STYLE.SMOOTH)
}

/** A towering spotted mushroom in a bright cap. */
function giantMushroom(b, x, y, z, s, rand) {
  const cap = pick(rand, ['#e8452c', '#4f8aff', '#b86bff', '#ffb21e'])
  b.addOn(x, y - 0.3, z, 1.2 * s, 5 * s, 1.2 * s, '#f4ead6')
  b.addOn(x, y + 4.4 * s, z, 5.4 * s, 1.4 * s, 5.4 * s, cap)
  b.addOn(x, y + 5.8 * s, z, 3.6 * s, 0.8 * s, 3.6 * s, cap)
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    b.add(x + Math.cos(a) * 1.8 * s, y + 5.9 * s, z + Math.sin(a) * 1.8 * s, 0.7 * s, 0.25 * s, 0.7 * s, '#ffffff', STYLE.SMOOTH)
  }
}

/** A pond with lily pads, and reeds at its edge. */
function lilyPond(b, x, y, z, s, rand) {
  b.addOn(x, y - 0.45, z, 6 * s, 0.5, 4.5 * s, '#3fa8a0', STYLE.WATER)
  for (let i = 0; i < 4; i += 1) {
    b.add(x + (rand() - 0.5) * 4 * s, y + 0.08, z + (rand() - 0.5) * 3 * s, 1 * s, 0.08, 1 * s, '#4fc83a', STYLE.SMOOTH, rand() * 3)
  }
  if (rand() < 0.6) b.add(x + 0.6 * s, y + 0.2, z, 0.35 * s, 0.25 * s, 0.35 * s, '#ff8ac0', STYLE.GLOW)
  for (let i = 0; i < 5; i += 1) b.addOn(x + 3.2 * s, y - 0.3, z - 1.6 * s + i * 0.8 * s, 0.15, (1.8 + rand()) * s, 0.15, '#6a8a2a', STYLE.SMOOTH)
}

/** A willow: a thick trunk and a wide, drooping green crown. */
function willow(b, x, y, z, s) {
  b.addOn(x, y - 0.3, z, 1 * s, 4 * s, 1 * s, '#5a4028')
  b.addOn(x, y + 3.6 * s, z, 5.5 * s, 1.6 * s, 5.5 * s, '#5fa83a')
  for (const [dx, dz] of [[-2.4, 0], [2.4, 0], [0, -2.4], [0, 2.4]]) b.addOn(x + dx * s, y + 1.4 * s, z + dz * s, 0.8 * s, 2.4 * s, 0.8 * s, '#6fb84a')
}

/** Branching coral in a bright colour. */
function coral(b, x, y, z, s, rand) {
  const c = pick(rand, ['#ff6a8a', '#ffb21e', '#b86bff', '#ff8a4a', '#4fe0d0'])
  b.addOn(x, y - 0.3, z, 0.6 * s, 3 * s, 0.6 * s, c)
  b.add(x + 0.8 * s, y + 1.8 * s, z, 0.5 * s, 2 * s, 0.5 * s, c, STYLE.STUDS, 0, 0, -0.5)
  b.add(x - 0.7 * s, y + 2.2 * s, z, 0.5 * s, 1.8 * s, 0.5 * s, c, STYLE.STUDS, 0, 0, 0.6)
  b.add(x, y + 3 * s, z, 0.9 * s, 0.9 * s, 0.9 * s, c, STYLE.GLOW)
}

/** Seaweed swaying up from the sand. */
function seaweed(b, x, y, z, s, rand) {
  for (let i = 0; i < 4; i += 1) {
    b.add(x + Math.sin(i * 1.3) * 0.3 * s, y + (0.6 + i * 1.1) * s, z, 0.4 * s, 1.2 * s, 0.25 * s, '#2fae5a', STYLE.SMOOTH, rand() * 0.5, 0, Math.sin(i) * 0.3)
  }
}

/** A dark tower with glowing window strips and a neon cap. */
function neonTower(b, x, y, z, s, rand) {
  const h = (12 + rand() * 18) * s
  const glow = pick(rand, ['#39ff88', '#ff3bd8', '#3fd0ff', '#ffe14a'])
  b.addOn(x, y - 0.5, z, 6 * s, h, 6 * s, '#1d1d2e', STYLE.WINDOWS)
  for (let k = 3; k < h - 1; k += 4 * s) b.add(x, y + k, z, 6.2 * s, 0.25 * s, 6.2 * s, glow, STYLE.GLOW)
  b.add(x, y + h - 0.2, z, 4 * s, 0.6 * s, 4 * s, glow, STYLE.GLOW)
}

/** A pillar of rainbow blocks topped by a cloud. */
function rainbowPillar(b, x, y, z, s, rand) {
  const colors = ['#ff3b5c', '#ff9a1f', '#ffe53b', '#4ef05a', '#2fc6ff', '#8a5cff']
  colors.forEach((c, i) => b.addOn(x, y - 0.3 + i * 1.2 * s, z, 1.6 * s, 1.2 * s, 1.6 * s, c, STYLE.SMOOTH))
  cloud(b, x, y + 8 * s, z, 0.6 * s, rand)
}

/** A crater: a low grey rim round a darker floor. */
function crater(b, x, y, z, s) {
  b.addOn(x, y - 0.35, z, 6 * s, 0.5 * s, 6 * s, '#8a8e9a')
  b.addOn(x, y - 0.3, z, 4.4 * s, 0.5 * s, 4.4 * s, '#6a6e7a')
}

/** A moon-base dome with an antenna, or a rocket on its pad. */
function moonBase(b, x, y, z, s, rand) {
  if (rand() < 0.5) {
    b.addOn(x, y - 0.3, z, 5 * s, 2 * s, 5 * s, '#e8ecf4', STYLE.SMOOTH)
    b.addOn(x, y + 1.7 * s, z, 3.4 * s, 1.2 * s, 3.4 * s, '#9fe8ff', STYLE.GLOW)
    b.addOn(x + 1.5 * s, y + 1.7 * s, z, 0.15 * s, 3 * s, 0.15 * s, '#c4ccd8', STYLE.SMOOTH)
    b.add(x + 1.5 * s, y + 4.8 * s, z, 0.5 * s, 0.5 * s, 0.5 * s, '#ff3b3b', STYLE.GLOW)
  } else {
    b.addOn(x, y - 0.3, z, 4 * s, 0.6 * s, 4 * s, '#5a5e6a')
    b.addOn(x, y + 0.3 * s, z, 1.6 * s, 6 * s, 1.6 * s, '#ffffff', STYLE.SMOOTH)
    b.addOn(x, y + 6.3 * s, z, 1 * s, 1.4 * s, 1 * s, '#ff3b3b', STYLE.SMOOTH)
    for (const dx of [-1.1, 1.1]) b.addOn(x + dx * s, y + 0.3 * s, z, 0.6 * s, 2 * s, 1.2 * s, '#ff3b3b', STYLE.SMOOTH)
  }
}

/** A glowing orb hovering over the ground. */
function orb(b, x, y, z, s, rand) {
  const c = pick(rand, ['#ff5bd8', '#7fe2ff', '#ffd84a', '#9b6bff'])
  b.add(x, y, z, 1.8 * s, 1.8 * s, 1.8 * s, c, STYLE.GLOW, rand() * 3, rand() * 3, rand() * 3)
  b.add(x, y, z, 2.6 * s, 0.2 * s, 2.6 * s, '#ffffff', STYLE.GLOW, rand() * 3, 0.4, 0.2)
}

/** A blocky cumulus: a few overlapping white slabs. */
function cloud(b, x, y, z, s, rand) {
  b.add(x, y, z, 6 * s, 2 * s, 4 * s, '#ffffff', STYLE.SMOOTH)
  b.add(x + 1.8 * s, y + 1.1 * s, z + 0.3 * s, 3.4 * s, 1.8 * s, 3 * s, '#ffffff', STYLE.SMOOTH)
  b.add(x - 1.6 * s, y + 0.7 * s, z - 0.4 * s, 3 * s, 1.6 * s, 2.8 * s, '#f3f7ff', STYLE.SMOOTH)
  if (rand() < 0.4) b.add(x, y - 1 * s, z, 4 * s, 0.4 * s, 3 * s, '#e3ecff', STYLE.SMOOTH)
}

/** A sky tower: a white pillar with a gold roof. */
function skyTower(b, x, y, z, s) {
  b.addOn(x, y - 0.5, z, 3 * s, 9 * s, 3 * s, '#f4f7ff')
  b.addOn(x, y + 8.5 * s, z, 3.8 * s, 0.6 * s, 3.8 * s, '#ffd21f', STYLE.GLOW)
  b.addOn(x, y + 9.1 * s, z, 2.4 * s, 1.6 * s, 2.4 * s, '#ffcf3a')
  b.addOn(x, y + 10.7 * s, z, 1.2 * s, 1.2 * s, 1.2 * s, '#ffcf3a')
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
      if (rand() < 0.5) mushroom(b, x, y, z, 0.8 + rand() * 0.6)
      else hayBale(b, x, y, z, 0.8 + rand() * 0.5)
    })
  },
  beach(b, m0, m1, rand, density) {
    along(m0, m1, 9, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 30)
      palm(b, x, y, z, 0.9 + rand() * 0.5, rand)
    })
    along(m0, m1, 16, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 10)
      if (rand() < 0.6) umbrella(b, x, y, z, 0.9 + rand() * 0.4, rand)
      else sandCastle(b, x, y, z, 0.8 + rand() * 0.5)
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
  sky(b, m0, m1, rand, density) {
    along(m0, m1, 10, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 4 + rand() * 40)
      cloud(b, x, y + 2 + rand() * 18, z, 0.8 + rand() * 0.9, rand)
    })
    along(m0, m1, 45, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 8 + rand() * 30)
      skyTower(b, x, y, z, 0.9 + rand() * 0.6)
    })
  },
  jungle(b, m0, m1, rand, density) {
    along(m0, m1, 8, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 30)
      if (rand() < 0.5) palm(b, x, y, z, 1 + rand() * 0.5, rand)
      else addTree(b, x, y - 0.3, z, 1.1 + rand() * 0.5, rand)
    })
    along(m0, m1, 30, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 6 + rand() * 20)
      ruin(b, x, y, z, 0.9 + rand() * 0.5, rand)
    })
    along(m0, m1, 12, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 1.5 + rand() * 6)
      bush(b, x, y, z, 0.9 + rand() * 0.5, '#2e9a3a')
    })
  },
  cherry(b, m0, m1, rand, density) {
    along(m0, m1, 8, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 30)
      autumnTree(b, x, y, z, 0.9 + rand() * 0.5, rand, pick(rand, BLOSSOM))
    })
    along(m0, m1, 14, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 1.5 + rand() * 8)
      bush(b, x, y, z, 0.7 + rand() * 0.4, '#ffc2dc')
    })
  },
  mushroom(b, m0, m1, rand, density) {
    along(m0, m1, 10, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 4 + rand() * 30)
      giantMushroom(b, x, y, z, 0.9 + rand() * 0.7, rand)
    })
    along(m0, m1, 12, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 1.5 + rand() * 6)
      mushroom(b, x, y, z, 0.8 + rand() * 0.5)
    })
  },
  swamp(b, m0, m1, rand, density) {
    along(m0, m1, 10, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 4 + rand() * 30)
      willow(b, x, y, z, 0.9 + rand() * 0.5)
    })
    along(m0, m1, 18, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 12)
      lilyPond(b, x, y, z, 0.8 + rand() * 0.5, rand)
    })
  },
  ocean(b, m0, m1, rand, density) {
    along(m0, m1, 7, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 28)
      if (rand() < 0.55) coral(b, x, y, z, 0.9 + rand() * 0.6, rand)
      else seaweed(b, x, y, z, 0.9 + rand() * 0.6, rand)
    })
    along(m0, m1, 16, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 10)
      rock(b, x, y, z, 0.6 + rand() * 0.5, '#f0c8a8')
    })
  },
  neon(b, m0, m1, rand, density) {
    along(m0, m1, 14, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 6 + rand() * 30)
      neonTower(b, x, y, z, 0.8 + rand() * 0.6, rand)
    })
  },
  rainbow(b, m0, m1, rand, density) {
    along(m0, m1, 12, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 26)
      rainbowPillar(b, x, y, z, 0.8 + rand() * 0.5, rand)
    })
    along(m0, m1, 10, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 6 + rand() * 40)
      cloud(b, x, y + 4 + rand() * 14, z, 0.7 + rand() * 0.8, rand)
    })
  },
  moon(b, m0, m1, rand, density) {
    along(m0, m1, 12, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 30)
      crater(b, x, y, z, 0.8 + rand() * 0.8)
    })
    along(m0, m1, 30, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 8 + rand() * 24)
      moonBase(b, x, y, z, 0.9 + rand() * 0.5, rand)
    })
  },
  aurora(b, m0, m1, rand, density) {
    along(m0, m1, 7, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 32)
      pine(b, x, y, z, 0.8 + rand() * 0.6, rand, true)
    })
    along(m0, m1, 14, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 16)
      iceCrystal(b, x, y, z, 0.9 + rand() * 0.7)
    })
  },
  cosmic(b, m0, m1, rand, density) {
    along(m0, m1, 8, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 3 + rand() * 36)
      orb(b, x, y + 3 + rand() * 14, z, 0.7 + rand() * 1, rand)
    })
    along(m0, m1, 12, rand, density, (m, side) => {
      const [x, y, z] = spot(m, side, 2 + rand() * 14)
      crystal(b, x, y, z, 0.8 + rand() * 0.8, rand)
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

// --- Along the track ---------------------------------------------------------------

/**
 * Props standing on the canyon floor along both edges, where the chase camera sees them
 * go by (the scenery above is mostly out of its view): each stage its own. They keep to
 * the outer few metres, clear of every tire's line, and away from gates and ramps.
 */
const EDGE_IN = HALF - 2.4
const EDGE_OUT = HALF - 0.8
/** No props this close to a gate, or round a ramp. */
const GATE_CLEAR = 9
const GATE_METERS = walls().map((w) => w.meter)
const RAMP_CLEAR = RAMP_LENGTH + 2

function clearAt(m) {
  for (const g of GATE_METERS) if (Math.abs(m - g) < GATE_CLEAR) return false
  const lips = rampLips(m - RAMP_CLEAR, m + RAMP_CLEAR, _edgeLips)
  return lips.length === 0
}
const _edgeLips = []

/** Calls `place(x, y, z, side)` along both edges of the floor about every `spacing` metres. */
function alongEdges(m0, m1, spacing, rand, density, place) {
  for (let m = m0 + spacing * rand(); m < m1; m += spacing * (0.8 + rand() * 0.5)) {
    if (m < DECOR_START || rand() > density || !clearAt(m)) continue
    for (const side of [-1, 1]) {
      if (rand() > 0.8) continue
      const z = zAt(m)
      place(side * (EDGE_IN + rand() * (EDGE_OUT - EDGE_IN)), surfaceY(z, 0), z, side)
    }
  }
}

/** A flower: a green stem, two leaves and a bright round head. */
function flower(b, x, y, z, rand) {
  const head = pick(rand, ['#ff4f9a', '#ffd23f', '#4fd2ff', '#ff7a1e', '#b86bff', '#ffffff'])
  b.addOn(x, y, z, 0.15, 1.2, 0.15, '#3fa83a', STYLE.SMOOTH)
  b.add(x + 0.25, y + 0.5, z, 0.45, 0.1, 0.22, '#4fc83a', STYLE.SMOOTH, 0, 0, 0.4)
  b.add(x, y + 1.35, z, 0.75, 0.75, 0.3, head, STYLE.SMOOTH, rand() * 3)
  b.add(x, y + 1.35, z + 0.12, 0.3, 0.3, 0.12, '#ffe45c', STYLE.GLOW)
}

/** A beach ball: stripes of colour stacked into a ball shape. */
function beachBall(b, x, y, z) {
  const colors = ['#ff3b5c', '#ffffff', '#2fb8ff', '#ffd23f']
  colors.forEach((c, i) => b.addOn(x, y + i * 0.3, z, 1.2 - Math.abs(i - 1.5) * 0.25, 0.3, 1.2 - Math.abs(i - 1.5) * 0.25, c, STYLE.SMOOTH))
}

/** A lamp post with a glowing lantern on top. */
function lampPost(b, x, y, z, glow) {
  b.addOn(x, y, z, 0.25, 3.2, 0.25, '#3a3f48', STYLE.SMOOTH)
  b.add(x, y + 3.4, z, 0.7, 0.7, 0.7, glow, STYLE.GLOW)
  b.add(x, y + 3.85, z, 0.9, 0.15, 0.9, '#3a3f48', STYLE.SMOOTH)
}

/** A short glowing neon post with a ring of light. */
function neonPost(b, x, y, z, rand) {
  const glow = pick(rand, ['#39ff88', '#ff3bd8', '#3fd0ff', '#ffe14a'])
  b.addOn(x, y, z, 0.35, 2.6, 0.35, '#1d1d2e', STYLE.SMOOTH)
  b.add(x, y + 2.8, z, 1.1, 0.2, 1.1, glow, STYLE.GLOW)
  b.add(x, y + 1.4, z, 0.5, 0.5, 0.5, glow, STYLE.GLOW, 0.7)
}

/** What lines the track's edges in each stage theme. */
const EDGES = {
  grassy(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 4, rand, density, (x, y, z) => (rand() < 0.7 ? flower(b, x, y, z, rand) : bush(b, x, y, z, 0.5, '#3fbf3a')))
  },
  autumn(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 6, rand, density, (x, y, z) => {
      const k = rand()
      if (k < 0.4) mushroom(b, x, y, z, 0.6)
      else if (k < 0.7) hayBale(b, x, y, z, 0.6)
      else b.addOn(x, y, z, 2.2, 0.08, 1.6, pick(rand, ['#ff8a1e', '#e8452c', '#ffc12a']), STYLE.SMOOTH, rand() * 3)
    })
  },
  desert(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 7, rand, density, (x, y, z) => (rand() < 0.6 ? cactus(b, x, y + 0.3, z, 1.6 + rand() * 1.2, rand) : sandPile(b, x, y + 0.2, z, 0.5)))
  },
  beach(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 8, rand, density, (x, y, z) => {
      const k = rand()
      if (k < 0.4) umbrella(b, x, y + 0.3, z, 0.6, rand)
      else if (k < 0.7) sandCastle(b, x, y + 0.2, z, 0.45)
      else beachBall(b, x, y, z)
    })
  },
  jungle(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 6, rand, density, (x, y, z) => (rand() < 0.7 ? bush(b, x, y, z, 0.7, pick(rand, ['#2e9a3a', '#3fbf3a', '#237a31'])) : ruin(b, x, y + 0.3, z, 0.35, rand)))
  },
  frozen(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 9, rand, density, (x, y, z) => (rand() < 0.4 ? snowman(b, x, y + 0.2, z) : iceCrystal(b, x, y, z, 0.6)))
  },
  cherry(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 7, rand, density, (x, y, z) => (rand() < 0.5 ? lampPost(b, x, y, z, '#ff9cc8') : bush(b, x, y, z, 0.55, '#ffc2dc')))
  },
  candy(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 5, rand, density, (x, y, z) => {
      const k = rand()
      if (k < 0.35) lollipop(b, x, y + 0.3, z, 0.55, rand)
      else if (k < 0.7) candyCane(b, x, y + 0.3, z, 0.6)
      else gumdrop(b, x, y + 0.2, z, 0.6, rand)
    })
  },
  mushroom(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 6, rand, density, (x, y, z) => (rand() < 0.7 ? mushroom(b, x, y, z, 0.8 + rand() * 0.5) : giantMushroom(b, x, y + 0.3, z, 0.4, rand)))
  },
  volcano(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 8, rand, density, (x, y, z) => (rand() < 0.5 ? lavaPool(b, x, y + 0.4, z, 0.45) : rock(b, x, y + 0.3, z, 0.6, '#2a2427')))
  },
  swamp(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 8, rand, density, (x, y, z) => (rand() < 0.5 ? lilyPond(b, x, y + 0.45, z, 0.35, rand) : bush(b, x, y, z, 0.6, '#5fa83a')))
  },
  crystal(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 5, rand, density, (x, y, z) => crystal(b, x, y, z, 0.5 + rand() * 0.3, rand))
  },
  ocean(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 4, rand, density, (x, y, z) => (rand() < 0.55 ? coral(b, x, y + 0.3, z, 0.6, rand) : seaweed(b, x, y, z, 0.6, rand)))
  },
  neon(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 6, rand, density, (x, y, z) => neonPost(b, x, y, z, rand))
  },
  sky(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 8, rand, density, (x, y, z) => (rand() < 0.6 ? cloud(b, x, y + 1.2, z, 0.35, rand) : lampPost(b, x, y, z, '#ffd84a')))
  },
  rainbow(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 7, rand, density, (x, y, z) => rainbowPillar(b, x, y + 0.3, z, 0.4, rand))
  },
  moon(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 9, rand, density, (x, y, z) => (rand() < 0.6 ? crater(b, x, y + 0.35, z, 0.4) : moonBase(b, x, y + 0.3, z, 0.4, rand)))
  },
  aurora(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 7, rand, density, (x, y, z) => (rand() < 0.5 ? pine(b, x, y + 0.3, z, 0.45, rand, true) : iceCrystal(b, x, y, z, 0.55)))
  },
  space(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 6, rand, density, (x, y, z) => asteroid(b, x, y + 1.5 + rand() * 3, z, 0.5, rand))
  },
  cosmic(b, m0, m1, rand, density) {
    alongEdges(m0, m1, 6, rand, density, (x, y, z) => orb(b, x, y + 1.5 + rand() * 2.5, z, 0.5, rand))
  },
}

/** Party flags strung across the track every so often, in the stage's colours. */
const BUNTING_EVERY = 90
const BUNTING_FLAGS = 14

function bunting(b, m, theme) {
  if (!clearAt(m)) return
  const z = zAt(m)
  const y = surfaceY(z, 0) + 11
  b.add(0, y + 0.45, z, HALF * 2 + 2, 0.08, 0.08, '#ffffff', STYLE.SMOOTH)
  const colors = [theme.gate, '#ffffff', theme.name[1]]
  for (let i = 0; i < BUNTING_FLAGS; i += 1) {
    const x = -HALF + ((i + 0.5) / BUNTING_FLAGS) * HALF * 2
    // A gentle sag in the middle of the string.
    const sag = 0.6 * (1 - (x / HALF) ** 2)
    b.add(x, y - sag, z, 0.9, 0.9, 0.1, colors[i % colors.length], STYLE.SMOOTH, 0, 0, Math.PI / 4)
  }
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
  const stages = zones()
  for (const zone of stages) if (zone.start > m0 && zone.start < m1) cuts.push(zone.start)
  cuts.push(m1)

  for (let i = 0; i < cuts.length - 1; i += 1) {
    const a = cuts[i]
    const c = cuts[i + 1]
    const zone = stages[zoneIndexAt(a)]
    const theme = ZONE_THEMES[zone.theme]
    canyon(b, a, c, theme, wide)
    DECOR[zone.theme](b, a, c, rand, density)
    // On LOW (thin scenery) the track's edges are sparser and the flags are left out,
    // to keep phones well inside the triangle budget.
    EDGES[zone.theme](b, a, c, rand, density < 0.5 ? density * 0.6 : density)
    if (density >= 0.5) {
      for (let m = Math.ceil((a - BUNTING_EVERY / 2) / BUNTING_EVERY) * BUNTING_EVERY + BUNTING_EVERY / 2; m < c; m += BUNTING_EVERY) {
        if (m >= a && m >= DECOR_START) bunting(b, m, theme)
      }
    }
  }

  for (const lip of rampLips(m0, m1, _lips)) ramp(b, lip, themeAt(lip).gate)
  return b
}
