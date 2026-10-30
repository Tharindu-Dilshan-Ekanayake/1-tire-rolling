import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { getQuality } from '../store/quality'
import { glowTime } from './glow'

/**
 * Tires: what every player trains with and rolls down the track.
 *
 * One tire mesh for all of them: a fat tread studded with knobs, a rim with a chrome lip
 * on both faces, raised spokes, and a domed hub cap ringed with lug nuts. What each tire
 * is made of - rubber, wood, stone, cookie, pizza, donut, watermelon, peppermint,
 * silver, gold, platinum, ice, lava, gems, diamond, rainbow, unicorn, galaxy, dragon
 * scales, prism - is its `skin`, drawn (and animated: sparkles, glowing cracks,
 * shifting colours) in the fragment shader along with its colours, width, knobs,
 * spokes, stripes and rim design, all per instance. So every tire in the game shares
 * one geometry, one material and one compiled shader program, and a showroom of
 * twenty-four different tires is a single draw call.
 *
 * Local frame: the axle runs along X, the wheel stands upright in the YZ plane centred
 * on the origin, TIRE_RADIUS to the outside of the tread. Rolling forwards (-Z) is a
 * negative turn about X.
 */

export const TIRE_RADIUS = 1

/** What a tire is made of: its `skin`, drawn by DESIGN_GLSL. */
export const SKIN = {
  RUBBER: 0,
  WOOD: 1,
  STONE: 2,
  METAL: 3,
  DIAMOND: 4,
  PIZZA: 5,
  DONUT: 6,
  COOKIE: 7,
  MELON: 8,
  LAVA: 9,
  ICE: 10,
  MINT: 11,
  RAINBOW: 12,
  GALAXY: 13,
  GEM: 14,
  UNICORN: 15,
  DRAGON: 16,
  PRISM: 17,
  ICECREAM: 18,
  SLIME: 19,
  BURGER: 20,
  CAKE: 21,
  CITRUS: 22,
  CHEESE: 23,
  COIN: 24,
  SUSHI: 25,
}

/**
 * The picture on each hub cap, outlined in ink like a sticker on a toy: a smiley for
 * the everyday tires, hearts, stars, a crown for gold... (see EMBLEM_GLSL).
 */
export const EMBLEM = { NONE: 0, STAR: 1, HEART: 2, FLAME: 3, CROWN: 4, SNOW: 5, BOLT: 6, GEM: 7, MOON: 8, SMILE: 9, PAW: 10, FLOWER: 11, MONSTER: 12 }

/**
 * Looks by tire id (ids and stats live in shared/balance.js). Every one is a fun object
 * rolling like a wheel - fruit slices, a cookie, coins, a burger, a cake, a planet -
 * not a real tire: no rubber, rims or tread; the dearer, the sillier and more magical. `skin` is what it's made
 * of (SKIN); `rubber` the colour of its tread, `rim` the wheel's, `accent` the hub,
 * spokes and the rim's design (see DESIGN_GLSL) - for the food tires, the topping
 * (pepperoni, chocolate chips, seeds...); `emblem` the picture on its hub cap (EMBLEM).
 * `glow` tints its trail and dust while rolling, `width` how fat it is (1 = a slim tire; toys run 1.3 to 2.2), `knob` how chunky its tread
 * knobs stand (0 = smooth), `spokes` whether raised 3D spokes stand out of its rim, and
 * `stripe` a racing stripe round the tread (1), or that and coloured rings round the
 * sidewalls (2).
 */
export const TIRE_STYLES = {
  bicycle: { skin: SKIN.CITRUS, emblem: EMBLEM.SMILE, rubber: '#ff8a1a', rim: '#ffab3d', accent: '#ffd84a', glow: '#ffb347', design: 0, width: 1.4, knob: 0, spokes: 0, stripe: 0 },
  mountain: { skin: SKIN.CITRUS, emblem: EMBLEM.STAR, rubber: '#3aa52a', rim: '#b4ec62', accent: '#fff6c8', glow: '#9dff5a', design: 0, width: 1.5, knob: 0, spokes: 0, stripe: 0 },
  wood: { skin: SKIN.WOOD, emblem: EMBLEM.FLOWER, rubber: '#b87a40', rim: '#c98f52', accent: '#7a4a24', glow: '#ffc07a', design: 2, width: 1.5, knob: 0, spokes: 1, stripe: 0 },
  stone: { skin: SKIN.STONE, emblem: EMBLEM.PAW, rubber: '#a4a8b0', rim: '#8c9098', accent: '#5f636c', glow: '#d0d6e0', design: 3, width: 1.6, knob: 0.5, spokes: 0, stripe: 0 },
  cookie: { skin: SKIN.COOKIE, emblem: EMBLEM.SMILE, rubber: '#e0aa62', rim: '#d49a52', accent: '#4a2a18', glow: '#ffcf8a', design: 0, width: 1.5, knob: 0, spokes: 0, stripe: 0 },
  pizza: { skin: SKIN.PIZZA, emblem: EMBLEM.HEART, rubber: '#e2a24a', rim: '#ffcf3a', accent: '#d8342a', glow: '#ffb347', design: 0, width: 1.45, knob: 0, spokes: 0, stripe: 0 },
  donut: { skin: SKIN.DONUT, emblem: EMBLEM.HEART, rubber: '#ff8fc8', rim: '#ff9ed0', accent: '#b8743a', glow: '#ff9cd6', design: 0, width: 1.9, knob: 0, spokes: 0, stripe: 0 },
  watermelon: { skin: SKIN.MELON, emblem: EMBLEM.SMILE, rubber: '#2f9a3a', rim: '#ff4a5a', accent: '#1d1f22', glow: '#7dff6a', design: 0, width: 1.8, knob: 0, spokes: 0, stripe: 0 },
  monster: { skin: SKIN.CHEESE, emblem: EMBLEM.SMILE, rubber: '#ffc832', rim: '#ffd95a', accent: '#ff9a1e', glow: '#ffd84a', design: 0, width: 1.9, knob: 0, spokes: 0, stripe: 0 },
  mint: { skin: SKIN.MINT, emblem: EMBLEM.STAR, rubber: '#ffffff', rim: '#ffffff', accent: '#ff2a4a', glow: '#ff7a8a', design: 5, width: 1.6, knob: 0, spokes: 0, stripe: 0 },
  silver: { skin: SKIN.COIN, emblem: EMBLEM.STAR, rubber: '#c9d1de', rim: '#e6ebf3', accent: '#8f9bb0', glow: '#e8f0ff', design: 0, width: 1.4, knob: 0, spokes: 0, stripe: 0 },
  ice: { skin: SKIN.ICECREAM, emblem: EMBLEM.HEART, rubber: '#ff9ec8', rim: '#e8ae62', accent: '#ff3f6a', glow: '#ffb3d6', design: 0, width: 1.8, knob: 0, spokes: 0, stripe: 0 },
  gold: { skin: SKIN.COIN, emblem: EMBLEM.CROWN, rubber: '#ffbf1a', rim: '#ffde5c', accent: '#ff9a0a', glow: '#ffd21f', design: 0, width: 1.5, knob: 0, spokes: 0, stripe: 0 },
  lava: { skin: SKIN.LAVA, emblem: EMBLEM.FLAME, rubber: '#2a120c', rim: '#3a1410', accent: '#ff6a1e', glow: '#ff4a1c', design: 0, width: 1.8, knob: 0.6, spokes: 0, stripe: 0 },
  platinum: { skin: SKIN.SUSHI, emblem: EMBLEM.FLOWER, rubber: '#1d3a28', rim: '#ff8a5c', accent: '#8ad94a', glow: '#ff9a7a', design: 0, width: 2.0, knob: 0, spokes: 0, stripe: 0 },
  emerald: { skin: SKIN.SLIME, emblem: EMBLEM.MONSTER, rubber: '#62e63c', rim: '#a8ff6e', accent: '#8a4dff', glow: '#7dff5a', design: 0, width: 1.9, knob: 0.7, spokes: 0, stripe: 0 },
  ruby: { skin: SKIN.BURGER, emblem: EMBLEM.STAR, rubber: '#eba24a', rim: '#d98a38', accent: '#ffd21f', glow: '#ffbe5c', design: 0, width: 2.1, knob: 0, spokes: 0, stripe: 0 },
  diamond: { skin: SKIN.DIAMOND, emblem: EMBLEM.GEM, rubber: '#dff6ff', rim: '#c8efff', accent: '#7fe2ff', glow: '#bff4ff', design: 0, width: 1.8, knob: 0, spokes: 0, stripe: 0 },
  rainbow: { skin: SKIN.RAINBOW, emblem: EMBLEM.HEART, rubber: '#ff5fd2', rim: '#ffffff', accent: '#ffffff', glow: '#ff7ad9', design: 0, width: 1.8, knob: 0, spokes: 0, stripe: 0 },
  unicorn: { skin: SKIN.UNICORN, emblem: EMBLEM.STAR, rubber: '#ffd6f4', rim: '#ffffff', accent: '#b07cff', glow: '#ffb0f0', design: 0, width: 1.9, knob: 0, spokes: 0, stripe: 0 },
  galaxy: { skin: SKIN.GALAXY, emblem: EMBLEM.MOON, rubber: '#1a1030', rim: '#2a1450', accent: '#c08bff', glow: '#a46bff', design: 0, width: 1.9, knob: 0, spokes: 0, stripe: 0 },
  dragon: { skin: SKIN.DRAGON, emblem: EMBLEM.FLAME, rubber: '#1f9a4a', rim: '#ffd21f', accent: '#ff5a1e', glow: '#4cff7a', design: 0, width: 2.1, knob: 1.2, spokes: 0, stripe: 0 },
  cosmic: { skin: SKIN.CAKE, emblem: EMBLEM.STAR, rubber: '#ff9ed8', rim: '#6e3f24', accent: '#ff3b5c', glow: '#ff9ed8', design: 0, width: 2.0, knob: 0, spokes: 0, stripe: 0 },
  infinity: { skin: SKIN.PRISM, emblem: EMBLEM.STAR, rubber: '#ffffff', rim: '#ffffff', accent: '#ffffff', glow: '#ffffff', design: 0, width: 2.1, knob: 0, spokes: 0, stripe: 0 },
}

