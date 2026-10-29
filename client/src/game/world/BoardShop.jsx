import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { BOARDS } from '@shared/balance'
import { BOARD_PADS, PAD_SIZE, SHOP_STAGES } from '@shared/world'

import { useGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { BlockSet, disposeBlocks } from '../blocks'
import { boardColor, boardGlow, createBoardMesh, disposeBoardMesh } from '../board'
import { createGlowInstances, disposeGlow } from '../glow'
import { padLabelSpec, padState } from '../labels/lobbyLabels'
import { updateWorldLabel } from '../labels/registry'
import { sharedMaterials, STYLE } from '../materials'

/** Pad colours by state, as in the reference: blue owned, yellow equipped, red not yet. */
const PAD_COLORS = {
  equipped: new Color('#ffd21f'),
  owned: new Color('#38c8ff'),
  buy: new Color('#ff3b3b'),
  locked: new Color('#b0262b'),
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3(1.55, 1.55, 1.55)
const _glow = new Vector3()

/** Height of a stand's glowing cap above its pad; the board floats over it. */
const CAP_TOP = 1.12
const HOVER = CAP_TOP + 1.25

/**
 * Display stands, all in one block set. The first BOARD_PADS.length blocks are the pads
 * themselves (recoloured by state, so their instance index is the pad index); the
 * trimmings follow.
 */
function buildStands() {
  const set = new BlockSet()
  const slab = PAD_SIZE - 0.4
  for (const pad of BOARD_PADS) set.addOn(pad.x, pad.y - 0.1, pad.z, slab, 0.3, slab, '#ffffff', STYLE.STUDS)
  for (const pad of BOARD_PADS) {
    const id = BOARDS[pad.index].id
    const { x, y, z } = pad
    // White frame, standing clear of the pad's top.
    const e = slab / 2 + 0.1
    for (const side of [-1, 1]) {
      set.addOn(x, y - 0.1, z + side * e, slab + 0.5, 0.45, 0.3, '#ffffff', STYLE.SMOOTH)
      set.addOn(x + side * e, y - 0.1, z, 0.3, 0.45, slab + 0.2, '#ffffff', STYLE.SMOOTH)
    }
    // A glowing square ring on the pad in the board's own glow colour.
    const glow = boardGlow(id)
    for (const side of [-1, 1]) {
      set.addOn(x, y + 0.2, z + side * 1.25, 2.68, 0.06, 0.18, glow, STYLE.GLOW)
      set.addOn(x + side * 1.25, y + 0.2, z, 0.18, 0.06, 2.32, glow, STYLE.GLOW)
    }
    // Low pedestal with a cap in the board's colour.
    set.addOn(x, y + 0.2, z, 1.1, 0.7, 1.1, '#f4f7fb', STYLE.SMOOTH)
    set.addOn(x, y + 0.9, z, 1.5, CAP_TOP - 0.9, 1.5, boardColor(id), STYLE.GLOW)
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
 * The board shop: twenty display stands on the two shop stages, each a pad framed in
 * white with a glowing pedestal and its board floating above it, tipped up towards the
 * plaza. Pads recolour and their labels rewrite as you buy and equip; the boards turn
 * slowly. Three draw calls: stands, boards, halos.
 */
export function BoardShop() {
  const owned = useGame((s) => s.profile.ownedBoards)
  const equipped = useGame((s) => s.profile.equippedBoard)
  const padsRef = useRef(null)
  const boardsRef = useRef(null)
  const glowRef = useRef(null)

  const assets = useMemo(() => {
    const pads = buildStands()
    // All twenty boards, each in its own design, in one draw call.
    const boards = createBoardMesh(BOARDS.length)
    BOARDS.forEach((board, i) => boards.setStyle(i, board.id))
    boards.count = BOARDS.length
    // Each one glows in its own colour.
    const glows = createGlowInstances(BOARDS.length, 0.7)
    BOARDS.forEach((board, i) => glows.setColorAt(i, boardGlow(board.id)))
    glows.count = BOARDS.length
    glows.instanceColor.needsUpdate = true
    return { pads, boards, glows }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.pads)
      disposeBoardMesh(assets.boards)
      disposeGlow(assets.glows)
    },
    [assets],
  )

  // Recolour pads and rewrite their labels whenever ownership changes.
  useEffect(() => {
    const pads = padsRef.current
    const profile = { ownedBoards: owned, equippedBoard: equipped }
    for (const pad of BOARD_PADS) {
      const state = padState(profile, pad.index)
      pads?.setColorAt(pad.index, PAD_COLORS[state])
      updateWorldLabel(`pad-${pad.index}`, padLabelSpec(pad.index, state))
    }
    if (pads?.instanceColor) pads.instanceColor.needsUpdate = true
  }, [owned, equipped])

  useFrame((state) => {
    const boards = boardsRef.current
    const glows = glowRef.current
    if (!boards || !glows) return
    const t = state.clock.elapsedTime
    const glowSize = 3.6 * getQuality().boardGlow
    for (const pad of BOARD_PADS) {
      _p.set(pad.x, pad.y + HOVER + Math.sin(t * 1.6 + pad.index) * 0.15, pad.z)
      // Nose up and deck turned to the plaza (west) so the design shows, swaying a little.
      _q.setFromEuler(_e.set(0.95, -Math.PI / 2 + Math.sin(t * 0.7 + pad.index) * 0.35, 0, 'YXZ'))
      boards.setMatrixAt(pad.index, _m.compose(_p, _q, _s))
      glows.setMatrixAt(pad.index, _m.compose(_p, _q, _glow.setScalar(glowSize)))
    }
    boards.instanceMatrix.needsUpdate = true
    glows.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={padsRef} object={assets.pads} />
      <primitive ref={boardsRef} object={assets.boards} />
      <primitive ref={glowRef} object={assets.glows} />
    </>
  )
}

export default BoardShop
