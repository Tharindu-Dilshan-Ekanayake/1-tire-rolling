import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import { isTreadmillUnlocked } from '@shared/logic'
import { clampToWalkable, groundHeightAt, STATIC_COLLIDERS, treadmillAt } from '@shared/world'

import { sfx } from '../audio/sfx'
import { getGame } from '../store/game'
import { getQuality } from '../store/quality'
import ErrorBoundary from '../ui/ErrorBoundary'
import { createBoardModel } from './board'
import FallbackAvatar from './FallbackAvatar'
import PlayerAvatar from './PlayerAvatar'
import { runtime } from './runtime'
import { BOARD_QUAT, LEAP, riderBody, rideTurn, standSide } from './slide/path'
import { advanceSlide, slide } from './slide/slideControl'
import useKeyboard from './useKeyboard'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45

const WALK_SPEED = 10.875
const ACCELERATION = 16
const GRAVITY = 32
const JUMP_SPEED = 10.5
/** Ledges up to this high are walked straight onto (the shop's back stage). */
const STEP_UP = 1.05
/** Facing the console at a treadmill's west end. */
const TREADMILL_YAW = -Math.PI / 2

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _clamped = { x: 0, z: 0 }

/** In the lobby, standing on the SLIDE ZONE, the board hovers ready this far ahead. */
const READY_AHEAD = new Vector3(0, 0.3, -LEAP)
const _launchFrom = new Quaternion()
/** 0 -> 1 with a springy overshoot, for things popping into view. */
const easeOutBack = (x) => {
  const t = Math.min(1, Math.max(0, x)) - 1
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t
}

/** Pushes a circle out of an axis-aligned rect. Returns true on contact. */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= RADIUS * RADIUS) return false

  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const push = (RADIUS - d) / d
    pos.x += dx * push
    pos.z += dz * push
    return true
  }

  // Centre inside the rect (spawned in, or a wall appeared on top of us): leave by the
  // nearest side.
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - RADIUS
  else if (m === right) pos.x = rect.maxX + RADIUS
  else if (m === near) pos.z = rect.minZ - RADIUS
  else pos.z = rect.maxZ + RADIUS
  return true
}

/**
 * The local player: a kinematic character controller.
 *
 * No physics engine: the world is flat ground, a few raised floors and a list of
 * rectangular walls, which a circle-vs-rect push-out handles exactly. That saves the
 * ~2 MB Rapier WASM download and keeps the active rigid body count at zero.
 *
 * While you slide, your logical position stays on the SLIDE ZONE (what the server
 * checks) and only the drawn character rides the board down the hill. On a treadmill
 * you run on the spot, facing its console.
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 *
 * @param {{ onAvatarReady?: () => void }} props
 */
