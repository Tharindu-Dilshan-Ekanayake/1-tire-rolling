import { Euler, Quaternion, Vector3 } from 'three'

import { ROLL_LAUNCH, WALL_STOP, ZONES } from '@shared/balance'
import { SLOPE_ANGLE, TRACK_START_Z } from '@shared/world'

/**
 * Geometry of the track: one long, straight canyon running north from the plaza's
 * edge, dropping downhill at SLOPE_ANGLE.
 *
 * Track metre `m` is measured along the track from the start line (the plaza's north
 * edge). Before the start (m < 0) the ground is the plaza. Everything here is pure
 * maths and allocation-free, so the frame loop can call it freely.
 */

export const SIN = Math.sin(SLOPE_ANGLE)
export const COS = Math.cos(SLOPE_ANGLE)
export const TAN = Math.tan(SLOPE_ANGLE)

/** World z of track metre m. */
export const zAt = (m) => TRACK_START_Z - (m > 0 ? m * COS : m)
/** Height of the floor at track metre m. */
export const floorY = (m) => (m > 0 ? -m * SIN : 0)
/** Height of the track's floor plane under world z. */
export const slopeY = (z) => (z < TRACK_START_Z ? -(TRACK_START_Z - z) * TAN : 0)
/** Height of a surface parallel to the floor, `h` metres off it, under world z. */
export const surfaceY = (z, h) => slopeY(z) + h / COS

/** How a box lies on the track: tipped back by the slope angle. */
export const SLOPE_EULER_X = -SLOPE_ANGLE

/** World point at track metre m, `x` to the side and `h` off the floor. */
export function trackPoint(m, x, h, out) {
  if (m <= 0) return out.set(x, h, TRACK_START_Z - m)
  return out.set(x, -m * SIN + h * COS, TRACK_START_Z - m * COS - h * SIN)
}

const _e = new Euler()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()

/**
 * Matrix of a box lying on the track, given in track terms: centred `x` across, `h`
 * off the floor (to its centre) and at metre `m` (also its centre), sized `sx` across,
 * `sy` thick and `sz` along the track, leaning `lean` radians about its own long axis.
 */
export function slopeBoxMatrix(m, x, h, sx, sy, sz, lean, out) {
  trackPoint(m, x, h, _p)
  _q.setFromEuler(_e.set(m > 0 ? SLOPE_EULER_X : 0, 0, lean))
  return out.compose(_p, _q, _s.set(sx, sy, sz))
}

/** Same as slopeBoxMatrix, but as BlockSet.add arguments: [x, y, z, rotX]. */
export function slopeBoxPlacement(m, x, h) {
  trackPoint(m, x, h, _p)
  return [_p.x, _p.y, _p.z, m > 0 ? SLOPE_EULER_X : 0]
}

/** Metres a world z is along the track (negative in the plaza). */
export const meterAtZ = (z) => (z < TRACK_START_Z ? (TRACK_START_Z - z) / COS : TRACK_START_Z - z)

// --- The roll ----------------------------------------------------------------------

/** The tire weaves gently from side to side down the canyon. */
export const weaveX = (m) => Math.sin(m * 0.011) * 4 + Math.sin(m * 0.0037 + 1.3) * 2.5

/** How thick the wooden walls between zones are (track.js builds them). */
export const WALL_THICK = 1.2

/** Radius of a rolling tire in the world: a big tire, more than twice as tall as a player. */
export const TIRE_SIZE = 2

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Seconds it takes to pick up speed after the push. */
const PICK_UP = 0.9

/**
 * Where along the track a tire is, `elapsed` seconds after setting off on a roll of
 * `duration` seconds from metre `from` to `to`: picking up speed, a long glide, and a
 * slow stop exactly there. `crash` keeps its speed to the end instead: it hits a wall.
 */
export function rideMeter(elapsed, from, to, duration, crash = false) {
  const t = Math.min(1, Math.max(0, elapsed / duration))
  const glide = crash ? 1 - Math.pow(1 - t, 1.15) * (1 - 0.15 * t) : 1 - Math.pow(1 - t, 1.7)
  const e = Math.max(0, elapsed) / PICK_UP
  const pickUp = 1 - Math.exp(-e * e)
  return from + (to - from) * (t >= 1 ? 1 : glide * pickUp)
}

