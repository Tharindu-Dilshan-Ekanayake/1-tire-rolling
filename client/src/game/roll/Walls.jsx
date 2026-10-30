import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { formatNumber } from '@shared/format'
import { winsMultiplier } from '@shared/logic'
import { mulberry32 } from '@shared/rng'
import { CANYON_HALF_WIDTH } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { iconUrl } from '../../ui/icons'
import { BlockSet, createBoxInstances, disposeBlocks } from '../blocks'
import { burst } from '../fx/fxQueue'
import { spawnScattered } from '../fx/popups'
import { sharedMaterials, STYLE } from '../materials'
import { tireAccent, tireRim, tireRubber, tireWidth } from '../tire'
import { perWorld, zones } from '../worldLook'
import { surfaceY, TIRE_SIZE, WALL_THICK, zAt } from './path'
import { roll } from './rollControl'
import { GATE_BEAM_H, GATE_BEAM_Y, WALL_COUNT, WALL_PLANK_TOP, walls as gatesHere, ZONE_THEMES } from './track'

/**
 * The gates between stages, as in the reference: two striped pillars and a beam with
 * the stage's sign, and a fence of planks filling the opening. A tire with enough
 * Health smashes straight through the planks - they fly - and rolls on under the beam;
 * one without slams into them and shatters: chunks of its rubber, rim and hub fly back
 * off the gate, which shudders from the hit.
 *
 * Every plank of every wall in view is one instance of one box mesh (one draw call),
 * every gate frame another (one more). A smashed wall bursts into small pieces - each
 * plank breaks in three, the rails too, and a spray of splinters - blown out from where
 * the tire hit: they fly, tumble and come to rest on the floor, then everything is put
 * back for the next roll. Walls smashed one after another make a combo: "SMASH x3!",
 * and a ding that climbs higher each time. No allocation per frame.
 */

const HALF = CANYON_HALF_WIDTH
/** Planks across a wall, and the two rails behind them. */
const PLANKS = 20
const PLANK_W = (HALF * 2) / PLANKS
const PARTS = PLANKS + 2
/** Walls drawn at once: the ones nearest where the camera looks. */
const MAX_WALLS = 3
/** Only walls this close ahead (or just behind) are drawn. */
const AHEAD = 520
const BEHIND = 90
const GRAVITY = 26
/** At most one smash popup this often (at warp speed many walls go at once). */
const POPUP_MS = 250
/** A shattered tire's pieces: rubber chunks round its tread, rim pieces, and the hub. */
const RUBBER_BITS = 18
const RIM_BITS = 6
const TIRE_BITS = RUBBER_BITS + RIM_BITS + 2
/** How long, and how hard, a gate shudders when a tire breaks on it. */
const SHAKE_MS = 700
/** A smashed plank breaks into this many pieces; the splinters thrown with them. */
const CHUNKS = 3
const SPLINTERS = 24
const RAIL_PIECES = 3

const PLANK_COLORS = ['#a8743f', '#9a6636', '#b88449', '#8f5d31'].map((c) => new Color(c))

/**
 * A gate frame's boxes, relative to its wall's centre on the floor: [x, y, z, sx, sy,
 * sz, colour ('gate' = the stage's), style]. Pillars and beam in the stage's colour,
 * gold caps, a navy sign board edged in light, white feet.
 */
