import { Euler, Quaternion, Vector3 } from 'three'

import { SLIDE_LAUNCH } from '@shared/balance'
import { SLIDE_START_Z, SLOPE_ANGLE } from '@shared/world'

/**
 * Geometry of the slide: one long, straight slope dropping north from the plaza's edge.
 *
 * Track metre `m` is measured along the slope from the start line (the plaza's north
 * edge). Before the start (m < 0) the ground is the flat plaza. Everything here is pure
 * maths and allocation-free, so the frame loop can call it freely.
 */

export const SIN = Math.sin(SLOPE_ANGLE)
export const COS = Math.cos(SLOPE_ANGLE)
export const TAN = Math.tan(SLOPE_ANGLE)

/** World z of track metre m. */
export const zAt = (m) => SLIDE_START_Z - (m > 0 ? m * COS : m)
/** Height of the floor at track metre m. */
export const floorY = (m) => (m > 0 ? -m * SIN : 0)
/** Height of the slope's floor plane under world z. */
export const slopeY = (z) => (z < SLIDE_START_Z ? -(SLIDE_START_Z - z) * TAN : 0)
/** Height of a surface parallel to the floor, `h` metres off it, under world z. */
export const surfaceY = (z, h) => slopeY(z) + h / COS

/** How a box lies on the slope: tipped back by the slope angle. */
export const SLOPE_EULER_X = -SLOPE_ANGLE

/**
 * World point at track metre m, `x` to the side and `h` off the floor (along the
 * slope's normal, so a rider stays flat on it).
 */
export function trackPoint(m, x, h, out) {
  if (m <= 0) return out.set(x, h, SLIDE_START_Z - m)
  return out.set(x, -m * SIN + h * COS, SLIDE_START_Z - m * COS - h * SIN)
}

const _e = new Euler()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()

/**
 * Matrix of a box lying on the slope, given in track terms: centred `x` across, `h` off
 * the floor (to its centre) and at metre `m` (also its centre), sized `sx` across, `sy`
 * thick and `sz` along the slope, leaning `lean` radians about its own long axis.
 */
export function slopeBoxMatrix(m, x, h, sx, sy, sz, lean, out) {
  trackPoint(m, x, h, _p)
  _q.setFromEuler(_e.set(m > 0 ? SLOPE_EULER_X : 0, 0, lean))
  return out.compose(_p, _q, _s.set(sx, sy, sz))
}

/** Same as slopeBoxMatrix, but as BlockSet.add arguments: [x, y, z, rotX, rotZ]. */
export function slopeBoxPlacement(m, x, h) {
  trackPoint(m, x, h, _p)
  return [_p.x, _p.y, _p.z, m > 0 ? SLOPE_EULER_X : 0]
}

// --- The ride ----------------------------------------------------------------------

/** The rider weaves gently from side to side down the canyon. */
export const weaveX = (m) => Math.sin(m * 0.011) * 4 + Math.sin(m * 0.0037 + 1.3) * 2.5

/** The board's underside rides this far off the floor. */
export const RIDE_HEIGHT = 0.03

const _x = new Vector3(1, 0, 0)
const _y = new Vector3(0, 1, 0)
/**
 * A rider's body, relative to their board: turned to face down the hill, laid face down
 * along the slope, feet at the board's tail and belly on its deck.
 */
export const RIDE_QUAT = new Quaternion()
  .setFromAxisAngle(_y, Math.PI)
  .multiply(new Quaternion().setFromAxisAngle(_x, Math.PI / 2 + SLOPE_ANGLE))
export const RIDE_FEET = new Vector3(0, 0.85 * SIN + 0.34 * COS, 0.85 * COS - 0.34 * SIN)
/** The board lies on the slope, nose down the hill. */
export const BOARD_QUAT = new Quaternion().setFromAxisAngle(_x, -SLOPE_ANGLE)

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Seconds it takes to pick up speed after pushing off. */
const PICK_UP = 0.9

/**
 * Where along the slide a rider is, `elapsed` seconds after pushing off on a ride of
 * `duration` seconds from metre `from` to `distance`: picking up speed down the slope,
 * a long glide, and a slow stop exactly at the distance. Returns the metre.
 */
export function rideMeter(elapsed, from, distance, duration) {
  const t = Math.min(1, Math.max(0, elapsed / duration))
  const glide = 1 - Math.pow(1 - t, 1.7)
  const e = Math.max(0, elapsed) / PICK_UP
  const pickUp = 1 - Math.exp(-e * e)
  return from + (distance - from) * (t >= 1 ? 1 : glide * pickUp)
}

// --- Ramps -------------------------------------------------------------------------

