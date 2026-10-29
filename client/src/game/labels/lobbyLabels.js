import { BOARDS, EGGS, PETS, SHOP, TREADMILLS, WORLD_PORTALS } from '@shared/balance'
import { formatMultiplier, formatNumber } from '@shared/format'
import { isTreadmillUnlocked } from '@shared/logic'
import { BOARD_PADS, CONSOLE_X, EGG_STANDS, FREE_REWARD, PORTALS, SPHINX_STAND, treadmillCenterZ } from '@shared/world'

import { eggHeight } from '../world/eggs'
import { TREADMILL_THEMES } from '../world/structures'

/**
 * Text styles, as gradients top-to-bottom, matching the reference signage.
 */
export const TEXT = {
  gold: ['#fffaa8', '#ffd52a', '#ff9c00'],
  green: ['#e6ffb0', '#8dff4f', '#2fd12f'],
  price: ['#d9ff9a', '#7dff4a', '#2fd12f'],
  white: ['#ffffff', '#ffffff', '#dfe7f0'],
  red: ['#ffb0a8', '#ff4a3b', '#d4142a'],
  blue: ['#e0faff', '#7fe2ff', '#2fa8ff'],
}

const tint = (hex) => ['#ffffff', hex, hex]

/** "x2 Slide / 1 Rebirth", "x1 Slide / UNLOCKED", "x30 Slide / VERY OP! / 150K Wins"... */
export function treadmillLabelSpec(index, unlocked) {
  const treadmill = TREADMILLS[index]
  const theme = TREADMILL_THEMES[index]
  const lines = [{ text: `${formatMultiplier(treadmill.mult)} Slide`, size: 54, icon: 'slide', gradient: tint(theme.text) }]
  if (unlocked) {
    lines.push({ text: treadmill.rebirths === 0 && !treadmill.product ? 'FREE' : 'UNLOCKED', size: 44, gradient: TEXT.green })
  } else if (treadmill.product) {
    lines.push({ text: treadmill.tag, size: 46, rainbow: true })
    lines.push({ text: `${formatNumber(SHOP[treadmill.product].price)} Wins`, size: 42, icon: 'trophy', gradient: TEXT.gold })
  } else {
    const word = treadmill.rebirths === 1 ? 'Rebirth' : 'Rebirths'
    lines.push({ text: `${treadmill.rebirths} ${word}`, size: 44, icon: 'rebirth', gradient: TEXT.red })
  }
  return { lines, pxPerUnit: 50 }
}

/** Largest a treadmill label can get, so its atlas slot fits every state. */
const treadmillReserve = (index) => {
  const treadmill = TREADMILLS[index]
  const lines = [{ text: `${formatMultiplier(treadmill.mult)} Slide`, size: 54, icon: 'slide' }]
  if (treadmill.product) {
    lines.push({ text: treadmill.tag, size: 46 })
    lines.push({ text: `${formatNumber(SHOP[treadmill.product].price)} Wins`, size: 42, icon: 'trophy' })
  } else {
    lines.push({ text: 'UNLOCKED', size: 44, icon: 'rebirth' })
  }
  return { lines }
}

export function treadmillLabels(profile) {
  return TREADMILLS.map((treadmill, i) => ({
    id: `tread-${i}`,
    position: [CONSOLE_X, treadmill.product ? 6.6 : 5.9, treadmillCenterZ(i)],
    spec: treadmillLabelSpec(i, isTreadmillUnlocked(profile, i)),
    reserve: treadmillReserve(i),
    fade: 150,
  }))
}

/** Ownership state of each shop pad: 'equipped' | 'owned' | 'buy' | 'locked'. */
export function padState(profile, index) {
  const board = BOARDS[index]
  if (profile.equippedBoard === board.id) return 'equipped'
  if (profile.ownedBoards.includes(board.id)) return 'owned'
  const previous = BOARDS[index - 1]
  return !previous || profile.ownedBoards.includes(previous.id) ? 'buy' : 'locked'
}

/** "x1.65 Slide" over "120 Wins", "OWNED" or "EQUIPPED". */
export function padLabelSpec(index, state) {
  const board = BOARDS[index]
  const status =
    state === 'equipped'
      ? { text: 'EQUIPPED', size: 40, gradient: TEXT.gold }
      : state === 'owned'
        ? { text: 'OWNED', size: 40, gradient: TEXT.blue }
        : { text: `${formatNumber(board.cost)} Wins`, size: 40, icon: 'trophy', gradient: state === 'locked' ? TEXT.red : TEXT.price }
  return {
    lines: [{ text: `${formatMultiplier(board.mult)} Slide`, size: 42, icon: 'slide', fill: '#ffffff' }, status],
    pxPerUnit: 70,
  }
}

