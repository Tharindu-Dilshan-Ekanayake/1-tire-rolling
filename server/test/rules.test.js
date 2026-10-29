import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AD_REWARDS,
  GEM_PRODUCTS,
  healthForLevel,
  levelCap,
  rebirthMultiplier,
  TIRES,
  TUTORIAL,
  WALL_STOP,
  ZONES,
} from '../../shared/balance.js'
import { formatDistance, formatNumber } from '../../shared/format.js'
import {
  applyAdReward,
  applyGemProduct,
  applyRebirth,
  applyRoll,
  applyTrain,
  buyHealthPack,
  buyTire,
  createProfile,
  createSession,
  healthPacks,
  levelFor,
  normalizeProfile,
  rebirthSkipPrice,
  rollOutcome,
  rollReach,
  skipRebirth,
} from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { PAD_X, padCenterZ, ROLL_ZONE, SPAWN } from '../../shared/world.js'

const onPad = (i) => ({ x: PAD_X, y: 0.5, z: padCenterZ(i) })
const inRollZone = () => ({ x: 0, y: 0, z: (ROLL_ZONE.minZ + ROLL_ZONE.maxZ) / 2 })

/** A session for a fresh profile, recording every event it emits. */
function makeSession(pos, profile = createProfile('a', 'A')) {
  const events = []
  const session = new PlayerSession(profile, { now: 0, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos })
  return { session, profile, events, count: (type) => events.filter((e) => e.type === type).length }
}

/** Trains on pad 0 until max level. */
function maxOut(p) {
  for (let i = 0; i < 1e5 && p.level < levelCap(p.rebirths); i += 1) applyTrain(p, 0, 0)
}

// --- Formatting ------------------------------------------------------------------

test('numbers format like the HUD', () => {
  assert.deepEqual(
    [0, 999, 1000, 1234, 7300, 14000, 2.5e6, 9999].map(formatNumber),
    ['0', '999', '1K', '1.2K', '7.3K', '14K', '2.5M', '9.9K'],
  )
  assert.equal(formatDistance(1050.7), '1,050 m')
})

// --- Levels and rebirth ----------------------------------------------------------

test('max level is 15 + 8 per rebirth; each rebirth adds x1 to gains', () => {
  assert.deepEqual([0, 1, 2, 3].map(levelCap), [15, 23, 31, 39])
  assert.deepEqual([0, 1, 2, 3].map(rebirthMultiplier), [1, 2, 3, 4])
})

test('each level needs more Health than the last', () => {
  assert.equal(healthForLevel(1), 0)
  for (let level = 2; level <= 60; level += 1) {
    assert.ok(healthForLevel(level) > healthForLevel(level - 1), `level ${level}`)
  }
  assert.equal(levelFor(0, 0), 1)
  assert.equal(levelFor(healthForLevel(15) - 1, 0), 14)
  assert.equal(levelFor(1e12, 0), 15, 'never past the cap')
  assert.equal(levelFor(1e12, 1), 23)
})

test('the first pad gives the tire power per step and stops at max level', () => {
  const p = createProfile('a', 'A')
  for (let i = 0; i < 10; i += 1) applyTrain(p, 0, 0)
  assert.equal(p.health, 10)
  maxOut(p)
  assert.equal(p.health, healthForLevel(15))
  assert.equal(p.level, 15)
  assert.equal(applyTrain(p, 0, 0).gain, 0, 'no more natural gains at max level')
  assert.equal(p.health, healthForLevel(15))
})

test('locked pads give nothing', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyTrain(p, 1, 0).ok, false)
  assert.equal(p.health, 0)
})

test('better tires add power, rebirths multiply it', () => {
  const p = createProfile('a', 'A')
  p.ownedTires.push('mountain')
  p.equippedTire = 'mountain'
  applyTrain(p, 0, 0)
  assert.equal(p.health, TIRES[1].power)
  p.rebirths = 1
  p.health = 0
  p.level = 1
  applyTrain(p, 0, 0)
  assert.equal(p.health, TIRES[1].power * 2)
  applyTrain(p, 1, 0)
  assert.equal(p.health, TIRES[1].power * 2 + TIRES[1].power * 2 * 2, 'Speed Pad is x2 on top')
})

test('rebirth needs max level, resets Health, keeps Wins and tires', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyRebirth(p).ok, false)
  maxOut(p)
  p.wins = 50
  p.ownedTires.push('mountain')
  assert.equal(applyRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.equal(p.health, 0)
  assert.equal(p.level, 1)
  assert.equal(p.wins, 50)
  assert.deepEqual(p.ownedTires, ['bicycle', 'mountain'])
})