const styleOf = (id) => TIRE_STYLES[id] || TIRE_STYLES.bicycle

// Parsed once, so frame code can look colours up without allocating.
const parse = (key) => Object.fromEntries(Object.entries(TIRE_STYLES).map(([id, s]) => [id, new Color(s[key])]))
const RUBBERS = parse('rubber')
const RIMS = parse('rim')
const ACCENTS = parse('accent')
const GLOWS = parse('glow')

export const tireRubber = (id) => RUBBERS[id] || RUBBERS.bicycle
export const tireRim = (id) => RIMS[id] || RIMS.bicycle
export const tireAccent = (id) => ACCENTS[id] || ACCENTS.bicycle
export const tireGlow = (id) => GLOWS[id] || GLOWS.bicycle
/** How wide a tire is drawn: its X scale, on top of whatever size it's shown at. */
export const tireWidth = (id) => styleOf(id).width

// --- Geometry ------------------------------------------------------------------------

/**
 * The tread's ring and tube, and the rim and hub inside it: a fat, puffy tread round a
 * flat rim face and a big domed hub cap, like a toy car's wheel - chunky enough for
 * kids to love, not a skinny real-world wheel.
 */
const RING = 0.7
const TUBE = 0.3
const RIM_R = 0.5
const RIM_W = 0.44
const HUB_R = 0.2
const HUB_W = 0.56
/** Tread knobs: per row round the tire, and the radius their bases sink to when flat. */
const KNOBS = 22
const KNOB_BASE = 0.95

/** Raised spokes on each face of the rim (tires with `spokes`). */
const SPOKES = 6

/**
 * The parts, by the `aPart` each vertex carries: 0 rubber, 1 rim, 2 accent (the hub
 * cap), 3 tread knob, 4 chrome (the rim's lips and the lug nuts), 5 spoke.
 */
const PART = { RUBBER: 0, RIM: 1, ACCENT: 2, KNOB: 3, CHROME: 4, SPOKE: 5 }

/** Tags every vertex of `g` as part `part` (see PART). */
function tagged(g, part) {
  g.deleteAttribute('uv')
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(part), 1))
  return g
}

/**
 * Mesh detail: the full tire, and a lighter one for the LOW preset (fewer segments and
 * knobs, no lug nuts) - a lobby full of tires stays well inside a phone's budget.
 */
const DETAIL = {
  full: { tube: [8, 30], rim: 24, hub: 16, lip: [4, 24], dome: [18, 6], nuts: 4, knobs: KNOBS },
  low: { tube: [6, 20], rim: 16, hub: 12, lip: [3, 16], dome: [12, 4], nuts: 0, knobs: 14 },
}
const baseGeometries = {}
/**
 * The tire: a fat torus of rubber studded with two staggered rows of knobs, round a rim
 * disc with a chrome lip on each face, raised spokes, and a domed hub cap on each side
 * ringed with four lug nuts. About 2,200 triangles, shared by every tire.
 */