const FRAME_TOP = GATE_BEAM_Y + GATE_BEAM_H
const BEAM_Y = GATE_BEAM_Y + GATE_BEAM_H / 2
const FRAME = [
  ...[-1, 1].flatMap((side) => [
    [side * (HALF + 1.3), 0.3, 0, 3.2, 1.6, 3.2, '#e9eef5', STYLE.SMOOTH],
    [side * (HALF + 1.3), 1.1 + (FRAME_TOP - 1.1) / 2, 0, 2.3, FRAME_TOP - 1.1, 2.3, 'gate', STYLE.STRIPES],
    [side * (HALF + 1.3), FRAME_TOP + 1.3, 0, 2.8, 2.8, 2.8, '#ffd21f', STYLE.GLOW],
  ]),
  [0, BEAM_Y, 0, HALF * 2 + 5, GATE_BEAM_H, 1.8, 'gate', STYLE.STRIPES],
  [0, BEAM_Y, 0.95, HALF * 1.5, GATE_BEAM_H - 0.8, 0.2, '#1f3c96', STYLE.SMOOTH],
  [0, BEAM_Y + GATE_BEAM_H / 2 - 0.25, 1.05, HALF * 1.5 + 0.4, 0.22, 0.12, '#ffffff', STYLE.GLOW],
  [0, BEAM_Y - GATE_BEAM_H / 2 + 0.25, 1.05, HALF * 1.5 + 0.4, 0.22, 0.12, '#ffffff', STYLE.GLOW],
  [0, GATE_BEAM_Y - 0.1, 0, HALF * 2 + 4, 0.25, 1.9, '#ffffff', STYLE.GLOW],
]
const FRAME_COLORS = FRAME.map((f) => (f[6] === 'gate' ? null : new Color(f[6])))
const gateColors = perWorld((zs) => zs.slice(1).map((z) => new Color(ZONE_THEMES[z.theme].gate)))
/** Each stage's gate is built to match it: glowing in Neon City, lava at the volcano... */
const GATE_STYLE_BY_THEME = {
  neon: STYLE.GLOW,
  crystal: STYLE.GLOW,
  aurora: STYLE.GLOW,
  rainbow: STYLE.RAINBOW,
  volcano: STYLE.LAVA,
  moon: STYLE.GALAXY,
  space: STYLE.GALAXY,
  cosmic: STYLE.GALAXY,
  desert: STYLE.STUDS,
  jungle: STYLE.STUDS,
}
const gateStyles = perWorld((zs) => zs.slice(1).map((z) => GATE_STYLE_BY_THEME[z.theme] ?? STYLE.STRIPES))

/** The frames' instanced boxes, each with its own style (the shader reads it per instance). */
function createFrames() {
  const set = new BlockSet()
  for (let i = 0; i < MAX_WALLS; i += 1) for (const f of FRAME) set.add(0, 0, 0, 0, 0, 0, '#ffffff', f[7])
  const mesh = set.build(sharedMaterials().blocks)
  mesh.count = 0
  mesh.frustumCulled = false
  return mesh
}
const RAIL_COLOR = new Color('#6b4428')
const SPLINTER_COLOR = new Color('#e8c48a')
const SMASH_ICON = iconUrl('trophy')

/** Each plank's look, seeded so every wall is the same ragged fence everywhere. */
const PLANK_SHAPES = (() => {
  const r = mulberry32(17)
  return Array.from({ length: PARTS }, (_, i) => {
    if (i >= PLANKS) {
      return { x: 0, h: 0.9, w: HALF * 2, y: i === PLANKS ? 2.2 : WALL_PLANK_TOP - 2.2, rail: true }
    }
    const h = WALL_PLANK_TOP - 0.8 + r() * 1.2
    return { x: -HALF + PLANK_W * (i + 0.5), h, w: PLANK_W - 0.08, y: h / 2, rail: false, color: PLANK_COLORS[i % PLANK_COLORS.length] }
  })
})()

/**
 * A smashed wall's pieces, relative to the wall's centre on the floor: each plank in
 * CHUNKS ragged lengths, each rail in thirds, and the splinters. Seeded, so every wall
 * breaks the same way.
 */
const PIECE_SHAPES = (() => {
  const r = mulberry32(29)
  const out = []
  for (let p = 0; p < PLANKS; p += 1) {
    const plank = PLANK_SHAPES[p]
    let y = 0
    for (let c = 0; c < CHUNKS; c += 1) {
      const h = c === CHUNKS - 1 ? plank.h - y : (plank.h / CHUNKS) * (0.75 + r() * 0.5)
      out.push({ x: plank.x, y: y + h / 2, z: 0, w: plank.w, h, d: WALL_THICK, color: plank.color })
      y += h
    }
  }
  for (let k = PLANKS; k < PARTS; k += 1) {
    const rail = PLANK_SHAPES[k]
    for (let c = 0; c < RAIL_PIECES; c += 1) {
      const w = rail.w / RAIL_PIECES
      out.push({ x: -rail.w / 2 + w * (c + 0.5), y: rail.y, z: WALL_THICK / 2 + 0.25, w, h: rail.h, d: 0.5, color: RAIL_COLOR })
    }
  }
  for (let k = 0; k < SPLINTERS; k += 1) {
    out.push({ x: (r() - 0.5) * HALF * 1.6, y: 1 + r() * (WALL_PLANK_TOP - 2), z: 0, w: 0.14, h: 0.5 + r() * 0.7, d: 0.14, color: SPLINTER_COLOR, splinter: true })
  }
  return out
})()
const PIECES = PIECE_SHAPES.length

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _axis = new Vector3()

