import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three'

import { groundHeightAt, SLIDE_START_Z, SLOPE_ANGLE } from '@shared/world'

import { useQuality } from '../store/quality'
import { runtime } from './runtime'
import { slopeY } from './slide/path'

const MAX_BLOBS = 48

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.35, 1.0, d)) * 0.32;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
    #include <fog_fragment>
  }
`

const _m = new Matrix4()
const _q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
/** Lying on the slope instead of the flat. */
const _qSlope = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2 - SLOPE_ANGLE)
const _p = new Vector3()
const _s = new Vector3()

/**
 * Soft round contact shadows under characters and pets, for presets without realtime
 * shadows. Procedural (no texture) and instanced: one draw call for all of them.
 */
export function BlobShadows() {
  const enabled = useQuality((s) => s.settings.shadows !== 'realtime')
  const ref = useRef(null)

  const mesh = useMemo(() => {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: {
        fogColor: { value: new Color() },
        fogNear: { value: 1 },
        fogFar: { value: 1000 },
        fogDensity: { value: 0 },
      },
    })
    const instanced = new InstancedMesh(new PlaneGeometry(1, 1), material, MAX_BLOBS)
    instanced.frustumCulled = false
    instanced.renderOrder = 1
    instanced.count = 0
    return instanced
  }, [])

  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    if (!enabled) {
      mesh.count = 0
      return
    }
    let i = 0
    for (const caster of runtime.shadowCasters) {
      if (i >= MAX_BLOBS) break
      if (caster.visible === false) continue
      const p = caster.position
      // Shrinks as the caster rises, like a real contact shadow. Down the hill, it lies
      // on the slope.
      const onSlope = p.z < SLIDE_START_Z
      const floor = onSlope ? slopeY(p.z) : groundHeightAt(p.x, p.z)
      const lift = Math.max(0, p.y - floor)
      const size = caster.size * Math.max(0.35, 1 - lift * 0.12)
      _p.set(p.x, floor + 0.04, p.z)
      _s.set(size, onSlope ? size * 1.6 : size, 1)
      mesh.setMatrixAt(i, _m.compose(_p, onSlope ? _qSlope : _q, _s))
      i += 1
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}

export default BlobShadows
