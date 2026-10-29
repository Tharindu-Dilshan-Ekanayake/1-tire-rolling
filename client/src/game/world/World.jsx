import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'

import { useQuality } from '../../store/quality'
import { asToyInstance, BlockSet, disposeBlocks, PropBuilder } from '../blocks'
import { glowTime } from '../glow'
import { createToyMaterial, sharedMaterials, toyTime } from '../materials'
import { createGroundGeometry, createGroundMap } from './ground'
import { buildEggStands } from './eggs'
import { buildPortalFrame } from './portalFrame'
import { createPaintedSigns } from './signs'
import { buildRollZone } from './rollZone'
import { buildPads, buildShop } from './structures'
import { buildWaterfall } from './waterfall'
import { buildTerrain } from './terrain'

/**
 * The static lobby: ground plane, every box (hills, trees, pads, stages) in one
 * InstancedMesh, and every non-box prop (pads, rings...) merged into one mesh. Three
 * draw calls for the whole environment.
 *
 * Built once. Quality only decides tree density at build time and whether the result
 * casts/receives realtime shadows.
 */
export function World() {
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const [signs, setSigns] = useState([])

  // Drives every animated toy-material style (water...).
  useFrame((state) => {
    toyTime.value = state.clock.elapsedTime
    glowTime.value = state.clock.elapsedTime
  })

  useEffect(() => {
    let made = []
    let cancelled = false
    const dispose = (list) => {
      for (const sign of list) {
        sign.geometry.dispose()
        sign.material.dispose()
        sign.texture.dispose()
      }
    }
    createPaintedSigns(useQuality.getState().settings.maxTexture).then((list) => {
      if (cancelled) {
        dispose(list)
        return
      }
      made = list
      setSigns(list)
    })
    return () => {
      cancelled = true
      dispose(made)
    }
  }, [])

  const { blocks, ground, props } = useMemo(() => {
    performance.mark('pp:world-start')
    const { decorDensity, maxTexture } = useQuality.getState().settings
    const set = new BlockSet()
    buildTerrain(set, { treeDensity: decorDensity })
    const propBuilder = new PropBuilder()
    buildPads(set, propBuilder)
    buildShop(set, { detail: decorDensity >= 0.75 })
    buildRollZone(set, propBuilder, { detail: decorDensity >= 0.75 })
    buildPortalFrame(set)
    buildWaterfall(set)
    buildEggStands(set)

    const map = createGroundMap(maxTexture)
    const groundMaterial = createToyMaterial({ instanced: false, vertexColors: false, map, studScale: 2 })

    performance.mark('pp:world-end')
    return {
      blocks: set.build(sharedMaterials().blocks),
      props: asToyInstance(propBuilder.build(), sharedMaterials().toy),
      ground: { geometry: createGroundGeometry(), material: groundMaterial, map },
    }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(blocks)
      props.geometry.dispose()
      props.dispose()
      ground.geometry.dispose()
      ground.material.dispose()
      ground.map.dispose()
    },
    [blocks, ground, props],
  )

  return (
    <>
      <mesh geometry={ground.geometry} material={ground.material} receiveShadow={shadows} />
      <primitive object={blocks} castShadow={shadows} receiveShadow={shadows} />
      <primitive object={props} castShadow={shadows} receiveShadow={shadows} />
      {signs.map((sign) => (
        <mesh key={sign.texture.uuid} geometry={sign.geometry} material={sign.material} position={sign.position} rotation={sign.rotation} renderOrder={1} />
      ))}
    </>
  )
}

export default World