function tireBaseGeometry(level) {
  if (baseGeometries[level]) return baseGeometries[level]
  const d = DETAIL[level]
  const rubber = new TorusGeometry(RING, TUBE, d.tube[0], d.tube[1])
  rubber.rotateY(Math.PI / 2)
  const rim = new CylinderGeometry(RIM_R, RIM_R, RIM_W, d.rim)
  rim.rotateZ(Math.PI / 2)
  const hub = new CylinderGeometry(HUB_R, HUB_R, HUB_W, d.hub)
  hub.rotateZ(Math.PI / 2)
  const pieces = [tagged(rubber, PART.RUBBER), tagged(rim, PART.RIM), tagged(hub, PART.ACCENT)]
  for (const side of [-1, 1]) {
    // The rim's chrome lip, and the hub cap's dome.
    const lip = new TorusGeometry(RIM_R - 0.02, 0.045, d.lip[0], d.lip[1])
    lip.rotateY(Math.PI / 2)
    lip.translate(side * (RIM_W / 2), 0, 0)
    pieces.push(tagged(lip, PART.CHROME))
    const dome = new SphereGeometry(HUB_R * 1.5, d.dome[0], d.dome[1], 0, Math.PI * 2, 0, Math.PI / 2)
    dome.rotateZ(-side * (Math.PI / 2))
    dome.scale(0.55, 1, 1)
    dome.translate(side * (HUB_W / 2 - 0.02), 0, 0)
    pieces.push(tagged(dome, PART.ACCENT))
    for (let i = 0; i < d.nuts; i += 1) {
      const a = (i / d.nuts) * Math.PI * 2 + Math.PI / 4
      const nut = new BoxGeometry(0.05, 0.06, 0.06)
      nut.translate(side * (RIM_W / 2 + 0.02), Math.cos(a) * 0.3, Math.sin(a) * 0.3)
      pieces.push(tagged(nut, PART.CHROME))
    }
    // Spokes standing out of the face, hub to lip; hidden on tires without them.
    for (let i = 0; i < SPOKES; i += 1) {
      const spoke = new BoxGeometry(0.07, RIM_R - HUB_R * 1.3, 0.075)
      spoke.translate(side * (RIM_W / 2 + 0.035), HUB_R * 1.3 + (RIM_R - HUB_R * 1.3) / 2 - 0.02, 0)
      spoke.rotateX((i / SPOKES) * Math.PI * 2 + (side > 0 ? 0 : Math.PI / SPOKES))
      pieces.push(tagged(spoke, PART.SPOKE))
    }
  }
  // Knobs: blocks standing out of the tread, two rows offset half a knob apart.
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < d.knobs; i += 1) {
      const a = ((i + row * 0.5) / d.knobs) * Math.PI * 2
      const knob = new BoxGeometry(0.2, 0.12, 0.15)
      knob.translate((row ? 1 : -1) * 0.12, RING + TUBE + 0.02, 0)
      knob.rotateX(a)
      pieces.push(tagged(knob, PART.KNOB))
    }
  }
  const merged = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  merged.computeBoundingSphere()
  baseGeometries[level] = merged
  return merged
}

// --- Material ------------------------------------------------------------------------

const vertexHead = /* glsl */ `
  attribute vec3 aRim;
  attribute vec3 aAccent;
  attribute float aDesign;
  attribute vec3 aShape;
  attribute float aSkin;
  attribute float aPart;
  varying vec3 vTLocal;
  varying vec3 vTNormal;
  varying vec3 vTRim;
  varying vec3 vTAccent;
  varying float vTDesign;
  varying float vTPart;
  varying float vTStripe;
  varying float vTSkin;
`

const vertexBody = /* glsl */ `
  // aShape: x = knob height, y = spokes on/off, z = stripe kind.
  // Knobs stand out by the tire's own amount: a smooth tire sinks them into the tread.
  if (aPart > 2.5 && aPart < 3.5) {
    float kr = length(transformed.yz);
    transformed.yz *= mix(${KNOB_BASE.toFixed(2)}, kr, clamp(aShape.x, 0.0, 1.0)) / kr;
    transformed.yz *= 1.0 + max(0.0, aShape.x - 1.0) * 0.08;
  }
  // Spokes fold away into the hub on tires that don't have them.
  if (aPart > 4.5 && aShape.y < 0.5) transformed *= 0.0;
  vTStripe = aShape.z;
  vTSkin = aSkin;
  vTLocal = position;
  vTNormal = normal;
  vTRim = aRim;
  vTAccent = aAccent;
  vTDesign = aDesign;
  vTPart = aPart;
`

