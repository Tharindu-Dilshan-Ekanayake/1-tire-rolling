/**
 * The roll's distance counter, zone name and zone progress bar are DOM elements written
 * from the frame loop. The overlay registers them here; the renderer writes the
 * distance (and moves your marker along the bar) at most UPDATE_HZ times a second and
 * only when the whole-metre value changes, and the zone name only when the tire crosses
 * into a new zone, so React never re-renders during a roll.
 */
import { ZONES } from '@shared/balance'
import { formatDistance } from '@shared/format'
import { zoneIndexAt } from '@shared/logic'

const UPDATE_MS = 1000 / 15

/** The stacked text spans (outline and fill) that show the distance, and the zone's. */
let distanceSpans = []
let zoneSpans = []
let zoneFill = null
let marker = null
let shown = -1
let shownZone = null
let lastWrite = 0

export function setRollHudElement(el) {
  distanceSpans = el ? [...el.querySelectorAll('[data-distance]')] : []
  zoneSpans = el ? [...el.querySelectorAll('[data-zone]')] : []
  zoneFill = el ? el.querySelector('[data-zone-fill]') : null
  marker = el ? el.querySelector('[data-zone-marker]') : null
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
  if (marker) marker.style.left = `${zoneBarPosition(m) * 100}%`
}

/**
 * Where metre `m` sits on the zone progress bar, 0-1: each zone gets an equal segment,
 * filled by how far through that zone the tire is (the last zone's segment fills over
 * as long again as the one before it).
 */
export function zoneBarPosition(m) {
  const i = zoneIndexAt(m)
  const start = ZONES[i].start
  const end = i + 1 < ZONES.length ? ZONES[i + 1].start : start * 2
  return (i + Math.min(1, (m - start) / Math.max(1, end - start))) / ZONES.length
}

/** Shows zone `index`'s `name` under the distance, filled with `gradient` (a CSS gradient). */
export function writeZone(index, name, gradient) {
  if (zoneSpans.length === 0 || name === shownZone) return
  shownZone = name
  for (const span of zoneSpans) span.textContent = name
  if (zoneFill) zoneFill.style.backgroundImage = gradient
}