test('skipping to a rebirth costs Wins', () => {
  const p = createProfile('a', 'A')
  const price = rebirthSkipPrice(p)
  p.wins = price - 1
  assert.equal(skipRebirth(p).ok, false)
  assert.equal(p.rebirths, 0)
  p.wins = price + 5
  assert.equal(skipRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.equal(p.wins, 5)
  assert.equal(p.health, 0)
})

// --- Rolling ---------------------------------------------------------------------

test('a tire stops short of a wall its Health cannot break', () => {
  const wall = ZONES[1]
  const weak = rollOutcome(wall.wall - 1)
  assert.ok(rollReach(wall.wall - 1) > wall.start, 'it would roll past the wall on open ground')
  assert.equal(weak.blocked, 1)
  assert.equal(weak.broken, 0)
  assert.equal(weak.distance, wall.start - WALL_STOP)
})

test('enough Health smashes the wall and rolls on', () => {
  const strong = rollOutcome(ZONES[1].wall)
  assert.equal(strong.blocked, -1)
  assert.equal(strong.broken, 1)
  assert.ok(strong.distance > ZONES[1].start)
  assert.equal(rollOutcome(0).distance, rollReach(0), 'nothing in the way of a short roll')
})

test('rolls pay Wins without using Health; a zone prize pays only once', () => {
  const p = createProfile('a', 'A')
  p.health = ZONES[1].wall
  const first = applyRoll(p, 0)
  assert.equal(p.health, ZONES[1].wall)
  assert.deepEqual(first.discovered, [1])
  assert.equal(first.prize, ZONES[1].discover)
  assert.equal(first.best, true)
  assert.equal(p.wins, first.wins + first.prize)
  const second = applyRoll(p, 0)
  assert.equal(second.prize, 0)
  assert.deepEqual(second.discovered, [])
  assert.equal(second.best, false)
  assert.equal(p.stats.totalWins, first.wins + first.prize + second.wins)
  assert.equal(p.stats.rolls, 2)
})

test('the very first roll pays for the second tire, as the guide asks', () => {
  const p = createProfile('a', 'A')
  const r = applyRoll(p, 0)
  assert.ok(r.wins >= TIRES[1].cost)
})

// --- Buying ----------------------------------------------------------------------

test('tires are bought in order with Wins', () => {
  const p = createProfile('a', 'A')
  p.wins = 1000
  assert.equal(buyTire(p, TIRES[3].id).ok, false, 'skipping ahead')
  assert.equal(buyTire(p, TIRES[1].id).ok, true)
  assert.equal(p.wins, 1000 - TIRES[1].cost)
  assert.equal(p.equippedTire, TIRES[1].id)
  assert.equal(buyTire(p, TIRES[2].id).ok, true)
  assert.equal(buyTire(p, 'nope').ok, false)
  p.wins = 0
  assert.equal(buyTire(p, TIRES[3].id).ok, false, 'not enough Wins')
})

test('Health packs follow your level and ignore the cap', () => {
  const p = createProfile('a', 'A')
  const early = healthPacks(p)
  p.health = healthForLevel(10)
  p.level = levelFor(p.health, 0)
  const later = healthPacks(p)
  assert.ok(later[0].amount > early[0].amount)
  assert.ok(later[2].amount > later[0].amount)
  p.wins = later[2].price - 1
  assert.equal(buyHealthPack(p, 2).ok, false)
  p.wins = later[2].price
  const before = p.health
  assert.equal(buyHealthPack(p, 2).ok, true)
  assert.equal(p.health, before + later[2].amount)
  assert.equal(p.wins, 0)
  // Past the cap with packs: Health keeps climbing, the level stops at max.
  p.health = healthForLevel(15)
  p.level = 15
  p.wins = 1e9
  buyHealthPack(p, 0)
  assert.ok(p.health > healthForLevel(15))
  assert.equal(p.level, 15)
})

// --- Boxity products -------------------------------------------------------------

test('Gems products grant passes, and an owned pass turns into Wins', () => {
  const p = createProfile('a', 'A')
  const first = applyGemProduct(p, 'health_x2')
  assert.equal(first.ok, true)
  assert.equal(p.passes.healthX2, true)
  assert.equal(p.wins, 0)
  const again = applyGemProduct(p, 'health_x2')
  assert.ok(again.wins >= 10)
  assert.equal(p.wins, again.wins)
  assert.equal(p.stats.totalWins, again.wins)
  applyGemProduct(p, 'auto_roll')
  assert.equal(p.settings.autoRoll, true)
  applyGemProduct(p, 'potion_bundle')
  assert.deepEqual(p.items, { potionHealth: 3, potionWins: 3 })
  assert.equal(applyGemProduct(p, 'nope').ok, false)
  for (const sku of Object.keys(GEM_PRODUCTS)) assert.equal(applyGemProduct(createProfile('b', 'B'), sku).ok, true, sku)
})

test('ad rewards have a cooldown per placement', () => {
  const p = createProfile('a', 'A')
  const s = createSession(0)
  const [placement] = Object.keys(AD_REWARDS)
  const t0 = 1_000_000
  assert.equal(applyAdReward(p, s, placement, t0).ok, true)
  assert.equal(p.items.potionHealth, 1)
  assert.equal(applyAdReward(p, s, placement, t0 + 1000).ok, false)
  assert.equal(applyAdReward(p, s, placement, t0 + AD_REWARDS[placement].cooldownMs).ok, true)
  assert.equal(applyAdReward(p, s, 'nope', t0).ok, false)
})

// --- Saves -----------------------------------------------------------------------

test('old or corrupt saves load with defaults filled in', () => {
  const p = normalizeProfile(
    { health: 'x', wins: -5, pets: [{ uid: 1, id: 'nope' }], equippedPets: [1], ownedTires: ['nope'], equippedTire: 'nope', stats: { rolls: 3 } },
    'x',
    'X',
  )
  assert.equal(p.health, 0)
  assert.equal(p.wins, 0)
  assert.deepEqual(p.pets, [])
  assert.deepEqual(p.equippedPets, [])
  assert.deepEqual(p.ownedTires, ['bicycle'])
  assert.equal(p.equippedTire, 'bicycle')
  assert.equal(p.stats.rolls, 3)
  assert.equal(p.stats.bestDistance, 0)
  assert.deepEqual(p.settings, { autoRebirth: false, autoRoll: false })
  assert.deepEqual(normalizeProfile(null, 'y', 'Y'), createProfile('y', 'Y'))
  assert.equal(normalizeProfile({ health: healthForLevel(5) }, 'z', 'Z').level, 5, 'level recomputed from Health')
})

test('only brand-new players get the tutorial', () => {
  assert.equal(normalizeProfile({ rebirths: 0, tutorialStep: 1 }, 'a', 'A').tutorialStep, 1)
  assert.equal(normalizeProfile({ rebirths: 1, tutorialStep: 1 }, 'b', 'B').tutorialStep, TUTORIAL.length)
})

// --- The session -----------------------------------------------------------------

test('training only counts on the pad the player really stands on', () => {
  const pos = { x: SPAWN.x, y: 0, z: SPAWN.z }
  const { session, profile } = makeSession(pos)
  session.handle('enterPad', { pad: 0 }, 0)
  session.tick(0.1, 0)
  session.tick(2, 0)
  assert.equal(profile.health, 0, 'claimed a pad from spawn')
  Object.assign(pos, onPad(0))
  session.tick(0.1, 0)
  session.tick(2, 0)
  assert.ok(profile.health > 0)
  session.handle('enterPad', { pad: 1 }, 0)
  assert.equal(session.pad, 0, 'a locked pad cannot be entered')
})

test('the first guide step completes on the pad once Health reaches 30', () => {
  assert.equal(TUTORIAL[0].event, 'train')
  assert.equal(TUTORIAL[0].health, 30)
  const pos = onPad(0)
  const { session, profile } = makeSession(pos)
  session.handle('enterPad', { pad: 0 }, 0)
  let t = 0
  while (profile.health < 29) session.tick(0.1, (t += 100))
  assert.equal(profile.tutorialStep, 0)
  while (profile.health < 30) session.tick(0.1, (t += 100))
  assert.equal(profile.tutorialStep, 1)
})

test('rolls start only from the roll zone, one at a time', () => {
  const pos = { x: SPAWN.x, y: 0, z: SPAWN.z }
  const { session, profile, count } = makeSession(pos)
  session.handle('roll', {}, 1000)
  assert.equal(count('roll'), 0, 'not from spawn')
  Object.assign(pos, inRollZone())
  session.handle('roll', {}, 1000)
  assert.equal(count('roll'), 1)
  session.handle('roll', {}, 1500)
  assert.equal(count('roll'), 1, 'no second roll while the tire is out')
  // Health ticks in while the tire rolls.
  for (let t = 1100; t < 4000; t += 100) session.tick(0.1, t)
  assert.ok(profile.health >= 2, `got ${profile.health}`)
  session.handle('roll', {}, 1000 + session.busyUntil)
  assert.equal(count('roll'), 2, 'rolls again once the cooldown is over')
  assert.equal(profile.stats.rolls, 2)
})

test('ads and Gems are granted by the host only, never by a client message', () => {
  const { session, profile, count } = makeSession(inRollZone())
  session.handle('grantAdReward', { placement: 'health-potion' }, 0)
  session.handle('grantGemProduct', { sku: 'wins_big' }, 0)
  session.handle('adReward', { placement: 'health-potion' }, 0)
  assert.equal(profile.wins, 0)
  assert.deepEqual(profile.items, {})
  assert.equal(session.grantAdReward('health-potion', 1e6).ok, true)
  assert.equal(profile.items.potionHealth, 1)
  assert.equal(session.grantGemProduct('wins_big').ok, true)
  assert.ok(profile.wins > 0)
  assert.equal(count('reward'), 2)
})
