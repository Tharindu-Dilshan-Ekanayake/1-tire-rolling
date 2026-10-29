import { createMusic } from './music'

/**
 * Sound effects and the background music, synthesised with WebAudio: no audio files
 * to download.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is created on
 * the first tap/click/key (which also starts the music) and every sound before that is
 * silently skipped.
 */

const MUTE_KEY = 'pp.muted'

let ctx = null
let master = null
/** Input of the echo the chimes ring out into (see createEcho). */
let echo = null
let noiseBuffer = null
let music = null
let muted = readMuted()
const lastPlayed = new Map()
const muteListeners = new Set()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return
  }
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.5
  master.connect(ctx.destination)
  echo = createEcho()
  // One second of white noise, reused by every whoosh and crack.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  music = createMusic(ctx, master, noiseBuffer)
  music.start()
}

/**
 * A short, darkening echo for the chimes to ring out into, so they sparkle instead of
 * clicking off. Built once; every sound sent to it shares it.
 */
function createEcho() {
  const input = ctx.createGain()
  input.gain.value = 0.25
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.13
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3200
  const feedback = ctx.createGain()
  feedback.gain.value = 0.32
  input.connect(delay)
  delay.connect(damp).connect(feedback).connect(delay)
  damp.connect(master)
  return input
}

/** Installs the first-gesture unlock. Call once at startup. */
export function installAudioUnlock() {
  const events = ['pointerdown', 'keydown', 'touchend']
  const handler = () => {
    unlock()
    for (const e of events) window.removeEventListener(e, handler, true)
  }
  for (const e of events) window.addEventListener(e, handler, true)
  // Mobile browsers suspend audio in the background; resume on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended') ctx.resume()
  })
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // Not persisted; fine.
  }
  if (master) master.gain.value = muted ? 0 : 0.5
  for (const listener of muteListeners) listener(muted)
}

/** Calls `listener(muted)` on every change; returns the unsubscribe. */
export function onMutedChange(listener) {
  muteListeners.add(listener)
  return () => muteListeners.delete(listener)
}

// --- The ride: the sound of the board going down the hill -----------------------------

let ride = null
let rideSetAt = 0

/**
 * One looping noise source through three bands: the rush of air (swelling with speed,
 * loudest in the air), the board rumbling over the ground (its bumps quickening with
 * speed, silent in the air) and the hiss of its edge carving (up as it skids). The
 * music ducks under it until `windStop`.
 */
function windStart() {
  if (!ctx || ride || ctx.state !== 'running') return
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const band = (type, frequency, q) => {
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    src.connect(filter).connect(gain).connect(master)
    return { filter, gain }
  }
  const air = band('bandpass', 400, 0.7)
  const rumble = band('lowpass', 220, 0.9)
  const carve = band('highpass', 3800, 0.7)
  // Bumps in the ground: the rumble's loudness wobbles, faster the faster you go.
  const bumps = ctx.createOscillator()
  bumps.frequency.value = 7
  const depth = ctx.createGain()
  depth.gain.value = 0
  bumps.connect(depth).connect(rumble.gain.gain)
  bumps.start()
  src.start()
  ride = { src, bumps, depth, air, rumble, carve }
  music?.duck(true)
}

/**
 * `level` 0..1 from your speed down the hill; `airborne` off a ramp; `skid` the board's
 * sideways skid (radians). Positional, not an object: it's called every frame.
 */
function windSet(level, airborne = false, skid = 0) {
  if (!ride) return
  // Ten updates a second is plenty for a smooth swell.
  const now = performance.now()
  if (now - rideSetAt < 100) return
  rideSetAt = now
  const t = ctx.currentTime
  const l = Math.min(1, Math.max(0, level))
  const ground = airborne ? 0 : 1
  ride.air.gain.gain.setTargetAtTime(0.03 + l * (airborne ? 0.26 : 0.17), t, 0.2)
  ride.air.filter.frequency.setTargetAtTime(320 + l * 2400 + (airborne ? 500 : 0), t, 0.25)
  const rumble = ground * (0.04 + l * 0.14)
  ride.rumble.gain.gain.setTargetAtTime(rumble, t, 0.08)
  ride.depth.gain.setTargetAtTime(rumble * 0.6, t, 0.08)
  ride.rumble.filter.frequency.setTargetAtTime(160 + l * 380, t, 0.2)
  ride.bumps.frequency.setTargetAtTime(6 + l * 16, t, 0.2)
  ride.carve.gain.gain.setTargetAtTime(ground * (0.008 + l * 0.03 + Math.min(1, Math.abs(skid)) * 0.06), t, 0.1)
}

