import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { SLIDE_RECOVERY } from '@shared/balance'

import { remotePlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { boardGlow, createBoardMesh, disposeBoardMesh } from '../board'
import { createGlowInstances, disposeGlow } from '../glow'
import { sharedMaterials, STYLE } from '../materials'
import { runtime } from '../runtime'
import { BOARD_QUAT, createRideState, FACE_DOWNHILL, meterAtZ, riderBody, rideState, rideTurn, standSide } from '../slide/path'
import { hideNameplatesFrom, NAMEPLATE_POOL_SIZE, placeNameplate } from './nameplates'

/** Remote players are drawn this far in the past, so 10 Hz updates interpolate. */
const INTERP_DELAY_MS = 110
const MAX_REMOTES = 8
const PARTS = 6
/** Ghost riders are drawn this much further away than people in the lobby. */
const RIDER_DISTANCE_SCALE = 2
const S = 0.36
/** Facing a treadmill's console, as your own character does. */
const TREADMILL_YAW = -Math.PI / 2

/** Classic blocky figure, in studs-scaled units: [x, y(pivot), size, hangs from pivot]. */
const PART_LAYOUT = [
  { key: 'head', pos: [0, 1.62, 0], size: [1.2 * S, 1 * S, 1 * S] },
  { key: 'torso', pos: [0, 1.08, 0], size: [2 * S, 2 * S, 1 * S] },
  { key: 'armL', pos: [-1.5 * S, 1.44, 0], size: [1 * S, 2 * S, 1 * S], swing: -1 },
  { key: 'armR', pos: [1.5 * S, 1.44, 0], size: [1 * S, 2 * S, 1 * S], swing: 1 },
  { key: 'legL', pos: [-0.5 * S, 0.72, 0], size: [1 * S, 2 * S, 1 * S], swing: 1 },
  { key: 'legR', pos: [0.5 * S, 0.72, 0], size: [1 * S, 2 * S, 1 * S], swing: -1 },
]

// Parsed once: setColorAt runs for every limb of every player, every frame.
const palette = (list) => list.map((c) => new Color(c))
const SHIRTS = palette(['#e8423a', '#2f7fe6', '#3ccf4e', '#9b4dff', '#ff9a1f', '#1d1f26', '#ffffff', '#ff5fa8'])
const PANTS = palette(['#2d3a5c', '#1d1f26', '#4a3a2a', '#3a3a46', '#2f5aa8'])
const SKINS = palette(['#f5cd47', '#e8b48a', '#c98a5a', '#8a5a3a', '#ffd9b3'])

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Each rider keeps to their own line down the canyon, so riders don't overlap. */
const riderLane = (sessionId) => ((hashString(sessionId) % 7) - 3) * 1.6

const _m = new Matrix4()
const _base = new Matrix4()
const _local = new Matrix4()
const _rot = new Matrix4()
const _scale = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _v = new Vector3()
const _up = new Vector3(0, 1, 0)
const _target = new Vector3()
const _dir = new Vector3()
const _prev = new Vector3()
const _rider = new Vector3()
const _feet = new Vector3()
const _glowAt = new Matrix4().makeTranslation(0, 0.05, 0.1)
const _qRide = new Quaternion()
const _qBody = new Quaternion()

function lerpAngle(a, b, t) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Interpolates a remote player to `renderTime`. */
function interpolate(r, renderTime) {
  const snaps = r.snaps
  if (snaps.length === 0) return
  let i = snaps.length - 1
  while (i > 0 && snaps[i - 1].t > renderTime) i -= 1
  const b = snaps[i]
  const a = snaps[Math.max(0, i - 1)]
  const span = b.t - a.t
  const t = span > 0 ? Math.min(1, Math.max(0, (renderTime - a.t) / span)) : 1
  _prev.copy(r.position)
  r.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)
  r.yaw = lerpAngle(a.r, b.r, t)
  // Drop snapshots we've moved past, keeping one to interpolate from.
  while (snaps.length > 2 && snaps[1].t < renderTime) snaps.shift()
}

/**
 * Writes one blocky figure's six parts from `base` (its feet), limbs swung by `swing`
 * (and arms by `armSwing`, for the riding grip). Returns the next free instance.
 */
