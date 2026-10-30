import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebGLRenderer } from 'three'

import { useBloxity } from '../bloxity/BloxityContext'
import { useBloxityStore } from '../bloxity/store'
import { useGame } from '../store/game'
import { useQuality } from '../store/quality'
import ErrorBoundary from '../ui/ErrorBoundary'
import BlobShadows from './BlobShadows'
import FollowCamera from './FollowCamera'
import GainFX from './fx/GainFX'
import WorldLabels from './labels/WorldLabels'
import Pets, { RewardCrab, SphinxShowcase } from './pets/Pets'
import RemoteAvatars from './remote/RemoteAvatars'
import RemotePlayers from './remote/RemotePlayers'
import Particles from './fx/Particles'
import Leaderboards from './world/Leaderboards'
import TireShop from './world/TireShop'
import EggDisplays from './world/EggDisplays'
import Portal from './world/Portal'
import TutorialArrows from './world/TutorialArrows'
import Lighting from './Lighting'
import PerfProbe from './PerfProbe'
import Player from './Player'
import ShaderWarmup from './ShaderWarmup'
import { FOG, SKY } from './sceneStyle'
import Sky from './Sky'
import World from './world/World'
import { showLobbySky } from './worldLook'

// r3f-perf is a dev-only overlay (?perf in the URL). The DEV check is static, so the
// import and the package are dropped from production builds entirely.
const DevPerf = import.meta.env.DEV
  ? lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })))
  : null
const showDevPerf = import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')

// The track is its own chunk, fetched once the lobby is on screen so it never delays
// time-to-playable.
const Roll = lazy(() => import('./roll/Roll'))

/**
 * Fires `onFirstFrame` after the renderer has actually drawn once.
 * "Ready" should mean "the player can see the game", not "React mounted".
 */
function FirstFrameSignal({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    performance.mark('pp:first-frame')
    // Deferred: never update React state from inside the frame loop.
    setTimeout(onFirstFrame, 0)
  })
  return null
}

/**
 * The world you're in: its lobby sky (and fog) now, and a track rebuilt with its stages
 * (Roll is keyed on it).
 */
function WorldSky({ world }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    showLobbySky(scene.fog)
  }, [world, scene])
  return null
}

/** Keeps the camera's far plane in step with the preset's view distance. */
function ViewDistance({ far }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { camera } = get()
    camera.far = far
    camera.updateProjectionMatrix()
  }, [get, far])
  return null
}

/**
 * The 3D view. Owns the renderer lifecycle: quality-driven settings, automatic preset
 * drops when FPS falls under budget, and recovery from a lost WebGL context.
 *
 * @param {{ onReady?: () => void }} props called once the avatar is in and a frame
 *   has been drawn
 */
