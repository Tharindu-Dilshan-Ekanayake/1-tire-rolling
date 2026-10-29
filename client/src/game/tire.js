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
  MeshLambertMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { createGlowInstances, disposeGlow, glowTime } from './glow'

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
}

/**
 * Looks by tire id (ids and stats live in shared/balance.js). `skin` is what it's made
 * of (SKIN); `rubber` the colour of its tread, `rim` the wheel's, `accent` the hub,
 * spokes and the rim's design (see DESIGN_GLSL) - for the food tires, the topping
 * (pepperoni, chocolate chips, seeds...). `glow` is the halo it carries on display and
 * while rolling, `width` how fat it is (1 = a car tire), `knob` how chunky its tread
 * knobs stand (0 = smooth), `spokes` whether raised 3D spokes stand out of its rim, and
 * `stripe` a racing stripe round the tread (1) or a glowing, pulsing one with glowing
 * sidewall rings (2).
 */
export const TIRE_STYLES = {
  bicycle: { skin: SKIN.RUBBER, rubber: '#3a3330', rim: '#c9a67a', accent: '#e8e8ee', glow: '#ffd08a', design: 0, width: 0.45, knob: 0.35, spokes: 0, stripe: 0 },
  mountain: { skin: SKIN.RUBBER, rubber: '#1d1f22', rim: '#2b2f33', accent: '#7dff4a', glow: '#5cff6a', design: 0, width: 0.6, knob: 0.9, spokes: 0, stripe: 1 },
  wood: { skin: SKIN.WOOD, rubber: '#b87a40', rim: '#c98f52', accent: '#7a4a24', glow: '#ffc07a', design: 2, width: 0.9, knob: 0, spokes: 1, stripe: 0 },
  stone: { skin: SKIN.STONE, rubber: '#a4a8b0', rim: '#8c9098', accent: '#5f636c', glow: '#d0d6e0', design: 3, width: 1.1, knob: 0.5, spokes: 0, stripe: 0 },
  cookie: { skin: SKIN.COOKIE, rubber: '#e0aa62', rim: '#d49a52', accent: '#4a2a18', glow: '#ffcf8a', design: 0, width: 0.9, knob: 0, spokes: 0, stripe: 0 },
  pizza: { skin: SKIN.PIZZA, rubber: '#e2a24a', rim: '#ffcf3a', accent: '#d8342a', glow: '#ffb347', design: 0, width: 0.8, knob: 0, spokes: 0, stripe: 0 },
  donut: { skin: SKIN.DONUT, rubber: '#ff8fc8', rim: '#ff9ed0', accent: '#b8743a', glow: '#ff9cd6', design: 0, width: 1.3, knob: 0, spokes: 0, stripe: 0 },
  watermelon: { skin: SKIN.MELON, rubber: '#2f9a3a', rim: '#ff4a5a', accent: '#1d1f22', glow: '#7dff6a', design: 0, width: 1.2, knob: 0, spokes: 0, stripe: 0 },
  monster: { skin: SKIN.RUBBER, rubber: '#18191c', rim: '#ff3b3b', accent: '#ffd21f', glow: '#ff6a3b', design: 4, width: 1.6, knob: 1.6, spokes: 0, stripe: 1 },
  mint: { skin: SKIN.MINT, rubber: '#ffffff', rim: '#ffffff', accent: '#ff2a4a', glow: '#ff7a8a', design: 5, width: 1.1, knob: 0.3, spokes: 0, stripe: 0 },
  silver: { skin: SKIN.METAL, rubber: '#c8ced8', rim: '#eef2f8', accent: '#8a96aa', glow: '#e8f0ff', design: 2, width: 1.2, knob: 0.4, spokes: 1, stripe: 0 },
  ice: { skin: SKIN.ICE, rubber: '#a8dcff', rim: '#e6f8ff', accent: '#5fc8ff', glow: '#9fe8ff', design: 6, width: 1.2, knob: 0.8, spokes: 0, stripe: 2 },
  gold: { skin: SKIN.METAL, rubber: '#ffc21a', rim: '#fff0a0', accent: '#ff9a0a', glow: '#ffd21f', design: 7, width: 1.3, knob: 0.6, spokes: 1, stripe: 0 },
  lava: { skin: SKIN.LAVA, rubber: '#2a120c', rim: '#3a1410', accent: '#ff6a1e', glow: '#ff4a1c', design: 7, width: 1.3, knob: 1, spokes: 0, stripe: 2 },
  platinum: { skin: SKIN.METAL, rubber: '#e2e7f0', rim: '#ffffff', accent: '#7fb8ff', glow: '#d8e8ff', design: 1, width: 1.3, knob: 0.5, spokes: 1, stripe: 2 },
  emerald: { skin: SKIN.GEM, rubber: '#1fbf5a', rim: '#7fffb0', accent: '#ffffff', glow: '#3fff8a', design: 4, width: 1.25, knob: 0.4, spokes: 0, stripe: 2 },
  ruby: { skin: SKIN.GEM, rubber: '#e8203a', rim: '#ff8a9a', accent: '#ffd21f', glow: '#ff3b5c', design: 4, width: 1.25, knob: 0.4, spokes: 1, stripe: 2 },
  diamond: { skin: SKIN.DIAMOND, rubber: '#dff6ff', rim: '#ffffff', accent: '#7fe2ff', glow: '#bff4ff', design: 6, width: 1.3, knob: 0.4, spokes: 1, stripe: 2 },
  rainbow: { skin: SKIN.RAINBOW, rubber: '#ff5fd2', rim: '#ffffff', accent: '#ffffff', glow: '#ff7ad9', design: 8, width: 1.35, knob: 0.5, spokes: 0, stripe: 2 },
  unicorn: { skin: SKIN.UNICORN, rubber: '#ffd6f4', rim: '#ffffff', accent: '#b07cff', glow: '#ffb0f0', design: 5, width: 1.3, knob: 0.3, spokes: 0, stripe: 2 },
  galaxy: { skin: SKIN.GALAXY, rubber: '#1a1030', rim: '#2a1450', accent: '#c08bff', glow: '#a46bff', design: 9, width: 1.4, knob: 0.6, spokes: 0, stripe: 2 },
  dragon: { skin: SKIN.DRAGON, rubber: '#1f9a4a', rim: '#ffd21f', accent: '#ff5a1e', glow: '#4cff7a', design: 7, width: 1.5, knob: 1.2, spokes: 0, stripe: 2 },
  cosmic: { skin: SKIN.GALAXY, rubber: '#160830', rim: '#120a2a', accent: '#ff5bd8', glow: '#ff5bd8', design: 9, width: 1.5, knob: 1, spokes: 0, stripe: 2 },
  infinity: { skin: SKIN.PRISM, rubber: '#ffffff', rim: '#ffffff', accent: '#ffffff', glow: '#ffffff', design: 8, width: 1.6, knob: 0.8, spokes: 1, stripe: 2 },
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

/** The tread's ring and tube, and the rim and hub inside it. */
const RING = 0.74
const TUBE = 0.26
const RIM_R = 0.56
const RIM_W = 0.34
const HUB_R = 0.15
const HUB_W = 0.42
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

let baseGeometry = null
/**
 * The tire: a fat torus of rubber studded with two staggered rows of knobs, round a rim
 * disc with a chrome lip on each face, raised spokes, and a domed hub cap on each side
 * ringed with four lug nuts. About 1,900 triangles, shared by every tire.
 */
function tireBaseGeometry() {
  if (baseGeometry) return baseGeometry
  const rubber = new TorusGeometry(RING, TUBE, 8, 30)
  rubber.rotateY(Math.PI / 2)
  const rim = new CylinderGeometry(RIM_R, RIM_R, RIM_W, 24)
  rim.rotateZ(Math.PI / 2)
  const hub = new CylinderGeometry(HUB_R, HUB_R, HUB_W, 10)
  hub.rotateZ(Math.PI / 2)
  const pieces = [tagged(rubber, PART.RUBBER), tagged(rim, PART.RIM), tagged(hub, PART.ACCENT)]
  for (const side of [-1, 1]) {
    // The rim's chrome lip, and the hub cap's dome.
    const lip = new TorusGeometry(RIM_R - 0.02, 0.045, 4, 24)
    lip.rotateY(Math.PI / 2)
    lip.translate(side * (RIM_W / 2), 0, 0)
    pieces.push(tagged(lip, PART.CHROME))
    const dome = new SphereGeometry(HUB_R * 1.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2)
    dome.rotateZ(-side * (Math.PI / 2))
    dome.scale(0.55, 1, 1)
    dome.translate(side * (HUB_W / 2 - 0.02), 0, 0)
    pieces.push(tagged(dome, PART.ACCENT))
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
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
    for (let i = 0; i < KNOBS; i += 1) {
      const a = ((i + row * 0.5) / KNOBS) * Math.PI * 2
      const knob = new BoxGeometry(0.2, 0.12, 0.15)
      knob.translate((row ? 1 : -1) * 0.12, RING + TUBE + 0.02, 0)
      knob.rotateX(a)
      pieces.push(tagged(knob, PART.KNOB))
    }
  }
  baseGeometry = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  baseGeometry.computeBoundingSphere()
  return baseGeometry
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
      // Metal: polished, with a bright sheen sliding round it.
      float sheen = 0.5 + 0.5 * sin(u * TTAU * 2.0 + p.x * 4.0 - uTTime * 1.6);
      col = base * (0.72 + 0.5 * sheen);
      emi += 0.12 * sheen;
    } else if (skin == 4 || skin == 14 || skin == 17) {
      // Diamond, gems and prism: cut facets catching the light, and sparkles.
      vec2 fq = tq * 0.9;
      float facet = tHash(floor(fq + vec2(floor(fq.y) * 0.5, 0.0)));
      vec3 tint = skin == 17 ? tHue(facet + uTTime * 0.2 + u) : base;
      col = tint * (0.65 + 0.6 * facet);
      if (skin == 4) col = mix(col, tHue(facet * 3.0 + uTTime * 0.1), 0.18);
      float sp = tSparkle(tq * 1.3, 0.6);
      col += vec3(sp);
      emi += 0.3 * facet + sp * 2.5;
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
      emi += crack * (1.4 + 0.5 * sin(uTTime * 4.0 + u * 20.0));
    } else if (skin == 10) {
      // Ice: frosty blue with white cracks and glints.
      float n = tNoise(tq * 1.5);
      col = mix(base, vec3(1.0), 0.2 + 0.35 * n);
      col = mix(col, vec3(1.0), 1.0 - smoothstep(0.02, 0.05, abs(tNoise(tq * 0.8) - 0.5)));
      float sp = tSparkle(tq * 1.2, 0.4);
      col += vec3(sp);
      emi += sp * 2.0 + 0.12;
    } else if (skin == 11) {
      // Peppermint: red and white candy stripes, swirling on the face.
      float st = face ? step(0.5, fract(u * 8.0 + rr * 3.0)) : step(0.5, fract(u * 16.0 + p.x * 3.0));
      col = mix(base, acc, st);
    } else if (skin == 12) {
      // Rainbow: every colour, flowing round.
      col = tHue(u * 2.0 + p.x * 0.5 - uTTime * 0.25) * 1.05;
      emi += 0.25;
    } else if (skin == 13) {
      // Galaxy: deep space, a coloured nebula and twinkling stars.
      col = base + tHue(u + p.x * 0.3 + uTTime * 0.05) * 0.35 * tNoise(tq * 0.7);
      float stars = tSparkle(tq * 2.0, 0.3) + step(0.985, tHash(floor(tq * 3.0))) * 0.8;
      col += vec3(stars) + acc * 0.25 * tNoise(tq * 0.4 + uTTime * 0.1);
      emi += stars * 2.0 + 0.2;
    } else if (skin == 15) {
      // Unicorn: pastel pink, blue and lilac flowing together, with sparkles.
      float w = 0.5 + 0.5 * sin(u * TTAU * 2.0 + p.x * 3.0 + uTTime);
      col = mix(vec3(1.0, 0.72, 0.92), vec3(0.68, 0.85, 1.0), w);
      col = mix(col, vec3(0.82, 0.7, 1.0), 0.5 + 0.5 * sin(u * TTAU * 3.0 - uTTime * 0.7) * 0.6);
      float sp = tSparkle(tq * 1.4, 0.5);
      col += vec3(sp);
      emi += sp * 2.0 + 0.15;
    } else if (skin == 16) {
      // Dragon: overlapping green scales edged in gold.
      vec2 c = tq * vec2(0.9, 1.5);
      c.x += step(1.0, mod(floor(c.y), 2.0)) * 0.5;
      vec2 f = fract(c) - vec2(0.5, 0.0);
      float d = length(f);
      col = mix(base * 1.15, base * 0.5, smoothstep(0.3, 0.5, d));
      float edge = tBand(d, 0.44, 0.52, 0.02);
      col = mix(col, rimC, edge);
      emi += edge * 0.4;
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
    float d = vTDesign + 0.5;
    int skin = int(vTSkin + 0.5);
    // Food, wood and stone tires are made of it all through, face and all.
    bool solid = skin == 1 || skin == 2 || (skin >= 5 && skin <= 8) || skin == 11;
    vec3 base = diffuseColor.rgb;
    vec3 col = base;
    float glow = 0.0;
    float stripeGlow = 0.0;
    float emi = 0.0;
    if (vTPart > 4.5) {
      // Spokes: the accent colour, polished (wooden ones grained).
      col = skin == 1 ? tSkin(1, vTAccent * 1.4, vTRim, vTAccent, vTLocal, ang, rr, false, emi) : mix(vTAccent, vec3(0.9), 0.15);
      glow = skin == 1 ? 0.0 : 0.5;
    } else if (vTPart > 3.5) {
      // Chrome: bright and cool, picking up a little of the rim's colour; a solid tire's
      // lip is more of it.
      col = solid ? base * 0.92 : mix(vec3(0.86, 0.89, 0.94), vTRim, 0.18);
    } else if (vTPart > 2.5) {
      // Knobs: the tread's skin, their tops a touch lighter where they wear.
      vec3 k = skin > 0 ? tSkin(skin, base, vTRim, vTAccent, vTLocal, ang, rr, false, emi) : base;
      col = k * mix(0.85, 1.12, smoothstep(0.96, 1.02, rr));
    } else if (vTPart < 0.5) {
      float outer = smoothstep(0.86, 0.95, rr);
      if (skin > 0) {
        col = tSkin(skin, base, vTRim, vTAccent, vTLocal, ang, rr, false, emi);
      } else {
        // Rubber: fine sipes across the tread, the sidewall a shade darker.
        float sipe = step(0.88, fract(ang / TTAU * 52.0));
        col *= mix(0.88, 1.0 - sipe * 0.25, outer);
      }
      // A coloured stripe round each sidewall, as on racing tires.
      float side = tBand(rr, 0.59, 0.64, 0.008) * (1.0 - outer) * step(0.5, vTStripe + (skin == 0 ? 1.0 : 0.0));
      col = mix(col, vTAccent, side * 0.9);
      // The racing stripe round the middle of the tread.
      float tread = smoothstep(0.93, 0.98, rr);
      float centre = (1.0 - smoothstep(0.045, 0.06, abs(vTLocal.x))) * tread * step(0.5, vTStripe);
      col = mix(col, vTAccent, centre);
      // The best tires' stripes and sidewall rings glow, pulsing round the tire.
      float pulse = 0.65 + 0.35 * sin(uTTime * 4.0 - ang * 2.0);
      stripeGlow = (centre + side) * step(1.5, vTStripe) * pulse;
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
          tint = mix(vTAccent, tHue(ang / TTAU + uTTime * 0.15), 0.5);
        }
        m = clamp(m, 0.0, 1.0) * face;
        col = mix(vTRim, tint, m);
        // The rim's edge and barrel, seen from the side, stay the rim's colour.
        col *= mix(0.8, 1.0, face);
        glow = m;
        // Metal and gem tires' rims shine and sparkle like the rest of them.
        if (skin == 3) col *= 0.8 + 0.35 * (0.5 + 0.5 * sin(ang * 2.0 - uTTime * 1.6));
        if (skin == 4 || skin == 14 || skin == 17) {
          float sp = tSparkle(vTLocal.yz * 9.0, 0.6);
          col += vec3(sp);
          emi += sp * 2.5;
        }
      }
    } else {
      // The hub cap: the accent colour, lit.
      col = vTAccent;
      glow = 1.0;
    }
    diffuseColor.rgb = col;
    // Shiny tires light their designs up; the lava one flickers.
    float flick = 0.75 + 0.25 * sin(uTTime * 5.0 + ang * 3.0);
    totalEmissiveRadiance += vTAccent * glow * (vTDesign > 6.5 ? 0.45 * flick : 0.12);
    totalEmissiveRadiance += vTAccent * stripeGlow * 0.9;
    totalEmissiveRadiance += col * emi * 0.35;
  }