function windStop() {
  if (!ride) return
  const { src, bumps, depth, air, rumble, carve } = ride
  ride = null
  const t = ctx.currentTime
  air.gain.gain.setTargetAtTime(0.0001, t, 0.3)
  rumble.gain.gain.setTargetAtTime(0.0001, t, 0.3)
  carve.gain.gain.setTargetAtTime(0.0001, t, 0.3)
  depth.gain.setTargetAtTime(0, t, 0.3)
  src.stop(t + 1.5)
  bumps.stop(t + 1.5)
  music?.duck(false)
}

function ready(name, minGapMs = 0) {
  if (!ctx || muted || ctx.state !== 'running') return false
  const now = performance.now()
  if (minGapMs && now - (lastPlayed.get(name) || 0) < minGapMs) return false
  lastPlayed.set(name, now)
  return true
}

/** A short enveloped oscillator note; `echo` also sends it into the echo. */
function tone(freq, { type = 'sine', at = 0, duration = 0.12, volume = 0.3, slideTo = null, attack = 0.01, echo: wet = false } = {}) {
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(gain).connect(master)
  if (wet) gain.connect(echo)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** A struck bell: the note, a quieter octave and a glassy strike, ringing into the echo. */
function bell(freq, { at = 0, volume = 0.1, decay = 0.4 } = {}) {
  tone(freq, { at, duration: decay, volume, echo: true })
  tone(freq * 2, { at, duration: decay * 0.6, volume: volume * 0.35, echo: true })
  tone(freq * 3.01, { type: 'triangle', at, duration: 0.05, volume: volume * 0.3 })
}

/** Trophy chimes climb and fall this scale while they keep coming (C major pentatonic). */
const TROPHY_SCALE = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637]
/** A trophy within this long of the last carries the run on; otherwise it starts again. */
const TROPHY_RUN_MS = 700
let trophyRun = 0
let trophyAt = 0

/** Filtered noise: whooshes and cracks. */
function noise({ at = 0, duration = 0.3, volume = 0.25, from = 400, to = 2400, q = 1.2 } = {}) {
  const t = ctx.currentTime + at
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + duration * 0.3)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(gain).connect(master)
  // Looped, so a long one from a random spot never runs off the end of the second.
  src.loop = true
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.02)
}