/** Largest a pad label can get, so its atlas slot fits every state. */
const padReserve = (index) => ({
  lines: [
    { text: `${formatMultiplier(BOARDS[index].mult)} Slide`, size: 42, icon: 'slide' },
    { text: `${formatNumber(BOARDS[index].cost)} Wins`, size: 40, icon: 'trophy' },
  ],
})

export function padLabels(profile) {
  return BOARD_PADS.map((pad) => ({
    id: `pad-${pad.index}`,
    // Each row back rides higher, so they clear the rows in front seen from the plaza.
    position: [pad.x, pad.y + 4.8 + pad.row * 1.25, pad.z],
    spec: padLabelSpec(pad.index, padState(profile, pad.index)),
    reserve: padReserve(pad.index),
    fade: 70,
  }))
}

export function eggLabels() {
  return EGG_STANDS.map((stand) => {
    const egg = EGGS[stand.eggId]
    const lines = stand.big
      ? [
          { text: 'Demon Egg', size: 54, gradient: TEXT.red },
          { text: `${formatNumber(egg.cost.wins)} Wins`, size: 46, icon: 'trophy', gradient: TEXT.gold },
        ]
      : [
          { text: `${egg.name} Egg`, size: 50, fill: '#ffffff' },
          { text: `${formatNumber(egg.cost.wins)} Wins`, size: 44, icon: 'trophy', gradient: TEXT.gold },
        ]
    return {
      id: `egg-${stand.eggId}`,
      position: [stand.x, eggHeight(stand) + (stand.big ? 4 : 2.5), stand.z],
      spec: { lines, pxPerUnit: 62 },
      fade: 100,
    }
  })
}

/** The limited Sphinx showcase: price, hype, and live stock. */
export function sphinxLabelSpec(stock) {
  const mult = PETS.sphinx.mult
  return {
    lines: [
      { text: `${formatNumber(SHOP.sphinx.price)} Wins`, size: 46, icon: 'trophy', gradient: TEXT.gold },
      { text: 'BEST IN GAME', size: 56, gradient: TEXT.red },
      { text: 'Sphinx', size: 76, fill: '#ffffff' },
      { text: `${formatNumber(mult * 100 - 100)}% BETTER`, size: 54, rainbow: true },
      { text: `${formatNumber(stock)} Left`, size: 50, gradient: TEXT.green },
    ],
    pxPerUnit: 48,
  }
}

export function sphinxLabel(stock) {
  return {
    id: 'sphinx',
    position: [SPHINX_STAND.x, 11.5, SPHINX_STAND.z],
    spec: sphinxLabelSpec(stock),
    reserve: sphinxLabelSpec(88888),
    fade: 140,
  }
}

const freeRewardLabel = () => ({
  id: 'free-reward',
  position: [FREE_REWARD.x, 4.6, FREE_REWARD.z],
  spec: { lines: [{ text: 'FREE REWARD', size: 50, gradient: ['#fff2b0', '#ffb347', '#ff6a1e'] }], pxPerUnit: 60 },
  fade: 90,
})

/** "WORLD 2", or "WORLD 3 / HALLOWEEN" in pumpkin orange and purple, and the Wins needed. */
const portalLabel = (portal) => {
  const halloween = portal.id === 'world3'
  const lines = halloween
    ? [
        { text: 'WORLD 3', size: 60, gradient: ['#fff1c2', '#ffa53b', '#ff6a00'] },
        { text: 'HALLOWEEN', size: 46, gradient: ['#f3d9ff', '#c27bff', '#7a2fd6'] },
      ]
    : [{ text: 'WORLD 2', size: 60, gradient: TEXT.green }]
  lines.push({ text: `Need ${formatNumber(WORLD_PORTALS[portal.id].wins)} Wins`, size: 42, icon: 'trophy', gradient: TEXT.white })
  return {
    id: `portal-${portal.id}`,
    // A line higher for the extra line, so it still clears the ring.
    position: [portal.x, portal.radius * 2 + (halloween ? 3.4 : 2.8), portal.z],
    spec: { lines, pxPerUnit: 56 },
    fade: 140,
  }
}

/** Every label in the lobby. */
export function lobbyLabels(profile, { sphinxStock = 0 } = {}) {
  return [...treadmillLabels(profile), ...padLabels(profile), ...eggLabels(), sphinxLabel(sphinxStock), freeRewardLabel(), ...PORTALS.map(portalLabel)]
}