/** Kickers across the canyon floor: the first lip at 160 m, then every 240 m. */
export const RAMP_FIRST = 160
export const RAMP_SPACING = 240
/** Each ramp rises RAMP_HEIGHT over its last RAMP_LENGTH metres up to its lip. */
export const RAMP_LENGTH = 7
export const RAMP_HEIGHT = 1
/**
 * Off the lip you fly for about AIR_TIME seconds whatever your speed (so a jump always
 * reads, even at hundreds of m/s), higher the faster you hit it; slow riders just hop.
 */
const AIR_TIME = 0.6
const MIN_JUMP = 10
const MAX_JUMP = 160
const FULL_POP = 40

/** The lip of the ramp whose run-up or jump `m` is in, or null. */
function rampLip(m) {
  if (m < RAMP_FIRST - RAMP_LENGTH) return null
  return RAMP_FIRST + Math.floor((m - RAMP_FIRST + RAMP_LENGTH) / RAMP_SPACING) * RAMP_SPACING
}

/** Every ramp lip in metres [m0, m1), for building them into the canyon. */
export function rampLips(m0, m1, out = []) {
  out.length = 0
  const first = Math.max(RAMP_FIRST, RAMP_FIRST + Math.ceil((m0 - RAMP_FIRST) / RAMP_SPACING) * RAMP_SPACING)
  for (let m = first; m < m1; m += RAMP_SPACING) out.push(m)
  return out
}

/**
 * Height of a rider off the floor at metre `m` from ramps: up the ramp's face, then an
 * arc off the lip. `lipSpeed` is how fast they left it (m/s): it sets how far and high
 * they fly. 0 elsewhere.
 */
function rampHeight(m, lip, lipSpeed) {
  if (lip === null) return 0
  if (m < lip) return m >= lip - RAMP_LENGTH ? (RAMP_HEIGHT * (m - lip + RAMP_LENGTH)) / RAMP_LENGTH : 0
  const length = Math.min(MAX_JUMP, Math.max(MIN_JUMP, lipSpeed * AIR_TIME))
  const u = (m - lip) / length
  if (u >= 1) return 0
  const height = Math.min(3.6, Math.max(1.3, length * 0.04)) * Math.min(1, lipSpeed / FULL_POP)
  return RAMP_HEIGHT * (1 - u) + height * 4 * u * (1 - u)
}

/**
 * Seconds after pushing off at which a ride reaches metre `m` (bisection on rideMeter,
 * which only ever goes forwards), searching up to `t`.
 */
function timeAtMeter(m, t, from, distance, duration) {
  let lo = 0
  let hi = t
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2
    if (rideMeter(mid, from, distance, duration) < m) lo = mid
    else hi = mid
  }
  return hi
}

// --- A whole ride --------------------------------------------------------------------

/** Metres the dive onto the board covers: the board pops out this far ahead of you. */
export const LEAP = 2.6
/** The last second of a ride is a skid; once stopped you take this long to get up. */
const SKID_TIME = 1
const STAND_TIME = 0.45

/** A fresh state for rideState to write into. */
export const createRideState = () => ({
  phase: 'launch',
  launch: 0,
  stand: 0,
  meter: 0,
  speed: 0,
  air: 0,
  airborne: false,
  roll: 0,
  skid: 0,
  x: 0,
  position: new Vector3(),
})

/**
 * Everything about a rider `elapsed` seconds into a slide - yours, or another player's
 * replayed from the same numbers, so both move identically. `ride` is
 * `{ fromMeter, startX, distance, duration }` (duration includes the launch); `lane` is
 * a sideways offset so riders don't overlap. Writes into `out` (see createRideState):
 *   phase    'launch' (diving onto the board) | 'ride' | 'stopped'
 *   launch   0-1 through the launch; stand 0-1 getting up once stopped
 *   meter    metres down the slope; speed in m/s along it
 *   air      height off the floor (ramps and jumps); airborne once off a lip
 *   roll     lean into the turns; skid: the sideways skid at the end (radians)
 *   position where the board's underside is
 */