export const sfx = {
  click() {
    if (ready('click', 40)) tone(660, { type: 'triangle', duration: 0.05, volume: 0.15 })
  },
  /** A Slide gain: a bright tick, softer for the ones that trickle in down the hill. */
  gain(sliding = false) {
    if (ready('gain', 110)) tone(880 + Math.random() * 120, { type: 'triangle', duration: 0.07, volume: sliding ? 0.05 : 0.07, slideTo: 1400 })
  },
  levelUp() {
    if (!ready('levelUp')) return
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'square', at: i * 0.07, duration: 0.14, volume: 0.09 }))
  },
  /** Pushing off down the hill: a kick, a whoosh, a rising boing and a sparkle. */
  slideStart() {
    if (!ready('slideStart')) return
    tone(110, { duration: 0.18, volume: 0.16, slideTo: 55 })
    noise({ duration: 0.7, volume: 0.3, from: 250, to: 3000, q: 0.8 })
    tone(220, { type: 'triangle', duration: 0.32, volume: 0.09, slideTo: 660 })
    bell(1319, { at: 0.2, volume: 0.05, decay: 0.3 })
  },
  /** The board popping out in front of you when you press SLIDE: a springy bloop. */
  boardPop() {
    if (!ready('boardPop', 200)) return
    tone(420, { type: 'sine', duration: 0.16, volume: 0.14, slideTo: 980 })
    tone(1320, { type: 'triangle', at: 0.08, duration: 0.1, volume: 0.06 })
  },
  /** Flying off a ramp: a rising rush of air. */
  jumpWhoosh() {
    if (ready('jumpWhoosh', 250)) noise({ duration: 0.4, volume: 0.18, from: 500, to: 2600, q: 0.9 })
  },
  /** The board slapping back down after a jump: a thump and a crunch of snow. */
  boardLand() {
    if (!ready('boardLand', 250)) return
    tone(160, { type: 'sine', duration: 0.2, volume: 0.18, slideTo: 55 })
    noise({ duration: 0.24, volume: 0.13, from: 2400, to: 300, q: 0.6 })
  },
  /**
   * A trophy slid through: a bell that climbs the scale and back down while they keep
   * coming, so a run of them plays a little tune.
   */
  trophy() {
    if (!ready('trophy', 90)) return
    const now = performance.now()
    trophyRun = now - trophyAt < TROPHY_RUN_MS ? trophyRun + 1 : 0
    trophyAt = now
    const n = TROPHY_SCALE.length
    const k = trophyRun % (2 * n - 2)
    bell(TROPHY_SCALE[k < n ? k : 2 * n - 2 - k], { volume: 0.085, decay: 0.32 })
  },
  /** Wins paid out (a slide's total, a badge): a fanfare, a shimmering chord and a shower of coins. */
  wins() {
    if (!ready('wins')) return
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.07, duration: 0.2, volume: 0.1, echo: true }))
    // G major, held, each voice doubled a hair apart so it shimmers.
    for (const f of [784, 988, 1175]) {
      tone(f * 1.003, { at: 0.28, duration: 0.9, volume: 0.045, attack: 0.05, echo: true })
      tone(f * 0.997, { at: 0.28, duration: 0.9, volume: 0.045, attack: 0.05 })
    }
    for (let i = 0; i < 6; i += 1) bell(2093 + Math.random() * 1200, { at: 0.3 + i * 0.07 + Math.random() * 0.03, volume: 0.035, decay: 0.2 })
  },
  crack() {
    if (!ready('crack', 150)) return
    noise({ duration: 0.12, volume: 0.35, from: 1800, to: 600, q: 0.8 })
    tone(220, { type: 'square', duration: 0.08, volume: 0.08, slideTo: 90 })
  },
  reveal() {
    if (!ready('reveal')) return
    ;[392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.06, duration: 0.22, volume: 0.12 }))
  },
  buy() {
    if (!ready('buy')) return
    tone(1047, { type: 'square', duration: 0.07, volume: 0.08 })
    tone(1568, { type: 'square', at: 0.08, duration: 0.16, volume: 0.08 })
  },
  error() {
    if (ready('error', 200)) tone(160, { type: 'sawtooth', duration: 0.18, volume: 0.07, slideTo: 110 })
  },
  rebirth() {
    if (!ready('rebirth')) return
    noise({ duration: 0.8, volume: 0.15, from: 200, to: 4000, q: 0.6 })
    ;[262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, { type: 'sawtooth', at: 0.1 + i * 0.07, duration: 0.25, volume: 0.06 }))
  },
  /** Stepping onto an unlocked treadmill: a soft rising chime. */
  treadmillEnter() {
    if (!ready('treadmillEnter', 400)) return
    ;[523, 784, 1047].forEach((f, i) => tone(f, { type: 'sine', at: i * 0.05, duration: 0.28, volume: 0.07 }))
  },
  /** A jump: a springy little boing. */
  jump() {
    if (ready('jump', 120)) tone(260, { type: 'triangle', duration: 0.18, volume: 0.1, slideTo: 620 })
  },
  /** Landing from a jump: a soft thump. */
  jumpLand() {
    if (!ready('jumpLand', 150)) return
    tone(140, { type: 'sine', duration: 0.12, volume: 0.12, slideTo: 70 })
    noise({ duration: 0.08, volume: 0.06, from: 900, to: 300, q: 0.7 })
  },
  /**
   * The skid to a stop, timed to end as you do: snow spraying off the board's edge
   * (bright, then darker as it slows), the board grinding under it, then a bump and a
   * little bounce as you stop.
   */
  slideStop() {
    if (!ready('slideStop')) return
    noise({ duration: 0.85, volume: 0.2, from: 5200, to: 700, q: 0.5 })
    noise({ duration: 0.8, volume: 0.12, from: 380, to: 120, q: 0.9 })
    tone(130, { at: 0.82, duration: 0.22, volume: 0.16, slideTo: 60 })
    tone(220, { type: 'triangle', at: 0.96, duration: 0.1, volume: 0.05, slideTo: 330 })
  },
  windStart,
  windSet,
  windStop,
}
