/**
 * Lobby layout: every gameplay-relevant position and trigger area.
 *
 * Shared by the client (which renders it) and the server (which validates positions
 * against it), so the two can never disagree about where a treadmill or the slide is.
 *
 * Units are roughly metres - the avatar is 1.8 tall. +X is east, -Z is north, which is
 * "forward" from spawn and the way down the hill.
 *
 * Seen from spawn: the slide zone and the canyon down the hill straight ahead (north),
 * the treadmills along the left (west) side, the board shop on the right (east), eggs
 * and leaderboards behind.
 *
 * Rects are `{ minX, maxX, minZ, maxZ }` on the ground plane.
 */

export const SPAWN = { x: 0, z: 14 }

/** The flat, walkable plaza. Hills surround it on every side but the slide. */
export const PLAZA = { minX: -50, maxX: 50, minZ: -40, maxZ: 36 }

// --- The slide ----------------------------------------------------------------------

/**
 * The top of the hill: the plaza's north edge, where the canyon starts. Track metre m
 * is m metres down the slope from here.
 */
export const SLIDE_START_Z = PLAZA.minZ
/** How steeply the canyon drops: about 12 degrees. */
export const SLOPE_ANGLE = 0.21
/** Half the width of the canyon floor. */
export const CANYON_HALF_WIDTH = 16

/** The yellow SLIDE ZONE at the canyon's mouth: stepping onto it starts a slide. */
export const SLIDE_ZONE = { minX: -13, maxX: 13, minZ: -40, maxZ: -33 }
/** Where you're put back after a slide: just short of the zone, facing it. */
export const SLIDE_RETURN = { x: 0, z: -27 }
/** The start arch's pillars, either side of the zone. */
export const SLIDE_ARCH = { x: 15.5, z: -37 }

/** Walkable ground; the controller clamps the player into it. Nothing past the start. */
export const WALKABLE = [PLAZA]

// --- Treadmills ---------------------------------------------------------------------

/**
 * Treadmills line the west side of the plaza, side by side. Each belt runs east-west:
 * you step on from the plaza (east end) and run facing the console at the west end.
 */
export const TREADMILL_COUNT = 7
export const TREADMILL_PITCH = 7
export const BELT_WIDTH = 4.2
/** East (entrance) and west (console) ends of every belt. */
export const BELT_NEAR_X = -28
export const BELT_FAR_X = -37
/** The belt's surface, a step up from the plaza. */
export const BELT_HEIGHT = 0.5
/** Where each treadmill's console and handlebars stand, past the belt's west end. */
export const CONSOLE_X = -38.4
/** Treadmill 0 (the free one) is the southernmost, nearest spawn; the rest run north. */
const TREADMILL0_Z = 24

export const treadmillCenterZ = (index) => TREADMILL0_Z - index * TREADMILL_PITCH

/** The belt of treadmill `index`: standing on it is training. */
export function beltRect(index) {
  const cz = treadmillCenterZ(index)
  return { minX: BELT_FAR_X, maxX: BELT_NEAR_X, minZ: cz - BELT_WIDTH / 2, maxZ: cz + BELT_WIDTH / 2 }
}

/** The whole machine's deck: the belt and the frame round it. */
export function deckRect(index) {
  const belt = beltRect(index)
  return { minX: belt.minX - 0.8, maxX: belt.maxX + 0.4, minZ: belt.minZ - 0.7, maxZ: belt.maxZ + 0.7 }
}

// --- Board shop ---------------------------------------------------------------------

/**
 * The board shop: an open-air yard east of the plaza with two display stages, the
 * first ten boards on the low front one and the next ten on the higher back one, and a
 * big BOARDS sign behind. Both stages are low enough to walk straight onto.
 */
export const SHOP = { minX: 22, maxX: 48, minZ: -26, maxZ: 12 }
export const SHOP_STAGES = [
  { minX: 23.5, maxX: 34, minZ: -25, maxZ: 11, height: 0.5 },
  { minX: 36.5, maxX: 47, minZ: -25, maxZ: 11, height: 1 },
]
/** The sign along the back (east) edge, facing the plaza, high enough to clear the labels. */
export const SHOP_BOARD = { x: 48.6, minZ: -23, maxZ: 9, top: 16 }
export const PAD_SIZE = 4.4

/** Rows of display stands, nearest the plaza first: two rows on each stage. */
const PAD_ROWS_X = [26, 31.5, 39, 44.5]

