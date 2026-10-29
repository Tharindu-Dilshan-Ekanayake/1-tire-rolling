import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { createGlowInstances, disposeGlow, glowTime } from './glow'

/**
 * Boards: the sleds every player slides down the hill on.
 *
 * One sled mesh for all of them. Each board's look - base colour, accent colour and one
 * of twenty deck designs - is per instance, and the designs are drawn in the fragment
 * shader. So every board in the game shares one geometry, one material and one compiled
 * shader program, and a shelf of twenty different boards is a single draw call.
 *
 * Local frame: the deck lies in XZ, top up (+Y), the nose curling up at -Z (down the
 * hill, when the board is unrotated), runners on y = 0. About 0.9 wide and 2 long.
 */

/**
 * Looks by board id (ids and stats live in shared/balance.js). `design` picks the deck
 * pattern (see DESIGN_GLSL), `accent` colours it and the rails, `glow` is the halo the
 * board carries on display and while sliding.
 */
export const BOARD_STYLES = {
  wood: { color: '#d69a5a', accent: '#8a5530', glow: '#ffd08a', design: 0 },
  sky: { color: '#7fd0ff', accent: '#ffffff', glow: '#4fc3ff', design: 1 },
  sunny: { color: '#ffd84a', accent: '#ff7a1e', glow: '#ffe066', design: 2 },
  cherry: { color: '#ff4d6d', accent: '#ffffff', glow: '#ff7a8f', design: 3 },
  racer: { color: '#ff3b3b', accent: '#ffffff', glow: '#ff5a3b', design: 4 },
  wave: { color: '#1f6fe0', accent: '#7ff0ff', glow: '#2fa8ff', design: 5 },
  jungle: { color: '#3ccf4e', accent: '#1c6b2a', glow: '#5cff6a', design: 6 },
  royal: { color: '#8a3ee8', accent: '#ffd21f', glow: '#c77dff', design: 7 },
  crystal: { color: '#9ff6ff', accent: '#ffffff', glow: '#7ff6ff', design: 8 },
  golden: { color: '#ffc61a', accent: '#fff3b0', glow: '#ffd21f', design: 9 },
  candy: { color: '#ff8fd0', accent: '#ffffff', glow: '#ff7ad9', design: 10 },
  ice: { color: '#c9f3ff', accent: '#3f9cff', glow: '#9fe8ff', design: 11 },
  lava: { color: '#3a1410', accent: '#ff6a1e', glow: '#ff4a1c', design: 12 },
  thunder: { color: '#2b2f8f', accent: '#ffe14a', glow: '#ffe14a', design: 13 },
  neon: { color: '#16161f', accent: '#39ff88', glow: '#39ff88', design: 14 },
  galaxy: { color: '#2a1450', accent: '#ffffff', glow: '#a46bff', design: 15 },
  dragon: { color: '#1f8a4a', accent: '#ffd21f', glow: '#4cff7a', design: 16 },
  rainbow: { color: '#ffffff', accent: '#ffffff', glow: '#ff7ad9', design: 17 },
  diamond: { color: '#d9f7ff', accent: '#5fc8ff', glow: '#bff4ff', design: 18 },
  cosmic: { color: '#120a2a', accent: '#ff5bd8', glow: '#ff5bd8', design: 19 },
}

// Parsed once, so frame code can look colours up without allocating.
const parse = (key) => Object.fromEntries(Object.entries(BOARD_STYLES).map(([id, s]) => [id, new Color(s[key])]))
const COLORS = parse('color')
const ACCENTS = parse('accent')
const GLOWS = parse('glow')

export const boardColor = (id) => COLORS[id] || COLORS.wood
export const boardAccent = (id) => ACCENTS[id] || ACCENTS.wood
export const boardGlow = (id) => GLOWS[id] || GLOWS.wood
export const boardDesign = (id) => (BOARD_STYLES[id] || BOARD_STYLES.wood).design

// --- Geometry ------------------------------------------------------------------------

