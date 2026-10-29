import { useSyncExternalStore } from 'react'
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderTarget } from 'three'

import { asToyInstance } from '../blocks'
import { sharedMaterials } from '../materials'
import { petGeometry } from './petModels'

/**
 * Pet portraits for the UI, rendered from the same voxel models the world uses, so a
 * pet looks identical in the inventory and following you around.
 *
 * Rendered on demand into a small offscreen target with the game's own renderer (a
 * couple per frame at most), read back once, and kept as PNG data URLs. No image
 * assets to download, and nothing is rendered twice.
 */

const SIZE = 128
const urls = new Map()
const queue = []
const listeners = new Set()
let renderer = null
let rig = null
let notifyScheduled = false
const _previousClear = new Color()

/** linear -> sRGB byte lookup: render targets come back in linear light. */
const TO_SRGB = new Uint8Array(256)
for (let i = 0; i < 256; i += 1) {
  const c = i / 255
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  TO_SRGB[i] = Math.round(Math.min(1, Math.max(0, s)) * 255)
}

function buildRig() {
  const scene = new Scene()
  scene.add(new HemisphereLight('#ffffff', '#b9cba6', 2.3))
  const sun = new DirectionalLight('#fff6e8', 1.6)
  sun.position.set(2, 4, 3)
  scene.add(sun)
  const camera = new PerspectiveCamera(26, 1, 0.1, 50)
  camera.position.set(1.55, 1.45, 3.3)
  camera.lookAt(0, 0.66, 0)
  const target = new WebGLRenderTarget(SIZE, SIZE, { samples: 4 })
  const mesh = asToyInstance(petGeometry('cat'), sharedMaterials().toy)
  scene.add(mesh)
  return { scene, camera, target, mesh, pixels: new Uint8Array(SIZE * SIZE * 4) }
}

function render(id) {
  rig.mesh.geometry = petGeometry(id)
  const previousTarget = renderer.getRenderTarget()
  const previousClear = renderer.getClearColor(_previousClear)
  const previousAlpha = renderer.getClearAlpha()
  renderer.setRenderTarget(rig.target)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(rig.scene, rig.camera)
  renderer.readRenderTargetPixels(rig.target, 0, 0, SIZE, SIZE, rig.pixels)
  renderer.setRenderTarget(previousTarget)
  renderer.setClearColor(previousClear, previousAlpha)

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(SIZE, SIZE)
  const src = rig.pixels
  // GL rows run bottom-up; MSAA edges come back premultiplied.
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const from = ((SIZE - 1 - y) * SIZE + x) * 4
      const to = (y * SIZE + x) * 4
      const a = src[from + 3]
      const k = a > 0 ? 255 / a : 0
      image.data[to] = TO_SRGB[Math.min(255, Math.round(src[from] * k))]
      image.data[to + 1] = TO_SRGB[Math.min(255, Math.round(src[from + 1] * k))]
      image.data[to + 2] = TO_SRGB[Math.min(255, Math.round(src[from + 2] * k))]
      image.data[to + 3] = a
    }
  }
  ctx.putImageData(image, 0, 0)
  urls.set(id, canvas.toDataURL('image/png'))
}

/** Called once the renderer exists (from inside the Canvas). */
export function attachIconRenderer(gl) {
  renderer = gl
  // Built here, at set-up, so the frame loop that renders portraits never allocates.
  rig ||= buildRig()
}

/** Renders up to `max` queued portraits. Runs in the frame loop; no React state. */
export function processIconQueue(max = 2) {
  if (!renderer || !rig || queue.length === 0) return
  for (let i = 0; i < max && queue.length; i += 1) render(queue.shift())
  // Re-render the portraits' React components after the frame, not inside it.
  if (notifyScheduled) return
  notifyScheduled = true
  setTimeout(() => {
    notifyScheduled = false
    for (const fn of listeners) fn()
  }, 0)
}

function request(id) {
  if (!id || urls.has(id) || queue.includes(id)) return
  queue.push(id)
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Portrait URL for a pet species; null until it has been rendered. */
export function usePetIcon(id) {
  request(id)
  return useSyncExternalStore(subscribe, () => urls.get(id) ?? null)
}