function writeFigure(body, instance, r, base, swing, armSwing) {
  const h = hashString(r.sessionId)
  const shirt = SHIRTS[h % SHIRTS.length]
  const pants = PANTS[(h >>> 8) % PANTS.length]
  const skin = SKINS[(h >>> 16) % SKINS.length]
  for (const part of PART_LAYOUT) {
    const hangs = part.swing !== undefined
    const isArm = part.key.startsWith('arm')
    const angle = hangs ? (isArm && armSwing !== null ? armSwing : swing * part.swing) : 0
    _local.makeTranslation(part.pos[0], part.pos[1], part.pos[2])
    _rot.makeRotationX(angle)
    _scale.makeScale(part.size[0], part.size[1], part.size[2])
    // Limbs hang from their pivot; head and torso are centred on theirs.
    if (hangs) _scale.setPosition(0, -part.size[1] / 2, 0)
    _m.copy(base).multiply(_local).multiply(_rot).multiply(_scale)
    body.setMatrixAt(instance, _m)
    // Classic look: shirt on the torso, trousers on the legs, bare arms and head.
    body.setColorAt(instance, part.key === 'torso' ? shirt : part.key.startsWith('leg') ? pants : skin)
    instance += 1
  }
  return instance
}

/** Puts a name tag over `at`, if it's on screen; returns the next free tag. */
function writeNameplate(plate, name, at, distance, maxDistance, camera, size) {
  if (plate >= NAMEPLATE_POOL_SIZE) return plate
  if (distance < maxDistance) {
    _v.copy(at).project(camera)
    if (_v.z < 1) {
      const fade = Math.min(1, (maxDistance - distance) / 6)
      placeNameplate(plate, name, (_v.x * 0.5 + 0.5) * size.width, (-_v.y * 0.5 + 0.5) * size.height, fade)
      return plate + 1
    }
  }
  placeNameplate(plate, '', null)
  return plate + 1
}

/**
 * Everyone else in the lobby: blocky avatars (one InstancedMesh for every limb of every
 * player), name tags and their pets (handed to the shared pet renderer). While someone
 * slides they ride down the canyon as a ghost rider on their own board, replayed from
 * the slide the server told us about. Hidden past the preset's draw distance.
 */