export function rideState(elapsed, ride, lane, out) {
  const start = ride.fromMeter + LEAP
  const rideTime = ride.duration - SLIDE_LAUNCH
  let meter = start
  let speed = 0
  let air = 0
  let roll = 0
  let skid = 0
  out.airborne = false
  if (elapsed < SLIDE_LAUNCH) {
    out.phase = 'launch'
    out.launch = clamp01(elapsed / SLIDE_LAUNCH)
    out.stand = 0
  } else {
    const t = elapsed - SLIDE_LAUNCH
    meter = rideMeter(t, start, ride.distance, rideTime)
    speed = (rideMeter(t + 0.05, start, ride.distance, rideTime) - meter) / 0.05
    out.phase = t >= rideTime ? 'stopped' : 'ride'
    out.launch = 1
    out.stand = clamp01((t - rideTime) / STAND_TIME)
    // Lean into the weave's turns, then skid sideways to a stop, leaning into the skid.
    const skidT = smooth(rideTime - SKID_TIME, rideTime, t)
    const side = standSide(ride.distance)
    skid = side * 1.3 * skidT
    const turn = weaveX(meter + 1) - weaveX(meter)
    roll = Math.max(-0.28, Math.min(0.28, turn * 5)) * (1 - skidT) - side * 0.2 * skidT
    // Over a ramp: how far and high you fly depends on how fast you left its lip.
    const lip = rampLip(meter)
    let lipSpeed = speed
    if (lip !== null && meter > lip) {
      const tl = timeAtMeter(lip, t, start, ride.distance, rideTime)
      lipSpeed = (rideMeter(tl + 0.05, start, ride.distance, rideTime) - rideMeter(tl, start, ride.distance, rideTime)) / 0.05
    }
    air = rampHeight(meter, lip, lipSpeed)
    out.airborne = lip !== null && meter > lip && air > 0.05
  }
  // Ease from where you started onto the weaving line.
  const settle = clamp01((meter - start) / 40)
  const x = ride.startX * (1 - settle) + (weaveX(meter) + lane) * settle
  out.meter = meter
  out.speed = speed
  out.air = air
  out.roll = roll
  out.skid = skid
  out.x = x
  trackPoint(meter, x, RIDE_HEIGHT + air, out.position)
  return out
}

// --- The rider's body ------------------------------------------------------------

/** Axes a rider turns about: skidding about the slope's normal, leaning about the track. */
const SLOPE_NORMAL = new Vector3(0, COS, -SIN)
const DOWN_TRACK = new Vector3(0, -SIN, -COS)
/** Upright, facing down the hill; and facing back up it, towards the chase camera. */
export const FACE_DOWNHILL = new Quaternion().setFromAxisAngle(_y, Math.PI)
const FACE_UPHILL = new Quaternion()
/** At the launch the rider stands LEAP behind the board the dive lands them on. */
const STAND_BEHIND = new Vector3(0, -RIDE_HEIGHT, LEAP)
/** Where they get up to cheer, beside the board (world offset; the side is per slide). */
const STAND_BESIDE = new Vector3(1.15, -RIDE_HEIGHT, 0.2)
const _qa = new Quaternion()
const _qb = new Quaternion()
const _qInv = new Quaternion()
const _qStand = new Quaternion()

/** Which side of their board a rider gets up on, from the slide itself so every client agrees. */
export const standSide = (distance) => (Math.floor(distance) % 2 === 0 ? 1 : -1)

/** The board's own turn for ride state `st`: skidding about the slope's normal, leaning into turns. */
export function rideTurn(st, out) {
  return out.multiplyQuaternions(_qa.setFromAxisAngle(SLOPE_NORMAL, st.skid), _qb.setFromAxisAngle(DOWN_TRACK, st.roll))
}

/**
 * Where a rider's body is relative to their board, in the board's turned frame (`turn`,
 * from rideTurn): feet position and orientation of an upright character. Standing
 * behind the board and diving onto it during the launch (turning from facing `from`),
 * lying on it face down, and getting up beside it on `side` to cheer at the end. Every
 * rider - yours, other players' avatars and their stand-ins - is placed with this.
 */
export function riderBody(st, turn, from, side, outPos, outQuat) {
  if (st.phase === 'launch') {
    // Turn to face down the hill while crouching, then dive in an arc onto the board.
    const t = st.launch
    const dive = smooth(0.4, 0.92, t)
    _qa.slerpQuaternions(from, FACE_DOWNHILL, smooth(0, 0.3, t))
    outQuat.slerpQuaternions(_qa, RIDE_QUAT, dive)
    outPos.lerpVectors(STAND_BEHIND, RIDE_FEET, dive)
    outPos.y += Math.sin(dive * Math.PI) * 1.25
  } else if (st.stand > 0) {
    // Stopped: hop up beside the board, turned round to face the camera.
    const k = smooth(0, 1, st.stand)
    _qInv.copy(turn).invert()
    _qStand.copy(_qInv).multiply(FACE_UPHILL)
    outQuat.slerpQuaternions(RIDE_QUAT, _qStand, k)
    outPos.copy(STAND_BESIDE)
    outPos.x *= -side
    outPos.applyQuaternion(_qInv)
    outPos.lerpVectors(RIDE_FEET, outPos, k)
    outPos.y += Math.sin(k * Math.PI) * 0.7
  } else {
    outQuat.copy(RIDE_QUAT)
    outPos.copy(RIDE_FEET)
  }
}

/** Metres a world z is down the slope (negative in the plaza). */
export const meterAtZ = (z) => (z < SLIDE_START_Z ? (SLIDE_START_Z - z) / COS : SLIDE_START_Z - z)
