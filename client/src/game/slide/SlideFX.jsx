import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { ZONES } from '@shared/balance'
import { zoneIndexAt } from '@shared/logic'

import { getGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { boardGlow } from '../board'
import { createGlowInstances, disposeGlow } from '../glow'
import { sharedMaterials, STYLE } from '../materials'
import { COS, SIN } from './path'
import { slide } from './slideControl'
import { ZONE_THEMES } from './track'

/** Spray pieces in flight at once, and the glow puffs making up the trail. */
const SPRAY = 72
const TRAIL = 18
/** A trail puff is dropped this often, and fades over TRAIL_LIFE seconds. */
const TRAIL_EVERY_MS = 35
const TRAIL_LIFE = 0.55
const GRAVITY = 16

const DOWN_TRACK = new Vector3(0, -SIN, -COS)
const SLOPE_NORMAL = new Vector3(0, COS, -SIN)
const WHITE = new Color('#ffffff')
/** What the board throws up in each zone: its floor, lightened. */
const SPRAY_COLORS = ZONES.map((z) => new Color(ZONE_THEMES[z.id].floor).lerp(WHITE, 0.55))

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _side = new Vector3()

const spray = Array.from({ length: SPRAY }, () => ({ life: 0, max: 1, size: 0.2, pos: new Vector3(), vel: new Vector3() }))
const trail = Array.from({ length: TRAIL }, () => ({ life: 0, pos: new Vector3() }))

/**
 * Throws `count` spray pieces off the board's tail: `spread` sideways, `lift` upwards,
 * `back` up the hill (so they're left behind). `st.next` is the pool's write head.
 */
function emit(pieces, st, count, spread, lift, back) {
  const color = SPRAY_COLORS[zoneIndexAt(Math.max(0, slide.meter))]
  for (let i = 0; i < count; i += 1) {
    const p = spray[st.next]
    pieces.setColorAt(st.next, color)
    st.next = (st.next + 1) % SPRAY
    const side = (Math.random() - 0.5) * 2
    _side.set(1, 0, 0)
    p.pos.copy(slide.position).addScaledVector(DOWN_TRACK, -0.9).addScaledVector(_side, side * 0.45).addScaledVector(SLOPE_NORMAL, 0.1)
    p.vel.copy(DOWN_TRACK).multiplyScalar(-back * (0.5 + Math.random()))
    p.vel.addScaledVector(_side, side * spread * (0.6 + Math.random() * 0.8))
    p.vel.addScaledVector(SLOPE_NORMAL, lift * (0.5 + Math.random()))
    p.max = 0.45 + Math.random() * 0.4
    p.life = p.max
    p.size = 0.14 + Math.random() * 0.2
  }
  if (pieces.instanceColor) pieces.instanceColor.needsUpdate = true
}

/**
 * The slide's effects, on presets with particles: snow, sand or dirt spraying off the
 * board's tail (more when you skid, a puff when you land or the board pops out), and a
 * trail of soft glows in the board's colour. Fixed pools, two draw calls, nothing drawn
 * when nothing's alive.
 */
export function SlideFX() {
  const sprayRef = useRef(null)
  const trailRef = useRef(null)
  const state = useRef({ next: 0, nextTrail: 0, owed: 0, trailAt: 0, landedSeen: 0, popped: false, stoppedSeen: false })

  const assets = useMemo(() => {
    const pieces = createBoxInstances(SPRAY, sharedMaterials().toy, STYLE.SMOOTH)
    pieces.count = SPRAY
    pieces.visible = false
    const glows = createGlowInstances(TRAIL, 0.55)
    glows.count = TRAIL
    glows.visible = false
    return { pieces, glows }
  }, [])

  useEffect(
    () => () => {
      for (const p of spray) p.life = 0
      for (const t of trail) t.life = 0
      disposeBlocks(assets.pieces)
      disposeGlow(assets.glows)
    },
    [assets],
  )

  useFrame((_frame, rawDelta) => {
    const pieces = sprayRef.current
    const glows = trailRef.current
    if (!pieces || !glows) return
    const delta = Math.min(rawDelta, 0.05)
    const on = getQuality().particles
    const st = state.current
    const now = performance.now()

    if (slide.active && on) {
      if (slide.phase === 'launch') {
        // The board popping out kicks up a little puff.
        if (!st.popped && slide.launch > 0.05) {
          st.popped = true
          emit(pieces, st, 10, 2.2, 2.5, 0.5)
        }
      } else if (slide.phase === 'ride') {
        const skidding = Math.abs(slide.skid) > 0.05
        if (!slide.airborne && slide.speed > 6) {
          st.owed += delta * Math.min(55, slide.speed * 0.45) * (skidding ? 2.6 : 1)
          const n = Math.floor(st.owed)
          st.owed -= n
          if (n > 0) emit(pieces, st, n, skidding ? 5 : 1.6, skidding ? 3.5 : 2.4, Math.min(8, slide.speed * 0.06))
        }
        if (slide.landedAt !== st.landedSeen) {
          st.landedSeen = slide.landedAt
          emit(pieces, st, 18, 4.5, 4, 2)
        }
      } else if (!st.stoppedSeen) {
        st.stoppedSeen = true
        emit(pieces, st, 22, 5, 3.5, 1)
      }
      // The trail: a glow dropped where the board is, every so often, while moving.
      if (slide.phase === 'ride' && slide.speed > 12 && now - st.trailAt > TRAIL_EVERY_MS) {
        st.trailAt = now
        const t = trail[st.nextTrail]
        t.life = TRAIL_LIFE
        t.pos.copy(slide.position).addScaledVector(SLOPE_NORMAL, 0.25)
        st.nextTrail = (st.nextTrail + 1) % TRAIL
      }
    } else if (!slide.active) {
      st.popped = false
      st.stoppedSeen = false
      st.owed = 0
    }

    // --- Spray --------------------------------------------------------------------
    let alive = false
    for (let i = 0; i < SPRAY; i += 1) {
      const p = spray[i]
      if (p.life <= 0) continue
      p.life -= delta
      if (p.life <= 0 || !on) {
        p.life = 0
        pieces.setMatrixAt(i, _m.makeScale(0, 0, 0))
        alive = true
        continue
      }
      alive = true
      p.vel.y -= GRAVITY * delta
      p.vel.multiplyScalar(1 - delta * 2)
      p.pos.addScaledVector(p.vel, delta)
      _s.setScalar(p.size * (p.life / p.max))
      pieces.setMatrixAt(i, _m.compose(p.pos, _q, _s))
    }
    pieces.visible = alive
    if (alive) pieces.instanceMatrix.needsUpdate = true

    // --- Trail --------------------------------------------------------------------
    let lit = false
    const color = boardGlow(getGame().profile.equippedBoard)
    for (let i = 0; i < TRAIL; i += 1) {
      const t = trail[i]
      if (t.life > 0) t.life -= delta
      const k = on && t.life > 0 ? t.life / TRAIL_LIFE : 0
      if (k > 0) lit = true
      glows.setMatrixAt(i, _m.compose(t.pos, _q, _s.setScalar(2.4 * k)))
      glows.setColorAt(i, color)
    }
    glows.visible = lit
    if (lit) {
      glows.instanceMatrix.needsUpdate = true
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      <primitive ref={trailRef} object={assets.glows} />
      <primitive ref={sprayRef} object={assets.pieces} />
    </>
  )
}

export default SlideFX