// --- Ramps -------------------------------------------------------------------------

/** Kickers across the canyon floor: one in the middle of every stage. */
export const RAMP_FIRST = 150
export const RAMP_SPACING = 300
/** Each ramp rises RAMP_HEIGHT over its last RAMP_LENGTH metres up to its lip. */
export const RAMP_LENGTH = 7
export const RAMP_HEIGHT = 1
/**
 * Off the lip a tire flies for about AIR_TIME seconds whatever its speed (so a jump
 * always reads, even at hundreds of m/s), higher the faster it hits it.
 */
const AIR_TIME = 0.6
const MIN_JUMP = 10
const MAX_JUMP = 160
const FULL_POP = 40

/** No ramp this close to a zone's wall: a tire must meet a wall on the ground. */
const WALL_CLEAR = 50
const WALL_METERS = ZONES.slice(1).map((z) => z.start)
const nearWall = (lip) => WALL_METERS.some((w) => Math.abs(lip - w) < WALL_CLEAR)

/** The lip of the ramp whose run-up or jump `m` is in, or null. */
function rampLip(m) {
  if (m < RAMP_FIRST - RAMP_LENGTH) return null
  const lip = RAMP_FIRST + Math.floor((m - RAMP_FIRST + RAMP_LENGTH) / RAMP_SPACING) * RAMP_SPACING
  return nearWall(lip) ? null : lip
}

/** Every ramp lip in metres [m0, m1), for building them into the canyon. */
export function rampLips(m0, m1, out = []) {
  out.length = 0
  const first = Math.max(RAMP_FIRST, RAMP_FIRST + Math.ceil((m0 - RAMP_FIRST) / RAMP_SPACING) * RAMP_SPACING)
  for (let m = first; m < m1; m += RAMP_SPACING) if (!nearWall(m)) out.push(m)
  return out
}

/**
 * Height off the floor at metre `m` from ramps: up the ramp's face, then an arc off the
 * lip. `lipSpeed` is how fast the tire left it (m/s). 0 elsewhere.
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

/** Seconds into the glide at which a roll reaches metre `m` (bisection, searching up to `t`). */
function timeAtMeter(m, t, from, to, duration, crash) {
  let lo = 0
  let hi = t
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2
    if (rideMeter(mid, from, to, duration, crash) < m) lo = mid
    else hi = mid
  }
  return hi
}

// --- A whole roll --------------------------------------------------------------------

/** The tire pops out this far ahead of you and sets off from there. */
export const PUSH_AHEAD = 3.6
/** A tire that hits a wall it can't break stops dead and shatters this long before the roll's end. */
const BOUNCE_TIME = 0.5
/** Once stopped, the tire wobbles and falls over onto its side. */
const TOPPLE_TIME = 0.7

/** A fresh state for rideState to write into. */
export const createRideState = () => ({
  phase: 'launch',
  launch: 0,
  meter: 0,
  speed: 0,
  air: 0,
  airborne: false,
  /** Turn about the axle (radians): the rolling itself. */
  spin: 0,
  /** Lean about the direction of travel: into the weave's turns, and falling over. */
  lean: 0,
  /** 0-1: falling over onto its side once stopped. */
  topple: 0,
  /** True once the tire has hit a wall it can't break. */
  crashed: false,
  x: 0,
  position: new Vector3(),
})

/** Which way a tire falls over, from the roll itself so every client agrees. */
export const toppleSide = (distance) => (Math.floor(distance) % 2 === 0 ? 1 : -1)

/**
 * Everything about a rolling tire `elapsed` seconds into a roll - yours, or another
 * player's replayed from the same numbers, so both move identically. `ride` is
 * `{ fromMeter, startX, distance, duration, blocked }` (duration includes the launch;
 * blocked > 0 means a wall stopped it, and the tire shatters on it: `crashed`); `lane` is a sideways offset so tires don't
 * overlap. Writes into `out` (see createRideState):
 *   phase    'launch' (popping out, being pushed) | 'ride' | 'stopped'
 *   launch   0-1 through the launch
 *   meter    metres along the track; speed in m/s along it
 *   air      height off the floor (ramps); airborne once off a lip
 *   position the tire's centre
 */