/** The deck: half its width, its thickness, and the runners it sits on. */
const HALF_W = 0.45
const THICK = 0.08
const RUNNER = 0.04
/** The flat of the deck runs from the tail (z = TAIL) forward FLAT metres; then it curls up. */
const TAIL = 0.95
const FLAT = 1.4
const CURL = 0.62
const CURL_RADIUS = 0.55
/** Rounded corners at both ends, and the stretch the deck design covers. */
const CORNER = 0.22
const DECK_FRONT = TAIL - FLAT - 0.25
const DECK_BACK = TAIL

/** The deck's centreline `s` metres from the tail: [y, z, angle up from flat]. */
function spine(s) {
  if (s <= FLAT) return [RUNNER + THICK / 2, TAIL - s, 0]
  const a = (s - FLAT) / CURL_RADIUS
  return [RUNNER + THICK / 2 + CURL_RADIUS * (1 - Math.cos(a)), TAIL - FLAT - CURL_RADIUS * Math.sin(a), a]
}

/** Half the deck's width `s` metres from the tail, rounded off at both ends. */
function halfWidth(s, length) {
  const end = Math.min(s, length - s)
  if (end >= CORNER) return HALF_W
  const d = CORNER - end
  return HALF_W - CORNER + Math.sqrt(Math.max(0, CORNER * CORNER - d * d))
}

/**
 * The deck, lofted along its spine: a slab whose every cross-section is a flat top and
 * bottom with half-round edges, running flat and then curling up into the nose, with
 * rounded corners and capped ends. Smooth normals, indexed.
 */
function deckGeometry() {
  const length = FLAT + CURL
  const rows = 16
  const r = THICK / 2
  // Round the edge: the right half-round, then the left one.
  const ring = []
  for (let i = 0; i <= 4; i += 1) ring.push([1, -Math.PI / 2 + (i / 4) * Math.PI])
  for (let i = 0; i <= 4; i += 1) ring.push([-1, Math.PI / 2 + (i / 4) * Math.PI])
  const n = ring.length
  const pos = []
  const nrm = []
  const idx = []
  for (let j = 0; j <= rows; j += 1) {
    const s = (j / rows) * length
    const [y, z, a] = spine(s)
    const hw = halfWidth(s, length)
    // The cross-section's "up" tips back with the curl.
    const uy = Math.cos(a)
    const uz = Math.sin(a)
    for (const [side, ang] of ring) {
      const py = Math.sin(ang) * r
      pos.push(side * (hw - r) + Math.cos(ang) * r, y + py * uy, z + py * uz)
      nrm.push(Math.cos(ang), Math.sin(ang) * uy, Math.sin(ang) * uz)
    }
  }
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * n + i
      const b = j * n + ((i + 1) % n)
      idx.push(a, a + n, b, b, a + n, b + n)
    }
  }
  // End caps: a fan from the middle of the first and the last cross-section, facing out.
  for (const [j, out] of [
    [0, 1],
    [rows, -1],
  ]) {
    const [y, z, a] = spine((j / rows) * length)
    const ty = -Math.sin(a) * out
    const tz = Math.cos(a) * out
    const centre = pos.length / 3
    pos.push(0, y, z)
    nrm.push(0, ty, tz)
    for (let i = 0; i < n; i += 1) {
      const k = (j * n + i) * 3
      pos.push(pos[k], pos[k + 1], pos[k + 2])
      nrm.push(0, ty, tz)
    }
    for (let i = 0; i < n; i += 1) {
      const a1 = centre + 1 + i
      const b1 = centre + 1 + ((i + 1) % n)
      // The ring runs anticlockwise seen from behind the tail, clockwise from the nose.
      if (out > 0) idx.push(centre, a1, b1)
      else idx.push(centre, b1, a1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  g.setIndex(idx)
  return g
}

/** A tube through `points` ([x, y, z]), for the rails and the handlebar. */
function tube(points, radius, segments) {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)))
  const g = new TubeGeometry(curve, segments, radius, 6, false)
  g.deleteAttribute('uv')
  return g
}

/** Tags every vertex of `g` as part 0 (the board's colour, and its design) or 1 (accent). */
function tagged(g, part) {
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(part), 1))
  return g
}

let baseGeometry = null
/**
 * The sled: the curled deck in the board's colour; in its accent, tube rails along both
 * edges that follow the curl up into a handlebar across the nose, and two runners
 * underneath. About 600 triangles, shared by every board.
 */
