import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Points,
  PointsMaterial,
  Quaternion,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three'

import { TROPHY_FIRST, TROPHY_SPACING, ZONES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { trophyValue, winsMultiplier, zoneIndexAt } from '@shared/logic'
import { mulberry32 } from '@shared/rng'
import { CANYON_HALF_WIDTH } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame, useGame } from '../../store/game'
import { getQuality, useQuality } from '../../store/quality'
import { iconUrl } from '../../ui/icons'
import { BlockSet, createToyInstances, disposeBlocks, PropBuilder } from '../blocks'
import { boardGlow } from '../board'
import { spawnScattered } from '../fx/popups'
import { LabelBatch } from '../labels/LabelBatch'
import { sharedMaterials, STYLE } from '../materials'
import { runtime } from '../runtime'
import { FOG, SKY } from '../sceneStyle'
import { skyUniforms } from '../skyState'
import { writeDistance, writeZone } from './hudLink'
import { slopeBoxMatrix, surfaceY, trackPoint, weaveX, zAt } from './path'
import SlideFX from './SlideFX'
import SpeedBlur from './SpeedBlur'
import { advanceSlide, slide } from './slideControl'
import { buildChunk, CHUNK, GATES, RIM_X, WALL_H, WALL_RUN, ZONE_THEMES } from './track'

/**
 * Above this speed (m/s) the slide goes to "warp": no new scenery is built, a plain
 * zone-coloured canyon rushes past under the speed lines, and only the chunks around
 * where you'll stop are prepared. Streaming real chunks at thousands of m/s would cost
 * more CPU than a phone has, for scenery nobody could see.
 */
const WARP_ON = 220
const WARP_OFF = 160
/** Length of the warp canyon, centred a little ahead of the rider. */
const WARP_LENGTH = 1400
/** Builder passes between prefetch builds while in warp (~1 chunk per 120 ms). */
const PREFETCH_EVERY = 4

const HALF = CANYON_HALF_WIDTH
const LEAN = Math.atan2(WALL_RUN, WALL_H)

/** Warp-canyon colours and styles per zone, parsed once. */
const WARP_THEMES = ZONES.map((z) => {
  const t = ZONE_THEMES[z.id]
  return {
    floor: new Color(t.floor),
    wall: new Color(t.wall),
    ledge: new Color(t.ledge),
    floorStyle: t.floorStyle ?? STYLE.STUDS,
    wallStyle: t.wallStyle ?? STYLE.STUDS,
    ledgeStyle: t.ledgeStyle ?? STYLE.STUDS,
  }
})
const STYLE_KEYS = { floor: 'floorStyle', wall: 'wallStyle', ledge: 'ledgeStyle' }
/** The warp canyon's boxes, in track terms: [x, h, width, thick, lean, part]. */
const WARP_PARTS = [
  [0, -0.5, HALF * 2 + 2, 1, 0, 'floor'],
  ...[-1, 1].flatMap((side) => [
    [side * (HALF + WALL_RUN / 2 + 3 * Math.cos(LEAN)), WALL_H / 2 - 3 * Math.sin(LEAN), 6, Math.hypot(WALL_RUN, WALL_H), -side * LEAN, 'wall'],
    [side * (RIM_X + 30), WALL_H / 2 - 2, 61, WALL_H + 4, 0, 'wall'],
    [side * (RIM_X + 30), WALL_H + 0.25, 61, 0.5, 0, 'ledge'],
  ]),
]

/** Chunks kept behind the focus point, and how many may be built per builder pass. */
const BEHIND = 60
const MAX_BUILDS_PER_FRAME = 2
/** How often the chunk builder runs (between frames, not inside them). */
const BUILD_INTERVAL_MS = 30
/** Chunks never thrown away: the stretch visible from the lobby. */
const PINNED_CHUNKS = 3
const CACHE_LIMIT = 14
const MAX_TROPHIES = 16
const STREAKS = 36
/** Trophies float this high over the riding line. */
const TROPHY_HEIGHT = 1.5
/**
 * Frame-loop priority: before every other system, so the chase camera has moved before
 * anything projects into it (name tags, popups). Negative, so R3F still renders itself.
 */