/** Flying pieces (a smashed wall's, or a shattered tire's): position, velocity and tumble. */
function createDebris(count = PARTS) {
  return Array.from({ length: count }, () => ({
    pos: new Vector3(),
    vel: new Vector3(),
    axis: new Vector3(1, 0, 0),
    angle: 0,
    spin: 0,
    resting: false,
  }))
}

export function Walls() {
  const meshRef = useRef(null)
  const framesRef = useRef(null)
  const bitsRef = useRef(null)
  /** Per wall index: when this roll smashed it (performance.now), or 0; and its pieces. */
  const state = useRef({
    rollId: -1,
    smashedAt: new Float64Array(WALL_COUNT),
    debris: Array.from({ length: WALL_COUNT }, () => createDebris(PIECES)),
    /** Walls smashed so far this roll: the combo. */
    combo: 0,
    blockedShown: false,
    popupAt: 0,
    pendingSmash: 0,
    /** The shattered tire's pieces, and the gate it broke on (walls() index) and when. */
    bits: createDebris(TIRE_BITS),
    bitSizes: Array.from({ length: TIRE_BITS }, () => new Vector3()),
    shattered: false,
    shakeWall: -1,
    shakeAt: 0,
  })

  const { mesh, frames, tireBits } = useMemo(() => {
    const m = createBoxInstances(MAX_WALLS * PIECES, sharedMaterials().blocks, STYLE.STUDS)
    m.count = 0
    m.frustumCulled = false
    m.receiveShadow = true
    const tireBits = createBoxInstances(TIRE_BITS, sharedMaterials().toy, STYLE.SMOOTH)
    tireBits.castShadow = true
    return { mesh: m, frames: createFrames(), tireBits }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(mesh)
      disposeBlocks(frames)
      disposeBlocks(tireBits)
    },
    [mesh, frames, tireBits],
  )

  useFrame((_frame, rawDelta) => {
    const walls = meshRef.current
    const gates = framesRef.current
    const bits = bitsRef.current
    if (!walls || !gates || !bits) return
    const delta = Math.min(rawDelta, 0.05)
    const st = state.current
    const now = performance.now()

    // A new roll puts every wall back.
    if (roll.active && st.rollId !== roll.startedAt) {
      st.rollId = roll.startedAt
      st.smashedAt.fill(0)
      st.blockedShown = false
      st.pendingSmash = 0
      st.combo = 0
      st.shattered = false
      st.shakeWall = -1
    }

    // Smash the walls the tire reaches this frame, if it's strong enough for them.
    if (roll.active && roll.phase !== 'launch') {
      const ahead = gatesHere()
      for (let i = 0; i < ahead.length; i += 1) {
        const w = ahead[i]
        if (st.smashedAt[i] || w.index > roll.broken) continue
        if (roll.meter + TIRE_SIZE < w.meter - WALL_THICK / 2) continue
        st.smashedAt[i] = now
        st.combo += 1
        smash(st.debris[i], w.meter, roll.position.x, Math.min(Math.max(roll.speed, 12), 70))
        st.pendingSmash += w.zone.smash
        sfx.wallSmash(st.combo)
        roll.hitAt = now
        if (getQuality().particles) {
          const at = { x: roll.position.x, y: roll.position.y + 1, z: zAt(w.meter) }
          burst({ ...at, count: 34, palette: 'wood', speed: 11 })
          burst({ ...at, count: 18, palette: 'gold', speed: 8 })
        }
      }
      if (st.pendingSmash > 0 && now - st.popupAt > POPUP_MS) {
        const wins = Math.round(st.pendingSmash * winsMultiplier(getGame().profile, Date.now()))
        const word = st.combo > 1 ? `SMASH x${st.combo}!` : 'SMASH!'
        spawnScattered(`${word} +${formatNumber(wins)}`, { iconUrl: SMASH_ICON, scale: 1.35 + 0.08 * Math.min(st.combo, 8) })
        st.pendingSmash = 0
        st.popupAt = now
      }
      // Slammed into a wall too strong for it: the tire shatters, the gate shudders,
      // and we say what it would have taken.
      if (roll.crashed && !st.blockedShown && roll.blocked > 0) {
        st.blockedShown = true
        st.shattered = true
        st.shakeWall = roll.blocked - 1
        st.shakeAt = now
        shatter(bits, st, roll.position, roll.tireId)
        sfx.wallSmash()
        if (getQuality().particles) burst({ x: roll.position.x, y: roll.position.y, z: roll.position.z, count: 40, palette: 'power', speed: 9 })
        spawnScattered('TIRE BROKE!', { iconUrl: iconUrl('tire'), scale: 1.6 })
        spawnScattered(`Need ${formatNumber(zones()[roll.blocked].wall)} Health to smash!`, { iconUrl: iconUrl('heart'), scale: 1.2 })
      }
    }

    // --- Draw the walls near where we're looking --------------------------------------
    const focus = roll.active ? Math.max(0, roll.meter) : 0
    let count = 0
    let shown = 0
    let framed = 0
    const frameStyles = gates.geometry.getAttribute('aStyle')
    const gateList = gatesHere()
    const colors = gateColors()
    const styles = gateStyles()
    for (let i = 0; i < gateList.length && shown < MAX_WALLS; i += 1) {
      const w = gateList[i]
      if (w.meter < focus - BEHIND || w.meter > focus + AHEAD) continue
      shown += 1
      const z = zAt(w.meter)
      const base = surfaceY(z, 0)
      const smashed = roll.active && st.smashedAt[i] > 0
      const debris = st.debris[i]
      // The gate's frame stays standing whatever happens to its wall.
      _q.identity()
      for (let f = 0; f < FRAME.length; f += 1) {
        const [fx, fy, fz, sx, sy, sz] = FRAME[f]
        gates.setMatrixAt(framed, _m.compose(_p.set(fx, base + fy, z + fz), _q, _s.set(sx, sy, sz)))
        gates.setColorAt(framed, FRAME_COLORS[f] || colors[i])
        // Pillars and beam in the stage's own style.
        const style = FRAME_COLORS[f] ? FRAME[f][7] : styles[i]
        if (frameStyles.array[framed] !== style) {
          frameStyles.array[framed] = style
          frameStyles.needsUpdate = true
        }
        framed += 1
      }
      if (smashed) {
        // In pieces: flying, tumbling, then lying where they land.
        for (let p = 0; p < PIECES; p += 1) {
          const piece = PIECE_SHAPES[p]
          const d = debris[p]
          if (!d.resting) {
            d.vel.y -= GRAVITY * delta
            d.pos.addScaledVector(d.vel, delta)
            d.angle += d.spin * delta
            // The track drops away downhill: each piece lands on the floor where it is.
            const floor = surfaceY(d.pos.z, Math.min(piece.h, piece.d) / 2)
            if (d.pos.y < floor) {
              d.pos.y = floor
              d.vel.multiplyScalar(0.35)
              d.vel.y = Math.abs(d.vel.y) > 2 ? -d.vel.y * 0.3 : 0
              d.spin *= 0.5
              if (d.vel.lengthSq() < 1) d.resting = true
            }
          }
          _q.setFromAxisAngle(d.axis, d.angle)
          walls.setMatrixAt(count, _m.compose(d.pos, _q, _s.set(piece.w, piece.h, piece.d)))
          walls.setColorAt(count, piece.color)
          count += 1
        }
        continue
      }
      for (let p = 0; p < PARTS; p += 1) {
        const shape = PLANK_SHAPES[p]
        _q.identity()
        _p.set(shape.x, base + shape.y, z + (shape.rail ? WALL_THICK / 2 + 0.25 : 0))
        // Shuddering from the tire that just broke on it.
        const since = now - st.shakeAt
        if (roll.active && i === st.shakeWall && since < SHAKE_MS) {
          const fade = 1 - since / SHAKE_MS
          _p.z -= Math.sin(since * 0.07 + p) * 0.35 * fade
          _q.setFromAxisAngle(_axis.set(1, 0, 0), Math.sin(since * 0.05 + p * 0.7) * 0.05 * fade)
        }
        _s.set(shape.w, shape.h, shape.rail ? 0.5 : WALL_THICK)
        walls.setMatrixAt(count, _m.compose(_p, _q, _s))
        walls.setColorAt(count, shape.rail ? RAIL_COLOR : shape.color)
        count += 1
      }
    }
    walls.count = count
    walls.instanceMatrix.needsUpdate = true
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true
    gates.count = framed
    gates.instanceMatrix.needsUpdate = true
    if (gates.instanceColor) gates.instanceColor.needsUpdate = true

    // --- The shattered tire's pieces ------------------------------------------------
    if (roll.active && st.shattered) {
      for (let k = 0; k < TIRE_BITS; k += 1) {
        const d = st.bits[k]
        const size = st.bitSizes[k]
        if (!d.resting) {
          d.vel.y -= GRAVITY * delta
          d.pos.addScaledVector(d.vel, delta)
          d.angle += d.spin * delta
          const floor = surfaceY(d.pos.z, size.y / 2)
          if (d.pos.y < floor) {
            d.pos.y = floor
            d.vel.multiplyScalar(0.4)
            d.vel.y = Math.abs(d.vel.y) > 2 ? -d.vel.y * 0.35 : 0
            d.spin *= 0.5
            if (d.vel.lengthSq() < 1) d.resting = true
          }
        }
        bits.setMatrixAt(k, _m.compose(d.pos, _q.setFromAxisAngle(d.axis, d.angle), size))
      }
      bits.count = TIRE_BITS
      bits.instanceMatrix.needsUpdate = true
    } else {
      bits.count = 0
    }
  })

  return (
    <>
      <primitive ref={framesRef} object={frames} />
      <primitive ref={meshRef} object={mesh} />
      <primitive ref={bitsRef} object={tireBits} />
    </>
  )
}