function boardBaseGeometry() {
  if (baseGeometry) return baseGeometry
  const length = FLAT + CURL
  // Rails ride just above the deck's top edges, tipping up with the curl.
  const lift = THICK / 2 + 0.035
  const rail = (side) =>
    [0.12, 0.5, 0.9, FLAT - 0.05, FLAT + 0.2, FLAT + 0.42].map((s) => {
      const [y, z, a] = spine(s)
      return [side * (halfWidth(s, length) - 0.05), y + lift * Math.cos(a), z + lift * Math.sin(a)]
    })
  const left = rail(-1)
  const tip = left[left.length - 1]
  const runner = (side) => {
    const g = new BoxGeometry(0.06, RUNNER, FLAT - 0.15)
    g.deleteAttribute('uv')
    g.translate(side * (HALF_W - 0.12), RUNNER / 2, TAIL - (FLAT - 0.15) / 2 - 0.05)
    return g
  }
  const pieces = [
    tagged(deckGeometry(), 0),
    tagged(tube(left, 0.035, 12), 1),
    tagged(tube(rail(1), 0.035, 12), 1),
    tagged(tube([tip, [0, tip[1] + 0.05, tip[2] - 0.03], [-tip[0], tip[1], tip[2]]], 0.035, 6), 1),
    tagged(runner(-1), 1),
    tagged(runner(1), 1),
  ]
  baseGeometry = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  baseGeometry.computeBoundingSphere()
  return baseGeometry
}

// --- Material ------------------------------------------------------------------------

const vertexHead = /* glsl */ `
  attribute vec3 aAccent;
  attribute float aDesign;
  attribute float aPart;
  varying vec3 vBLocal;
  varying vec3 vBAccent;
  varying float vBDesign;
  varying float vBUp;
  varying float vBPart;
`

const vertexBody = /* glsl */ `
  vBLocal = position;
  vBUp = normal.y;
  vBAccent = aAccent;
  vBDesign = aDesign;
  vBPart = aPart;
`

const fragmentHead = /* glsl */ `
  varying vec3 vBLocal;
  varying vec3 vBAccent;
  varying float vBDesign;
  varying float vBUp;
  varying float vBPart;
  uniform float uBTime;

  const float TAU = 6.2831853;
  float bTop = 0.0;

  // Anti-aliased band between radii a and b.
  float bBand(float r, float a, float b, float w) {
    return smoothstep(a - w, a + w, r) * (1.0 - smoothstep(b - w, b + w, r));
  }
  float bCore(float r, float a, float w) {
    return 1.0 - smoothstep(a - w, a + w, r);
  }
  // 'count' round dots spaced around the ring at radius 'ring'.
  float bDots(float r, float ang, float ring, float count, float size, float phase) {
    float cell = fract(ang / TAU * count + phase) - 0.5;
    vec2 p = vec2(cell * TAU * ring / count, r - ring);
    return 1.0 - smoothstep(size * 0.85, size, length(p));
  }
  float bHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  // 1 inside an n-pointed star between radii inner and outer.
  float bStar(float r, float ang, float n, float inner, float outer, float w) {
    float k = abs(fract(ang / TAU * n) - 0.5) * 2.0;
    float edge = mix(outer, inner, k);
    return 1.0 - smoothstep(edge - w, edge + w, r);
  }
`

/**
 * The twenty deck designs, chosen per instance by vBDesign. Drawn in deck space: `q`
 * runs -1..1 across the deck and nose to tail, `P` is the same at half scale.
 */
