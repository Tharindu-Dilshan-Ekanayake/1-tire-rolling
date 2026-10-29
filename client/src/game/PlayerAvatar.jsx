import { useFrame, useLoader } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, MeshLambertMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import {
  assetUrls,
  BASE_BODY_URL,
  isRealId,
  PART_SLOTS,
  skinCompositeUrl,
  skinIdOrDefault,
} from '../bloxity/avatarAssets'
import { loadOBJ, loadPartGLB, loadTexture } from '../bloxity/avatarLoader'
import { useBloxity } from '../bloxity/BloxityContext'
import { shareLook } from '../net/connection'
import {
  animateRig,
  applyPart,
  applyProportions,
  applySkin,
  attachAccessory,
  collectRig,
  disposeMergedBody,
  mergeBody,
  placeHand,
} from './avatarRig'

/**
 * Keeps the avatar breathing when it is rendered outside the game (a menu preview,
 * say) with no physics body feeding it motion.
 */
const _idleMotion = { time: 0, speed: 0, grounded: true, maxSpeed: 6 }
function fallbackMotion(delta) {
  _idleMotion.time += delta
  return _idleMotion
}

/**
 * A Bloxity avatar wearing `equipped` with `proportions`, assembled at runtime: yours,
 * or another player's from what the server tells us they wear.
 *
 * `player.glb` is the base humanoid rig: six skinned meshes (head, torso, two arms,
 * two legs) sharing one skeleton. Assembly means, per equipped slot:
 *   - body parts  -> swap the matching mesh's geometry
 *   - hat / back  -> attach an OBJ to the Neck1 / Spine2 bone
 *   - skin        -> set one texture as the map on every skinned mesh
 * then the six parts are merged into one skinned mesh, so a whole character is a
 * single draw call (plus one per hat or back item).
 *
 * Any slot that is unequipped or 404s leaves the base body's own part in place. The
 * whole thing re-assembles when `equipped` changes.
 *
 * @param {{ equipped?: object, proportions?: object, onReady?: () => void,
 *   onStep?: (text: string) => void, targetHeight?: number, motionRef?: object,
 *   handRef?: object }} props
 *   `targetHeight` is the world-space height to fit the avatar into, in the game's
 *   own units: Bloxity authors the rig ~6.4 units tall with the feet at y=0, far bigger
 *   than the game's metric scale, so the model is measured and rescaled. `handRef` is
 *   an object beside the avatar that gets moved onto the right palm every frame, for
 *   anything held. `onStep` reports loading progress.
 */
