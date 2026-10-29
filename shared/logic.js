import {
  BADGES,
  BASE_GAIN,
  BOARDS,
  DAILY_INTERVAL_MS,
  DAILY_REWARDS,
  EGGS,
  FREE_REWARD,
  ITEMS,
  levelCap,
  MAX_EQUIPPED_PETS,
  MAX_PET_INVENTORY,
  OFFLINE_MAX_MS,
  OFFLINE_MIN_MS,
  OFFLINE_RATE,
  PETS,
  PLAYTIME_REWARDS,
  RARITIES,
  REBIRTH_SKIP_SLIDES,
  rebirthMultiplier,
  SHOP,
  SLIDE_BASE,
  SLIDE_K,
  SLIDE_PACKS,
  SLIDE_RECOVERY,
  slideDuration,
  slideForLevel,
  TRAIN_INTERVAL,
  TREADMILLS,
  TROPHY_FIRST,
  TROPHY_METERS,
  TROPHY_SPACING,
  TUTORIAL,
  ZONES,
} from './balance.js'

/**
 * Game rules as pure functions over a plain profile object.
 *
 * The server runs these authoritatively; the client runs the very same functions for
 * offline play and for display (costs, multipliers, what a button would do). Mutating
 * functions change the profile in place and return a small result describing what
 * happened, which is what gets sent to the client as an event.
 *
 * `session` is the per-connection state that is never saved: when this session
 * started, which playtime rewards were claimed, the free-reward flag.
 */

export const PROFILE_VERSION = 1

export function createProfile(id, name) {
  return {
    v: PROFILE_VERSION,
    id,
    name,
    slide: 0,
    wins: 0,
    rebirths: 0,
    level: 1,
    equippedBoard: 'wood',
    ownedBoards: ['wood'],
    pets: [],
    equippedPets: [],
    nextPetUid: 1,
    items: {},
    boosts: { slide: 0, wins: 0 },
    passes: {},
    daily: { start: 0, claimed: [] },
    freeRewardClaimed: false,
    tutorialStep: 0,
    badges: [],
    stats: { slides: 0, trains: 0, bestDistance: 0, playtime: 0, bestSlide: 0 },
    lastTreadmill: -1,
    lastSeen: 0,
    settings: { autoRebirth: false },
  }
}

/** Fills in anything missing from an older or partial save. Never throws. */
export function normalizeProfile(raw, id, name) {
  const base = createProfile(id, name)
  if (!raw || typeof raw !== 'object') return base
  const p = { ...base, ...raw, id, name: name || raw.name || base.name }
  p.boosts = { ...base.boosts, ...(raw.boosts || {}) }
  p.stats = { ...base.stats, ...(raw.stats || {}) }
  p.settings = { ...base.settings, ...(raw.settings || {}) }
  p.daily = { ...base.daily, ...(raw.daily || {}) }
  p.items = Object.fromEntries(Object.entries(raw.items || {}).filter(([itemId]) => ITEMS[itemId]))
  p.passes = { ...(raw.passes || {}) }
  p.slide = Number.isFinite(raw.slide) ? Math.max(0, raw.slide) : 0
  p.pets = Array.isArray(raw.pets) ? raw.pets.filter((pet) => PETS[pet?.id]) : []
  p.equippedPets = Array.isArray(raw.equippedPets)
    ? raw.equippedPets.filter((uid) => p.pets.some((pet) => pet.uid === uid)).slice(0, MAX_EQUIPPED_PETS)
    : []
  const owned = Array.isArray(raw.ownedBoards) ? raw.ownedBoards.filter((boardId) => boardIndex(boardId) >= 0) : []
  p.ownedBoards = owned.length ? owned : ['wood']
  if (!p.ownedBoards.includes(p.equippedBoard)) p.equippedBoard = p.ownedBoards[0]
  // Levels follow from Slide; recompute rather than trust a stored one.
  p.level = levelFor(p.slide, p.rebirths)
  // The tutorial is for brand-new players only: anyone who has rebirthed is past it.
  if (p.rebirths > 0) p.tutorialStep = TUTORIAL.length
  p.v = PROFILE_VERSION
  return p
}