const DESIGN_GLSL = /* glsl */ `
  {
    vec2 q = vec2(vBLocal.x / ${HALF_W.toFixed(2)}, (vBLocal.z - ${((DECK_FRONT + DECK_BACK) / 2).toFixed(2)}) / ${((DECK_BACK - DECK_FRONT) / 2).toFixed(2)});
    vec2 P = q * 0.5;
    float r = length(q);
    float ang = atan(q.y, q.x);
    float w = max(fwidth(r), 0.004);
    float d = vBDesign + 0.5;
    float m = 0.0;
    vec3 tint = vBAccent;
    if (d < 1.0) {
      // Wood: planks with dark seams and a little grain.
      float plank = abs(fract(q.x * 1.5 + 0.5) - 0.5);
      m = (1.0 - smoothstep(0.03, 0.06, plank)) * 0.8 + step(0.8, fract(q.y * 6.0 + bHash(vec2(floor(q.x * 1.5), 1.0)))) * 0.15;
    } else if (d < 2.0) {
      // Sky: a ring of puffy dots around a ring.
      m = bDots(r, ang, 0.66, 10.0, 0.11, 0.0) + bBand(r, 0.3, 0.36, w);
    } else if (d < 3.0) {
      // Sunny: sun and rays.
      float rays = step(0.5, fract(ang / TAU * 12.0));
      m = bCore(r, 0.28, w) + rays * bBand(r, 0.38, 0.88, w);
    } else if (d < 4.0) {
      // Cherry: cherries in two rings round a centre.
      m = bDots(r, ang, 0.34, 5.0, 0.1, 0.1) + bDots(r, ang, 0.68, 9.0, 0.1, 0.0) + bCore(r, 0.1, w);
    } else if (d < 5.0) {
      // Racer: twin racing stripes nose to tail.
      float x = abs(q.x);
      m = bBand(x, 0.12, 0.3, max(fwidth(x), 0.004)) + bBand(x, 0.42, 0.5, max(fwidth(x), 0.004));
    } else if (d < 6.0) {
      // Wave: a three-arm swirl.
      m = step(0.5, fract(ang / TAU * 3.0 + r * 1.8)) * smoothstep(0.1, 0.16, r);
    } else if (d < 7.0) {
      // Jungle: leafy spots on three rings.
      m = bDots(r, ang, 0.28, 5.0, 0.09, 0.3) + bDots(r, ang, 0.55, 8.0, 0.12, 0.1) + bDots(r, ang, 0.8, 12.0, 0.08, 0.5);
    } else if (d < 8.0) {
      // Royal: a gold star in a gold ring.
      m = bStar(r, ang + 1.5708, 5.0, 0.3, 0.68, w) + bBand(r, 0.8, 0.88, w);
    } else if (d < 9.0) {
      // Crystal: an eight-point snowflake star.
      m = bStar(r, ang, 8.0, 0.22, 0.92, w) * (1.0 - bCore(r, 0.1, w)) + bBand(r, 0.42, 0.47, w);
    } else if (d < 10.0) {
      // Golden: a sunburst with a bright hub.
      float rays = step(0.5, fract(ang / TAU * 16.0));
      m = rays * bBand(r, 0.3, 0.9, w) + bBand(r, 0.1, 0.2, w);
    } else if (d < 11.0) {
      // Candy: a lollipop swirl.
      m = step(0.5, fract(ang / TAU * 6.0 + r * 2.2)) * smoothstep(0.08, 0.12, r);
    } else if (d < 12.0) {
      // Ice: icicles in from the edge round a frosty hub.
      m = bStar(r, ang, 12.0, 0.58, 0.95, w) * smoothstep(0.5, 0.56, r) + bCore(r, 0.2, w) + bBand(r, 0.34, 0.38, w);
    } else if (d < 13.0) {
      // Lava: flames flickering round a molten core.
      float flick = 0.08 * sin(uBTime * 4.0 + ang * 7.0);
      m = (1.0 - bStar(r, ang, 7.0, 0.42 + flick, 0.82, w)) * smoothstep(0.3, 0.36, r) * (1.0 - smoothstep(0.93, 0.96, r)) + bCore(r, 0.18, w);
    } else if (d < 14.0) {
      // Thunder: a lightning bolt down the deck, inside a ring.
      float zig = q.x + 0.32 * (abs(fract(q.y * 1.4 + 0.25) - 0.5) * 4.0 - 1.0);
      m = (1.0 - smoothstep(0.11, 0.14, abs(zig))) * (1.0 - smoothstep(0.76, 0.8, abs(q.y))) + bBand(r, 0.86, 0.92, w);
    } else if (d < 15.0) {
      // Neon: glowing rings with a pulse running outwards.
      float pulse = 0.5 + 0.5 * sin(uBTime * 3.0 - r * 9.0);
      m = (bBand(r, 0.18, 0.22, w) + bBand(r, 0.38, 0.42, w) + bBand(r, 0.58, 0.62, w) + bBand(r, 0.78, 0.82, w)) * (0.55 + 0.45 * pulse);
    } else if (d < 16.0) {
      // Galaxy: a two-arm spiral sprinkled with stars.
      float arms = step(0.62, fract(ang / TAU * 2.0 + r * 1.3)) * smoothstep(0.12, 0.2, r) * 0.55;
      float stars = step(0.93, bHash(floor(P * 70.0)));
      m = max(arms, stars) + bCore(r, 0.1, w);
    } else if (d < 17.0) {
      // Dragon: rows of golden scales round a dragon's eye.
      m = bDots(r, ang, 0.36, 7.0, 0.1, 0.0) + bDots(r, ang, 0.56, 11.0, 0.1, 0.5) + bDots(r, ang, 0.76, 15.0, 0.1, 0.0) + bCore(r, 0.14, w);
    } else if (d < 18.0) {
      // Rainbow: bands of every colour.
      m = 1.0;
      tint = 0.5 + 0.5 * cos(TAU * (q.y * 0.6 + vec3(0.0, 0.33, 0.67)));
    } else if (d < 19.0) {
      // Diamond: cut facets round a bright table.
      m = mix(0.45, 1.0, step(0.5, fract(ang / TAU * 12.0))) * bBand(r, 0.3, 0.92, w) + bCore(r, 0.24, w);
    } else {
      // Cosmic: a four-point star in shifting colours over a starfield.
      float stars = step(0.94, bHash(floor(P * 60.0)));
      m = max(bStar(r, ang, 4.0, 0.14, 0.82, w), stars) + bBand(r, 0.88, 0.93, w);
      tint = 0.5 + 0.5 * cos(TAU * (ang / TAU + uBTime * 0.15 + vec3(0.0, 0.33, 0.67)));
    }
    // The design goes on the deck's top only; rails and trim are in the accent colour,
    // and a pinstripe in it runs round the deck's edge.
    float top = step(vBPart, 0.5) * smoothstep(0.6, 0.85, vBUp);
    bTop = top;
    float mask = clamp(m, 0.0, 1.0) * top;
    vec3 col = mix(diffuseColor.rgb, tint, mask);
    float ex = abs(vBLocal.x) / ${HALF_W.toFixed(2)};
    float pin = smoothstep(0.8, 0.83, ex) * (1.0 - smoothstep(0.87, 0.9, ex));
    col = mix(col, vBAccent, pin * top * 0.9);
    col = mix(col, vBAccent, step(0.5, vBPart));
    // Lighter down the middle, the underside and edges a shade darker.
    col *= mix(1.06, 0.92, clamp(abs(q.x), 0.0, 1.0)) * mix(0.78, 1.0, smoothstep(-0.2, 0.4, vBUp));
    // The best of each shelf catch a sweeping shine; Crystal and Diamond shimmer.
    float sweep = 1.0 - smoothstep(0.0, 0.07, abs(fract((vBLocal.x + vBLocal.z) * 0.6 - uBTime * 0.45) - 0.5));
    if ((d > 7.0 && d < 10.0) || d > 15.0) col += vec3(0.5) * sweep * top;
    if ((d > 8.0 && d < 9.0) || (d > 18.0 && d < 19.0)) col += 0.22 * (0.5 + 0.5 * cos(TAU * (r * 1.4 + ang / TAU + uBTime * 0.2 + vec3(0.0, 0.33, 0.67)))) * top;
    diffuseColor.rgb = col;
    totalEmissiveRadiance += tint * mask * (d > 14.0 && d < 15.0 ? 0.8 : 0.3);
  }
`