/**
 * Breaks the tire at `center` into pieces in its own colours and throws them back off
 * the gate: chunks of tread from all round it, pieces of rim, and the hub.
 */
function shatter(bits, st, center, tireId) {
  const r = TIRE_SIZE
  const w = tireWidth(tireId) * TIRE_SIZE * 0.5
  for (let k = 0; k < TIRE_BITS; k += 1) {
    const d = st.bits[k]
    const rubber = k < RUBBER_BITS
    const rim = !rubber && k < RUBBER_BITS + RIM_BITS
    const n = rubber ? RUBBER_BITS : RIM_BITS
    const a = ((rubber ? k : k - RUBBER_BITS) / n) * Math.PI * 2
    const ring = rubber ? r * 0.85 : rim ? r * 0.45 : 0
    d.pos.set(center.x, center.y + Math.cos(a) * ring, center.z + Math.sin(a) * ring)
    // Back off the wall (towards +z, where it came from), up, and out to the sides.
    d.vel.set((Math.random() - 0.5) * 12, 4 + Math.random() * 8 + Math.cos(a) * 3, 5 + Math.random() * 9 + Math.sin(a) * 3)
    d.axis.copy(_axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize())
    d.angle = Math.random() * 3
    d.spin = (Math.random() - 0.5) * 16
    d.resting = false
    if (rubber) st.bitSizes[k].set(w * 1.6, r * 0.32, r * 0.42)
    else if (rim) st.bitSizes[k].set(w * 0.9, r * 0.22, r * 0.3)
    else st.bitSizes[k].set(w * 0.8, r * 0.18, r * 0.18)
    bits.setColorAt(k, rubber ? tireRubber(tireId) : rim ? tireRim(tireId) : tireAccent(tireId))
  }
  if (bits.instanceColor) bits.instanceColor.needsUpdate = true
}

