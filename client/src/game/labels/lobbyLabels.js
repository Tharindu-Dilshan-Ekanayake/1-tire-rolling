import { EGGS, PADS, PETS, RARITIES, SHOP, TIRES, WORLD_PORTALS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isPadUnlocked } from '@shared/logic'
import { EGG_STANDS, FREE_REWARD, PAD_HEIGHT, PAD_X, padCenterZ, PORTALS, SPHINX_STAND, TIRE_STANDS } from '@shared/world'

import { eggHeight } from '../world/eggs'
import { PAD_THEMES } from '../world/structures'

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

/** "4x HEALTH / 2 Rebirths", "1x HEALTH / UNLOCKED", "40x HEALTH / VERY OP! / 150K Wins"... */
export function padLabelSpec(index, unlocked) {
  const pad = PADS[index]
  const theme = PAD_THEMES[index]
  const lines = [{ text: `${formatNumber(pad.mult)}x HEALTH`, size: 54, icon: 'heart', gradient: tint(theme.text) }]
  if (unlocked) {
    lines.push({ text: pad.rebirths === 0 && !pad.product ? 'FREE' : 'UNLOCKED', size: 44, gradient: TEXT.green })
  } else if (pad.product) {
    lines.push({ text: pad.tag, size: 46, rainbow: true })
    lines.push({ text: `${formatNumber(SHOP[pad.product].price)} Wins`, size: 42, icon: 'trophy', gradient: TEXT.gold })
  } else {
    const word = pad.rebirths === 1 ? 'Rebirth' : 'Rebirths'
    lines.push({ text: `LOCKED: ${pad.rebirths} ${word}`, size: 44, icon: 'rebirth', gradient: TEXT.red })
  }
  return { lines, pxPerUnit: 50 }
}

/** Largest a pad label can get, so its atlas slot fits every state. */
const padReserve = (index) => {
  const pad = PADS[index]
  const lines = [{ text: `${formatNumber(pad.mult)}x HEALTH`, size: 54, icon: 'heart' }]
  if (pad.product) {
    lines.push({ text: pad.tag, size: 46 })
    lines.push({ text: `${formatNumber(SHOP[pad.product].price)} Wins`, size: 42, icon: 'trophy' })
  } else {
    lines.push({ text: 'LOCKED: 88 Rebirths', size: 44, icon: 'rebirth' })
  }
  return { lines }
}

export function padLabels(profile) {
  return PADS.map((pad, i) => ({
    id: `pad-${i}`,
    // Above the tire spinning over the pad.
    position: [PAD_X, PAD_HEIGHT + (pad.product ? 7.6 : 6.9), padCenterZ(i)],
    spec: padLabelSpec(i, isPadUnlocked(profile, i)),
    reserve: padReserve(i),
    fade: 150,
  }))
}

/** Ownership state of each tire stand: 'equipped' | 'owned' | 'buy' | 'locked'. */
export function standState(profile, index) {
  const tire = TIRES[index]
  if (profile.equippedTire === tire.id) return 'equipped'
  if (profile.ownedTires.includes(tire.id)) return 'owned'
  const previous = TIRES[index - 1]
  return !previous || profile.ownedTires.includes(previous.id) ? 'buy' : 'locked'
}

/** A tire's rarity line: in its rarity's colour, rainbow for the Secret ones. */
const rarityLine = (tire) => {
  const rarity = RARITIES[tire.rarity]
  return tire.rarity === 'secret'
    ? { text: rarity.name.toUpperCase(), size: 36, rainbow: true }
    : { text: rarity.name.toUpperCase(), size: 34, gradient: tint(rarity.color) }
}

/** "MYTHIC" over "Diamond Tire", "+7M" and "1B Wins", "Owned" or "Equipped", as in the reference. */
export function standLabelSpec(index, state) {
  const tire = TIRES[index]
  const status =
    state === 'equipped'
      ? { text: 'Equipped', size: 40, gradient: TEXT.green }
      : state === 'owned'
        ? { text: 'Owned', size: 40, gradient: TEXT.blue }
        : { text: `${formatNumber(tire.cost)} Wins`, size: 40, icon: 'trophy', gradient: state === 'locked' ? TEXT.red : TEXT.price }
  return {
    lines: [
      rarityLine(tire),
      { text: tire.name, size: 46, fill: '#ffffff' },
      { text: `+${formatNumber(tire.power)}`, size: 42, icon: 'heart', gradient: TEXT.gold },
      status,
    ],
    pxPerUnit: 70,
  }
}

/** Largest a stand label can get, so its atlas slot fits every state. */
const standReserve = (index) => ({
  lines: [
    { text: 'LEGENDARY', size: 36 },
    { text: TIRES[index].name, size: 46 },
    { text: `+${formatNumber(TIRES[index].power)}`, size: 42, icon: 'heart' },
    { text: `${formatNumber(TIRES[index].cost)} Wins`, size: 40, icon: 'trophy' },
  ],
})

export function standLabels(profile) {
  return TIRE_STANDS.map((stand) => ({
    id: `stand-${stand.index}`,
    // Each row back rides higher, so they clear the rows in front seen from the plaza.
    position: [stand.x, stand.y + 6.8 + stand.row * 1.35, stand.z],
    spec: standLabelSpec(stand.index, standState(profile, stand.index)),
    reserve: standReserve(stand.index),
    fade: 70,
  }))
}

export function eggLabels() {
  return EGG_STANDS.map((stand) => {
    const egg = EGGS[stand.eggId]
    const lines = stand.big
      ? [
          { text: 'Volcano Egg', size: 54, gradient: TEXT.red },
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

/** "WORLD 2" and the Wins needed. */
const portalLabel = (portal) => ({
  id: `portal-${portal.id}`,
  position: [portal.x, portal.radius * 2 + 2.8, portal.z],
  spec: {
    lines: [
      { text: 'WORLD 2', size: 60, gradient: TEXT.green },
      { text: `Need ${formatNumber(WORLD_PORTALS[portal.id].wins)} Wins`, size: 42, icon: 'trophy', gradient: TEXT.white },
    ],
    pxPerUnit: 56,
  },
  fade: 140,
})

/** Every label in the lobby. */
export function lobbyLabels(profile, { sphinxStock = 0 } = {}) {
  return [...padLabels(profile), ...standLabels(profile), ...eggLabels(), sphinxLabel(sphinxStock), freeRewardLabel(), ...PORTALS.map(portalLabel)]
}