/** Glossy lacquer, after lighting: a fixed highlight and a rim light. */
const SHINE_GLSL = /* glsl */ `
  {
    vec3 bV = normalize(vViewPosition);
    vec3 bN = normalize(normal);
    if (dot(bN, bV) < 0.0) bN = -bN;
    vec3 bH = normalize(normalize(vec3(0.45, 0.85, 0.35)) + bV);
    float bSpec = pow(max(dot(bN, bH), 0.0), 36.0);
    float bRim = pow(1.0 - max(dot(bN, bV), 0.0), 3.0);
    outgoingLight += vec3(0.7) * bSpec * (0.45 + 0.55 * bTop) + vec3(0.25) * bRim;
  }
`

let sharedMaterial = null

/** The one material every board uses. */
export function boardMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new MeshLambertMaterial({
      color: 0xffffff,
      emissive: new Color('#ffffff'),
      emissiveIntensity: 0.1,
    })
    sharedMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${vertexHead}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${fragmentHead}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${DESIGN_GLSL}`)
        .replace('#include <opaque_fragment>', `${SHINE_GLSL}\n#include <opaque_fragment>`)
      // The lobby's clock, which already ticks every frame for the halos.
      shader.uniforms.uBTime = glowTime
    }
    sharedMaterial.customProgramCacheKey = () => 'board-v2'
  }
  return sharedMaterial
}