export function RemotePlayers() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const bodyRef = useRef(null)
  const boardsRef = useRef(null)
  const glowsRef = useRef(null)

  const assets = useMemo(() => {
    // Smooth toy boxes: the shared toy material, so no extra shader program.
    const body = createBoxInstances(MAX_REMOTES * PARTS, sharedMaterials().toy, STYLE.SMOOTH)
    body.castShadow = true
    // Riders' boards: the same mesh and material as yours.
    const boards = createBoardMesh(MAX_REMOTES)
    return { body, boards, glows: createGlowInstances(MAX_REMOTES, 0.6) }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.body)
      disposeBoardMesh(assets.boards)
      disposeGlow(assets.glows)
      hideNameplatesFrom(0)
    },
    [assets],
  )

  useFrame((state, rawDelta) => {
    const body = bodyRef.current
    const boards = boardsRef.current
    const glows = glowsRef.current
    if (!body || !boards || !glows) return
    const delta = Math.min(rawDelta, 0.05)
    const settings = getQuality()
    const now = performance.now()
    const renderTime = now - INTERP_DELAY_MS
    const t = state.clock.elapsedTime

    let instance = 0
    let plate = 0
    let rode = 0
    runtime.remotePets.length = 0

    for (const r of remotePlayers.values()) {
      interpolate(r, renderTime)
      const moved = _prev.distanceTo(r.position)
      r.speed = r.speed * 0.8 + (moved / Math.max(delta, 1e-3)) * 0.2

      // --- Riding down the hill: a ghost of the slide they started ------------------
      const ride = runtime.ghostSlides.get(r.sessionId)
      const elapsed = ride ? (now - ride.startedAt) / 1000 : 0
      if (ride && elapsed > ride.duration + SLIDE_RECOVERY) runtime.ghostSlides.delete(r.sessionId)
      r.riding = Boolean(ride) && elapsed <= ride.duration + SLIDE_RECOVERY
      r.shadow.visible = false
      r.ride = r.riding ? ride : null
      if (r.riding) {
        // The same ride as theirs (path.rideState): dive, jumps, leans and skid. Their
        // real avatar (RemoteAvatars) reads `r.ride` to ride along with it.
        if (!ride.state) {
          ride.fromMeter = meterAtZ(ride.z)
          ride.startX = ride.x
          ride.state = createRideState()
        }
        const st = rideState(elapsed, ride, riderLane(r.sessionId), ride.state)
        _rider.copy(st.position)
        const distance = camera.position.distanceTo(_rider)
        if (distance < settings.remoteDrawDistance * RIDER_DISTANCE_SCALE && rode < MAX_REMOTES) {
          rideTurn(st, _qRide)
          // Their board, nose down the hill, glowing in its colour; it pops out at the start.
          const pop = st.phase === 'launch' ? Math.min(1, st.launch / 0.3) : 1
          _base.compose(_rider, _qBody.multiplyQuaternions(_qRide, BOARD_QUAT), _s.setScalar(pop))
          boards.setMatrixAt(rode, _base)
          boards.setStyle(rode, ride.boardId)
          glows.setMatrixAt(rode, _m.copy(_base).multiply(_glowAt).scale(_s.setScalar(2.6 * settings.boardGlow)))
          glows.setColorAt(rode, boardGlow(ride.boardId))
          rode += 1
          // Far away (no real avatar for them): the blocky stand-in, placed just as an
          // avatar would be - diving on, lying on it, getting up to cheer.
          if (!r.fullAvatar && instance + PARTS <= MAX_REMOTES * PARTS) {
            riderBody(st, _qRide, FACE_DOWNHILL, standSide(ride.distance), _feet, _qBody)
            _feet.applyQuaternion(_qRide).add(_rider)
            _base.compose(_feet, _qBody.premultiply(_qRide), _s.set(1, 1, 1))
            const arms = st.phase === 'launch' && st.launch < 0.5 ? 0.6 : st.stand > 0.5 ? -2.7 + Math.sin(t * 10) * 0.3 : -1.35
            instance = writeFigure(body, instance, r, _base, st.stand > 0.5 ? 0 : Math.sin(t * 30) * 0.04, arms)
          }
          _v.copy(_rider).y += st.stand > 0.5 ? 2.3 : 1.4
          plate = writeNameplate(plate, r.name, _v, distance, settings.remoteNameDistance, camera, size)
        }
        continue
      }

      // --- In the lobby -----------------------------------------------------------
      const distance = camera.position.distanceTo(r.position)
      // Someone mid-slide we never saw start (we joined late) isn't drawn at the top.
      const visible = distance < settings.remoteDrawDistance && r.anim !== 'slide'
      r.shadow.visible = visible
      const running = r.anim === 'run'

      // Players drawn as their real avatar (RemoteAvatars) skip the blocky figure.
      if (visible && !r.fullAvatar && instance + PARTS <= MAX_REMOTES * PARTS) {
        const walking = running || r.speed > 0.6
        if (walking) r.walkPhase += delta * (running ? 11 : 6 + Math.min(r.speed, 10) * 0.5)
        const swing = walking ? Math.sin(r.walkPhase) * 0.9 : 0
        _q.setFromAxisAngle(_up, running ? TREADMILL_YAW : r.yaw)
        _base.compose(r.position, _q, _s.set(1, 1, 1))
        instance = writeFigure(body, instance, r, _base, swing, null)
      }

      // Name tag, just above the head (players are 1.8 tall).
      if (visible) {
        _v.set(r.position.x, r.position.y + 2.05, r.position.z)
        plate = writeNameplate(plate, r.name, _v, distance, settings.remoteNameDistance, camera, size)
      }

      // Their pets: follow in formation, drawn by the shared pet renderer.
      if (visible) {
        const sin = Math.sin(r.yaw)
        const cos = Math.cos(r.yaw)
        for (let i = 0; i < r.petIds.length && i < r.pets.length; i += 1) {
          const pet = r.pets[i]
          pet.id = r.petIds[i]
          const sx = i === 0 ? -1.5 : i === 1 ? 1.5 : 0
          const sz = i === 2 ? -2.5 : -1.3
          _target.set(r.position.x - cos * sx + sin * sz, r.position.y, r.position.z + sin * sx + cos * sz)
          _dir.copy(pet.position)
          pet.position.lerp(_target, 1 - Math.exp(-6 * delta))
          const stepped = _dir.distanceTo(pet.position)
          if (stepped > 0.005) pet.yaw = Math.atan2(pet.position.x - _dir.x, pet.position.z - _dir.z)
          pet.hop = Math.abs(Math.sin(t * 7 + i)) * (stepped > 0.01 ? 0.35 : 0.08)
          runtime.remotePets.push(pet)
        }
      }
    }
    hideNameplatesFrom(plate)
    body.count = instance
    body.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    boards.count = rode
    glows.count = rode
    boards.instanceMatrix.needsUpdate = true
    glows.instanceMatrix.needsUpdate = true
    if (glows.instanceColor) glows.instanceColor.needsUpdate = true
  })

  return (
    <>
      <primitive ref={bodyRef} object={assets.body} />
      <primitive ref={glowsRef} object={assets.glows} />
      <primitive ref={boardsRef} object={assets.boards} />
    </>
  )
}

export default RemotePlayers
