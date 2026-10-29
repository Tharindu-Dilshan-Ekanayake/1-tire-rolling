/**
 * Background music, made live with WebAudio like the sound effects: a gentle, sunny
 * loop - soft pad chords, a round bass, a plucked arpeggio, a light shaker and a sparse
 * melody over C - G - Am - F - kept quiet under the game.
 *
 * Notes are scheduled a little ahead on the audio clock by a timer (the usual
 * look-ahead scheduler), never from the render loop.
 */

const BPM = 92
const EIGHTH = 60 / BPM / 2
const LOOKAHEAD_S = 0.35
const TICK_MS = 100

/** One chord per bar, as MIDI notes: bass root, then the pad's three voices. */
const BARS = [
  { root: 36, pad: [60, 64, 67] }, // C
  { root: 43, pad: [59, 62, 67] }, // G
  { root: 45, pad: [60, 64, 69] }, // Am
  { root: 41, pad: [60, 65, 69] }, // F
]
/** The arpeggio's order through the pad's voices (an octave up), per eighth. */
const ARP = [0, 1, 2, 1, 0, 2, 1, 2]
/** A 4-bar melody over the progression: [eighth within the 32, MIDI note, eighths long]. */
const MELODY = [
  [0, 76, 3],
  [3, 74, 1],
  [4, 72, 4],
  [10, 74, 2],
  [12, 79, 4],
  [18, 76, 2],
  [20, 72, 4],
  [26, 77, 2],
  [28, 76, 4],
]

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12)

export function createMusic(ctx, destination, noiseBuffer) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(destination)
  // A gentle low-pass over everything keeps it soft and out of the effects' way.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600
  tone.connect(out)

  let step = 0
  let nextAt = 0
  let timer = null
  const level = { base: 0.55, ducked: 1, volume: 1 }

  function note(midi, t, { type = 'sine', length = 0.3, volume = 0.05, attack = 0.01 } = {}) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq(midi)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(tone)
    osc.start(t)
    osc.stop(t + length + 0.05)
  }

  function shaker(t) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6000
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.012, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    src.connect(hp).connect(gain).connect(tone)
    src.start(t, Math.random() * 0.5)
    src.stop(t + 0.06)
  }

  /** Everything that sounds on eighth `step` (of a 4-bar, 32-eighth loop) at time t. */
  function play(t) {
    const inBar = step % 8
    const bar = BARS[Math.floor(step / 8) % BARS.length]
    if (inBar === 0) {
      for (const n of bar.pad) note(n, t, { type: 'triangle', length: EIGHTH * 8, volume: 0.022, attack: 0.35 })
    }
    if (inBar === 0 || inBar === 4) note(bar.root, t, { length: EIGHTH * 3, volume: 0.09 })
    if (inBar % 2 === 1 || inBar === 6) note(bar.pad[ARP[inBar]] + 12, t, { length: 0.22, volume: 0.022 })
    if (inBar % 2 === 1) shaker(t)
    for (const [at, midi, length] of MELODY) {
      if (at === step % 32) note(midi, t, { type: 'triangle', length: EIGHTH * length * 0.95, volume: 0.03, attack: 0.03 })
    }
  }

  function schedule() {
    // After the page was hidden (the context suspended), pick up from now.
    nextAt = Math.max(nextAt, ctx.currentTime + 0.05)
    while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
      play(nextAt)
      nextAt += EIGHTH
      step = (step + 1) % 32
    }
  }

  const applyLevel = (seconds) =>
    out.gain.setTargetAtTime(level.base * level.ducked * level.volume, ctx.currentTime, seconds)

  return {
    start() {
      if (timer) return
      nextAt = ctx.currentTime + 0.1
      timer = setInterval(schedule, TICK_MS)
      schedule()
      // Fade in.
      applyLevel(1.2)
    },
    /** Quieter while something else should be heard (the wind of a rolling tire). */
    duck(on) {
      level.ducked = on ? 0.45 : 1
      applyLevel(0.4)
    },
    /** The player's music volume, 0..1 (Boxity's music_volume setting). */
    setVolume(volume) {
      level.volume = Math.min(1, Math.max(0, Number(volume) || 0))
      // Before start() the fade-in will pick it up.
      if (timer) applyLevel(0.15)
    },
  }
}
