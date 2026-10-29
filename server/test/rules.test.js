import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BOARDS, EGGS, levelCap, rebirthMultiplier, SHOP, slideForLevel, TUTORIAL, WORLD_PORTALS } from '../../shared/balance.js'
import { formatNumber } from '../../shared/format.js'
import {
  applyRebirth,
  applySlide,
  applyTrain,
  buyBoard,
  buySlidePack,
  createProfile,
  dailyStatus,
  hatchEgg,
  levelFor,
  normalizeProfile,
  skipRebirth,
  slideDistance,
  slidePacks,
} from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { BELT_FAR_X, BELT_NEAR_X, BOARD_PADS, isSlideReturn, PORTALS, SLIDE_RETURN, SLIDE_ZONE, SPAWN, treadmillCenterZ } from '../../shared/world.js'

const onBelt = (i) => ({ x: (BELT_NEAR_X + BELT_FAR_X) / 2, y: 0.5, z: treadmillCenterZ(i) })
const inZone = () => ({ x: 0, y: 0, z: (SLIDE_ZONE.minZ + SLIDE_ZONE.maxZ) / 2 })

test('numbers format like the HUD', () => {
  assert.deepEqual(
    [0, 999, 1000, 1234, 7300, 14000, 2.5e6, 9999].map(formatNumber),
    ['0', '999', '1K', '1.2K', '7.3K', '14K', '2.5M', '9.9K'],
  )
})

test('first rebirth is at level 15, then +8 levels and +0.5x per rebirth', () => {
  assert.deepEqual([0, 1, 2, 3].map(levelCap), [15, 23, 31, 39])
  assert.deepEqual([0, 1, 2, 3].map(rebirthMultiplier), [1, 1.5, 2, 2.5])
})

test('levels follow Slide like the reference: 200 / 237 / 280 for levels 13-15', () => {
  assert.deepEqual([13, 14, 15].map(slideForLevel), [200, 237, 280])
  assert.equal(levelFor(0, 0), 1)
  assert.equal(levelFor(279, 0), 14)
  assert.equal(levelFor(280, 0), 15)
  assert.equal(levelFor(1e9, 0), 15, 'never past the cap')
})

test('about 280 Slide slides about a kilometre', () => {
  const d = slideDistance(280)
  assert.ok(d > 980 && d < 1080, `got ${d}`)
})

test('the free treadmill gives +1 a step and stops at max level', () => {
  const p = createProfile('a', 'A')
  for (let i = 0; i < 10; i += 1) applyTrain(p, 0, 0)
  assert.equal(p.slide, 10)
  for (let i = 0; i < 1000; i += 1) applyTrain(p, 0, 0)
  assert.equal(p.slide, slideForLevel(15))
  assert.equal(p.level, 15)
})

test('boards and rebirths multiply gains', () => {
  const p = createProfile('a', 'A')
  p.ownedBoards.push('sky', 'sunny')
  p.equippedBoard = 'sunny'
  applyTrain(p, 0, 0)
  assert.equal(p.slide, 1.4)
  p.rebirths = 1
  applyTrain(p, 1, 0)
  assert.equal(p.slide, 1.4 + 1.4 * 2 * 1.5)
})

test('rebirth needs max level, resets Slide, keeps Wins and boards', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyRebirth(p).ok, false)
  for (let i = 0; i < 400; i += 1) applyTrain(p, 0, 0)
  p.wins = 50
  assert.equal(applyRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.equal(p.slide, 0)
  assert.equal(p.level, 1)
  assert.equal(p.wins, 50)
})

test('skipping to a rebirth costs Wins', () => {
  const p = createProfile('a', 'A')
  assert.equal(skipRebirth(p).ok, false)
  p.wins = 1e9
  assert.equal(skipRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.ok(p.wins < 1e9)
})

test('locked treadmills give nothing', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyTrain(p, 1, 0).ok, false)
  assert.equal(p.slide, 0)
})