export function rideState(elapsed, ride, lane, out) {
  const start = ride.fromMeter + PUSH_AHEAD
  const crash = ride.blocked > 0
  const rideTime = ride.duration - ROLL_LAUNCH
  // A crash reaches the wall's face a bounce early, then bounces back to `distance`.
  const glideTime = crash ? rideTime - BOUNCE_TIME : rideTime
  const impact = crash ? ride.distance + WALL_STOP - WALL_THICK / 2 - TIRE_SIZE : ride.distance
  let meter = start
  let speed = 0
  let air = 0
  let lean = 0
  out.airborne = false
  out.crashed = false
  out.topple = 0
  if (elapsed < ROLL_LAUNCH) {
    out.phase = 'launch'
    out.launch = clamp01(elapsed / ROLL_LAUNCH)
  } else {
    const t = elapsed - ROLL_LAUNCH
    out.launch = 1
    out.phase = t >= rideTime ? 'stopped' : 'ride'
    if (t < glideTime) {
      meter = rideMeter(t, start, impact, glideTime, crash)
      speed = (rideMeter(t + 0.05, start, impact, glideTime, crash) - meter) / 0.05
      // Over a ramp: how far and high it flies depends on how fast it left the lip.
      const lip = rampLip(meter)
      let lipSpeed = speed
      if (lip !== null && meter > lip) {
        const tl = timeAtMeter(lip, t, start, impact, glideTime, crash)
        lipSpeed = (rideMeter(tl + 0.05, start, impact, glideTime, crash) - rideMeter(tl, start, impact, glideTime, crash)) / 0.05
      }
      air = rampHeight(meter, lip, lipSpeed)
      out.airborne = lip !== null && meter > lip && air > 0.05
      // Lean into the weave's turns.
      const turn = weaveX(meter + 1) - weaveX(meter)
      lean = Math.max(-0.25, Math.min(0.25, turn * 4))
    } else {
      // Slammed into a wall too strong for it: stopped dead against it, in pieces
      // (Walls.jsx throws them).
      meter = impact
      out.crashed = true
    }
    if (out.phase === 'stopped' && crash) {
      out.crashed = true
    } else if (out.phase === 'stopped') {
      // Wobbling, then flat on its side.
      const k = clamp01((t - rideTime) / TOPPLE_TIME)
      out.topple = k * k
      const wobble = Math.sin(k * 14) * 0.12 * (1 - k)
      lean = toppleSide(ride.distance) * (Math.PI / 2) * out.topple + wobble
    } else if (!crash) {
      // Slowing to a stop: the last second wobbles as it loses speed.
      const slow = smooth(rideTime - 1, rideTime, t)
      lean += Math.sin(t * 9) * 0.1 * slow
    }
  }
  // Ease from where it set off onto the weaving line.
  const settle = clamp01((meter - start) / 40)
  const x = ride.startX * (1 - settle) + (weaveX(meter) + lane) * settle
  out.meter = meter
  out.speed = speed
  out.air = air
  out.lean = lean
  out.spin = -(meter - start) / TIRE_SIZE
  out.x = x
  // Lying down, its centre sinks to half its width off the floor.
  const height = TIRE_SIZE + (TIRE_SIZE * 0.32 - TIRE_SIZE) * out.topple
  trackPoint(meter, x, height + air, out.position)
  return out
}

const _ax = new Vector3(1, 0, 0)
const _az = new Vector3(0, 0, 1)
const _qa = new Quaternion()
const _qb = new Quaternion()

/** The tire's turn for ride state `st`: leaning about the track, spinning about its axle. */
export function rideTurn(st, out) {
  // Lean about the direction of travel (Z), then the roll about the axle (X).
  return out.multiplyQuaternions(_qa.setFromAxisAngle(_az, st.lean), _qb.setFromAxisAngle(_ax, st.spin))
}