const fragmentHead = /* glsl */ `
  varying vec3 vTLocal;
  varying vec3 vTNormal;
  varying vec3 vTRim;
  varying vec3 vTAccent;
  varying float vTDesign;
  varying float vTPart;
  varying float vTStripe;
  varying float vTSkin;
  uniform float uTTime;
  const float TTAU = 6.2831853;
  float tHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float tBand(float r, float a, float b, float w) {
    return smoothstep(a - w, a + w, r) * (1.0 - smoothstep(b - w, b + w, r));
  }
  float tNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = tHash(i);
    float b = tHash(i + vec2(1.0, 0.0));
    float c = tHash(i + vec2(0.0, 1.0));
    float d = tHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float tDot2(vec2 v) {
    return dot(v, v);
  }
  float tSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  float tStar5(vec2 p, float r, float rf) {
    const vec2 k1 = vec2(0.809016994, -0.587785252);
    const vec2 k2 = vec2(-0.809016994, -0.587785252);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
  }
  float tHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return sqrt(tDot2(p - vec2(0.25, 0.75))) - 0.35355;
    return sqrt(min(tDot2(p - vec2(0.0, 1.0)), tDot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
  }
  // A teardrop: round at the bottom, a point at the top (iq's uneven capsule).
  float tDrop(vec2 p, float r1, float r2, float h) {
    p.x = abs(p.x);
    float b = (r1 - r2) / h;
    float a = sqrt(1.0 - b * b);
    float k = dot(p, vec2(-b, a));
    if (k < 0.0) return length(p) - r1;
    if (k > a * h) return length(p - vec2(0.0, h)) - r2;
    return dot(p, vec2(a, b)) - r1;
  }

  /** The hub cap's colour at q with its emblem e drawn on: a filled shape with an ink edge. */
  vec3 tEmblem(int e, vec2 q, vec3 acc, vec3 rimC) {
    vec3 ink = vec3(0.06, 0.06, 0.12);
    float lum = dot(acc, vec3(0.299, 0.587, 0.114));
    // White on a coloured cap; the rim's colour (or pink) on a pale one.
    vec3 fill = lum > 0.72 ? rimC : vec3(1.0);
    if (lum > 0.72 && dot(rimC, vec3(0.299, 0.587, 0.114)) > 0.72) fill = vec3(1.0, 0.42, 0.66);
    vec3 col = acc;
    float d = 10.0;
    vec3 inner = fill;
    float di = 10.0;
    if (e == 9) {
      // A smiley: eyes, a big grin and rosy cheeks, in ink (white on a dark cap).
      vec3 face = lum > 0.45 ? ink : vec3(1.0);
      float aa = fwidth(q.x) * 1.5;
      float eyes = length((vec2(abs(q.x), q.y) - vec2(0.3, 0.22)) * vec2(1.0, 0.72)) - 0.13;
      float grin = max(abs(length(q - vec2(0.0, 0.12)) - 0.5) - 0.075, q.y + 0.02);
      float cheeks = length(vec2(abs(q.x), q.y) - vec2(0.56, -0.08)) - 0.12;
      col = mix(col, vec3(1.0, 0.45, 0.55), (1.0 - smoothstep(-aa, aa, cheeks)) * 0.75);
      return mix(col, face, 1.0 - smoothstep(-aa, aa, min(eyes, grin)));
    }
    if (e == 12) {
      // A silly monster: googly eyes looking different ways and a toothy grin.
      float aa = fwidth(q.x) * 1.5;
      vec2 m = (q - vec2(0.0, -0.12)) * vec2(1.0, 1.7);
      float mouth = max(length(m) - 0.56, q.y + 0.12);
      float tooth = q.y + 0.12 + 0.17 * (1.0 - abs(fract((q.x + 0.6) / 0.24) - 0.5) * 2.0);
      col = mix(col, vec3(0.3, 0.04, 0.1), 1.0 - smoothstep(-aa, aa, mouth));
      col = mix(col, vec3(1.0), (1.0 - smoothstep(-aa, aa, mouth)) * (1.0 - smoothstep(-aa, aa, -tooth)));
      vec2 ql = q - vec2(-0.3, 0.3);
      vec2 qr = q - vec2(0.3, 0.33);
      float eyes = min(length(ql) - 0.25, length(qr) - 0.21);
      float pupils = min(length(ql - vec2(0.08, -0.07)) - 0.11, length(qr - vec2(-0.05, 0.07)) - 0.09);
      col = mix(col, ink, 1.0 - smoothstep(-aa, aa, eyes - 0.06));
      col = mix(col, vec3(1.0), 1.0 - smoothstep(-aa, aa, eyes));
      return mix(col, ink, 1.0 - smoothstep(-aa, aa, pupils));
    }
    if (e == 1) {
      d = tStar5(q * vec2(1.0, -1.0) + vec2(0.0, 0.05), 0.78, 0.48);
    } else if (e == 2) {
      d = tHeart(q / 1.35 + vec2(0.0, 0.5)) * 1.35;
    } else if (e == 3) {
      // A flame, its tip flicking to one side, with a yellow heart.
      vec2 f = vec2(q.x + 0.1 * sin(q.y * 4.0 + 1.0) * smoothstep(-0.2, 0.7, q.y), q.y + 0.4);
      d = tDrop(f, 0.42, 0.03, 1.1);
      di = tDrop(vec2(f.x, f.y + 0.05) * 1.8, 0.42, 0.03, 1.1) / 1.8;
      fill = vec3(1.0, 0.36, 0.12);
      inner = vec3(1.0, 0.85, 0.2);
    } else if (e == 4) {
      // A crown: three points with a jewel on each.
      float t = abs(fract((q.x + 0.6) / 0.6) - 0.5) * 2.0;
      float body = max(max(abs(q.x) - 0.62, -0.45 - q.y), q.y - (0.02 + 0.42 * t));
      float jewels = min(length(vec2(abs(q.x) - 0.6, q.y - 0.47)), length(vec2(q.x, q.y - 0.47))) - 0.11;
      d = min(body, jewels);
      fill = vec3(1.0, 0.86, 0.22);
      di = jewels;
      inner = vec3(1.0, 0.25, 0.4);
    } else if (e == 5) {
      // A snowflake: three bars and little V's at their ends.
      float bars = 10.0;
      for (int i = 0; i < 3; i++) {
        float a = float(i) * 1.0472 + 1.5708;
        vec2 dir = vec2(cos(a), sin(a));
        bars = min(bars, tSeg(q, -dir * 0.75, dir * 0.75));
      }
      d = bars - 0.08;
    } else if (e == 6) {
      // A lightning bolt.
      float z = min(min(tSeg(q, vec2(0.28, 0.78), vec2(-0.18, 0.02)), tSeg(q, vec2(-0.18, 0.02), vec2(0.2, 0.02))), tSeg(q, vec2(0.2, 0.02), vec2(-0.26, -0.78)));
      d = z - 0.12;
      fill = vec3(1.0, 0.9, 0.2);
      if (lum > 0.72) fill = vec3(1.0, 1.0, 1.0);
    } else if (e == 7) {
      // A cut gem: flat top, point below, a lighter top facet.
      float top = max(abs(q.x) - 0.62, abs(q.y - 0.32) - 0.14);
      float bottom = max(abs(q.x) * 0.95 + (0.18 - q.y) * 0.62 - 0.6, q.y - 0.18);
      bottom = max(bottom, -0.75 - q.y);
      d = min(top, max(bottom, abs(q.x) - 0.62));
      di = top;
      inner = mix(fill, vec3(1.0), 0.55);
    } else if (e == 8) {
      // A crescent moon and a little star.
      d = max(length(q - vec2(-0.1, 0.0)) - 0.66, -(length(q - vec2(0.22, 0.18)) - 0.55));
      d = min(d, tStar5(q * vec2(1.0, -1.0) - vec2(0.45, 0.42), 0.22, 0.45));
      fill = vec3(1.0, 0.9, 0.35);
    } else if (e == 10) {
      // A paw print.
      float pad = length((q - vec2(0.0, -0.22)) * vec2(1.0, 1.25)) - 0.36;
      float toes = min(length(vec2(abs(q.x) - 0.45, q.y - 0.2)), length(vec2(abs(q.x) - 0.17, q.y - 0.45))) - 0.15;
      d = min(pad, toes);
    } else if (e == 11) {
      // A flower: five round petals and a yellow middle.
      float a = atan(q.y, q.x);
      d = (length(q) - (0.5 + 0.22 * cos(5.0 * a))) * 0.8;
      di = length(q) - 0.2;
      inner = vec3(1.0, 0.82, 0.2);
      if (lum < 0.72) fill = vec3(1.0, 0.62, 0.8);
    } else {
      return col;
    }
    float aa = fwidth(d) * 1.2 + 0.004;
    col = mix(col, ink, 1.0 - smoothstep(-aa, aa, d - 0.09));
    col = mix(col, fill, 1.0 - smoothstep(-aa, aa, d));
    col = mix(col, inner, 1.0 - smoothstep(-aa, aa, di));
    return col;
  }
  vec3 tHue(float h) {
    return 0.5 + 0.5 * cos(TTAU * (h + vec3(0.0, 0.33, 0.67)));
  }
  // A few cells at a time flash a little white star.
  float tSparkle(vec2 q, float rate) {
    vec2 c = floor(q);
    float h = tHash(c);
    float t = fract(uTTime * rate + h * 7.0);
    float flash = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.08, 0.3, t));
    vec2 f = fract(q) - 0.5;
    float star = max(1.0 - smoothstep(0.0, 0.06, abs(f.x)) * 1.0, 1.0 - smoothstep(0.0, 0.06, abs(f.y)));
    star *= 1.0 - smoothstep(0.1, 0.42, length(f));
    return flash * step(0.8, h) * star;
  }

  /**
   * A skin's colour at a point. 'face' = on the rim's face (p.yz runs across it) rather
   * than round the tread. Adds any self-lit glow (sparkles, lava, stars) to 'emi'.
   */
  vec3 tSkin(int skin, vec3 base, vec3 rimC, vec3 acc, vec3 p, float ang, float rr, bool face, inout float emi) {
    float u = ang / TTAU;
    vec2 tq = face ? p.yz * 6.0 : vec2(u * 40.0, p.x * 10.0);
    vec3 col = base;
    if (skin == 1) {
      // Wood: grain running round the tread, growth rings on the face.
      float g = fract((face ? rr * 9.0 : u * 4.0 + p.x * 1.5) + tNoise(tq * vec2(0.25, 1.4)) * 0.6);
      col = mix(base * 0.68, base * 1.1, smoothstep(0.1, 0.9, g)) * (0.92 + 0.12 * tNoise(tq * 3.0));
    } else if (skin == 2) {
      // Stone: blotchy grey with dark cracks.
      float n = tNoise(tq * 0.8) * 0.6 + tNoise(tq * 2.3) * 0.4;
      col = base * (0.72 + 0.5 * n);
      col = mix(col, base * 0.4, 1.0 - smoothstep(0.0, 0.03, abs(tNoise(tq * 0.6) - 0.5)));
    } else if (skin == 3) {
      // Metal: polished bands of light and shade, standing still.
      float sheen = 0.5 + 0.5 * sin(u * TTAU * 2.0 + p.x * 4.0);
      col = base * (0.78 + 0.3 * sheen);
    } else if (skin == 4 || skin == 14 || skin == 17) {
      // Diamond, gems and prism: cut facets catching the light, and sparkles.
      vec2 fq = tq * 0.9;
      float facet = tHash(floor(fq + vec2(floor(fq.y) * 0.5, 0.0)));
      vec3 tint = skin == 17 ? tHue(facet + uTTime * 0.2 + u) : base;
      col = tint * (0.65 + 0.6 * facet);
      if (skin == 4) col = mix(col, tHue(facet * 3.0 + uTTime * 0.1), 0.18);

    } else if (skin == 5) {
      if (face) {
        // Pizza: melted cheese, pepperoni and a few green peppers.
        vec2 c = p.yz * 7.0;
        vec2 cell = floor(c);
        vec2 f = fract(c) - 0.5 + (vec2(tHash(cell), tHash(cell + 7.0)) - 0.5) * 0.4;
        float pep = step(0.55, tHash(cell + 3.0)) * (1.0 - smoothstep(0.26, 0.3, length(f)));
        col = mix(rimC * (0.9 + 0.15 * tNoise(c * 1.7)), acc, pep);
        col = mix(col, vec3(0.25, 0.65, 0.2), step(0.94, tHash(floor(c * 2.3))));
      } else {
        // The crust: golden, with toasted spots.
        col = base * (0.85 + 0.25 * tNoise(tq * 1.5));
        col = mix(col, base * 0.6, step(0.78, tNoise(tq * 4.0)));
      }
    } else if (skin == 6) {
      // Donut: pink frosting with rainbow sprinkles; the dough shows round the hole.
      vec2 c = tq * 1.6;
      vec2 cell = floor(c);
      float h = tHash(cell);
      vec2 f = fract(c) - 0.5;
      float a = h * TTAU;
      vec2 r = vec2(cos(a) * f.x + sin(a) * f.y, -sin(a) * f.x + cos(a) * f.y);
      float sprinkle = (1.0 - smoothstep(0.22, 0.26, abs(r.x))) * (1.0 - smoothstep(0.05, 0.08, abs(r.y))) * step(0.35, h);
      col = mix(base, tHue(h * 5.0), sprinkle);
      if (face) col = mix(acc, col, smoothstep(0.32, 0.38, rr / 0.56));
    } else if (skin == 7) {
      // Cookie: baked dough with chocolate chips.
      col = base * (0.88 + 0.22 * tNoise(tq * 2.0));
      vec2 c = tq * 1.2;
      vec2 f = fract(c) - 0.5 + (vec2(tHash(floor(c)), tHash(floor(c) + 5.0)) - 0.5) * 0.3;
      col = mix(col, acc, step(0.45, tHash(floor(c) + 9.0)) * (1.0 - smoothstep(0.16, 0.2, length(f))));
    } else if (skin == 8) {
      if (face) {
        // Watermelon: red flesh with seeds, a white band, then the green rind.
        float r2 = rr / 0.56;
        col = mix(rimC, vec3(1.0, 0.96, 0.85), smoothstep(0.82, 0.86, r2));
        vec2 c = vec2(u * 14.0, r2 * 4.0);
        vec2 f = fract(c) - 0.5;
        col = mix(col, acc, step(0.5, tHash(floor(c))) * step(r2, 0.75) * (1.0 - smoothstep(0.1, 0.16, length(f * vec2(1.0, 1.6)))));
      } else {
        float stripe = step(0.5, fract(u * 18.0 + sin(p.x * 18.0) * 0.08));
        col = mix(base * 0.55, base * 1.15, stripe);
      }
    } else if (skin == 9) {
      // Lava: dark crust split by glowing, pulsing cracks.
      float n = tNoise(tq * 1.2 + vec2(uTTime * 0.2, 0.0));
      float crack = 1.0 - smoothstep(0.02, 0.09, abs(n - 0.5));
      col = mix(base, acc * 1.4, crack);

    } else if (skin == 10) {
      // Ice: frosty blue with white cracks and glints.
      float n = tNoise(tq * 1.5);
      col = mix(base, vec3(1.0), 0.2 + 0.35 * n);
      col = mix(col, vec3(1.0), 1.0 - smoothstep(0.02, 0.05, abs(tNoise(tq * 0.8) - 0.5)));

    } else if (skin == 11) {
      // Peppermint: red and white candy stripes, swirling on the face.
      float st = face ? step(0.5, fract(u * 8.0 + rr * 3.0)) : step(0.5, fract(u * 16.0 + p.x * 3.0));
      col = mix(base, acc, st);
    } else if (skin == 12) {
      // Rainbow: every colour, flowing round.
      col = tHue(u * 2.0 + p.x * 0.5 - uTTime * 0.25) * 1.05;

    } else if (skin == 13) {
      // Galaxy: deep space, a coloured nebula and twinkling stars.
      // A little planet: deep violet swirled with bright nebula colours, and stars.
      float neb = smoothstep(0.25, 0.85, tNoise(tq * 0.45) * 0.7 + tNoise(tq * 1.3) * 0.3);
      col = mix(base * 1.6 + vec3(0.12, 0.04, 0.25), tHue(u * 2.0 + p.x * 0.3 + 0.62), neb * 0.7);
      float stars = step(0.965, tHash(floor(tq * 2.4)));
      col = mix(col, vec3(1.0, 0.97, 0.85), stars) + acc * 0.18 * tNoise(tq * 0.4);
    } else if (skin == 15) {
      // Unicorn: pastel pink, blue and lilac flowing together, with sparkles.
      float w = 0.5 + 0.5 * sin(u * TTAU * 2.0 + p.x * 3.0 + uTTime);
      col = mix(vec3(1.0, 0.72, 0.92), vec3(0.68, 0.85, 1.0), w);
      col = mix(col, vec3(0.82, 0.7, 1.0), 0.5 + 0.5 * sin(u * TTAU * 3.0 - uTTime * 0.7) * 0.6);

    } else if (skin == 16) {
      // Dragon: overlapping green scales edged in gold.
      vec2 c = tq * vec2(0.9, 1.5);
      c.x += step(1.0, mod(floor(c.y), 2.0)) * 0.5;
      vec2 f = fract(c) - vec2(0.5, 0.0);
      float d = length(f);
      col = mix(base * 1.15, base * 0.5, smoothstep(0.3, 0.5, d));
      float edge = tBand(d, 0.44, 0.52, 0.02);
      col = mix(col, rimC, edge);

    } else if (skin == 22) {
      // A citrus slice: peel round the edge, a white ring of pith, then juicy segments
      // split by white lines, and a white middle.
      float r2 = face ? rr / 0.56 * 0.84 : rr;
      float line = smoothstep(0.92, 0.97, abs(fract(ang / TTAU * 9.0) - 0.5) * 2.0);
      float middle = 1.0 - smoothstep(0.14, 0.18, r2);
      vec3 flesh = rimC * (0.88 + 0.22 * tNoise(vec2(u * 60.0, r2 * 14.0)));
      flesh = mix(flesh, vec3(1.0, 0.98, 0.9), max(line, middle));
      col = r2 > 0.9 ? base * (0.92 + 0.12 * tNoise(tq * 3.0)) : r2 > 0.83 ? vec3(1.0, 0.98, 0.9) : flesh;
    } else if (skin == 23) {
      // Cheese: holes of every size, shaded inside.
      vec2 c = tq * 0.55;
      vec2 cell = floor(c);
      vec2 f = fract(c) - 0.5 + (vec2(tHash(cell), tHash(cell + 5.0)) - 0.5) * 0.35;
      float h = tHash(cell + 11.0);
      float rad = 0.12 + 0.16 * h;
      float d = length(f);
      col = base * (0.95 + 0.08 * tNoise(tq * 1.5));
      float hole = step(0.35, h) * (1.0 - smoothstep(rad - 0.02, rad, d));
      col = mix(col, base * mix(0.62, 0.82, smoothstep(-rad, rad, f.y)), hole);
    } else if (skin == 24) {
      if (face) {
        // A coin's face: a raised rim and a ring of dots round the edge.
        float r2 = rr / 0.56;
        col = rimC;
        col = mix(col, base * 0.82, tBand(r2, 0.86, 1.0, 0.01));
        float cell = fract(ang / TTAU * 24.0) - 0.5;
        col = mix(col, base * 0.75, 1.0 - smoothstep(0.08, 0.12, length(vec2(cell * 0.3, r2 - 0.76))));
      } else {
        // The edge ridged like a real coin's; the sides plain metal with a raised ring.
        float ridge = step(0.5, fract(u * 72.0));
        float outer = smoothstep(0.86, 0.92, rr);
        col = mix(rimC, base * mix(0.8, 1.08, ridge), outer);
        col = mix(col, base * 0.85, tBand(rr, 0.74, 0.8, 0.01) * (1.0 - outer));
      }
    } else if (skin == 25) {
      if (face) {
        // Inside the roll: rice, then salmon with stripes of fat, and avocado.
        float r2 = rr / 0.56;
        vec2 c = p.yz * 16.0;
        float grain = step(0.55, tHash(floor(c))) * (1.0 - smoothstep(0.25, 0.4, length((fract(c) - 0.5) * vec2(1.0, 2.0))));
        col = mix(vec3(0.97, 0.97, 0.94), vec3(0.86, 0.87, 0.84), grain);
        float salmon = 1.0 - smoothstep(0.42, 0.45, r2);
        vec3 fish = mix(rimC, vec3(1.0, 0.9, 0.82), step(0.82, fract((p.y + p.z) * 9.0)));
        col = mix(col, fish, salmon);
        float avo = tBand(r2, 0.45, 0.62, 0.01) * step(0.7, fract(ang / TTAU * 3.0));
        col = mix(col, vec3(0.55, 0.78, 0.3), avo);
      } else if (rr > 0.86) {
        // The seaweed wrap.
        col = base * (0.85 + 0.25 * tNoise(tq * vec2(0.4, 3.0)));
      } else {
        // Rice packed round the sides.
        vec2 c = tq * 2.2;
        float grain = step(0.5, tHash(floor(c))) * (1.0 - smoothstep(0.2, 0.4, length((fract(c) - 0.5) * vec2(1.0, 2.0))));
        col = mix(vec3(0.97, 0.97, 0.94), vec3(0.85, 0.86, 0.83), grain);
      }
    } else if (skin == 18) {
      if (face) {
        // Ice cream: the rim is the waffle cone, criss-crossed.
        vec2 w = vec2(p.y + p.z, p.y - p.z) * 9.0;
        float lines = max(step(0.86, fract(w.x)), step(0.86, fract(w.y)));
        col = mix(rimC, rimC * 0.62, lines);
      } else {
        // Three scoops round the tire - strawberry, vanilla, chocolate - with wavy
        // edges, and sprinkles all over.
        float xn = p.x / 0.3;
        float wv = 0.14 * sin(ang * 9.0);
        col = xn < -0.34 + wv ? vec3(1.0, 0.6, 0.76) : xn < 0.34 - wv ? vec3(1.0, 0.95, 0.8) : vec3(0.48, 0.27, 0.16);
        vec2 c = tq * 1.4;
        float h = tHash(floor(c));
        vec2 f = fract(c) - 0.5;
        float a = h * TTAU;
        vec2 r = vec2(cos(a) * f.x + sin(a) * f.y, -sin(a) * f.x + cos(a) * f.y);
        float sprinkle = (1.0 - smoothstep(0.2, 0.24, abs(r.x))) * (1.0 - smoothstep(0.05, 0.08, abs(r.y))) * step(0.55, h);
        col = mix(col, tHue(h * 5.0), sprinkle);
      }
    } else if (skin == 19) {
      // Slime: gooey green, lighter where it bulges, bubbles rising in it.
      float n = tNoise(tq * 0.5) * 0.65 + tNoise(tq * 1.6 + 3.0) * 0.35;
      col = mix(base * 0.72, base * 1.22, smoothstep(0.3, 0.75, n));
      vec2 c = tq * 0.75;
      vec2 f = fract(c) - 0.5;
      float h = tHash(floor(c) + 2.0);
      float d = length(f);
      col = mix(col, vec3(0.86, 1.0, 0.8), tBand(d, 0.16, 0.22, 0.02) * step(0.62, h));
      col = mix(col, vec3(1.0), (1.0 - smoothstep(0.03, 0.06, length(f - vec2(-0.07, 0.07)))) * step(0.62, h));
    } else if (skin == 20) {
      if (face) {
        // The bun's side: toasted, with sesame seeds.
        col = rimC * (0.9 + 0.15 * tNoise(p.yz * 8.0));
        vec2 c = p.yz * 10.0;
        vec2 f = fract(c) - 0.5;
        float h = tHash(floor(c));
        col = mix(col, vec3(1.0, 0.96, 0.84), step(0.6, h) * (1.0 - smoothstep(0.1, 0.14, length(f * vec2(1.0, 1.8)))));
      } else {
        // Across the tread, a burger: bottom bun, patty, cheese, tomato, lettuce, top bun.
        float xn = p.x / 0.3;
        float ripple = 0.05 * sin(ang * 16.0);
        if (xn < -0.55) col = base * 0.85;
        else if (xn < -0.3 + 0.08 * abs(sin(ang * 12.0))) col = vec3(0.42, 0.22, 0.12) * (0.85 + 0.3 * tNoise(tq * 2.0));
        else if (xn < -0.08) col = vec3(1.0, 0.8, 0.15);
        else if (xn < 0.14) col = vec3(0.92, 0.2, 0.16);
        else if (xn < 0.4 + ripple) col = vec3(0.35, 0.8, 0.22);
        else {
          col = base * 1.05;
          vec2 c = tq * 1.3;
          vec2 f = fract(c) - 0.5;
          col = mix(col, vec3(1.0, 0.96, 0.84), step(0.55, tHash(floor(c))) * (1.0 - smoothstep(0.14, 0.18, length(f * vec2(1.0, 1.8)))));
        }
      }
    } else if (skin == 21) {
      if (face) {
        // Chocolate on top, ringed with piped cream.
        float r2 = rr / 0.56;
        col = rimC * (0.9 + 0.12 * tNoise(p.yz * 7.0));
        float cell = fract(ang / TTAU * 16.0) - 0.5;
        float piped = 1.0 - smoothstep(0.08, 0.11, length(vec2(cell * 0.4, r2 - 0.78)));
        col = mix(col, vec3(1.0, 0.97, 0.92), piped);
      } else {
        // Pink frosting dripping down over layers of sponge and cream, with sprinkles.
        float drip = 0.84 - 0.1 * max(0.0, sin(ang * 11.0)) - 0.05 * max(0.0, sin(ang * 23.0 + 1.0));
        if (rr > drip) {
          col = base;
          vec2 c = tq * 1.4;
          float h = tHash(floor(c) + 4.0);
          vec2 f = fract(c) - 0.5;
          col = mix(col, tHue(h * 5.0), step(0.6, h) * (1.0 - smoothstep(0.1, 0.13, length(f))));
        } else {
          float band = rr * 9.0;
          float layer = mod(floor(band), 2.0);
          col = layer < 0.5 ? vec3(1.0, 0.86, 0.6) : vec3(0.55, 0.3, 0.18);
          col = mix(col, vec3(1.0, 0.97, 0.94), step(0.82, fract(band)));
        }
      }
    }
    return col;
  }
`

