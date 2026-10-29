import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Quaternion, Vector3 } from 'three'

import { remotePlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { BloxityAvatar } from '../PlayerAvatar'
import { FACE_DOWNHILL, riderBody, rideTurn, standSide } from '../slide/path'

/** How often the set of fully drawn players is reconsidered. */
const PICK_MS = 500
/** Top walking speed: full stride amplitude, as for your own character. */
const MAX_SPEED = 10.875
/** Facing a treadmill's console, as your own character does. */
const TREADMILL_YAW = -Math.PI / 2

const _up = new Vector3(0, 1, 0)
const _turn = new Quaternion()
const _bodyQuat = new Quaternion()
const _bodyPos = new Vector3()

/** Where a remote player is drawn: down the hill while they slide, else where they stand. */
const shownAt = (r) => (r.riding && r.ride?.state ? r.ride.state.position : r.position)

/**
 * One other player as their real Bloxity avatar, dressed as they are and posed by the
 * same playerPose as yours, from what the network says they're doing: walking pace,
 * running on a treadmill, jumping - and sliding: diving onto their board, lying on it
 * down the hill (RemotePlayers draws the board), flying off ramps and cheering at the
 * end, placed exactly as your own rider is (path.riderBody).
 */
function RemoteAvatar({ sessionId, look }) {
  const groupRef = useRef(null)
  const lastY = useRef(null)
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: MAX_SPEED, vy: 0, stride: 0, sliding: false, launch: 1, stand: 0, air: 0 })

  useFrame((_state, rawDelta) => {
    const group = groupRef.current
    const r = remotePlayers.get(sessionId)
    if (!group || !r) return
    const delta = Math.min(rawDelta, 0.05)
    const m = motionRef.current
    m.time += delta

    // Sliding: on their board down the hill.
    const st = r.riding ? r.ride?.state : null
    if (st) {
      group.visible = true
      rideTurn(st, _turn)
      riderBody(st, _turn, FACE_DOWNHILL, standSide(r.ride.distance), _bodyPos, _bodyQuat)
      group.position.copy(_bodyPos).applyQuaternion(_turn).add(st.position)
      group.quaternion.multiplyQuaternions(_turn, _bodyQuat)
      m.sliding = true
      m.launch = st.launch
      m.stand = st.stand
      m.air += ((st.airborne ? 1 : 0) - m.air) * (1 - Math.exp(-10 * delta))
      m.speed = st.phase === 'ride' ? st.speed : 0
      m.grounded = true
      lastY.current = null
      return
    }
    m.sliding = false
    m.launch = 1
    m.stand = 0
    m.air = 0

    const running = r.anim === 'run'
    // Mid-slide but we never saw it start (we joined late): not drawn at the top.
    group.visible = r.anim !== 'slide'
    group.position.copy(r.position)
    group.quaternion.setFromAxisAngle(_up, running ? TREADMILL_YAW : r.yaw)

    const speed = running ? MAX_SPEED : r.speed
    m.speed = speed
    m.grounded = r.anim !== 'jump'
    // Vertical speed from the interpolated height, smoothed: rising vs falling.
    const y = r.position.y
    if (lastY.current !== null) m.vy += ((y - lastY.current) / Math.max(delta, 1e-3) - m.vy) * 0.3
    lastY.current = y
    m.stride += delta * (5 + 6 * Math.min(1, speed / MAX_SPEED))
  })

  return (
    <group ref={groupRef}>
      <BloxityAvatar equipped={look?.equipped} proportions={look?.proportions} motionRef={motionRef} targetHeight={1.8} />
    </group>
  )
}

/**
 * The other players nearest the camera, as their real avatars - standing, walking or
 * sliding: as many as the quality preset allows (`remoteAvatars`), within
 * `remoteAvatarDistance`. Anyone further is the cheap blocky figure RemotePlayers draws
 * (`r.fullAvatar` tells it who's covered); far enough away that it's only a few pixels.
 * Chosen twice a second, never per frame, so React only re-renders when the set of
 * players (or an outfit) actually changes.
 */
export function RemoteAvatars() {
  const camera = useThree((s) => s.camera)
  const [shown, setShown] = useState([])

  useEffect(() => {
    const pick = () => {
      const settings = getQuality()
      const near = []
      for (const r of remotePlayers.values()) {
        r.fullAvatar = false
        // Riders count by where they are on the hill, not where they pressed SLIDE.
        const d = camera.position.distanceTo(shownAt(r))
        if (d < settings.remoteAvatarDistance) near.push([d, r])
      }
      near.sort((a, b) => a[0] - b[0])
      const next = near
        .slice(0, settings.remoteAvatars)
        .map(([, r]) => r)
        .sort((a, b) => (a.sessionId < b.sessionId ? -1 : 1))
      for (const r of next) r.fullAvatar = true
      setShown((prev) => {
        const same = prev.length === next.length && prev.every((p, i) => p.sessionId === next[i].sessionId && p.lookKey === next[i].lookKey)
        return same ? prev : next.map((r) => ({ sessionId: r.sessionId, look: r.look, lookKey: r.lookKey }))
      })
    }
    pick()
    const id = setInterval(pick, PICK_MS)
    return () => clearInterval(id)
  }, [camera])

  return shown.map((s) => (
    <Suspense key={`${s.sessionId}:${s.lookKey}`} fallback={null}>
      <RemoteAvatar sessionId={s.sessionId} look={s.look} />
    </Suspense>
  ))
}

export default RemoteAvatars