export function Player({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const boardRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)
  const wasSliding = useRef(false)
  /**
   * This slide's bits Player keeps: whether the board was already out, the skid's side,
   * the ready hover (0-1) and how far into the jump pose (0-1).
   */
  const ride = useRef({ popped: false, side: 1, ready: 0, air: 0 })
  const board = useMemo(() => createBoardModel(), [])

  /** Handed to the avatar so it can pose itself. A ref: written every frame. */
  const motionRef = useRef({
    time: 0,
    speed: 0,
    grounded: true,
    maxSpeed: WALK_SPEED,
    vy: 0,
    stride: 0,
    sliding: false,
  })

  // The blob shadow follows what's drawn, which is down the hill while you slide.
  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1 }
    runtime.shadowCasters.add(caster)
    return () => runtime.shadowCasters.delete(caster)
  }, [shownAt])

  useEffect(() => () => board.dispose(), [board])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const player = runtime.player
    const pos = player.position
    const k = keys.current
    const joy = runtime.input
    const motion = motionRef.current
    motion.time += delta

    const group = groupRef.current
    const visual = visualRef.current
    const b = boardRef.current

    // --- Riding the slide ------------------------------------------------------
    if (slide.active && group && visual && b) {
      advanceSlide(state.clock.elapsedTime)
      if (!wasSliding.current) {
        // Pressed SLIDE: remember which way you faced, and whether the board was
        // already out (hovering ready) or has to pop out now.
        wasSliding.current = true
        _launchFrom.copy(visual.quaternion)
        ride.current.popped = b.visible
        ride.current.side = standSide(slide.distance)
      }
      player.anim = 'slide'
      player.speed = 0
      velocity.current.set(0, 0, 0)
      vy.current = 0
      // The group is the board's underside: skids and leans turn the board and rider together.
      group.position.copy(slide.position)
      rideTurn(slide, group.quaternion)
      shownAt.copy(slide.position)

      b.visible = true
      b.position.set(0, 0, 0)
      b.quaternion.copy(BOARD_QUAT)
      b.scale.setScalar(ride.current.popped ? 1 : easeOutBack(slide.launch / 0.35))
      b.setBoard(getGame().profile.equippedBoard)
      b.setGlowSize(2.6 * getQuality().boardGlow)

      // Diving on, lying on it, getting up to cheer: placed on the board's frame.
      riderBody(slide, group.quaternion, _launchFrom, ride.current.side, visual.position, visual.quaternion)
      // In the air: spread out (eased in and out); landing: a squash. On the ground at
      // speed the board shudders a little.
      const r = ride.current
      r.air += ((slide.airborne ? 1 : 0) - r.air) * (1 - Math.exp(-10 * delta))
      const sinceLanding = performance.now() - slide.landedAt
      const squash = slide.landedAt > 0 && sinceLanding < 450 ? Math.exp(-sinceLanding / 110) : 0
      group.scale.set(1 + 0.1 * squash, 1 - 0.16 * squash, 1 + 0.1 * squash)
      const shudder = slide.phase === 'ride' && !slide.airborne ? Math.min(1, slide.speed / 150) * 0.018 : 0
      b.position.y = Math.sin(state.clock.elapsedTime * 47) * shudder
      motion.sliding = true
      motion.launch = slide.launch
      motion.stand = slide.stand
      motion.air = r.air
      motion.speed = slide.phase === 'ride' ? slide.speed : 0
      motion.grounded = true
      return
    }
    if (wasSliding.current && group && visual && b) {
      // Back at the top: stand up where the slide control put you.
      wasSliding.current = false
      visual.position.set(0, 0, 0)
      visual.quaternion.setFromAxisAngle(_up, player.yaw)
      group.position.copy(pos)
      group.quaternion.identity()
      group.scale.set(1, 1, 1)
      ride.current.air = 0
      motion.air = 0
      b.visible = false
      b.scale.setScalar(1)
      motion.sliding = false
      motion.launch = 1
      motion.stand = 0
    }

    // --- Ready to slide: the board hovers in front of you on the SLIDE ZONE ------
    if (b) {
      const ready = getGame().zone.slideZone && !player.frozen
      const r = ride.current
      r.ready = ready ? Math.min(1, r.ready + delta * 4) : Math.max(0, r.ready - delta * 6)
      b.visible = r.ready > 0
      if (b.visible) {
        const t = state.clock.elapsedTime
        b.position.copy(READY_AHEAD)
        b.position.y += Math.sin(t * 3) * 0.08
        b.quaternion.setFromAxisAngle(_up, Math.sin(t * 1.3) * 0.25)
        b.scale.setScalar(easeOutBack(r.ready))
        b.setBoard(getGame().profile.equippedBoard)
        b.setGlowSize(2.6 * getQuality().boardGlow)
      }
    }

    // --- Input, relative to the camera ----------------------------------------
    _input.set(0, 0, 0)
    if (!player.frozen) {
      _input.set(
        (k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX,
        0,
        (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - joy.joyY,
      )
    }
    const inputLength = Math.min(1, _input.length())

    if (inputLength > 0.02) {
      _input.normalize()
      // Flatten the camera's forward onto the ground plane so "up" always means
      // "away from the camera".
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
        .multiplyScalar(WALK_SPEED * inputLength)
    } else {
      _move.set(0, 0, 0)
    }

    // Ease towards the target velocity: crisp, but no instant 0->max snaps.
    const blend = 1 - Math.exp(-ACCELERATION * delta)
    velocity.current.lerp(_move, blend)

    // --- Horizontal move + collision --------------------------------------------
    const prevX = pos.x
    const prevZ = pos.z
    pos.x += velocity.current.x * delta
    pos.z += velocity.current.z * delta

    for (const rect of STATIC_COLLIDERS) pushOut(pos, rect)
    for (const rect of runtime.dynamicColliders) pushOut(pos, rect)
    clampToWalkable(pos.x, pos.z, _clamped)
    pos.x = _clamped.x
    pos.z = _clamped.z

    // A ledge too tall to step onto acts as a wall.
    let floor = groundHeightAt(pos.x, pos.z)
    if (floor - pos.y > STEP_UP) {
      pos.x = prevX
      pos.z = prevZ
      floor = groundHeightAt(pos.x, pos.z)
    }

    // --- Vertical ---------------------------------------------------------------
    const wantJump = !player.frozen && (k.jump || joy.jump)
    if (wantJump && player.grounded) {
      vy.current = JUMP_SPEED
      player.grounded = false
      sfx.jump()
    }
    vy.current -= GRAVITY * delta
    pos.y += vy.current * delta

    if (pos.y <= floor) {
      // Coming down from a jump (not just stepping off a kerb) lands with a thump.
      if (!player.grounded && vy.current < -5) sfx.jumpLand()
      pos.y = floor
      vy.current = 0
      player.grounded = true
    } else if (pos.y - floor > 0.05) {
      // Walked off a ledge, or still rising from a jump.
      player.grounded = false
    }

    // --- Facing -----------------------------------------------------------------
    const speed = Math.hypot(velocity.current.x, velocity.current.z)
    // Standing still on an unlocked treadmill: run on the spot, facing its console.
    const tread = treadmillAt(pos.x, pos.z)
    const running = tread >= 0 && player.grounded && speed < 0.5 && !player.frozen && isTreadmillUnlocked(getGame().profile, tread)
    if (running) player.yaw = TREADMILL_YAW
    else if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)
    if (visual) {
      _targetQuat.setFromAxisAngle(_up, player.yaw)
      visual.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0005, delta))
    }
    if (group) {
      // Step-ups ease in over a few frames on the visual only; the logical position
      // snaps so collision and triggers stay exact.
      const steppingUp = player.grounded && pos.y > group.position.y
      const visualY = steppingUp
        ? group.position.y + (pos.y - group.position.y) * Math.min(1, delta * 18)
        : pos.y
      group.position.set(pos.x, visualY, pos.z)
    }
    shownAt.copy(pos)

    // --- Publish motion ---------------------------------------------------------
    player.speed = speed
    player.anim = !player.grounded ? 'jump' : running ? 'run' : speed > 0.5 ? 'walk' : 'idle'

    const shownSpeed = running ? WALK_SPEED : speed
    motion.speed = shownSpeed
    motion.grounded = player.grounded
    motion.vy = vy.current
    // Steps quicken with speed: the stride phase runs faster rather than jumping.
    motion.stride += delta * (5 + 6 * Math.min(1, shownSpeed / WALK_SPEED))
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} onReady={onAvatarReady} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} />
          </Suspense>
        </ErrorBoundary>
      </group>
      <primitive ref={boardRef} object={board} visible={false} />
    </group>
  )
}

export default Player