/**
 * Every part's colour: the rubber's tread (or the tire's skin), the knobs, chrome,
 * spokes, hub, and the ten rim designs - chosen per instance by vTDesign and drawn on
 * the rim's faces in polar terms: `r` 0 at the hub to 1 at the rim's edge, `ang` round
 * it. Tires made of food, wood or stone wear their skin on the rim's face too.
 */
const DESIGN_GLSL = /* glsl */ `
  {
    float ang = atan(vTLocal.z, vTLocal.y);
    float rr = length(vTLocal.yz);
    float d = mod(vTDesign, 16.0) + 0.5;
    int skin = int(vTSkin + 0.5);
    // Food, wood and stone tires are made of it all through, face and all.
    bool solid = skin != 0 && skin != 3;
    vec3 base = diffuseColor.rgb;
    vec3 col = base;
    float emi = 0.0;
    if (vTPart > 4.5) {
      // Spokes: the accent colour, polished (wooden ones grained).
      col = skin == 1 ? tSkin(1, vTAccent * 1.4, vTRim, vTAccent, vTLocal, ang, rr, false, emi) : mix(vTAccent, vec3(0.9), 0.15);
    } else if (vTPart > 3.5) {
      // Chrome: bright and cool, picking up a little of the rim's colour; on a solid
      // wheel (fruit, coin, cake...) just more of what it's made of.
      col = solid ? tSkin(skin, base, vTRim, vTAccent, vTLocal, ang, rr, true, emi) : mix(vec3(0.86, 0.89, 0.94), vTRim, 0.18);
    } else if (vTPart > 2.5) {
      // Knobs: the tread's skin, their tops a touch lighter where they wear.
      vec3 k = skin > 0 ? tSkin(skin, base, vTRim, vTAccent, vTLocal, ang, rr, false, emi) : base;
      col = k * mix(0.85, 1.12, smoothstep(0.96, 1.02, rr));
    } else if (vTPart < 0.5) {
      float outer = smoothstep(0.86, 0.95, rr);
      if (skin > 0) {
        col = tSkin(skin, base, vTRim, vTAccent, vTLocal, ang, rr, false, emi);
      } else {
        // Rubber, cartoon-clean: V-shaped grooves round the tread, and a wide band in
        // the rim's colour round each sidewall, like a toy car's wheel.
        float chevron = step(0.8, fract(ang / TTAU * 22.0 + abs(vTLocal.x) * 1.4));
        col *= mix(0.92, 1.08 - chevron * 0.3, outer);
        col = mix(col, vTRim, tBand(rr, 0.7, 0.82, 0.01) * (1.0 - outer) * 0.9);
      }
      // A coloured stripe round each sidewall, as on racing tires.
      float side = tBand(rr, 0.62, 0.68, 0.008) * (1.0 - outer) * step(0.5, vTStripe + (skin == 0 ? 1.0 : 0.0));
      col = mix(col, vTAccent, side * 0.9);
      // The racing stripe round the middle of the tread.
      float tread = smoothstep(0.93, 0.98, rr);
      float centre = (1.0 - smoothstep(0.045, 0.06, abs(vTLocal.x))) * tread * step(0.5, vTStripe);
      col = mix(col, vTAccent, centre);

    } else if (vTPart < 1.5) {
      float r = rr / ${RIM_R.toFixed(2)};
      float face = smoothstep(0.7, 0.9, abs(vTNormal.x));
      if (solid) {
        col = tSkin(skin, base, vTRim, vTAccent, vTLocal, ang, rr, face > 0.5, emi);
      } else {
        float w = max(fwidth(r), 0.004);
        float m = 0.0;
        vec3 tint = vTAccent;
        if (d < 1.0) {
          // Thin wire spokes.
          m = (1.0 - smoothstep(0.0, 0.08, abs(fract(ang / TTAU * 18.0) - 0.5) * 2.0)) * step(0.25, r) + tBand(r, 0.9, 1.0, w);
        } else if (d < 2.0) {
          // Five fat spokes.
          m = step(0.62, 1.0 - abs(fract(ang / TTAU * 5.0) - 0.5) * 2.0) * step(0.22, r) + tBand(r, 0.92, 1.0, w);
          m = 1.0 - clamp(m, 0.0, 1.0);
          tint = vTRim * 0.45;
        } else if (d < 3.0) {
          // Six split spokes.
          float s = abs(fract(ang / TTAU * 12.0) - 0.5) * 2.0;
          m = step(0.75, s) * tBand(r, 0.25, 0.88, w);
        } else if (d < 4.0) {
          // A ring of round holes.
          float cell = fract(ang / TTAU * 8.0) - 0.5;
          vec2 q = vec2(cell * TTAU * 0.6 / 8.0, r - 0.6);
          m = 1.0 - smoothstep(0.13, 0.15, length(q));
          tint = vTRim * 0.35;
          m += tBand(r, 0.2, 0.26, w);
        } else if (d < 5.0) {
          // A five-point star.
          float k = abs(fract(ang / TTAU * 5.0 + 0.25) - 0.5) * 2.0;
          float edge = mix(0.85, 0.35, k);
          m = 1.0 - smoothstep(edge - w, edge + w, r);
        } else if (d < 6.0) {
          // A candy swirl.
          m = step(0.5, fract(ang / TTAU * 3.0 + r * 1.6)) * smoothstep(0.15, 0.2, r);
        } else if (d < 7.0) {
          // Ten thin spokes and a bright inner ring.
          m = step(0.8, 1.0 - abs(fract(ang / TTAU * 10.0) - 0.5) * 2.0) * step(0.3, r) + tBand(r, 0.28, 0.36, w) + tBand(r, 0.9, 1.0, w);
        } else if (d < 8.0) {
          // A sunburst.
          m = step(0.5, fract(ang / TTAU * 14.0)) * tBand(r, 0.3, 0.92, w) + tBand(r, 0.0, 0.22, w);
        } else if (d < 9.0) {
          // Rainbow rings.
          m = 1.0;
          tint = tHue(r * 1.2 + uTTime * 0.2);
        } else {
          // A spiral sprinkled with stars, in shifting colours.
          float arms = step(0.6, fract(ang / TTAU * 2.0 + r * 1.4)) * 0.6;
          float stars = step(0.92, tHash(floor(vTLocal.yz * 40.0)));
          m = max(arms, stars) + tBand(r, 0.0, 0.2, w);
          tint = mix(vTAccent, tHue(ang / TTAU), 0.5);
        }
        m = clamp(m, 0.0, 1.0) * face;
        col = mix(vTRim, tint, m);
        // The rim's edge and barrel, seen from the side, stay the rim's colour.
        col *= mix(0.8, 1.0, face);
        if (skin == 3) col *= 0.85 + 0.2 * (0.5 + 0.5 * sin(ang * 2.0));

      }
    } else {
      // The hub cap: the accent colour, its emblem on the dome (drawn the right way
      // round from either side).
      col = vTAccent;
      if (abs(vTLocal.x) > ${(HUB_W / 2 - 0.03).toFixed(3)} && abs(vTNormal.x) > 0.3) {
        vec2 q = vec2(-vTLocal.z * sign(vTLocal.x), vTLocal.y) / ${(HUB_R * 1.5 * 0.8).toFixed(3)};
        col = tEmblem(int(floor(vTDesign / 16.0 + 0.01)), q, vTAccent, vTRim);
      }
    }
    // Flat toy colours: nothing on a tire glows or glitters.
    diffuseColor.rgb = col;
  }
`

