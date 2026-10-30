import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'

import { COS, SIN, TIRE_SIZE } from './path'
import { roll } from './rollControl'

/**
 * Every tire leaves its own smoke behind it as it rolls: soft round puffs in its
 * colours that billow out, grow and fade over about a second - orange behind the
 * orange slice, pink behind the cake, gold behind the gold coin, every colour behind
 * the rainbow, fiery smoke rising off the lava rock and the dragon. The dearer the
 * tire, the thicker its smoke.
 *
 * The puffs stream back from the tire and travel along with it (their positions are
 * offsets from it), so the smoke stays in view for its whole second.
 *
 * On every graphics level, because it's cheap: one draw call of camera-facing quads
 * (two triangles a puff, a fixed pool of them reused round and round), the soft round
 * shape worked out in the shader with no texture, no allocation per frame, and nothing
 * drawn when nothing's alive. Its shader is compiled when the track loads, so the
 * first roll can't stutter.
 */

/** Puffs alive at once, and how long each lasts (seconds). */
const POOL = 48
const LIFE = 1

/**
 * Each tire's smoke: its colours (cycled in order for the rainbow ones), how many puffs
 * a second, and how much it rises (fire and stars float up; the rest drifts).
 */
const RAINBOW = ['#ff5a6a', '#ffa23a', '#ffe04a', '#6fe04a', '#4ac8ff', '#a77bff']
const SMOKES = {
  bicycle: { colors: ['#ff9a2e', '#ffc46a'], rate: 22, rise: 0.6 },
  mountain: { colors: ['#7fe04a', '#c8f58a'], rate: 23, rise: 0.6 },
  wood: { colors: ['#c99460', '#e6c49a'], rate: 24, rise: 0.5 },
  stone: { colors: ['#b4b8c0', '#d8dbe0'], rate: 25, rise: 0.4 },
  cookie: { colors: ['#e8b878', '#f6dcae'], rate: 26, rise: 0.5 },
  pizza: { colors: ['#ffce4a', '#ff7a5a'], rate: 27, rise: 0.6 },
  donut: { colors: ['#ff9ad0', '#ffd0ea', '#9adfff'], rate: 28, rise: 0.7 },
  watermelon: { colors: ['#ff6a78', '#8ee07a'], rate: 29, rise: 0.6 },
  monster: { colors: ['#ffd23a', '#fff0a0'], rate: 30, rise: 0.6 },
  mint: { colors: ['#ff4a62', '#ffffff'], rate: 31, rise: 0.7, ordered: true },
  silver: { colors: ['#e6ebf3', '#c4ccda'], rate: 32, rise: 0.8 },
  ice: { colors: ['#ffa8d0', '#fff2dc', '#9a6a4a'], rate: 33, rise: 0.7 },
  gold: { colors: ['#ffd21f', '#fff0a0'], rate: 34, rise: 0.9 },
  lava: { colors: ['#ff6a1e', '#ffb03a', '#5a2a1e'], rate: 36, rise: 1.6 },
  platinum: { colors: ['#ffffff', '#ff9a74', '#a8e070'], rate: 36, rise: 0.6 },
  emerald: { colors: ['#6aff3e', '#b8ff8a'], rate: 37, rise: 0.5 },
  ruby: { colors: ['#f0b060', '#7ad04a', '#ff6a5a'], rate: 38, rise: 0.6 },
  diamond: { colors: ['#ffffff', '#bff4ff', '#8ae6ff'], rate: 40, rise: 1.1 },
  rainbow: { colors: RAINBOW, rate: 42, rise: 0.8, ordered: true },
  unicorn: { colors: ['#ffb8f2', '#b8dcff', '#dcb8ff'], rate: 42, rise: 1.1, ordered: true },
  galaxy: { colors: ['#9a6bff', '#5a3ad8', '#ffe8a8'], rate: 44, rise: 1.2 },
  dragon: { colors: ['#ff5a1e', '#ffd21f', '#ff8a3a'], rate: 45, rise: 1.6 },
  cosmic: { colors: ['#ff9ed8', '#ffffff', '#ffe04a', '#9adfff'], rate: 45, rise: 0.9, ordered: true },
  infinity: { colors: [...RAINBOW, '#ffffff'], rate: 46, rise: 1, ordered: true },
}
// Parsed once (and softened a little towards white): frame code never allocates.
const WHITE = new Color('#ffffff')
for (const s of Object.values(SMOKES)) s.palette = s.colors.map((c) => new Color(c).lerp(WHITE, 0.15))

