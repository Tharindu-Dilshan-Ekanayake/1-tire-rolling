import { CanvasTexture, LinearMipmapLinearFilter, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'

import { SHOP_BOARD, SLIDE_ZONE } from '@shared/world'

import { ARCH_SIGN } from './slideZone'

const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'

/**
 * Big chunky lettering painted on a textured quad, slanted by shear (the font has no
 * italic face): a solid extruded edge in `edge` under a thick dark outline, the face
 * filled with a top-to-bottom gradient of `fill` stops, and a glossy band across the
 * top of each letter. Every painted sign shares one material setup, so one shader
 * program.
 */
function paintText(text, maxTexture, { aspect, fill, edge, slant = 0.22, worldWidth }) {
  const width = Math.min(1024, maxTexture)
  const height = Math.round(width * aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // As tall as the canvas allows, shrunk if needed so the outline and slant still fit.
  ctx.font = `100px ${FONT}`
  const size = Math.min(height * 0.7, (100 * width * 0.95) / (ctx.measureText(text).width * (1 + slant * 0.5)))
  const x = width / 2
  const y = height * 0.46
  const depth = size * 0.1
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.setTransform(1, 0, -slant, 1, height * slant * 0.55, 0)

  // The extruded edge: the outlined letters stacked downwards, darkest at the back.
  ctx.lineWidth = size * 0.22
  ctx.strokeStyle = '#10142a'
  ctx.fillStyle = edge
  for (let i = depth; i > 0; i -= Math.max(1, depth / 8)) {
    ctx.strokeText(text, x, y + i)
    ctx.fillText(text, x, y + i)
  }
  // Outline and face.
  ctx.strokeText(text, x, y)
  const gradient = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45)
  fill.forEach((stop, i) => gradient.addColorStop(i / (fill.length - 1), stop))
  ctx.fillStyle = gradient
  ctx.fillText(text, x, y)
  // Gloss on the upper part of the letters only (drawn onto what's already there).
  ctx.globalCompositeOperation = 'source-atop'
  const gloss = ctx.createLinearGradient(0, y - size * 0.45, 0, y)
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.fillRect(-width, y - size * 0.45, width * 3, size * 0.4)
  ctx.globalCompositeOperation = 'source-over'

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const geometry = new PlaneGeometry(worldWidth, worldWidth * aspect)
  return { geometry, material, texture }
}

/**
 * The painted signs, drawn once the font has loaded: "SLIDE ZONE" across the strip at
 * the top of the hill, "SLIDE!" on the start arch and "BOARDS" on the shop's sign. Each
 * sits a couple of centimetres proud of what it's painted on, so it can't sink into it.
 *
 * @param {number} maxTexture texture size cap for the preset
 * @returns {Promise<Array<{ geometry, material, texture, position: number[], rotation: number[] }>>}
 */
export async function createPaintedSigns(maxTexture) {
  await document.fonts?.load(`64px ${FONT}`).catch(() => null)

  const zoneWidth = SLIDE_ZONE.maxX - SLIDE_ZONE.minX - 5
  const zone = paintText('SLIDE ZONE', maxTexture, {
    aspect: 0.24,
    fill: ['#ffffff', '#ffffff', '#e6ecf5'],
    edge: '#9aa6b8',
    worldWidth: zoneWidth,
  })
  // Just above the strip's raised yellow fill (its top is 0.1 up), read from the plaza.
  zone.position = [0, 0.13, (SLIDE_ZONE.minZ + SLIDE_ZONE.maxZ) / 2 + 0.3]
  zone.rotation = [-Math.PI / 2, 0, 0]

  const boardWidth = SHOP_BOARD.maxZ - SHOP_BOARD.minZ - 3
  const board = paintText('BOARDS', maxTexture, {
    aspect: 0.26,
    fill: ['#fffbd0', '#ffd21f', '#ff8a00'],
    edge: '#c2410c',
    slant: 0.14,
    worldWidth: boardWidth,
  })
  // On the board's navy face (0.4 west of its centre line), turned to the plaza.
  board.position = [SHOP_BOARD.x - 0.43, SHOP_BOARD.top - 4.1, (SHOP_BOARD.minZ + SHOP_BOARD.maxZ) / 2]
  board.rotation = [0, -Math.PI / 2, 0]

  const arch = paintText('SLIDE!', maxTexture, {
    aspect: 0.3,
    fill: ['#fffbd0', '#ffd21f', '#ff8a00'],
    edge: '#c2410c',
    slant: 0.14,
    worldWidth: ARCH_SIGN.width - 0.3,
  })
  arch.position = [0, ARCH_SIGN.y, ARCH_SIGN.faceZ + 0.03]
  arch.rotation = [0, 0, 0]

  return [zone, board, arch]
}