/**
 * The cartoon finish, after the toon lighting: a thick dark outline wherever the surface
 * turns away from the camera (the tire's silhouette, the knobs' sides - drawn like a
 * comic, with no extra geometry) and a small, soft highlight. Nothing glitters or glows:
 * the tires read as bright painted toys.
 */
const SHINE_GLSL = /* glsl */ `
  {
    vec3 tV = normalize(vViewPosition);
    vec3 tN = normalize(normal);
    if (dot(tN, tV) < 0.0) tN = -tN;
    float tFacing = max(dot(tN, tV), 0.0);
    vec3 tH = normalize(normalize(vec3(0.45, 0.85, 0.35)) + tV);
    int tSkinId = int(vTSkin + 0.5);
    float tShiny = (tSkinId == 3 || tSkinId == 4 || tSkinId == 10 || tSkinId == 14 || tSkinId == 17 || vTPart > 3.5) ? 1.0 : 0.0;
    // The shine: a crisp white spot, not a realistic soft glare.
    float tSpec = pow(max(dot(tN, tH), 0.0), tShiny > 0.5 ? 40.0 : 24.0);
    tSpec = smoothstep(0.45, 0.55, tSpec) * (tShiny > 0.5 ? 0.3 : 0.18);
    outgoingLight += vec3(tSpec);
    if (tSkinId == 3 || tSkinId == 24) outgoingLight *= mix(0.74, 1.12, smoothstep(-0.5, 0.6, tN.y));
    // The outline: ink in dark navy round every edge.
    float tInk = 1.0 - smoothstep(0.2, 0.34, tFacing);
    outgoingLight = mix(outgoingLight, vec3(0.06, 0.06, 0.12), tInk * 0.92);
  }
`