export const BloxityAvatar = forwardRef(function BloxityAvatar(
  { equipped, proportions, onReady, onStep, targetHeight = 1.8, motionRef, handRef, ...props },
  ref,
) {
  // three's own GLTFLoader (the one the cosmetics use too), not drei's useGLTF, which
  // would bundle a second loader plus Draco/Meshopt/KTX2 decoders this GLB never needs.
  const { scene: baseScene } = useLoader(GLTFLoader, BASE_BODY_URL)
  const [assembled, setAssembled] = useState(false)
  /** The merged body currently shown; replaced on every re-assembly. */
  const bodyRef = useRef(null)

  // The GLTF cache hands back one shared scene. Clone via SkeletonUtils so this
  // instance gets an independent, still-working skeleton.
  const character = useMemo(() => cloneSkeleton(baseScene), [baseScene])

  // Rig lookup tables (bones, part meshes, pristine geometries) built once per clone.
  const rig = useMemo(() => {
    const collected = collectRig(character)

    // The base body ships with an empty texture; give every skinned mesh its own
    // material instance so a skin swap here can't leak into another avatar.
    for (const mesh of collected.skinnedMeshes) {
      // Lambert: these settings made Standard look matte anyway, and Lambert is far
      // cheaper to compile and to shade.
      mesh.material = new MeshLambertMaterial({ color: 0xffffff })
    }

    if (!collected.skeleton) {
      console.warn('[bloxity] player.glb has no skeleton - avatar will not deform')
    }
    return collected
  }, [character])

  // Measured once, from the bind pose, before proportions touch the root scale.
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(character)
    const size = box.getSize(new Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return { scale: 1, footOffset: 0 }
    const scale = targetHeight / size.y
    // The rig's feet sit at its bbox minimum; drop the group so they land on y=0
    // of the parent (which Player positions at the bottom of the capsule).
    return { scale, footOffset: -box.min.y * scale }
  }, [character, targetHeight])

  // --- Assemble equipped cosmetics --------------------------------------------
  useEffect(() => {
    let cancelled = false
    const holder = bodyRef
    // Accessories are re-attached on every rebuild; track them so the previous
    // hat/back can be removed rather than stacking up.
    const attached = []

    onStep?.('Loading avatar…')

    const jobs = []

    // Skin always loads - "0" is the fallback, since the base body has no baked map.
    // With a face, shirt or pants worn it's the server-composited version; if that
    // can't be fetched, the bare skin is better than an untextured body.
    const compositeUrl = skinCompositeUrl(equipped)
    const plainSkinUrl = assetUrls.skinTexture(skinIdOrDefault(equipped?.skinId))
    jobs.push(
      (compositeUrl ? loadTexture(compositeUrl) : Promise.resolve(null))
        .then((texture) => texture || loadTexture(plainSkinUrl))
        .then((texture) => ({ kind: 'skin', texture })),
    )

    // Body parts: fetch only real ids; a missing slot resets to the base geometry.
    for (const [slot, cfg] of Object.entries(PART_SLOTS)) {
      const id = equipped?.[cfg.idKey]
      if (!isRealId(id)) {
        jobs.push(Promise.resolve({ kind: 'part', slot, scene: null }))
        continue
      }
      jobs.push(
        loadPartGLB(assetUrls.part(slot, id)).then((scene) => ({
          kind: 'part',
          slot,
          scene,
        })),
      )
    }

    // Accessories.
    for (const [kind, idKey, meshUrl, texUrl] of [
      ['hat', 'hatId', assetUrls.hatMesh, assetUrls.hatTexture],
      ['back', 'backId', assetUrls.backMesh, assetUrls.backTexture],
    ]) {
      const id = equipped?.[idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(meshUrl(id)), loadTexture(texUrl(id))]).then(
          ([object, texture]) => ({ kind: 'accessory', accessory: kind, object, texture }),
        ),
      )
    }

    Promise.all(jobs)
      .then((results) => {
        if (cancelled) return

        for (const result of results) {
          // One bad slot must not take the rest of the character down.
          try {
            if (result.kind === 'skin') {
              applySkin(rig, result.texture)
            } else if (result.kind === 'part') {
              applyPart(rig, result.slot, result.scene)
            } else if (result.kind === 'accessory' && result.object) {
              if (result.texture) {
                result.object.traverse((child) => {
                  if (child.isMesh) {
                    child.material = new MeshLambertMaterial({ map: result.texture })
                  }
                })
              }
              const added = attachAccessory(rig, result.accessory, result.object)
              if (added) attached.push(added)
            }
          } catch (err) {
            console.warn(`[bloxity] failed to apply ${result.kind}`, err)
          }
        }

        // One draw call for the body: merge the assembled parts.
        try {
          disposeMergedBody(holder.current)
          holder.current = mergeBody(rig)
        } catch (err) {
          console.warn('[bloxity] could not merge the body; drawing its parts', err)
          for (const mesh of rig.skinnedMeshes) mesh.visible = true
        }
        setAssembled(true)
      })
      .catch((err) => {
        console.warn('[bloxity] avatar assembly failed; showing base body', err)
        if (!cancelled) setAssembled(true)
      })

    return () => {
      cancelled = true
      for (const object of attached) {
        object.parent?.remove(object)
        object.traverse((child) => {
          child.geometry?.dispose()
          if (child.isMesh) child.material?.dispose()
        })
      }
    }
  }, [rig, equipped, onStep])

  // Frees what this avatar made when it goes (other players come and go). Loaded
  // part scenes and textures are shared through the loader cache, so they stay.
  useEffect(() => {
    const holder = bodyRef
    return () => {
      disposeMergedBody(holder.current)
      holder.current = null
      for (const mesh of rig.skinnedMeshes) mesh.material.dispose()
      for (const geometry of Object.values(rig.originalGeometries)) geometry.dispose()
    }
  }, [rig])

  // --- Proportions and pose -----------------------------------------------------
  // Applied per frame rather than in an effect: every bone is reset to its rest pose
  // and re-scaled each pass, which keeps it idempotent and survives anything else
  // that touches the skeleton.
  const proportionsRef = useRef(proportions)
  proportionsRef.current = proportions

  useFrame((_state, delta) => {
    try {
      // Order matters: proportions reset every bone to its rest pose, and the
      // animation then rotates on top of that clean base.
      applyProportions(rig, proportionsRef.current)
      animateRig(rig, motionRef?.current ?? fallbackMotion(delta), 1 / fit.scale)
      if (handRef?.current) placeHand(rig, handRef.current)
    } catch {
      // A malformed payload must not kill the render loop.
    }
  })

  // Signal readiness only once the model is actually standing there.
  useEffect(() => {
    if (assembled) onReady?.()
  }, [assembled, onReady])

  return (
    <group ref={ref} {...props}>
      {/* Fit scale lives on this wrapper, not on `character` - applyProportions
          overwrites the character's own scale every frame. */}
      <group scale={fit.scale} position={[0, fit.footOffset, 0]}>
        <primitive object={character} />
      </group>
    </group>
  )
})

/**
 * Your own avatar: whatever your Bloxity account (or guest) is wearing. Also tells the
 * other players, so they see you dressed the same.
 */
export const PlayerAvatar = forwardRef(function PlayerAvatar(props, ref) {
  const { avatar, proportions, game } = useBloxity()
  useEffect(() => shareLook(avatar, proportions), [avatar, proportions])
  return <BloxityAvatar ref={ref} {...props} equipped={avatar} proportions={proportions} onStep={game.loadingStep} />
})

useLoader.preload(GLTFLoader, BASE_BODY_URL)

export default PlayerAvatar