export function GameScene({ onReady }) {
  const { game } = useBloxity()
  const settings = useQuality((s) => s.settings)
  const antialias = useQuality((s) => s.antialias)
  // A level picked in Settings rebuilds the whole 3D view with it.
  const rebuild = useQuality((s) => s.rebuild)
  const degrade = useQuality((s) => s.degrade)
  // Boxity ad break: nothing renders until it's over.
  const adBreak = useBloxityStore((s) => s.adBreak)
  const world = useGame((s) => s.profile.world)

  const [warmedUp, setWarmedUp] = useState(false)
  const [firstFrame, setFirstFrame] = useState(false)
  const [contextKey, setContextKey] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  /** The last rebuild (see quality.js) whose shaders have warmed up. */
  const [warmedRebuild, setWarmedRebuild] = useState(0)
  // Rebuilt for a new graphics level, still compiling: a cover instead of an empty sky.
  const rebuilding = rebuild !== warmedRebuild
  const readySent = useRef(false)

  const handleWarmedUp = useCallback(() => {
    setWarmedUp(true)
    setWarmedRebuild(useQuality.getState().rebuild)
  }, [])
  const handleFirstFrame = useCallback(() => setFirstFrame(true), [])

  useEffect(() => {
    game.loadingStep('Preparing scene…')
  }, [game])

  // Playable once every shader is compiled and the first real frame is drawn. The
  // player's own avatar streams in afterwards (a blocky stand-in shows meanwhile), so a
  // slow avatar CDN never holds the game up.
  useEffect(() => {
    if (!warmedUp || !firstFrame || readySent.current) return
    readySent.current = true
    performance.mark('pp:ready')
    game.loadingEnd()
    onReady?.()
  }, [warmedUp, firstFrame, game, onReady])

  // A lost context (GPU reset, too many tabs, backgrounded on mobile) is recovered by
  // remounting the canvas, which builds a fresh context and re-uploads everything.
  // Game state lives in stores, so nothing is lost but a moment of rendering.
  const handleCreated = useCallback(({ gl }) => {
    performance.mark('pp:gl-created')
    gl.setClearColor(SKY.horizon)
    // Checking every program's compile status forces the driver to finish it on the
    // spot. Worth it while developing; in production it only costs start-up time.
    gl.debug.checkShaderErrors = import.meta.env.DEV
    const canvas = gl.domElement
    let remountTimer = null
    const remount = () => {
      clearTimeout(remountTimer)
      setContextLost(false)
      setContextKey((k) => k + 1)
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      // A canvas already taken off the page was replaced on purpose (a new graphics
      // level), and losing its context is how it's cleaned up: nothing to recover.
      if (!canvas.isConnected) return
      e.preventDefault()
      setContextLost(true)
      // Don't wait forever for a 'restored' that may never come.
      remountTimer = setTimeout(remount, 1500)
    })
    canvas.addEventListener('webglcontextrestored', remount)
  }, [])

  // Never set state from the monitor's frame callback directly.
  const handleDecline = useCallback(() => setTimeout(degrade, 0), [degrade])

  const dpr = Math.min(settings.dpr, window.devicePixelRatio || 1)

  // The renderer is built here rather than by R3F so its creation (the WebGL context,
  // often the slowest single step of start-up) is measured, and so the canvas is opaque:
  // the sky covers it anyway, and an opaque canvas is cheaper for the browser to
  // composite.
  const createRenderer = useMemo(
    () => (defaults) => {
      performance.mark('pp:gl-start')
      const renderer = new WebGLRenderer({
        ...defaults,
        alpha: false,
        antialias,
        stencil: false,
        powerPreference: 'high-performance',
      })
      performance.mark('pp:gl-end')
      return renderer
    },
    [antialias],
  )

  return (
    <>
      <Canvas
        key={`${contextKey}:${rebuild}`}
        frameloop={adBreak ? 'never' : 'always'}
        dpr={dpr}
        gl={createRenderer}
        // PCF, not R3F's default "soft": three r18x removed PCFSoftShadowMap.
        shadows={settings.shadows === 'realtime' ? 'percentage' : false}
        // No tone mapping. The default (ACES) desaturates the toy colours; the palette
        // and light levels in sceneStyle.js are chosen to look right without it.
        flat
        camera={{ position: [0, 6, 26], fov: 60, near: 0.5, far: settings.viewDistance }}
        onCreated={handleCreated}
      >
        <fog attach="fog" args={[FOG.color, settings.fogNear, settings.viewDistance * 0.95]} />
        <ViewDistance far={settings.viewDistance} />
        <PerformanceMonitor bounds={() => [45, Infinity]} onDecline={handleDecline} />

        <Sky />
        <WorldSky world={world} />
        <Lighting />
        <World />
        <WorldLabels />
        <TireShop />
        <EggDisplays />
        <Portal />
        <Leaderboards />
        <TutorialArrows />
        <Particles />
        <SphinxShowcase />
        <RewardCrab />
        <Pets />
        <RemotePlayers />
        <RemoteAvatars />
        <Player />
        <BlobShadows />
        <GainFX />
        {warmedUp && firstFrame && (
          <Suspense fallback={null}>
            <Roll key={world} />
          </Suspense>
        )}

        <FollowCamera />
        <ShaderWarmup onDone={handleWarmedUp} />
        {warmedUp && <FirstFrameSignal onFirstFrame={handleFirstFrame} />}
        <PerfProbe />
        {showDevPerf && DevPerf && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <DevPerf position="bottom-right" minimal />
            </Suspense>
          </ErrorBoundary>
        )}
      </Canvas>

      {(contextLost || rebuilding) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-sky-400/80 text-2xl text-white">
          <span className="pp-stroke">Reloading graphics…</span>
        </div>
      )}
    </>
  )
}

export default GameScene