test('boards are bought in order with Wins', () => {
  const p = createProfile('a', 'A')
  p.wins = 1000
  assert.equal(buyBoard(p, BOARDS[3].id).ok, false)
  assert.equal(buyBoard(p, BOARDS[1].id).ok, true)
  assert.equal(p.wins, 1000 - BOARDS[1].cost)
  assert.equal(p.equippedBoard, BOARDS[1].id)
})

test('Slide packs scale with your level and ignore the cap', () => {
  const p = createProfile('a', 'A')
  const early = slidePacks(p)
  p.slide = 250
  p.level = levelFor(p.slide, 0)
  const later = slidePacks(p)
  assert.ok(later[0].amount > early[0].amount)
  p.wins = later[3].price
  assert.equal(buySlidePack(p, 3).ok, true)
  assert.equal(p.slide, 250 + later[3].amount)
  assert.equal(p.level, 15)
  assert.equal(p.wins, 0)
})

test('egg odds add up to 100% and hatching charges wins', () => {
  for (const [id, egg] of Object.entries(EGGS)) {
    assert.equal(egg.pets.reduce((s, [, w]) => s + w, 0), 100, id)
  }
  const p = createProfile('a', 'A')
  p.wins = 60
  const r = hatchEgg(p, 'basic', 1, { rand: () => 0 })
  assert.equal(r.ok, true)
  assert.equal(p.wins, 0)
  assert.equal(p.pets[0].id, 'cat')
  assert.deepEqual(p.equippedPets, [p.pets[0].uid])
})

test('slides pay wins and never consume Slide', () => {
  const p = createProfile('a', 'A')
  p.slide = 280
  const r = applySlide(p, 0)
  assert.equal(p.slide, 280)
  assert.ok(r.wins > 0 && p.wins === r.wins)
  assert.equal(r.best, true)
  assert.equal(applySlide(p, 0).best, false)
})

test('daily rewards unlock one per day', () => {
  const p = createProfile('a', 'A')
  const states = dailyStatus(p, 0).map((d) => d.state)
  assert.deepEqual(states.slice(0, 3), ['ready', 'next', 'locked'])
})

test('corrupt or old saves load safely', () => {
  const p = normalizeProfile({ pets: [{ uid: 1, id: 'nope' }], equippedPets: [1], ownedBoards: ['nope'], slide: 'x' }, 'x', 'X')
  assert.deepEqual(p.pets, [])
  assert.deepEqual(p.equippedPets, [])
  assert.deepEqual(p.ownedBoards, ['wood'])
  assert.equal(p.slide, 0)
})

test('the session only trains where the player really stands', () => {
  const events = []
  const pos = { x: 0, y: 0, z: 0 }
  const s = new PlayerSession(createProfile('a', 'A'), { now: 0, emit: (t) => events.push(t), getPosition: () => pos })
  s.handle('enterTreadmill', { treadmill: 0 }, 0)
  s.tick(2, 0)
  assert.equal(s.profile.slide, 0, 'claimed a treadmill from spawn')
  Object.assign(pos, onBelt(0))
  s.tick(2, 0)
  assert.ok(s.profile.slide > 0)
})

test('slides start only from the slide zone, and Slide ticks in on the way down', () => {
  const events = []
  const pos = { x: 0, y: 0, z: 14 }
  const s = new PlayerSession(createProfile('a', 'A'), { now: 0, emit: (t) => events.push(t), getPosition: () => pos })
  s.handle('slide', {}, 1000)
  assert.equal(events.includes('slide'), false)
  Object.assign(pos, inZone())
  s.handle('slide', {}, 1000)
  assert.equal(events.filter((e) => e === 'slide').length, 1)
  s.handle('slide', {}, 1500)
  assert.equal(events.filter((e) => e === 'slide').length, 1, 'no second slide while sliding')
  for (let t = 1100; t < 4000; t += 100) s.tick(0.1, t)
  assert.ok(s.profile.slide >= 2, `got ${s.profile.slide}`)
  assert.equal(s.profile.tutorialStep, 1)
})

