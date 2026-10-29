import { hash2, mulberry32 } from '@shared/rng'
import { PLAZA } from '@shared/world'

import { STYLE } from '../materials'
import { PALETTE } from '../sceneStyle'

/**
 * Terraced voxel hills ringing the plaza, plus blocky trees on top.
 *
 * Heights come from a smooth value-noise field quantised into terraces, sampled on a
 * coarse grid and greedy-merged into as few boxes as possible: a few hundred instances
 * for the whole ring rather than thousands of columns.
 */

const CELL = 4
const BOUNDS = { minX: -176, maxX: 156, minZ: -150, maxZ: 136 }
/** The throw track leaves the plaza northwards through this gap in the hills. */
const CORRIDOR_HALF_WIDTH = 34
const STEP = 2

function smooth(t) {
  return t * t * (3 - 2 * t)
}

function valueNoise(x, z, scale, seed) {
  const fx = x / scale
  const fz = z / scale
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const tx = smooth(fx - ix)
  const tz = smooth(fz - iz)
  const a = hash2(ix, iz, seed)
  const b = hash2(ix + 1, iz, seed)
  const c = hash2(ix, iz + 1, seed)
  const d = hash2(ix + 1, iz + 1, seed)
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz
}

function distanceOutside(rect, x, z) {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX)
  const dz = Math.max(rect.minZ - z, 0, z - rect.maxZ)
  return Math.hypot(dx, dz)
}

const CORRIDOR = { minX: -CORRIDOR_HALF_WIDTH, maxX: CORRIDOR_HALF_WIDTH, minZ: -10000, maxZ: PLAZA.minZ }

/** Terrain height at a cell centre, or 0 where the ground is open. */
export function terrainHeight(x, z) {
  if (distanceOutside(PLAZA, x, z) === 0) return 0
  if (distanceOutside(CORRIDOR, x, z) === 0) return 0
  const d = Math.min(distanceOutside(PLAZA, x, z), distanceOutside(CORRIDOR, x, z))
  // A low first terrace right at the plaza edge, rising in big steps further out.
  const base = d < 6 ? 4 : 6 + Math.floor(d / 14) * 5
  const n = valueNoise(x, z, 28, 11) * 7 + valueNoise(x, z, 9, 23) * 2.5
  const h = Math.round((base + n) / STEP) * STEP
  return Math.min(34, Math.max(4, h))
}

/**
 * Adds a blocky tiered tree standing on `base`.
 *
 * @param {import('../blocks').BlockSet} blocks
 * @param {() => number} rand
 */
/** Half the widest canopy tier of a scale-1 tree. */
const TREE_HALF_WIDTH = 2.4

export function addTree(blocks, x, base, z, scale = 1, rand = Math.random) {
  const s = scale
  const trunk = 3 * s
  blocks.addOn(x, base, z, 0.9 * s, trunk, 0.9 * s, PALETTE.trunk)

  const greens = PALETTE.leaves
  const green = greens[Math.floor(rand() * greens.length)]
  const tiers = [4.8, 3.6, 2.4]
  let y = base + trunk - 0.4 * s
  for (const width of tiers) {
    const w = width * s
    blocks.addOn(x, y, z, w, 1.7 * s, w, green)
    y += 1.5 * s
  }
  blocks.addOn(x, y, z, 1.1 * s, 1.1 * s, 1.1 * s, green)
}

/** Builds the hill ring into `blocks` and returns tree spots used (for tests/debug). */
export function buildTerrain(blocks, { treeDensity = 1 } = {}) {
  const cols = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL)
  const rows = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL)
  const heights = new Int16Array(cols * rows)

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = BOUNDS.minX + (i + 0.5) * CELL
      const z = BOUNDS.minZ + (j + 0.5) * CELL
      heights[j * cols + i] = terrainHeight(x, z)
    }
  }

  // Greedy merge: runs along X, then stack identical runs along Z.
  const open = new Map()
  const emit = (run) => {
    const width = (run.i1 - run.i0 + 1) * CELL
    const depth = (run.j1 - run.j0 + 1) * CELL
    const x = BOUNDS.minX + run.i0 * CELL + width / 2
    const z = BOUNDS.minZ + run.j0 * CELL + depth / 2
    // Sunk slightly so no seam shows where hills meet the ground plane.
    blocks.addOn(x, -0.5, z, width, run.h + 0.5, depth, PALETTE.dirt, STYLE.TERRAIN)
  }

  for (let j = 0; j < rows; j += 1) {
    const runs = []
    let i = 0
    while (i < cols) {
      const h = heights[j * cols + i]
      if (h === 0) {
        i += 1
        continue
      }
      let i1 = i
      while (i1 + 1 < cols && heights[j * cols + i1 + 1] === h) i1 += 1
      runs.push({ i0: i, i1, h })
      i = i1 + 1
    }

    const nextOpen = new Map()
    for (const run of runs) {
      const key = `${run.i0}:${run.i1}:${run.h}`
      const prev = open.get(key)
      if (prev) {
        prev.j1 = j
        nextOpen.set(key, prev)
        open.delete(key)
      } else {
        nextOpen.set(key, { ...run, j0: j, j1: j })
      }
    }
    for (const run of open.values()) emit(run)
    open.clear()
    for (const [key, run] of nextOpen) open.set(key, run)
  }
  for (const run of open.values()) emit(run)

  // Trees on the terraces, kept off the cliff edges so they don't overhang the plaza,
  // and clear of each other: overlapping canopies of near-equal height flicker.
  const rand = mulberry32(5)
  const placed = []
  let trees = 0
  for (let j = 1; j < rows - 1; j += 1) {
    for (let i = 1; i < cols - 1; i += 1) {
      const h = heights[j * cols + i]
      if (h === 0) continue
      if (hash2(i, j, 77) > 0.075 * treeDensity) continue
      const flat =
        heights[j * cols + i - 1] === h &&
        heights[j * cols + i + 1] === h &&
        heights[(j - 1) * cols + i] === h &&
        heights[(j + 1) * cols + i] === h
      if (!flat) continue
      const x = BOUNDS.minX + (i + 0.5) * CELL
      const z = BOUNDS.minZ + (j + 0.5) * CELL
      const scale = 0.9 + rand() * 0.5
      const reach = TREE_HALF_WIDTH * scale
      if (placed.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) < t.reach + reach)) continue
      placed.push({ x, z, reach })
      addTree(blocks, x, h, z, scale, rand)
      trees += 1
    }
  }

  // A few trees inside the plaza edge, as in the reference shots.
  const plazaTrees = [
    [PLAZA.minX + 4, PLAZA.maxZ - 5],
    [PLAZA.maxX - 4, PLAZA.maxZ - 5],
    [-26, PLAZA.maxZ - 3],
    [26, PLAZA.maxZ - 3],
  ]
  for (const [x, z] of plazaTrees) addTree(blocks, x, 0, z, 1.1, rand)

  return { trees }
}