/** Three flat bands of light: the cel shading that makes it read as a cartoon. */
let toonBands = null
function toonGradient() {
  if (!toonBands) {
    toonBands = new DataTexture(new Uint8Array([150, 210, 255]), 3, 1, RedFormat)
    toonBands.minFilter = NearestFilter
    toonBands.magFilter = NearestFilter
    toonBands.generateMipmaps = false
    toonBands.needsUpdate = true
  }
  return toonBands
}

let sharedMaterial = null

/** The one material every tire uses. */
export function tireMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new MeshToonMaterial({ color: 0xffffff, emissive: new Color('#ffffff'), emissiveIntensity: 0.08, gradientMap: toonGradient() })
    sharedMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${vertexHead}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${fragmentHead}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${DESIGN_GLSL}`)
        .replace('#include <opaque_fragment>', `${SHINE_GLSL}\n#include <opaque_fragment>`)
      // The lobby's clock, which already ticks every frame for the halos.
      shader.uniforms.uTTime = glowTime
    }
    sharedMaterial.customProgramCacheKey = () => 'tire-v9'
  }
  return sharedMaterial
}

/**
 * Up to `max` tires in one draw call. Place them with setMatrixAt (scale X by
 * tireWidth for the right tread) and style them with `setStyle(index, tireId)`; set
 * `.count` to how many to draw.
 */