test('each world portal badges you only from its own swirl, with its own Wins', () => {
  const pos = { x: 0, y: 0, z: 0 }
  const s = new PlayerSession(createProfile('a', 'A'), { now: 0, emit: () => {}, getPosition: () => pos })
  const world3 = PORTALS.find((p) => p.id === 'world3')
  s.profile.wins = WORLD_PORTALS.world3.wins - 1
  s.handle('portal', {}, 0)
  assert.deepEqual(s.profile.badges, [], 'not from spawn')
  Object.assign(pos, { x: world3.x, z: world3.z })
  s.handle('portal', {}, 0)
  assert.deepEqual(s.profile.badges, [], 'one Win short')
  s.profile.wins += 1
  s.handle('portal', {}, 0)
  assert.deepEqual(s.profile.badges, ['world3'])
})

test('only the hop back from the slide zone skips the speed check', () => {
  assert.equal(isSlideReturn(inZone(), SLIDE_RETURN), true)
  assert.equal(isSlideReturn(SPAWN, SLIDE_RETURN), false, 'not from elsewhere in the lobby')
  assert.equal(isSlideReturn(inZone(), SPAWN), false, 'not to anywhere else')
})

test('the first slide pays enough for the first board, as the guide asks', () => {
  const p = createProfile('a', 'A')
  const r = applySlide(p, 0)
  assert.ok(r.wins >= BOARDS[1].cost, `first slide paid ${r.wins}, Sky Board costs ${BOARDS[1].cost}`)
  assert.equal(TUTORIAL[1].event, 'buyBoard')
  assert.equal(TUTORIAL[TUTORIAL.length - 1].event, 'slide', 'the guide ends with a second slide')
})

test('walking earns Slide, but teleports do not', () => {
  const pos = { x: 0, y: 0, z: 10 }
  const p = createProfile('a', 'A')
  const s = new PlayerSession(p, { now: 0, emit: () => {}, getPosition: () => pos })
  s.tick(0.1, 0)
  // Walk 41 m at 8.2 m/s: five "+1"s (one per 8 m).
  for (let i = 1; i <= 50; i += 1) {
    pos.x += 0.82
    s.tick(0.1, i * 100)
  }
  assert.equal(p.slide, 5)
  // A teleport across the lobby earns nothing.
  pos.x = -20
  s.tick(0.1, 6000)
  assert.equal(p.slide, 5)
})

test('boards can only be bought standing on their pad', () => {
  const pos = { x: 0, y: 0, z: 0 }
  const p = createProfile('a', 'A')
  p.wins = 100
  const s = new PlayerSession(p, { now: 0, emit: () => {}, getPosition: () => pos })
  s.handle('buyBoard', { id: 'sky' }, 0)
  assert.equal(p.ownedBoards.length, 1)
  Object.assign(pos, { x: BOARD_PADS[1].x, z: BOARD_PADS[1].z })
  s.handle('buyBoard', { id: 'sky' }, 0)
  assert.equal(p.ownedBoards.length, 2)
})

test('only brand-new players get the tutorial', () => {
  const fresh = normalizeProfile({ rebirths: 0, tutorialStep: 1 }, 'a', 'A')
  assert.equal(fresh.tutorialStep, 1)
  const reborn = normalizeProfile({ rebirths: 1, tutorialStep: 1 }, 'b', 'B')
  assert.equal(reborn.tutorialStep, TUTORIAL.length)
})

test('the shop sells for Wins only', () => {
  const p = createProfile('a', 'A')
  const s = new PlayerSession(p, { now: 0, emit: () => {}, getPosition: () => ({ x: 0, z: 0 }) })
  s.handle('purchase', { productId: 'slideX2' }, 0)
  assert.equal(p.passes.slideX2, undefined)
  p.wins = SHOP.slideX2.price + 7
  s.handle('purchase', { productId: 'slideX2' }, 0)
  assert.equal(p.passes.slideX2, true)
  assert.equal(p.wins, 7)
  applyTrain(p, 0, 0)
  assert.equal(p.slide, 2, 'x2 Slide doubles gains')
})