`

/** Glossy rims, after lighting: a highlight and a rim light; metal and gems shine hardest. */
const SHINE_GLSL = /* glsl */ `
  {
    vec3 tV = normalize(vViewPosition);
    vec3 tN = normalize(normal);
    if (dot(tN, tV) < 0.0) tN = -tN;
    vec3 tH = normalize(normalize(vec3(0.45, 0.85, 0.35)) + tV);
    int tSkinId = int(vTSkin + 0.5);
    float tShiny = (tSkinId == 3 || tSkinId == 4 || tSkinId == 10 || tSkinId == 14 || tSkinId == 17) ? 1.0 : 0.0;
    float tChrome = step(3.5, vTPart) * step(vTPart, 4.5);
    float tPower = tChrome > 0.5 || tShiny > 0.5 ? 60.0 : 30.0;
    float tAmount = tChrome > 0.5 ? 1.4 : vTPart > 4.5 ? 0.9 : tShiny > 0.5 ? 1.2 : vTPart > 2.5 ? 0.12 : vTPart > 0.5 ? 0.8 : 0.22;
    float tSpec = pow(max(dot(tN, tH), 0.0), tPower) * tAmount;
    float tRimLight = pow(1.0 - max(dot(tN, tV), 0.0), 3.0) * (tShiny > 0.5 ? 0.4 : 0.22);
    outgoingLight += vec3(tSpec + tRimLight);
  }