/**
 * Twenty stands, five to a row 7 m apart. `row` (0-3, front to back) lets the labels
 * above them step up so nearer ones don't hide farther ones.
 */
export const BOARD_PADS = Array.from({ length: 20 }, (_, i) => {
  const row = Math.floor(i / 5)
  return {
    index: i,
    row,
    x: PAD_ROWS_X[row],
    z: (SHOP.minZ + SHOP.maxZ) / 2 - 14 + (i % 5) * 7,
    y: SHOP_STAGES[row < 2 ? 0 : 1].height,
  }
})

export const padRect = (pad) => ({
  minX: pad.x - PAD_SIZE / 2,
  maxX: pad.x + PAD_SIZE / 2,
  minZ: pad.z - PAD_SIZE / 2,
  maxZ: pad.z + PAD_SIZE / 2,
})

// --- Eggs, showcases, boards --------------------------------------------------------

/** The egg row stands in the middle behind spawn, the leaderboards behind it. */
export const EGG_STANDS = [
  { eggId: 'basic', x: -12, z: 24 },
  { eggId: 'meadow', x: -4, z: 24 },
  { eggId: 'sunset', x: 4, z: 24 },
  { eggId: 'unicorn', x: 12, z: 24 },
  { eggId: 'demon', x: -12, z: -14, big: true },
]
export const EGG_TRIGGER_RADIUS = 4.2

/** Limited premium pet on display. */
export const SPHINX_STAND = { x: 45, z: 21 }

export const LEADERBOARDS = [
  { id: 'rebirths', x: -12, z: 33.5 },
  { id: 'playtime', x: 0, z: 33.5 },
  { id: 'distance', x: 12, z: 33.5 },
]

/**
 * The world portals either side of the start arch: World 2 to the east, and World 3,
 * the Halloween one, mirrored to the west. Names and Wins are WORLD_PORTALS in balance.js.
 */
export const PORTALS = [
  { id: 'world2', x: 28, z: -34, radius: 3.4 },
  { id: 'world3', x: -28, z: -34, radius: 3.4 },
]
const WORLD3 = PORTALS[1]

/**
 * World 3's Halloween dressing, all solid: a big jack-o'-lantern either side of the
 * portal, smaller ones about, graves and a dead tree. Faces look south, at the plaza.
 */
export const HALLOWEEN_PROPS = [
  { kind: 'pumpkin', x: WORLD3.x - 6.2, z: WORLD3.z + 0.6, size: 1.9 },
  { kind: 'pumpkin', x: WORLD3.x + 6.2, z: WORLD3.z + 0.6, size: 1.9 },
  { kind: 'pumpkin', x: WORLD3.x - 8.6, z: WORLD3.z + 4.2, size: 1.1 },
  { kind: 'pumpkin', x: WORLD3.x + 8.4, z: WORLD3.z + 4.6, size: 1.2 },
  { kind: 'pumpkin', x: WORLD3.x + 4.6, z: WORLD3.z + 3.4, size: 0.8 },
  { kind: 'grave', x: WORLD3.x - 9.5, z: WORLD3.z - 2.5 },
  { kind: 'grave', x: WORLD3.x - 11.2, z: WORLD3.z + 2.2 },
  { kind: 'grave', x: WORLD3.x + 8.8, z: WORLD3.z - 3.2 },
  { kind: 'tree', x: WORLD3.x - 13.5, z: WORLD3.z - 1.5 },
]
/** Footprint half-sizes of each kind of prop (a pumpkin's scales with it). */
const PROP_HALF = {
  pumpkin: (p) => [0.65 * p.size, 0.6 * p.size],
  grave: () => [0.7, 0.35],
  tree: () => [0.5, 0.5],
}

export const FREE_REWARD = { x: 12, z: 10, radius: 3 }
export const WATERFALL = { x: 42, z: -40 }

// --- Collision ----------------------------------------------------------------------

const box = (x, z, halfX, halfZ) => ({
  minX: x - halfX,
  maxX: x + halfX,
  minZ: z - halfZ,
  maxZ: z + halfZ,
})