/**
 * Bursts a wall: every piece blown away from where the tire hit (at `hitX`, about a
 * tire's height up) - outwards, up, and a little on down the track - tumbling, the
 * splinters fastest of all.
 */
function smash(debris, meter, hitX, speed) {
  const z = zAt(meter)
  const base = surfaceY(z, 0)
  for (let p = 0; p < PIECES; p += 1) {
    const piece = PIECE_SHAPES[p]
    const d = debris[p]
    d.pos.set(piece.x, base + piece.y, z + piece.z)
    const dx = piece.x - hitX
    const dy = piece.y - TIRE_SIZE
    const dist = Math.max(1, Math.hypot(dx, dy))
    // Pieces near the hit fly hardest.
    const blast = (piece.splinter ? 16 : 10) * (0.5 + Math.random() * 0.6) * Math.min(1.6, 6 / dist + 0.4)
    // Mostly out to the sides and up, clearing a hole the tire bursts through, and only
    // a little on down the track, so the camera isn't flying through a cloud of planks.
    const side = dx / dist + Math.sign(dx || 1) * 0.6
    d.vel.set(side * blast * 1.2, 5 + (dy / dist) * blast * 0.5 + Math.random() * 6, -speed * (0.12 + Math.random() * 0.25))
    d.axis.copy(_axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize())
    d.angle = 0
    d.spin = (Math.random() - 0.5) * (piece.splinter ? 26 : 16)
    d.resting = false
  }
}

export default Walls