export function createTireMesh(max) {
  // Chosen when the mesh is made: the LOW preset gets the lighter tire.
  const base = tireBaseGeometry(getQuality().decorDensity < 0.5 ? 'low' : 'full')
  // Own geometry object (it needs its own per-instance attributes), sharing the
  // tire's vertex buffers.
  const geometry = new BufferGeometry()
  geometry.setIndex(base.index)
  for (const name of ['position', 'normal', 'aPart']) geometry.setAttribute(name, base.getAttribute(name))
  geometry.boundingSphere = base.boundingSphere
  const rim = new InstancedBufferAttribute(new Float32Array(max * 3), 3)
  const accent = new InstancedBufferAttribute(new Float32Array(max * 3), 3)
  const design = new InstancedBufferAttribute(new Float32Array(max), 1)
  const shape = new InstancedBufferAttribute(new Float32Array(max * 3), 3)
  const skin = new InstancedBufferAttribute(new Float32Array(max), 1)
  geometry.setAttribute('aRim', rim)
  geometry.setAttribute('aAccent', accent)
  geometry.setAttribute('aDesign', design)
  geometry.setAttribute('aShape', shape)
  geometry.setAttribute('aSkin', skin)

  const mesh = new InstancedMesh(geometry, tireMaterial(), max)
  mesh.setColorAt(0, RUBBERS.bicycle)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = true
  const styled = new Array(max).fill(null)

  /** Styles instance `i` as tire `id`; cheap to call every frame. */
  mesh.setStyle = (i, id) => {
    if (styled[i] === id) return
    styled[i] = id
    mesh.setColorAt(i, tireRubber(id))
    const r = tireRim(id)
    const a = tireAccent(id)
    rim.setXYZ(i, r.r, r.g, r.b)
    accent.setXYZ(i, a.r, a.g, a.b)
    const st = styleOf(id)
    design.setX(i, st.design + (st.emblem || 0) * 16)
    shape.setXYZ(i, st.knob, st.spokes, st.stripe)
    skin.setX(i, st.skin)
    mesh.instanceColor.needsUpdate = true
    rim.needsUpdate = true
    accent.needsUpdate = true
    design.needsUpdate = true
    shape.needsUpdate = true
    skin.needsUpdate = true
  }
  return mesh
}

/** Frees a mesh made by createTireMesh (the shared tire and material stay). */
export function disposeTireMesh(mesh) {
  mesh.geometry.dispose()
  mesh.dispose()
}

const _m = new Matrix4()
const _s = new Vector3()

/**
 * A single tire, for the one waiting on the Roll Zone and the one you train on. `setTire(id)` restyles it (and its width); `dispose()` frees what
 * it owns. The group is the tire's centre; turn `group.spin` (a child) to roll it.
 */
export function createTireModel() {
  const tire = createTireMesh(1)
  tire.count = 1

  const spin = new Group()
  spin.add(tire)
  const group = new Group()
  group.add(spin)
  group.spin = spin
  let current = null

  group.setTire = (id) => {
    if (id === current) return
    current = id
    tire.setStyle(0, id)
    tire.setMatrixAt(0, _m.makeScale(tireWidth(id), 1, 1))
    tire.instanceMatrix.needsUpdate = true
  }
  group.dispose = () => disposeTireMesh(tire)

  group.setTire('bicycle')
  return group
}

/** Writes a tire's matrix: centred at `position`, turned by `quaternion`, `size` across. */
export function tireMatrix(position, quaternion, size, id, out) {
  return out.compose(position, quaternion, _s.set(size * tireWidth(id), size, size))
}