export function createSession(now) {
  return { start: now, playtimeClaimed: [], freeRewardTaken: false }
}

// --- Lookups ------------------------------------------------------------------------

export const boardIndex = (id) => BOARDS.findIndex((b) => b.id === id)
export const boardById = (id) => BOARDS.find((b) => b.id === id) || BOARDS[0]

export function isTreadmillUnlocked(profile, index) {
  const treadmill = TREADMILLS[index]
  if (!treadmill) return false
  if (treadmill.product) return Boolean(profile.passes[treadmill.product])
  return profile.rebirths >= treadmill.rebirths
}

/**
 * Slide values are kept to a tenth below a million (the HUD shows "+1.8") and whole
 * above, so repeated small gains don't pile up float dust.
 */
export const tidy = (value) => (value < 1e6 ? Math.round(value * 10) / 10 : Math.round(value))

/** "Nice" price or amount: two significant figures (692 -> 690, 1934 -> 1900). */
export function niceRound(n) {
  if (n < 100) return Math.max(1, Math.round(n))
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

// --- Levels -------------------------------------------------------------------------

/** The level `slide` reaches, never above the cap for `rebirths`. */
export function levelFor(slide, rebirths) {
  const cap = levelCap(rebirths)
  let level = 1
  while (level < cap && slide >= slideForLevel(level + 1)) level += 1
  return level
}

export const isMaxLevel = (profile) => profile.level >= levelCap(profile.rebirths)

/** 0..1 through the current level: what the level bar fills to. */
export function levelProgress(profile) {
  if (isMaxLevel(profile)) return 1
  const from = slideForLevel(profile.level)
  const to = slideForLevel(profile.level + 1)
  return Math.max(0, Math.min(1, (profile.slide - from) / Math.max(1e-9, to - from)))
}

/** 0..1 progress towards being able to rebirth, by levels. */
export function rebirthProgress(profile) {
  const cap = levelCap(profile.rebirths)
  if (profile.level >= cap) return 1
  return Math.max(0, Math.min(1, (profile.level - 1 + levelProgress(profile)) / Math.max(1, cap - 1)))
}

// --- Multipliers --------------------------------------------------------------------

/** Equipped pets stack additively: x3 and x2 together make x4, not x6. */
export function petMultiplier(profile) {
  let total = 1
  for (const uid of profile.equippedPets) {
    const pet = profile.pets.find((p) => p.uid === uid)
    if (pet && PETS[pet.id]) total += PETS[pet.id].mult - 1
  }
  return total
}

export const isBoostActive = (profile, kind, now) => (profile.boosts[kind] || 0) > now

/** The x2 Slide pass and potion; they stack. */
export function slideBoostMultiplier(profile, now) {
  return (profile.passes.slideX2 ? 2 : 1) * (isBoostActive(profile, 'slide', now) ? 2 : 1)
}

/** The x2 Wins pass and potion; they stack. */
export function winsMultiplier(profile, now) {
  return (profile.passes.winsX2 ? 2 : 1) * (isBoostActive(profile, 'wins', now) ? 2 : 1)
}

/** Everything that multiplies a Slide gain except where you earn it. */
export function gainMultiplier(profile, now) {
  return (
    boardById(profile.equippedBoard).mult *
    rebirthMultiplier(profile.rebirths) *
    petMultiplier(profile) *
    slideBoostMultiplier(profile, now)
  )
}

/** Slide from one treadmill step on treadmill `index`. */
export function treadmillGain(profile, index, now) {
  const treadmill = TREADMILLS[index]
  if (!treadmill) return 0
  return tidy(BASE_GAIN * treadmill.mult * gainMultiplier(profile, now))
}

/** Slide from one tick of sliding down the hill: the "+1". */
export const slideTickGain = (profile, now) => tidy(BASE_GAIN * gainMultiplier(profile, now))

// --- Training, levels, rebirth ------------------------------------------------------

/**
 * Banks a natural gain (treadmill or sliding) and the levels it reaches. Once you're at
 * max level natural gains stop: rebirth to keep going. Returns what was really added.
 */
function addSlide(profile, gain) {
  const cap = levelCap(profile.rebirths)
  if (profile.level >= cap) return { gain: 0, leveledUp: false, maxed: true }
  // Stops exactly on max level rather than overshooting it.
  const room = Math.max(0, slideForLevel(cap) - profile.slide)
  const added = tidy(Math.min(gain, room))
  profile.slide = tidy(profile.slide + added)
  profile.stats.trains += 1
  profile.stats.bestSlide = Math.max(profile.stats.bestSlide, profile.slide)
  const before = profile.level
  profile.level = levelFor(profile.slide, profile.rebirths)
  return { gain: added, leveledUp: profile.level > before, maxed: profile.level >= cap }
}

export function applyTrain(profile, index, now) {
  if (!isTreadmillUnlocked(profile, index)) return { ok: false, error: 'Treadmill locked' }
  profile.lastTreadmill = index
  return { ok: true, ...addSlide(profile, treadmillGain(profile, index, now)) }
}

/** One tick of Slide while sliding down the hill. */
export function applySlideTick(profile, now) {
  return { ok: true, ...addSlide(profile, slideTickGain(profile, now)) }
}

/** One step's worth of walking round the lobby: the same "+1" as a slide tick. */
export const applyWalkStep = applySlideTick

/** Rebirth: +1 rebirth; Slide and levels reset (Wins, boards and pets stay). */
export function applyRebirth(profile) {
  if (!isMaxLevel(profile)) return { ok: false, error: `Reach level ${levelCap(profile.rebirths)} first!` }
  profile.rebirths += 1
  profile.tutorialStep = TUTORIAL.length
  profile.slide = 0
  profile.level = 1
  return { ok: true, rebirths: profile.rebirths }
}

// --- Sliding ------------------------------------------------------------------------

export const slideDistance = (slide) => SLIDE_BASE + SLIDE_K * Math.sqrt(Math.max(0, slide))

export function zoneIndexAt(meter) {
  for (let i = ZONES.length - 1; i >= 0; i -= 1) {
    if (meter >= ZONES[i].start) return i
  }
  return 0
}

/** Metres of every trophy within `distance`. */
export function trophiesWithin(distance) {
  const out = []
  for (let m = TROPHY_FIRST; m <= distance; m += TROPHY_SPACING) out.push(m)
  return out
}

export const trophyValue = (meter) => Math.max(1, Math.round(ZONES[zoneIndexAt(meter)].winsPerMeter * TROPHY_METERS))

/** Wins for a slide before multipliers: metres slid in each zone, plus trophies. */
export function baseSlideWins(distance) {
  let wins = 0
  for (let i = 0; i < ZONES.length; i += 1) {
    const start = ZONES[i].start
    const end = i + 1 < ZONES.length ? ZONES[i + 1].start : Infinity
    const metres = Math.max(0, Math.min(distance, end) - start)
    wins += metres * ZONES[i].winsPerMeter
  }
  for (let m = TROPHY_FIRST; m <= distance; m += TROPHY_SPACING) wins += trophyValue(m)
  return wins
}

/**
 * A slide down the hill. Slide is not consumed. Returns everything the client needs to
 * replay it locally: distance, duration and the Wins earned (trophy positions follow
 * from the distance).
 */
export function applySlide(profile, now) {
  const distance = Math.round(slideDistance(profile.slide) * 10) / 10
  const multiplier = winsMultiplier(profile, now)
  const wins = Math.max(1, Math.round(baseSlideWins(distance) * multiplier))
  const best = distance > profile.stats.bestDistance
  profile.wins += wins
  profile.stats.slides += 1
  profile.stats.bestDistance = Math.max(profile.stats.bestDistance, distance)
  const duration = slideDuration(distance)
  return { ok: true, distance, wins, multiplier, best, duration, cooldown: duration + SLIDE_RECOVERY }
}

/** Wins (before multipliers) of a slide at your max level: what packs and skips cost in. */
export const maxSlideWins = (profile) => baseSlideWins(slideDistance(slideForLevel(levelCap(profile.rebirths))))

/**
 * The four Slide packs as they stand for you now: `[{ amount, price }]`. Both follow
 * the Slide your next level needs, and the Wins a slide with that much Slide pays.
 */
export function slidePacks(profile) {
  const next = slideForLevel(profile.level + 1)
  const wins = baseSlideWins(slideDistance(next))
  return SLIDE_PACKS.map((pack) => ({
    amount: niceRound(Math.max(10, next * pack.share)),
    price: niceRound(Math.max(5, wins * pack.slides)),
  }))
}

/** Buys Slide pack `index` with Wins. Packs ignore the level cap. */
export function buySlidePack(profile, index) {
  const pack = slidePacks(profile)[index]
  if (!pack) return { ok: false, error: 'Unknown pack' }
  if (profile.wins < pack.price) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= pack.price
  profile.slide = tidy(profile.slide + pack.amount)
  profile.stats.bestSlide = Math.max(profile.stats.bestSlide, profile.slide)
  profile.level = levelFor(profile.slide, profile.rebirths)
  return { ok: true, amount: pack.amount }
}

/** Wins to rebirth now without reaching max level first. */
export const rebirthSkipPrice = (profile) => niceRound(Math.max(50, maxSlideWins(profile) * REBIRTH_SKIP_SLIDES))

export function skipRebirth(profile) {
  if (isMaxLevel(profile)) return applyRebirth(profile)
  const price = rebirthSkipPrice(profile)
  if (profile.wins < price) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= price
  profile.level = levelCap(profile.rebirths)
  return applyRebirth(profile)
}

// --- Boards -------------------------------------------------------------------------

export function buyBoard(profile, boardId) {
  const board = BOARDS.find((b) => b.id === boardId)
  if (!board) return { ok: false, error: 'Unknown board' }
  if (profile.ownedBoards.includes(boardId)) return equipBoard(profile, boardId)
  const previous = BOARDS[boardIndex(boardId) - 1]
  if (previous && !profile.ownedBoards.includes(previous.id)) {
    return { ok: false, error: `Buy the ${previous.name} first!` }
  }
  if (profile.wins < board.cost) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= board.cost
  profile.ownedBoards.push(boardId)
  profile.equippedBoard = boardId
  return { ok: true, bought: true, boardId }
}

export function equipBoard(profile, boardId) {
  if (!profile.ownedBoards.includes(boardId)) return { ok: false, error: 'You don’t own that board' }
  profile.equippedBoard = boardId
  return { ok: true, equipped: true, boardId }
}

/** The next board in the shop you don't have yet, or null. */
export function nextBoard(profile) {
  return BOARDS.find((b) => !profile.ownedBoards.includes(b.id)) || null
}

// --- Pets --------------------------------------------------------------------------

function rollPet(eggId, rand) {
  const egg = EGGS[eggId]
  const total = egg.pets.reduce((sum, [, w]) => sum + w, 0)
  let r = rand() * total
  for (const [petId, weight] of egg.pets) {
    r -= weight
    if (r < 0) return petId
  }
  return egg.pets[egg.pets.length - 1][0]
}

export function addPet(profile, petId) {
  const pet = { uid: profile.nextPetUid++, id: petId }
  profile.pets.push(pet)
  // Auto-equip into a free slot, so a first pet does something straight away.
  if (profile.equippedPets.length < MAX_EQUIPPED_PETS) profile.equippedPets.push(pet.uid)
  return pet
}

/**
 * Hatches `count` eggs. `paid` says how: 'wins' charges the egg's Wins price, 'item'
 * consumes an egg item, 'free' is for reward grants already paid for.
 */
export function hatchEgg(profile, eggId, count = 1, { paid = 'wins', rand = Math.random } = {}) {
  const egg = EGGS[eggId]
  if (!egg) return { ok: false, error: 'Unknown egg' }
  if (profile.pets.length + count > MAX_PET_INVENTORY) return { ok: false, error: 'Pet inventory full!' }
  if (paid === 'wins') {
    if (!egg.cost.wins) return { ok: false, error: 'This egg is premium only' }
    const price = egg.cost.wins * count
    if (profile.wins < price) return { ok: false, error: 'Not enough Wins!' }
    profile.wins -= price
  } else if (paid === 'item') {
    const itemId = Object.keys(ITEMS).find((k) => ITEMS[k].kind === 'egg' && ITEMS[k].egg === eggId)
    if (!itemId || (profile.items[itemId] || 0) < count) return { ok: false, error: 'No eggs left' }
    profile.items[itemId] -= count
  }
  const pets = []
  for (let i = 0; i < count; i += 1) pets.push(addPet(profile, rollPet(eggId, rand)))
  return { ok: true, eggId, pets }
}

export function equipPet(profile, uid) {
  if (!profile.pets.some((p) => p.uid === uid)) return { ok: false, error: 'Unknown pet' }
  if (profile.equippedPets.includes(uid)) return { ok: true }
  if (profile.equippedPets.length >= MAX_EQUIPPED_PETS) return { ok: false, error: `Max ${MAX_EQUIPPED_PETS} pets equipped` }
  profile.equippedPets.push(uid)
  return { ok: true }
}

export function unequipPet(profile, uid) {
  profile.equippedPets = profile.equippedPets.filter((u) => u !== uid)
  return { ok: true }
}

const petScore = (pet) => PETS[pet.id]?.mult ?? 0

export function equipBestPets(profile) {
  const best = [...profile.pets].sort((a, b) => petScore(b) - petScore(a)).slice(0, MAX_EQUIPPED_PETS)
  profile.equippedPets = best.map((p) => p.uid)
  return { ok: true }
}

export function deletePet(profile, uid) {
  const before = profile.pets.length
  profile.pets = profile.pets.filter((p) => p.uid !== uid)
  profile.equippedPets = profile.equippedPets.filter((u) => u !== uid)
  return { ok: profile.pets.length < before }
}

/** Sort key for inventory display: equipped first, then rarity, then multiplier. */
export function petSortKey(profile, pet) {
  const info = PETS[pet.id]
  const equipped = profile.equippedPets.includes(pet.uid) ? 1 : 0
  return equipped * 1e6 + (RARITIES[info.rarity]?.order ?? 0) * 1e4 + info.mult
}

// --- Items & boosts ---------------------------------------------------------------

export function addItem(profile, itemId, amount = 1) {
  profile.items[itemId] = (profile.items[itemId] || 0) + amount
}

export function usePotion(profile, itemId, now) {
  const item = ITEMS[itemId]
  if (!item || item.kind !== 'potion') return { ok: false, error: 'Not a potion' }
  if ((profile.items[itemId] || 0) <= 0) return { ok: false, error: 'None left' }
  profile.items[itemId] -= 1
  // Stacks: a second potion extends the timer instead of wasting it.
  profile.boosts[item.boost] = Math.max(profile.boosts[item.boost] || 0, now) + item.durationMs
  return { ok: true, boost: item.boost, endsAt: profile.boosts[item.boost] }
}

/** Applies a reward grant: { wins } | { item } | { pet } | { slide } | { hatch }. */
export function applyGrant(profile, grant, { rand = Math.random } = {}) {
  const result = { ok: true }
  if (grant.wins) profile.wins += grant.wins
  if (grant.slide) {
    profile.slide = tidy(profile.slide + grant.slide)
    profile.stats.bestSlide = Math.max(profile.stats.bestSlide, profile.slide)
    profile.level = levelFor(profile.slide, profile.rebirths)
  }
  if (grant.item) addItem(profile, grant.item, grant.amount || 1)
  if (grant.pet) result.pets = [addPet(profile, grant.pet)]
  if (grant.hatch) {
    const hatched = hatchEgg(profile, grant.hatch, 1, { paid: 'free', rand })
    if (!hatched.ok) return hatched
    result.pets = hatched.pets
    result.eggId = grant.hatch
  }
  return result
}

// --- Daily & playtime rewards -------------------------------------------------------

/**
 * State of each daily reward: 'claimed' | 'ready' | 'next' (with `unlocksIn` ms) |
 * 'locked'. A new 7-day cycle starts on first claim after the last one finishes.
 */
export function dailyStatus(profile, now) {
  const { start, claimed } = profile.daily
  const fresh = !start || claimed.length >= DAILY_REWARDS.length
  const cycleStart = fresh ? now : start
  let nextShown = false
  return DAILY_REWARDS.map((reward, day) => {
    if (!fresh && claimed.includes(day)) return { day, state: 'claimed' }
    const unlockAt = cycleStart + day * DAILY_INTERVAL_MS
    if (now >= unlockAt) return { day, state: 'ready' }
    if (!nextShown) {
      nextShown = true
      return { day, state: 'next', unlocksIn: unlockAt - now }
    }
    return { day, state: 'locked' }
  })
}

export function claimDaily(profile, day, now, opts) {
  const status = dailyStatus(profile, now)[day]
  if (!status || status.state !== 'ready') return { ok: false, error: 'Not ready yet' }
  if (!profile.daily.start || profile.daily.claimed.length >= DAILY_REWARDS.length) {
    profile.daily = { start: now, claimed: [] }
  }
  profile.daily.claimed.push(day)
  const result = applyGrant(profile, DAILY_REWARDS[day].grant, opts)
  return { ...result, day, label: DAILY_REWARDS[day].label }
}

export function playtimeStatus(session, now) {
  const minutes = (now - session.start) / 60000
  return PLAYTIME_REWARDS.map((reward, index) => {
    if (session.playtimeClaimed.includes(index)) return { index, state: 'claimed' }
    if (minutes >= reward.minutes) return { index, state: 'ready' }
    return { index, state: 'locked', unlocksIn: (reward.minutes - minutes) * 60000 }
  })
}

export function claimPlaytime(profile, session, index, now, opts) {
  const status = playtimeStatus(session, now)[index]
  if (!status || status.state !== 'ready') return { ok: false, error: 'Not ready yet' }
  session.playtimeClaimed.push(index)
  const result = applyGrant(profile, PLAYTIME_REWARDS[index].grant, opts)
  return { ...result, index, label: PLAYTIME_REWARDS[index].label }
}

export function claimFreeReward(profile, session, opts) {
  if (session.freeRewardTaken) return { ok: false, error: 'Already claimed this session' }
  session.freeRewardTaken = true
  const grant = profile.freeRewardClaimed ? FREE_REWARD.repeat : FREE_REWARD.firstTime
  profile.freeRewardClaimed = true
  return { ...applyGrant(profile, grant, opts), grant }
}

// --- Shop ---------------------------------------------------------------------------

/** Buys a SHOP item with Wins. */
export function buyShopItem(profile, productId, opts = {}) {
  const item = SHOP[productId]
  if (!item) return { ok: false, error: 'Unknown item' }
  if (item.kind === 'pass' && profile.passes[productId]) return { ok: false, error: 'Already owned' }
  if (profile.wins < item.price) return { ok: false, error: 'Not enough Wins!' }
  if (item.kind === 'pass') {
    profile.wins -= item.price
    profile.passes[productId] = true
    return { ok: true, productId, pass: true }
  }
  const result = applyGrant(profile, item.grant || {}, opts)
  if (result.ok) profile.wins -= item.price
  return { ...result, productId }
}

// --- Offline progress -------------------------------------------------------------

/** Slide earned while away, if the player logged off on a treadmill. */
export function applyOfflineProgress(profile, now) {
  const away = Math.min(OFFLINE_MAX_MS, now - (profile.lastSeen || now))
  if (profile.lastTreadmill < 0 || away < OFFLINE_MIN_MS) return null
  if (!isTreadmillUnlocked(profile, profile.lastTreadmill) || isMaxLevel(profile)) return null
  const steps = Math.floor(away / 1000 / TRAIN_INTERVAL)
  // Potions don't run while you're away.
  const gain = treadmillGain(profile, profile.lastTreadmill, 0)
  const result = addSlide(profile, Math.floor(steps * gain * OFFLINE_RATE))
  if (result.gain <= 0) return null
  return { slide: result.gain, ms: away }
}

// --- Tutorial & badges ------------------------------------------------------------

/** Advances the tutorial if `event` completes the current step. */
export function advanceTutorial(profile, event) {
  const step = TUTORIAL[profile.tutorialStep]
  if (step && step.event === event) {
    profile.tutorialStep += 1
    return true
  }
  return false
}

/** Awards a badge once. Returns the badge if newly awarded. */
export function awardBadge(profile, id) {
  if (!BADGES[id] || profile.badges.includes(id)) return null
  profile.badges.push(id)
  return { id, ...BADGES[id] }
}