const vertexShader = /* glsl */ `
  attribute vec2 aPuff;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    // A camera-facing quad at the instance's position, as big as its scale.
    vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float size = length(instanceMatrix[0].xyz);
    vec4 mv = modelViewMatrix * vec4(centre, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vColor = instanceColor;
    vUv = uv;
    vFade = aPuff.x;
    vSeed = aPuff.y;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    // A puffy, cloud-like edge rather than a perfect circle, and a lighter middle.
    float a = atan(p.y, p.x);
    float edge = 0.86 + 0.07 * sin(a * 5.0 + vSeed) + 0.04 * sin(a * 9.0 - vSeed * 2.0);
    float alpha = (1.0 - smoothstep(edge * 0.3, edge, r)) * vFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor * (0.9 + 0.25 * (1.0 - r)), alpha);
    #include <colorspace_fragment>
  }
`

const DOWN_TRACK = new Vector3(0, -SIN, -COS)
const UP = new Vector3(0, 1, 0)
const SIDE = new Vector3(1, 0, 0)

const puffs = Array.from({ length: POOL }, () => ({
  life: 0,
  /** Where it is relative to the tire, and how it moves relative to it. */
  off: new Vector3(),
  vel: new Vector3(),
  size: 1,
}))

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _p = new Vector3()
const _zero = new Matrix4().makeScale(0, 0, 0)

export function TireTrail() {
  const ref = useRef(null)
  const state = useRef({ next: 0, owed: 0, colorIndex: 0 })
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  const mesh = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1)
    geometry.setAttribute('aPuff', new InstancedBufferAttribute(new Float32Array(POOL * 2), 2))
    const material = new ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false })
    const m = new InstancedMesh(geometry, material, POOL)
    // Colour every instance once, so the colour attribute exists before the shader compiles.
    for (let i = 0; i < POOL; i += 1) {
      m.setMatrixAt(i, _zero)
      m.setColorAt(i, WHITE)
    }
    m.frustumCulled = false
    m.renderOrder = 5
    m.visible = false
    return m
  }, [])

  // Compiled now, while the track loads, rather than on the first roll.
  useEffect(() => {
    gl.compileAsync?.(mesh, camera, scene)?.catch(() => null)
  }, [gl, camera, scene, mesh])

  useEffect(
    () => () => {
      for (const p of puffs) p.life = 0
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame((_frame, rawDelta) => {
    const m = ref.current
    if (!m) return
    const delta = Math.min(rawDelta, 0.05)
    const st = state.current
    const smoke = SMOKES[roll.tireId] ?? SMOKES.bicycle
    const fades = m.geometry.getAttribute('aPuff')

    // Puff out new smoke while the tire is moving.
    let colored = false
    if (roll.active && roll.phase === 'ride' && !roll.crashed && roll.speed > 4) {
      st.owed += delta * smoke.rate
      while (st.owed >= 1) {
        st.owed -= 1
        const i = st.next
        st.next = (st.next + 1) % POOL
        const p = puffs[i]
        p.life = LIFE
        // From behind the tire, low and round its middle.
        const side = (Math.random() - 0.5) * 2
        p.off
          .set(0, 0, 0)
          .addScaledVector(DOWN_TRACK, -TIRE_SIZE * 0.6)
          .addScaledVector(SIDE, side * TIRE_SIZE * 0.35)
          .addScaledVector(UP, (Math.random() - 0.4) * TIRE_SIZE * 0.6)
        // Billowing back from it, out a little, and up by the smoke's rise.
        p.vel
          .set(side * 1.2, smoke.rise * (0.8 + Math.random() * 0.8), 0)
          .addScaledVector(DOWN_TRACK, -(4 + Math.random() * 3 + Math.min(roll.speed, 60) * 0.05))
        p.size = TIRE_SIZE * (0.9 + Math.random() * 0.4)
        fades.setY(i, Math.random() * 6.28)
        const ci = smoke.ordered ? st.colorIndex++ % smoke.palette.length : Math.floor(Math.random() * smoke.palette.length)
        m.setColorAt(i, smoke.palette[ci])
        colored = true
      }
    } else {
      st.owed = 0
    }

    // Grow, drift and fade what's alive; spent puffs are scaled to nothing.
    let alive = false
    for (let i = 0; i < POOL; i += 1) {
      const p = puffs[i]
      if (p.life <= 0) continue
      p.life -= delta
      alive = true
      if (p.life <= 0) {
        p.life = 0
        m.setMatrixAt(i, _zero)
        fades.setX(i, 0)
        continue
      }
      const age = 1 - p.life / LIFE
      p.vel.multiplyScalar(1 - delta * 1.2)
      p.off.addScaledVector(p.vel, delta)
      // Swelling as it goes; quick to appear, slow to thin away.
      _s.setScalar(p.size * (0.7 + age * 1.5))
      m.setMatrixAt(i, _m.compose(_p.copy(roll.position).add(p.off), _q, _s))
      fades.setX(i, 0.88 * Math.min(1, age * 8) * (1 - age) * (1 - age * 0.3))
    }
    m.visible = alive
    if (alive) {
      m.instanceMatrix.needsUpdate = true
      fades.needsUpdate = true
    }
    if (colored && m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}

export default TireTrail
