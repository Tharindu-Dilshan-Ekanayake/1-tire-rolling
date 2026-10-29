import { create } from 'zustand'

/**
 * Graphics quality presets. Every visual feature reads its settings from here rather
 * than deciding for itself, so dropping a preset reliably sheds load everywhere.
 *
 * LOW is the mobile / weak-PC baseline: no realtime shadows, no particles, no
 * post-processing, short view distance and textures capped at 512px.
 */
export const QUALITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH']

export const PRESETS = {
  LOW: {
    dpr: 1,
    antialias: false,
    /** 'blob' = fake contact shadows only; 'realtime' = shadow-mapped sun. */
    shadows: 'blob',
    shadowMapSize: 0,
    particles: false,
    speedLines: false,
    /** Motion blur down the sides at speed (post-processing): samples a pixel, 0 = off. */
    motionBlur: 0,
    viewDistance: 190,
    fogNear: 60,
    cloudCount: 8,
    /** Max side of any generated texture. */
    maxTexture: 512,
    /**
     * Other players are drawn this far away - the whole lobby, as the blocky figures
     * are one draw call for everybody - and the nearest `remoteAvatars` of them within
     * `remoteAvatarDistance` as their real avatar.
     */
    remoteDrawDistance: 150,
    remoteAvatars: 3,
    remoteAvatarDistance: 45,
    remoteNameDistance: 40,
    /** World labels fade out past this. */
    labelDistance: 70,
    /** How much of the canyon's scenery to spawn (0-1). */
    decorDensity: 0.45,
    /** Board and egg halo size multiplier. */
    boardGlow: 0.8,
  },
  MEDIUM: {
    dpr: 1.25,
    antialias: true,
    shadows: 'blob',
    shadowMapSize: 0,
    particles: true,
    speedLines: true,
    motionBlur: 8,
    viewDistance: 300,
    fogNear: 100,
    cloudCount: 14,
    maxTexture: 1024,
    remoteDrawDistance: 150,
    remoteAvatars: 5,
    remoteAvatarDistance: 60,
    remoteNameDistance: 55,
    labelDistance: 110,
    decorDensity: 0.75,
    boardGlow: 1,
  },
  HIGH: {
    dpr: 1.5,
    antialias: true,
    shadows: 'realtime',
    shadowMapSize: 1024,
    particles: true,
    speedLines: true,
    motionBlur: 12,
    viewDistance: 460,
    fogNear: 140,
    cloudCount: 18,
    maxTexture: 1024,
    remoteDrawDistance: 150,
    remoteAvatars: 7,
    remoteAvatarDistance: 80,
    remoteNameDistance: 70,
    labelDistance: 150,
    decorDensity: 1,
    boardGlow: 1,
  },
}

const STORAGE_KEY = 'pp.quality'

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true
  // iPadOS reports itself as a Mac; touch points give it away.
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)
}

/**
 * Picks a starting preset from the hardware. Deliberately pessimistic: the monitor can
 * only ever drop a level, so starting too high costs a few janky seconds, while
 * starting too low costs nothing.
 */
export function detectQuality() {
  if (typeof navigator === 'undefined') return 'MEDIUM'
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 8
  if (isMobileDevice() || cores <= 4) return 'LOW'
  if (cores <= 8 || memory <= 4) return 'MEDIUM'
  return 'HIGH'
}

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return QUALITY_LEVELS.includes(saved) ? saved : null
  } catch {
    return null
  }
}

const initialLevel = readSaved() || detectQuality()

export const useQuality = create((set, get) => ({
  level: initialLevel,
  /** True when the player picked the level by hand; auto-drop then stays out of it. */
  manual: readSaved() !== null,
  isMobile: isMobileDevice(),
  /** Set once at startup: antialiasing can't change without recreating the context. */
  antialias: PRESETS[initialLevel].antialias,
  settings: PRESETS[initialLevel],

  setLevel: (level, manual = true) => {
    if (!QUALITY_LEVELS.includes(level)) return
    if (manual) {
      try {
        localStorage.setItem(STORAGE_KEY, level)
      } catch {
        // Private mode: the choice just won't persist.
      }
    }
    set({ level, manual, settings: PRESETS[level] })
  },

  /** Called by the performance monitor when FPS stays under budget. */
  degrade: () => {
    const { level, manual } = get()
    if (manual) return
    const index = QUALITY_LEVELS.indexOf(level)
    if (index <= 0) return
    const next = QUALITY_LEVELS[index - 1]
    console.info(`[quality] FPS under budget, dropping ${level} -> ${next}`)
    set({ level: next, settings: PRESETS[next] })
  },
}))

/** Non-reactive read, safe inside useFrame. */
export const getQuality = () => useQuality.getState().settings
