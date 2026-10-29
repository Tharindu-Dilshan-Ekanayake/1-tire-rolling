/**
 * The slide's distance counter and zone name are DOM elements written from the frame
 * loop. The overlay registers them here; the renderer writes the distance at most
 * UPDATE_HZ times a second and only when the whole-metre value changes, and the zone
 * name only when you cross into a new zone, so React never re-renders during a slide.
 */
import { formatDistance } from '@shared/format'

const UPDATE_MS = 1000 / 15

/** The stacked text spans (outline and fill) that show the distance, and the zone's. */
let distanceSpans = []
let zoneSpans = []
let zoneFill = null
let shown = -1
let shownZone = null
let lastWrite = 0

export function setSlideHudElement(el) {
  distanceSpans = el ? [...el.querySelectorAll('[data-distance]')] : []
  zoneSpans = el ? [...el.querySelectorAll('[data-zone]')] : []
  zoneFill = el ? el.querySelector('[data-zone-fill]') : null
  shown = -1
  shownZone = null
  lastWrite = 0
}

export function writeDistance(meters, now = performance.now()) {
  const m = Math.max(0, Math.floor(meters))
  if (distanceSpans.length === 0 || m === shown || now - lastWrite < UPDATE_MS) return
  shown = m
  lastWrite = now
  const text = formatDistance(m)
  for (const span of distanceSpans) span.textContent = text
}

/** Shows `name` under the distance, filled with `gradient` (a CSS gradient). */
export function writeZone(name, gradient) {
  if (zoneSpans.length === 0 || name === shownZone) return
  shownZone = name
  for (const span of zoneSpans) span.textContent = name
  if (zoneFill) zoneFill.style.backgroundImage = gradient
}
