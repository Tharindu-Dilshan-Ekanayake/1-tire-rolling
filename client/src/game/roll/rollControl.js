import { ROLL_LAUNCH, ZONES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { ROLL_RETURN } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame } from '../../store/game'
import { fadeThrough } from '../../ui/fade'
import { burst } from '../fx/fxQueue'
import { runtime } from '../runtime'
import { createRideState, meterAtZ, rideState } from './path'

/** How long the "+N Wins" result shows over your stopped tire before you're back. */
const RESULT_HOLD_MS = 2000
/** The skid sound starts this long before a normal stop. */
const SKID_SOUND_LEAD = 0.9

/**
 * The roll currently playing, read every frame by the camera, the track, the walls and
 * the effects. Everything about it is known when it starts (the authority already
 * resolved the distance, the walls and the Wins), so the client just plays it back: no
 * per-frame network traffic.
 *
 * It's a ride state (see path.rideState: phase, launch, meter, air, spin, lean,
 * topple, position...) plus the roll's numbers. Your logical position stays on the
 * ROLL ZONE while the tire rolls (that's what the server checks); only the tire and the
 * camera go down the track.
 */
export const roll = {
  ...createRideState(),
  active: false,
  /** True once the tire has stopped and the result is showing. */
  stopped: false,
  startedAt: 0,
  distance: 0,
  duration: 1,
  wins: 0,
  prize: 0,
  discovered: [],
  /** Zone index of the wall that stopped it, or -1. */
  blocked: -1,
  /** How many walls it smashes on the way. */
  broken: 0,
  best: false,
  tireId: 'bicycle',
  /** Where the roll started: metre along the track and how far to the side. */
  fromMeter: 0,
  startX: 0,
  /** performance.now() of the last landing, take-off and wall hit, for dust, shake and sound. */
  landedAt: 0,
  tookOffAt: 0,
  hitAt: 0,
  frameKey: -1,
}

let timers = []

function clearTimers() {
  for (const id of timers) clearTimeout(id)
  timers = []
}

/**
 * Moves the roll on to this frame. Idempotent per frame (keyed on the renderer's
 * clock), so the camera, walls and effects all see exactly the same state however many
 * of them ask.
 */
export function advanceRoll(clockTime) {
  if (!roll.active || roll.frameKey === clockTime) return roll
  roll.frameKey = clockTime
  const now = performance.now()
  const wasAirborne = roll.airborne
  const wasCrashed = roll.crashed
  rideState((now - roll.startedAt) / 1000, roll, 0, roll)
  if (!wasAirborne && roll.airborne) {
    roll.tookOffAt = now
    sfx.jumpWhoosh()
  } else if (wasAirborne && !roll.airborne) {
    roll.landedAt = now
    sfx.tireLand()
  }
  if (!wasCrashed && roll.crashed) {
    roll.hitAt = now
    sfx.wallBlock()
  }
  return roll
}

/** Starts a roll the authority already resolved: the tire pops out, then off it goes. */
export function beginRoll(result) {
  clearTimers()
  const game = getGame()
  const p = runtime.player.position
  Object.assign(roll, {
    active: true,
    stopped: false,
    startedAt: performance.now(),
    distance: result.distance,
    duration: result.duration,
    wins: result.wins,
    prize: result.prize || 0,
    discovered: result.discovered || [],
    blocked: result.blocked ?? -1,
    broken: result.broken || 0,
    best: result.best,
    tireId: result.tireId || game.profile.equippedTire,
    fromMeter: meterAtZ(p.z),
    startX: p.x,
    landedAt: 0,
    tookOffAt: 0,
    hitAt: 0,
    frameKey: -1,
  })
  rideState(0, roll, 0, roll)
  runtime.player.frozen = true
  runtime.camera.mode = 'roll'
  game.startRoll({
    distance: result.distance,
    wins: result.wins,
    prize: result.prize || 0,
    blocked: result.blocked ?? -1,
    duration: result.duration,
    best: result.best,
  })

  timers.push(setTimeout(() => sfx.rollStart(), ROLL_LAUNCH * 1000))
  if (!(result.blocked > 0)) {
    timers.push(setTimeout(() => sfx.rollStop(), Math.max(0, result.duration - SKID_SOUND_LEAD) * 1000))
  }
  timers.push(
    setTimeout(() => {
      roll.stopped = true
      sfx.wins()
      const f = roll.position
      burst({ x: f.x, y: f.y + 1.8, z: f.z, count: 50, palette: 'gold', speed: 9 })
      game.endRoll()
      // A zone reached for the first time ever: its name and the prize, once.
      for (const zi of roll.discovered) {
        game.showToast(`NEW ZONE: ${ZONES[zi].name}! +${formatNumber(ZONES[zi].discover)} Wins`)
      }
      timers.push(setTimeout(() => fadeThrough(finishRoll), RESULT_HOLD_MS))
    }, result.duration * 1000),
  )
}

/**
 * Back at the start, just short of the roll zone, camera behind you. With Auto Roll on
 * you stay on the zone instead, so the next roll goes straight away.
 */
export function finishRoll() {
  clearTimers()
  roll.active = false
  roll.stopped = false
  runtime.flightFocus = null
  const player = runtime.player
  const { passes, settings } = getGame().profile
  if (!(passes.autoRoll && settings.autoRoll)) player.position.set(ROLL_RETURN.x, 0, ROLL_RETURN.z)
  player.yaw = Math.PI
  player.frozen = false
  runtime.camera.mode = 'follow'
  runtime.camera.yaw = 0
  runtime.camera.snap = true
  getGame().clearRollResult()
}
