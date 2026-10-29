import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { TIRES } from '@shared/balance'
import { PAD_COUNT, PAD_HEIGHT, PAD_X, padCenterZ, SHOP_STAGES, STAND_SIZE, TIRE_STANDS } from '@shared/world'

import { useGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { BlockSet, disposeBlocks } from '../blocks'
import { createGlowInstances, disposeGlow } from '../glow'
import { standLabelSpec, standState } from '../labels/lobbyLabels'
import { updateWorldLabel } from '../labels/registry'
import { sharedMaterials, STYLE } from '../materials'
import { createTireMesh, disposeTireMesh, tireGlow, tireMatrix, tireRim } from '../tire'
import { PAD_THEMES } from './structures'

/** Stand colours by state, as in the reference: green equipped, blue owned, red not yet. */
const STAND_COLORS = {
  equipped: new Color('#3fdc4a'),
  owned: new Color('#38c8ff'),
  buy: new Color('#ff3b3b'),
  locked: new Color('#b0262b'),
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _glow = new Vector3()

/** Height of a stand's glowing cap above its pad; the tire floats over it. */
const CAP_TOP = 1.12
/** Showroom tires' size (radius), and the ones spinning over the training pads. */
const SHOWN_SIZE = 1.6
const HOVER = CAP_TOP + SHOWN_SIZE + 0.25
const PAD_TIRE_SIZE = 1.05
const PAD_TIRE_Y = PAD_HEIGHT + 4.2

/**
 * Display stands, all in one block set. The first TIRE_STANDS.length blocks are the
 * stands' tops themselves (recoloured by state, so their instance index is the stand
 * index); the trimmings follow.
 */
function buildStands() {
  const set = new BlockSet()
  const slab = STAND_SIZE - 0.4
  for (const stand of TIRE_STANDS) set.addOn(stand.x, stand.y - 0.1, stand.z, slab, 0.3, slab, '#ffffff', STYLE.STUDS)
  for (const stand of TIRE_STANDS) {
    const id = TIRES[stand.index].id
    const { x, y, z } = stand
    // Grey stepped frame, standing clear of the stand's top, like the reference's.
    const e = slab / 2 + 0.1
    for (const side of [-1, 1]) {
      set.addOn(x, y - 0.1, z + side * e, slab + 0.5, 0.45, 0.3, '#c4ccd8', STYLE.SMOOTH)
      set.addOn(x + side * e, y - 0.1, z, 0.3, 0.45, slab + 0.2, '#c4ccd8', STYLE.SMOOTH)
    }
    // A glowing square ring on the stand in the tire's own glow colour.
    const glow = tireGlow(id)
    for (const side of [-1, 1]) {
      set.addOn(x, y + 0.2, z + side * 1.25, 2.68, 0.06, 0.18, glow, STYLE.GLOW)
      set.addOn(x + side * 1.25, y + 0.2, z, 0.18, 0.06, 2.32, glow, STYLE.GLOW)
    }
    // Low pedestal with a cap in the tire's rim colour.
    set.addOn(x, y + 0.2, z, 1.1, 0.7, 1.1, '#f4f7fb', STYLE.SMOOTH)
    set.addOn(x, y + 0.9, z, 1.5, CAP_TOP - 0.9, 1.5, tireRim(id), STYLE.GLOW)
  }
  // A red carpet down the aisle between the two stages, edged in gold.
  const [front, back] = SHOP_STAGES
  const aisleX = (front.maxX + back.minX) / 2
  const length = front.maxZ - front.minZ
  const midZ = (front.minZ + front.maxZ) / 2
  set.addOn(aisleX, 0, midZ, 2.4, 0.06, length, '#d8263a', STYLE.SMOOTH)
  for (const side of [-1, 1]) set.addOn(aisleX + side * 1.25, 0, midZ, 0.18, 0.1, length, '#ffd21f', STYLE.GLOW)
  return set.build(sharedMaterials().blocks)
}

/**
 * The tire showroom: twenty display stands on the two showroom stages, each with its
 * tire standing on edge above it, slowly turning to show off its rim. Stands recolour
 * and their labels rewrite as you buy and equip. Also the tires spinning over the
 * training pads, which share the showroom's tire mesh. Three draw calls: stands, tires,
 * halos.
 */
export function TireShop() {
  const owned = useGame((s) => s.profile.ownedTires)
  const equipped = useGame((s) => s.profile.equippedTire)
  const standsRef = useRef(null)
  const tiresRef = useRef(null)
  const glowRef = useRef(null)

  const assets = useMemo(() => {
    const stands = buildStands()
    // All twenty showroom tires plus one over each pad, in one draw call.
    const count = TIRES.length + PAD_COUNT
    const tires = createTireMesh(count)
    TIRES.forEach((tire, i) => tires.setStyle(i, tire.id))
    for (let i = 0; i < PAD_COUNT; i += 1) tires.setStyle(TIRES.length + i, PAD_THEMES[i].tire)
    tires.count = count
    // Each one glows in its own colour.
    const glows = createGlowInstances(count, 0.7)
    TIRES.forEach((tire, i) => glows.setColorAt(i, tireGlow(tire.id)))
    for (let i = 0; i < PAD_COUNT; i += 1) glows.setColorAt(TIRES.length + i, tireGlow(PAD_THEMES[i].tire))
    glows.count = count
    glows.instanceColor.needsUpdate = true
    return { stands, tires, glows }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.stands)
      disposeTireMesh(assets.tires)
      disposeGlow(assets.glows)
    },
    [assets],
  )

  // Recolour stands and rewrite their labels whenever ownership changes.
  useEffect(() => {
    const stands = standsRef.current
    const profile = { ownedTires: owned, equippedTire: equipped }
    for (const stand of TIRE_STANDS) {
      const state = standState(profile, stand.index)
      stands?.setColorAt(stand.index, STAND_COLORS[state])
      updateWorldLabel(`stand-${stand.index}`, standLabelSpec(stand.index, state))
    }
    if (stands?.instanceColor) stands.instanceColor.needsUpdate = true
  }, [owned, equipped])

  useFrame((state) => {
    const tires = tiresRef.current
    const glows = glowRef.current
    if (!tires || !glows) return
    const t = state.clock.elapsedTime
    const glowSize = 3.4 * getQuality().boardGlow
    for (const stand of TIRE_STANDS) {
      const id = TIRES[stand.index].id
      _p.set(stand.x, stand.y + HOVER + Math.sin(t * 1.6 + stand.index) * 0.15, stand.z)
      // Standing on edge, rim turned towards the plaza (west), swinging a little.
      _q.setFromEuler(_e.set(0, Math.sin(t * 0.7 + stand.index) * 0.5, 0))
      tires.setMatrixAt(stand.index, tireMatrix(_p, _q, SHOWN_SIZE, id, _m))
      glows.setMatrixAt(stand.index, _m.compose(_p, _q, _glow.setScalar(glowSize)))
    }
    // Over the pads: spinning fast, like the reference's training tires.
    for (let i = 0; i < PAD_COUNT; i += 1) {
      const n = TIRES.length + i
      _p.set(PAD_X, PAD_TIRE_Y + Math.sin(t * 2 + i) * 0.2, padCenterZ(i))
      _q.setFromEuler(_e.set(-t * 6 - i, Math.PI / 2 + Math.sin(t * 0.5 + i) * 0.3, 0, 'YXZ'))
      tires.setMatrixAt(n, tireMatrix(_p, _q, PAD_TIRE_SIZE, PAD_THEMES[i].tire, _m))
      glows.setMatrixAt(n, _m.compose(_p, _q.identity(), _glow.setScalar(glowSize * 0.8)))
    }
    tires.instanceMatrix.needsUpdate = true
    glows.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={standsRef} object={assets.stands} />
      <primitive ref={tiresRef} object={assets.tires} />
      <primitive ref={glowRef} object={assets.glows} />
    </>
  )
}

export default TireShop