const BEFORE_EVERYTHING = -1

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _v = new Vector3()
const _look = new Vector3()
const _cam = new Vector3()
/** The chase camera's smoothed position, before any shake is added on top. */
const camBase = new Vector3()
const _up = new Vector3(0, 1, 0)
/** Stable vector for runtime.flightFocus (the scratch ones are reused mid-frame). */
const riderFocus = new Vector3()
const _skyTop = new Color()
const _skyHorizon = new Color()

/** The chase camera's field of view widens with speed, up to this much more. */
const FOV_KICK = 16
/** Shake at full speed, and the jolt of a landing (metres), fading over LAND_SHAKE_MS. */
const SPEED_SHAKE = 0.05
const LAND_SHAKE = 0.3
const LAND_SHAKE_MS = 160

/** At most one trophy popup this often; the trophies in between are summed into it. */
const TROPHY_POPUP_MS = 180
const TROPHY_ICON = iconUrl('trophy')
/** Trophy popups are scattered over the screen (see spawnScattered), a touch bigger than gains. */
const TROPHY_POPUP = { iconUrl: TROPHY_ICON, scale: 1.2 }

/** Built chunks by index. Module-level: one canyon exists at a time. */
const chunkCache = new Map()
/** The chunk window the frame loop wants; the builder makes it so. */
const trackWindow = { first: 0, last: 0, density: 1, shadows: false, warp: false, prefetchFirst: 0, prefetchLast: -1 }
/** Shows a built chunk only while it's in the window (a named function: no closure per frame). */
const showIfWanted = (mesh, i) => {
  mesh.visible = i >= trackWindow.first && i <= trackWindow.last
}

/**
 * Speed-line streaks, made once: alternately down the left and right of the view (well
 * clear of the rider and the distance counter), each a little thicker or longer than
 * the next, and every third tinted with your board's glow.
 */
const streakState = (() => {
  const r = mulberry32(5)
  return Array.from({ length: STREAKS }, (_, i) => ({
    a: (i % 2 ? 0 : Math.PI) + (r() - 0.5) * 1.6,
    r: 2.8 + r() * 4,
    z: -r() * 30,
    width: 0.06 + r() * 0.06,
    length: 0.7 + r() * 0.6,
    tinted: i % 3 === 0,
  }))
})()
/** Speed lines fade in between these speeds (m/s). */
const STREAKS_FROM = 20
const STREAKS_FULL = 70
const WHITE = new Color('#ffffff')
const _tint = new Color()

/**
 * A speed line: two crossed quads, so it's thin from any angle. uv.x runs across it,
 * uv.y along it, from the tail (0) to the head (1, the end it travels towards).
 */
function createStreakGeometry() {
  const geometry = new BufferGeometry()
  const positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5]
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  return geometry
}

const streakVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #endif
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const streakFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vColor;
  void main() {
    // Soft-edged across; a long tail fading out behind a bright, rounded head.
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float along = smoothstep(0.0, 0.75, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    // Gone before it reaches the lens (no fat bars across the screen), and faint far off.
    float depth = smoothstep(1.5, 6.0, vDepth) * (1.0 - smoothstep(24.0, 34.0, vDepth));
    gl_FragColor = vec4(vColor, across * across * along * depth * uOpacity);
    #include <colorspace_fragment>
  }
`

const ZONE_SKIES = ZONES.map((z) => ZONE_THEMES[z.id].sky.map((c) => new Color(c)))
const ZONE_NAME_GRADIENTS = ZONES.map((z) => {
  const [a, b, c] = ZONE_THEMES[z.id].name
  return `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${c} 100%)`
})
const DEFAULT_TOP = new Color(SKY.top)
const DEFAULT_HORIZON = new Color(SKY.horizon)

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function createTrophyGeometry() {
  const p = new PropBuilder()
  const gold = '#ffcc1f'
  p.add(new CylinderGeometry(0.42, 0.24, 0.62, 12), { position: [0, 0.55, 0], color: gold, style: STYLE.GLOW })
  p.add(new TorusGeometry(0.2, 0.06, 6, 10, Math.PI), { position: [-0.42, 0.62, 0], rotation: [0, 0, Math.PI / 2], color: gold })
  p.add(new TorusGeometry(0.2, 0.06, 6, 10, Math.PI), { position: [0.42, 0.62, 0], rotation: [0, 0, -Math.PI / 2], color: gold })
  p.add(new CylinderGeometry(0.08, 0.08, 0.3, 6), { position: [0, 0.12, 0], color: gold })
  p.box(0, -0.05, 0, 0.5, 0.14, 0.5, '#ffb01e', STYLE.SMOOTH)
  return p.build()
}

let warpZone = -1

/** Lays the warp canyon along the slope around `meter`, restyled when the zone changes. */
function updateWarpCanyon(canyon, meter) {
  const zi = zoneIndexAt(meter)
  const theme = WARP_THEMES[zi]
  const center = meter + WARP_LENGTH * 0.35
  const styles = canyon.geometry.getAttribute('aStyle')
  for (let i = 0; i < WARP_PARTS.length; i += 1) {
    const p = WARP_PARTS[i]
    canyon.setMatrixAt(i, slopeBoxMatrix(center, p[0], p[1], p[2], p[3], WARP_LENGTH, p[4], _m))
    if (zi !== warpZone) {
      canyon.setColorAt(i, theme[p[5]])
      styles.array[i] = theme[STYLE_KEYS[p[5]]]
    }
  }
  canyon.instanceMatrix.needsUpdate = true
  if (zi !== warpZone) {
    warpZone = zi
    if (canyon.instanceColor) canyon.instanceColor.needsUpdate = true
    styles.needsUpdate = true
  }
}

/**
 * Lazily loaded: the canyon down the hill, the trophies on it and the chase camera
 * while you slide. While nobody is sliding it still streams the first stretch, which is
 * the canyon you see dropping away from the lobby.
 */
export default function Slide() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const rootRef = useRef(null)
  const groupRef = useRef(null)
  const warpRef = useRef(null)
  const trophyRef = useRef(null)
  const streakRef = useRef(null)
  /** The slide (its startedAt) the speed lines were last tinted for. */
  const streakTintedFor = useRef(-1)
  const starsRef = useRef(null)
  const gatesRef = useRef(null)
  const startedFor = useRef(0)
  /** Trophies passed so far this slide: the next one's metre, and Wins not yet shown. */
  const trophyTally = useRef({ next: TROPHY_FIRST, pending: 0, shownAt: 0 })
  const zoneShown = useRef(-1)
  const wasActive = useRef(false)
  /** The camera's field of view outside slides, restored after each. */
  const baseFov = useRef(60)
  const speedLines = useQuality((s) => s.settings.speedLines)
  const particles = useQuality((s) => s.settings.particles)
  const motionBlur = useQuality((s) => s.settings.motionBlur)
  const antialias = useQuality((s) => s.antialias)
  const sliding = useGame((s) => Boolean(s.slide))

  const assets = useMemo(() => {
    const trophies = createToyInstances(createTrophyGeometry(), sharedMaterials().toy, MAX_TROPHIES)

    const streakMaterial = new ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: streakVertexShader,
      fragmentShader: streakFragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    })
    const streakMesh = new InstancedMesh(createStreakGeometry(), streakMaterial, STREAKS)
    // Colours exist from the start, so the shader is compiled with them once.
    for (let i = 0; i < STREAKS; i += 1) streakMesh.setColorAt(i, WHITE)
    streakMesh.frustumCulled = false
    streakMesh.count = 0

    const rand = mulberry32(99)
    const starPositions = new Float32Array(500 * 3)
    for (let i = 0; i < 500; i += 1) {
      _v.set(rand() * 2 - 1, rand() * 1.2 - 0.2, rand() * 2 - 1).normalize().multiplyScalar(140)
      starPositions.set([_v.x, _v.y, _v.z], i * 3)
    }
    const starGeometry = new BufferGeometry()
    starGeometry.setAttribute('position', new BufferAttribute(starPositions, 3))
    const stars = new Points(starGeometry, new PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
    stars.frustumCulled = false
    stars.visible = false

    // Warp canyon: floor, walls and ledges as one stretched set of boxes.
    const warpSet = new BlockSet()
    for (let i = 0; i < WARP_PARTS.length; i += 1) warpSet.add(0, 0, 0, 1, 1, 1, '#ffffff', STYLE.STUDS)
    const warpCanyon = warpSet.build(sharedMaterials().blocks)
    warpCanyon.visible = false
    warpCanyon.frustumCulled = false

    return { trophies, streakMesh, streakMaterial, stars, warpCanyon }
  }, [])

  // This module loads after the lobby is on screen; compile its shaders in the
  // background before showing it, so the first slide doesn't stall on them.
  useEffect(() => {
    const root = rootRef.current
    // Skipped in dev, where StrictMode's remount disposes materials mid-compile (see
    // ShaderWarmup).
    if (!root || import.meta.env.DEV) return undefined
    let cancelled = false
    root.visible = false
    gl.compileAsync(root, camera, scene)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) root.visible = true
      })
    return () => {
      cancelled = true
    }
  }, [gl, camera, scene])

  // Zone names over the gates: their own small label batch.
  useEffect(() => {
    const batch = new LabelBatch({ pageSize: Math.min(512, getQuality().maxTexture) })
    for (const g of GATES) {
      const z = zAt(g.meter)
      batch.add(
        `gate-${g.zone.id}`,
        [0, surfaceY(z, 0) + 18.5, z],
        { lines: [{ text: g.zone.name, size: 64, gradient: ZONE_THEMES[g.zone.id].name }], pxPerUnit: 26 },
        { fade: 400 },
      )
    }
    let cancelled = false
    batch.build().then((meshes) => {
      if (cancelled || !gatesRef.current) return
      for (const mesh of meshes) gatesRef.current.add(mesh)
    })
    return () => {
      cancelled = true
      batch.dispose()
    }
  }, [])

  // Streams canyon chunks in and out between frames: at most two builds per pass.
  useEffect(() => {
    const group = groupRef.current
    let pass = 0
    const build = (i, density) => {
      const mesh = buildChunk(i, { density }).build(sharedMaterials().blocks)
      mesh.receiveShadow = trackWindow.shadows
      chunkCache.set(i, mesh)
      group.add(mesh)
    }
    const id = setInterval(() => {
      if (!group) return
      const want = trackWindow
      pass += 1
      if (want.warp) {
        // Only get the stopping place ready, one chunk at a time.
        if (pass % PREFETCH_EVERY === 0) {
          for (let i = want.prefetchFirst; i <= want.prefetchLast; i += 1) {
            if (chunkCache.has(i)) continue
            build(i, want.density)
            break
          }
        }
      } else {
        let built = 0
        for (let i = want.first; i <= want.last && built < MAX_BUILDS_PER_FRAME; i += 1) {
          if (chunkCache.has(i)) continue
          build(i, want.density)
          built += 1
        }
      }
      if (chunkCache.size <= CACHE_LIMIT) return
      for (const [i, mesh] of chunkCache) {
        const wanted = (i >= want.first && i <= want.last) || (i >= want.prefetchFirst && i <= want.prefetchLast)
        if (!wanted && i >= PINNED_CHUNKS) {
          group.remove(mesh)
          disposeBlocks(mesh)
          chunkCache.delete(i)
        }
      }
    }, BUILD_INTERVAL_MS)
    return () => {
      clearInterval(id)
      for (const mesh of chunkCache.values()) disposeBlocks(mesh)
      chunkCache.clear()
      assets.trophies.geometry.dispose()
      assets.trophies.dispose()
      assets.streakMesh.geometry.dispose()
      assets.streakMaterial.dispose()
      assets.streakMesh.dispose()
      assets.stars.geometry.dispose()
      assets.stars.material.dispose()
      disposeBlocks(assets.warpCanyon)
      skyUniforms.topColor.value.copy(DEFAULT_TOP)
      skyUniforms.horizonColor.value.copy(DEFAULT_HORIZON)
    }
  }, [assets])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const group = groupRef.current
    if (!group) return
    const settings = getQuality()
    const now = performance.now()

    // --- The ride -----------------------------------------------------------------
    let focus = 0
    let speed = 0
    if (slide.active) {
      advanceSlide(state.clock.elapsedTime)
      if (startedFor.current !== slide.startedAt) {
        startedFor.current = slide.startedAt
        camBase.copy(camera.position)
        baseFov.current = camera.fov
        const tally = trophyTally.current
        tally.next = TROPHY_FIRST
        tally.pending = 0
        tally.shownAt = 0
        zoneShown.current = -1
      }
      focus = Math.max(0, slide.meter)
      speed = slide.speed
      const p = slide.position
      runtime.flightFocus = riderFocus.copy(p)
      writeDistance(Math.max(0, slide.meter))
      const zi = zoneIndexAt(Math.max(0, slide.meter))
      if (zi !== zoneShown.current) {
        zoneShown.current = zi
        writeZone(ZONES[zi].name, ZONE_NAME_GRADIENTS[zi])
      }

      // The sound of the ride, swelling with your speed, gone once you stop.
      if (!slide.stopped && speed > 4) {
        sfx.windStart()
        sfx.windSet(speed / 120, slide.airborne, slide.skid)
      } else if (slide.stopped) {
        sfx.windStop()
      }

      if (runtime.camera.mode === 'slide') {
        const elapsed = (now - slide.startedAt) / 1000
        if (slide.phase === 'stopped') {
          // Stopped: swing round to the side and in, onto you cheering.
          const k = smoothstep(0, 1.4, elapsed - slide.duration)
          const angle = (Math.floor(slide.distance) % 2 === 0 ? 1 : -1) * 0.75 * k
          const dist = 8.5 - 3.2 * k
          const height = 3.4 - 1.5 * k
          _cam.set(Math.sin(angle) * dist, height + Math.cos(angle) * dist * 0.2, Math.cos(angle) * dist).add(p)
          camBase.lerp(_cam, 1 - Math.exp(-4 * delta))
          _look.copy(p).y += 1.1 - 0.4 * (1 - k)
        } else {
          // Chase camera: behind and above you, looking down the slope. Locked to you
          // along the slope (at warp speed any lag leaves it hundreds of metres behind);
          // eased sideways so the weaving stays smooth, and eased in from the lobby
          // camera - close and low for the dive, pulling back once you're off.
          const off = smoothstep(0.5, 1.4, elapsed)
          const behind = 7 + 1.5 * off + Math.min(speed, 300) * 0.006
          trackPoint(slide.meter - behind, 0, 3.1 + 0.3 * off + slide.air * 0.85, _cam)
          const easingIn = elapsed < 1
          const kIn = easingIn ? 1 - Math.exp(-8 * delta) : 1
          const kx = easingIn ? kIn : 1 - Math.exp(-5 * delta)
          camBase.set(
            camBase.x + (p.x * 0.65 - camBase.x) * kx,
            camBase.y + (_cam.y - camBase.y) * kIn,
            camBase.z + (_cam.z - camBase.z) * kIn,
          )
          trackPoint(slide.meter + 14, p.x * 0.85, 0.4 + slide.air * 0.9, _look)
        }
        // Shake: a rumble that grows with speed, and a jolt when the board lands.
        const sinceLand = now - slide.landedAt
        const amp =
          (slide.phase === 'ride' ? Math.min(1, speed / 220) * SPEED_SHAKE : 0) +
          (sinceLand < LAND_SHAKE_MS * 3 ? LAND_SHAKE * Math.exp(-sinceLand / LAND_SHAKE_MS) : 0)
        camera.position.set(camBase.x + (Math.random() - 0.5) * amp, camBase.y + (Math.random() - 0.5) * amp, camBase.z)
        camera.lookAt(_look)
        // The view widens with speed: the rush of going fast.
        const fov = baseFov.current + (slide.phase === 'ride' ? Math.min(FOV_KICK, speed * 0.08) : slide.phase === 'stopped' ? -6 : 0)
        // (The frame's own camera handle: the same camera, but writable by lint's rules.)
        const lens = state.camera
        if (Math.abs(fov - lens.fov) > 0.05) {
          lens.fov += (fov - lens.fov) * (1 - Math.exp(-3 * delta))
          lens.updateProjectionMatrix()
        }
      }
    }
    if (wasActive.current && !slide.active) {
      state.camera.fov = baseFov.current
      state.camera.updateProjectionMatrix()
      sfx.windStop()
      skyUniforms.topColor.value.copy(DEFAULT_TOP)
      skyUniforms.horizonColor.value.copy(DEFAULT_HORIZON)
      if (scene.fog) scene.fog.color.set(FOG.color)
    }
    wasActive.current = slide.active

    // --- Canyon chunks ------------------------------------------------------------
    // Only decide what should exist; the builder above does the allocating, outside
    // the frame loop.
    const ahead = settings.viewDistance
    const want = trackWindow
    want.first = Math.max(0, Math.floor((focus - BEHIND) / CHUNK))
    want.last = Math.floor((focus + ahead) / CHUNK)
    // Less scenery when screaming past at hundreds of metres a second.
    want.density = settings.decorDensity * (speed > 300 ? 0.35 : speed > 120 ? 0.65 : 1)
    want.shadows = settings.shadows === 'realtime'
    chunkCache.forEach(showIfWanted)

    if (!slide.active) want.warp = false
    else if (!want.warp && speed > WARP_ON) want.warp = true
    else if (want.warp && speed < WARP_OFF) want.warp = false
    if (slide.active) {
      // Where you'll stop, built ahead of time while warping towards it.
      want.prefetchFirst = Math.max(0, Math.floor((slide.distance - 150) / CHUNK))
      want.prefetchLast = Math.floor((slide.distance + Math.min(ahead, 240)) / CHUNK)
    } else {
      want.prefetchLast = -1
    }
    const canyon = warpRef.current
    if (canyon) {
      canyon.visible = want.warp
      if (want.warp) updateWarpCanyon(canyon, focus)
    }

    // --- Trophies -----------------------------------------------------------------
    if (slide.active) {
      // Tally the ones just slid through. The Wins were granted with the slide; this is
      // the visual receipt. At speed you pass dozens a second, so they're summed into
      // one popup at most every TROPHY_POPUP_MS.
      const tally = trophyTally.current
      while (tally.next <= Math.min(slide.meter, slide.distance)) {
        tally.pending += trophyValue(tally.next)
        tally.next += TROPHY_SPACING
      }
      if (tally.pending > 0 && now - tally.shownAt >= TROPHY_POPUP_MS) {
        const multiplier = winsMultiplier(getGame().profile, Date.now())
        spawnScattered(`+${formatNumber(Math.round(tally.pending * multiplier))}`, TROPHY_POPUP)
        sfx.trophy()
        tally.pending = 0
        tally.shownAt = now
      }
    }
    const trophies = trophyRef.current
    if (trophies) {
      const spin = now * 0.003
      let count = 0
      const k0 = Math.max(0, Math.ceil((focus - 10 - TROPHY_FIRST) / TROPHY_SPACING))
      for (let m = TROPHY_FIRST + k0 * TROPHY_SPACING; m < focus + ahead * 0.8 && count < MAX_TROPHIES; m += TROPHY_SPACING) {
        if (slide.active && m <= slide.meter) continue
        trackPoint(m, weaveX(m), TROPHY_HEIGHT + Math.sin(spin + m) * 0.25, _p)
        _q.setFromAxisAngle(_up, spin + m)
        _s.setScalar(1.5)
        trophies.setMatrixAt(count, _m.compose(_p, _q, _s))
        count += 1
      }
      trophies.count = count
      trophies.instanceMatrix.needsUpdate = true
    }

    // --- Sky tint by zone ---------------------------------------------------------
    if (slide.active) {
      const meter = Math.max(0, slide.meter)
      const zi = zoneIndexAt(meter)
      const blend = smoothstep(ZONES[zi].start, ZONES[zi].start + 80, meter)
      const prev = ZONE_SKIES[Math.max(0, zi - 1)]
      const cur = ZONE_SKIES[zi]
      _skyTop.copy(prev[0]).lerp(cur[0], zi === 0 ? 1 : blend)
      _skyHorizon.copy(prev[1]).lerp(cur[1], zi === 0 ? 1 : blend)
      skyUniforms.topColor.value.copy(_skyTop)
      skyUniforms.horizonColor.value.copy(_skyHorizon)
      if (scene.fog) scene.fog.color.copy(_skyHorizon)

      const stars = starsRef.current
      if (stars && particles) {
        const spaceBlend = zi === ZONES.length - 1 ? blend : 0
        stars.visible = spaceBlend > 0.01
        stars.material.opacity = spaceBlend
        stars.position.copy(camera.position)
      }
    } else if (starsRef.current) {
      starsRef.current.visible = false
    }

    // --- Speed lines --------------------------------------------------------------
    const lines = streakRef.current
    if (lines) {
      const active = slide.active && !slide.stopped && speedLines && speed > STREAKS_FROM
      if (!active) {
        lines.count = 0
      } else {
        if (streakTintedFor.current !== slide.startedAt) {
          // Once a slide: the tinted ones take this board's glow, softened towards white.
          streakTintedFor.current = slide.startedAt
          _tint.copy(boardGlow(getGame().profile.equippedBoard)).lerp(WHITE, 0.35)
          for (let i = 0; i < STREAKS; i += 1) lines.setColorAt(i, streakState[i].tinted ? _tint : WHITE)
          lines.instanceColor.needsUpdate = true
        }
        const fast = Math.min(speed, 400)
        lines.material.uniforms.uOpacity.value = smoothstep(STREAKS_FROM, STREAKS_FULL, speed)
        const travel = fast * delta * 0.6
        lines.count = STREAKS
        for (let i = 0; i < STREAKS; i += 1) {
          const st = streakState[i]
          st.z += travel
          if (st.z > 4) st.z -= 34
          // A wide oval: out to the sides more than up and down.
          _v.set(Math.cos(st.a) * st.r * 1.15, Math.sin(st.a) * st.r * 0.75, st.z - 4)
          _v.applyQuaternion(camera.quaternion).add(camera.position)
          _q.copy(camera.quaternion)
          _s.set(st.width, st.width, (2 + fast * 0.02) * st.length)
          lines.setMatrixAt(i, _m.compose(_v, _q, _s))
        }
        lines.instanceMatrix.needsUpdate = true
      }
    }
  }, BEFORE_EVERYTHING)

  return (
    <group ref={rootRef}>
      <group ref={groupRef} />
      <group ref={gatesRef} />
      <primitive ref={warpRef} object={assets.warpCanyon} />
      <primitive ref={trophyRef} object={assets.trophies} />
      <primitive ref={streakRef} object={assets.streakMesh} />
      <primitive ref={starsRef} object={assets.stars} />
      <SlideFX />
      {sliding && motionBlur > 0 && <SpeedBlur samples={motionBlur} antialias={antialias} />}
    </group>
  )
}
