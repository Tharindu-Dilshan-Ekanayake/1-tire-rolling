import { SLIDE_LAUNCH } from '@shared/balance'
import { SLIDE_RETURN } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame } from '../../store/game'
import { fadeThrough } from '../../ui/fade'
import { burst } from '../fx/fxQueue'
import { runtime } from '../runtime'
import { createRideState, meterAtZ, rideState } from './path'

/** How long you stand and cheer with the "+N Wins" result before heading back up. */
const RESULT_HOLD_MS = 2000
/** The skid at the end starts this long before you stop (see path.js). */
const SKID_SOUND_LEAD = 0.9

/**
 * The slide currently being ridden, read every frame by the player, the camera, the
 * track and its effects. Everything about it is known when it starts (the authority
 * already resolved distance and Wins), so the client just plays it back: no per-frame
 * network traffic.
 *
 * It's a ride state (see path.rideState: phase, launch, meter, air, roll, skid,
 * position...) plus the slide's numbers. Your logical position stays on the SLIDE ZONE
 * while you ride (that's what the server checks); only what's drawn goes down the hill.
 */
export const slide = {
  ...createRideState(),
  active: false,
  /** True once you've stopped and the result is showing. */
  stopped: false,
  startedAt: 0,
  distance: 0,
  duration: 1,
  wins: 0,
  best: false,
  /** Where the ride started: metre along the slope and how far to the side. */
  fromMeter: 0,
  startX: 0,
  /** performance.now() of the last landing and take-off, for dust, shake and sound. */
  landedAt: 0,
  tookOffAt: 0,
  frameKey: -1,
}

let timers = []

function clearTimers() {
  for (const id of timers) clearTimeout(id)
  timers = []
}

/**
 * Moves the ride on to this frame. Idempotent per frame (keyed on the renderer's clock),
 * so the player, camera and effects all see exactly the same state however many of
 * them ask.
 */
export function advanceSlide(clockTime) {
  if (!slide.active || slide.frameKey === clockTime) return slide
  slide.frameKey = clockTime
  const now = performance.now()
  const wasAirborne = slide.airborne
  rideState((now - slide.startedAt) / 1000, slide, 0, slide)
  if (!wasAirborne && slide.airborne) {
    slide.tookOffAt = now
    sfx.jumpWhoosh()
  } else if (wasAirborne && !slide.airborne) {
    slide.landedAt = now
    sfx.boardLand()
  }
  return slide
}

/** Starts a slide the authority already resolved: the launch, then the ride. */
export function beginSlide(result) {
  clearTimers()
  const game = getGame()
  const p = runtime.player.position
  Object.assign(slide, {
    active: true,
    stopped: false,
    startedAt: performance.now(),
    distance: result.distance,
    duration: result.duration,
    wins: result.wins,
    best: result.best,
    fromMeter: meterAtZ(p.z),
    startX: p.x,
    landedAt: 0,
    tookOffAt: 0,
    frameKey: -1,
  })
  rideState(0, slide, 0, slide)
  runtime.player.frozen = true
  runtime.camera.mode = 'slide'
  game.startSlide({ distance: result.distance, wins: result.wins, duration: result.duration, best: result.best })

  timers.push(setTimeout(() => sfx.slideStart(), SLIDE_LAUNCH * 1000))
  timers.push(setTimeout(() => sfx.slideStop(), Math.max(0, result.duration - SKID_SOUND_LEAD) * 1000))
  timers.push(
    setTimeout(() => {
      slide.stopped = true
      sfx.wins()
      const f = slide.position
      burst({ x: f.x, y: f.y + 1.8, z: f.z, count: 50, palette: 'gold', speed: 9 })
      game.endSlide()
      timers.push(setTimeout(() => fadeThrough(finishSlide), RESULT_HOLD_MS))
    }, result.duration * 1000),
  )
}

/** Back to the top of the hill, just short of the slide zone, camera behind you. */
export function finishSlide() {
  clearTimers()
  slide.active = false
  slide.stopped = false
  runtime.flightFocus = null
  const player = runtime.player
  player.position.set(SLIDE_RETURN.x, 0, SLIDE_RETURN.z)
  player.yaw = Math.PI
  player.frozen = false
  runtime.camera.mode = 'follow'
  runtime.camera.yaw = 0
  runtime.camera.snap = true
  getGame().clearSlideResult()
}