/** Solid, never-changing obstacles. Locked treadmills add their own walls at runtime. */
export const STATIC_COLLIDERS = [
  // The shop's sign.
  { minX: SHOP_BOARD.x - 0.5, maxX: SHOP_BOARD.x + 0.5, minZ: SHOP_BOARD.minZ - 0.5, maxZ: SHOP_BOARD.maxZ + 0.5 },
  // Egg pedestals.
  ...EGG_STANDS.map((s) => box(s.x, s.z, s.big ? 2.1 : 1.6, s.big ? 2.1 : 1.6)),
  box(SPHINX_STAND.x, SPHINX_STAND.z, 3, 3),
  ...LEADERBOARDS.map((b) => box(b.x, b.z, 4.6, 0.5)),
  box(FREE_REWARD.x, FREE_REWARD.z, 1.4, 1.4),
  // Each portal ring's base; the swirl itself is walk-through.
  ...PORTALS.flatMap((p) => [box(p.x - p.radius, p.z, 0.6, 0.8), box(p.x + p.radius, p.z, 0.6, 0.8)]),
  ...HALLOWEEN_PROPS.map((p) => box(p.x, p.z, ...PROP_HALF[p.kind](p))),
  // The start arch's pillars.
  box(-SLIDE_ARCH.x, SLIDE_ARCH.z, 1, 1),
  box(SLIDE_ARCH.x, SLIDE_ARCH.z, 1, 1),
  // The canyon's rims either side of its mouth.
  { minX: PLAZA.minX, maxX: -CANYON_HALF_WIDTH - 1, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
  { minX: CANYON_HALF_WIDTH + 1, maxX: PLAZA.maxX, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
  // Each treadmill's console.
  ...Array.from({ length: TREADMILL_COUNT }, (_, i) => box(CONSOLE_X, treadmillCenterZ(i), 0.8, 2.6)),
]

/** Raised floors the player stands on, as rects with a height. */
export const PLATFORMS = [
  ...SHOP_STAGES.map((s) => ({ ...s })),
  ...Array.from({ length: TREADMILL_COUNT }, (_, i) => ({ ...deckRect(i), height: BELT_HEIGHT })),
]

// --- Helpers ------------------------------------------------------------------------

export const inRect = (r, x, z, margin = 0) =>
  x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin

/** Index of the treadmill whose belt is under (x, z), or -1. */
export function treadmillAt(x, z, margin = 0) {
  for (let i = 0; i < TREADMILL_COUNT; i += 1) {
    if (inRect(beltRect(i), x, z, margin)) return i
  }
  return -1
}

export const inSlideZone = (x, z, margin = 0) => inRect(SLIDE_ZONE, x, z, margin)

/** The portal whose swirl (x, z) is in, give or take `margin`, or null. */
export function portalAt(x, z, margin = 0) {
  for (const p of PORTALS) {
    if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return p
  }
  return null
}

/**
 * Whether a move from `from` to `to` is the hop back to the top after a slide: off the
 * slide zone onto SLIDE_RETURN. Faster than walking, so the server's speed check lets
 * exactly this one through.
 */
export const isSlideReturn = (from, to) =>
  inSlideZone(from.x, from.z, 2) && Math.hypot(to.x - SLIDE_RETURN.x, to.z - SLIDE_RETURN.z) < 2.5

/** Index of the board pad under (x, z), or -1. */
export function padAt(x, z) {
  for (const pad of BOARD_PADS) {
    if (inRect(padRect(pad), x, z)) return pad.index
  }
  return -1
}

/** The egg stand within reach of (x, z), or null. */
export function eggStandNear(x, z) {
  for (const stand of EGG_STANDS) {
    const reach = EGG_TRIGGER_RADIUS + (stand.big ? 1 : 0)
    if (Math.hypot(stand.x - x, stand.z - z) <= reach) return stand
  }
  return null
}

/** Height of the floor at (x, z): raised platforms, else the ground at 0. */
export function groundHeightAt(x, z) {
  let h = 0
  for (const p of PLATFORMS) {
    if (p.height > h && inRect(p, x, z)) h = p.height
  }
  return h
}

/** Clamps (x, z) into the walkable union, returning the nearest walkable point. */
export function clampToWalkable(x, z, out = { x: 0, z: 0 }) {
  let best = Infinity
  for (const r of WALKABLE) {
    const cx = Math.min(r.maxX, Math.max(r.minX, x))
    const cz = Math.min(r.maxZ, Math.max(r.minZ, z))
    const d = (cx - x) ** 2 + (cz - z) ** 2
    if (d < best) {
      best = d
      out.x = cx
      out.z = cz
      if (d === 0) break
    }
  }
  return out
}

/** Fastest a player can legitimately move, for the server's anti-teleport check. */
export const MAX_MOVE_SPEED = 14