`

let sharedMaterial = null

/** The one material every tire uses. */
export function tireMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new MeshLambertMaterial({ color: 0xffffff, emissive: new Color('#ffffff'), emissiveIntensity: 0.06 })
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
    sharedMaterial.customProgramCacheKey = () => 'tire-v4'
  }
  return sharedMaterial
}

/**
 * Up to `max` tires in one draw call. Place them with setMatrixAt (scale X by
 * tireWidth for the right tread) and style them with `setStyle(index, tireId)`; set
 * `.count` to how many to draw.
 */
export function createTireMesh(max) {
  const base = tireBaseGeometry()
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
    design.setX(i, styleOf(id).design)
    const st = styleOf(id)
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
 * A single tire with a soft glow behind it, for the one you roll and the one waiting
 * on the Roll Zone. `setTire(id)` restyles it (and its width); `dispose()` frees what
 * it owns. The group is the tire's centre; turn `group.spin` (a child) to roll it.
 *
 * @param {{ glowSize?: number, glowIntensity?: number }} options
 */
export function createTireModel({ glowSize = 2.6, glowIntensity = 0.7 } = {}) {
  const tire = createTireMesh(1)
  tire.count = 1
  const glow = createGlowInstances(1, glowIntensity)
  glow.setMatrixAt(0, _m.identity())
  glow.count = 1
  glow.scale.setScalar(glowSize)

  const spin = new Group()
  spin.add(tire)
  const group = new Group()
  group.add(glow, spin)
  group.spin = spin
  let current = null

  group.setTire = (id) => {
    if (id === current) return
    current = id
    tire.setStyle(0, id)
    tire.setMatrixAt(0, _m.makeScale(tireWidth(id), 1, 1))
    tire.instanceMatrix.needsUpdate = true
    glow.setColorAt(0, tireGlow(id))
    glow.instanceColor.needsUpdate = true
  }
  /** Halo size, e.g. from the quality preset; 0 hides it. */
  group.setGlowSize = (size) => {
    glow.visible = size > 0
    glow.scale.setScalar(Math.max(size, 0.001))
  }
  group.dispose = () => {
    disposeTireMesh(tire)
    disposeGlow(glow)
  }

  group.setTire('bicycle')
  return group
}

/** Writes a tire's matrix: centred at `position`, turned by `quaternion`, `size` across. */
export function tireMatrix(position, quaternion, size, id, out) {
  return out.compose(position, quaternion, _s.set(size * tireWidth(id), size, size))
}