const WHITE = new Color('#ffffff')

/**
 * Up to `max` boards in one draw call. Place them with setMatrixAt and style them with
 * `setStyle(index, boardId)`; set `.count` to how many to draw.
 */
export function createBoardMesh(max) {
  const base = boardBaseGeometry()
  // Own geometry object (it needs its own per-instance attributes), sharing the sled's
  // vertex buffers.
  const geometry = new BufferGeometry()
  geometry.setIndex(base.index)
  for (const name of ['position', 'normal', 'aPart']) geometry.setAttribute(name, base.getAttribute(name))
  geometry.boundingSphere = base.boundingSphere
  const accent = new InstancedBufferAttribute(new Float32Array(max * 3), 3)
  const design = new InstancedBufferAttribute(new Float32Array(max), 1)
  geometry.setAttribute('aAccent', accent)
  geometry.setAttribute('aDesign', design)

  const mesh = new InstancedMesh(geometry, boardMaterial(), max)
  mesh.setColorAt(0, WHITE)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = true
  const styled = new Array(max).fill(null)

  /** Styles instance `i` as board `id`; cheap to call every frame. */
  mesh.setStyle = (i, id) => {
    if (styled[i] === id) return
    styled[i] = id
    mesh.setColorAt(i, boardColor(id))
    const a = boardAccent(id)
    accent.setXYZ(i, a.r, a.g, a.b)
    design.setX(i, boardDesign(id))
    mesh.instanceColor.needsUpdate = true
    accent.needsUpdate = true
    design.needsUpdate = true
  }
  return mesh
}

/** Frees a mesh made by createBoardMesh (the shared sled and material stay). */
export function disposeBoardMesh(mesh) {
  mesh.geometry.dispose()
  mesh.dispose()
}

const IDENTITY = new Matrix4()
const GLOW_UNDER = new Matrix4().makeTranslation(0, 0.05, 0.1)

/**
 * A single board with a soft glow under it, for the one you ride. `setBoard(id)`
 * restyles it; `dispose()` frees what it owns.
 *
 * @param {{ glowSize?: number, glowIntensity?: number }} options
 */
export function createBoardModel({ glowSize = 2.6, glowIntensity = 0.7 } = {}) {
  const board = createBoardMesh(1)
  board.setMatrixAt(0, IDENTITY)
  board.count = 1
  // An instanced halo of one, so it shares the shader program with every other halo.
  const glow = createGlowInstances(1, glowIntensity)
  glow.setMatrixAt(0, GLOW_UNDER)
  glow.count = 1
  glow.scale.setScalar(glowSize)

  const group = new Group()
  group.add(glow, board)
  let current = null

  group.setBoard = (id) => {
    if (id === current) return
    current = id
    board.setStyle(0, id)
    glow.setColorAt(0, boardGlow(id))
    glow.instanceColor.needsUpdate = true
  }
  /** Halo size, e.g. from the quality preset; 0 hides it. */
  group.setGlowSize = (size) => {
    glow.visible = size > 0
    glow.scale.setScalar(Math.max(size, 0.001))
  }
  group.dispose = () => {
    disposeBoardMesh(board)
    disposeGlow(glow)
  }

  group.setBoard('wood')
  return group
}
