/**
 * Every tunable number in the game. Rules live in logic.js; this file is only data,
 * so balancing never means touching code. `scripts/balance-sim.mjs` plays the game
 * with these numbers and prints the pacing (time to each rebirth, tire and zone).
 *
 * Shared by client (display) and server (authority): both always agree on costs and
 * multipliers because they read the same table.
 *
 * The loop: train on a pad for Health -> roll your tire (more Health rolls further and
 * smashes tougher walls) -> Wins -> better tires, eggs and pads -> rebirth at max
 * level for a bigger Health multiplier and a higher cap -> roll further still.
 */

// --- Health and levels --------------------------------------------------------------

/** Seconds between gains while standing on a training pad. */
export const TRAIN_INTERVAL = 0.6
/** Seconds between the "+N" gains your tire earns while it rolls. */
export const ROLL_TICK = 1
/**
 * Walking around the lobby earns Health too: one gain for every WALK_STEP metres
 * walked (about one a second at a walk). Less than a pad, so training still pays.
 */
export const WALK_STEP = 8

/**
 * Your level comes from your Health: reaching level L takes healthForLevel(L) Health.
 * Each level needs LEVEL_GROWTH_EARLY times the last at first, easing towards
 * LEVEL_GROWTH_LATE: early rebirths multiply your gains many times over (a new pad,
 * x2 from the rebirth itself, the next tire), later ones much less, and the levels
 * keep step so every rebirth takes a little longer than the one before.
 */
export const LEVEL_BASE = 20
export const LEVEL_GROWTH_EARLY = 1.3
export const LEVEL_GROWTH_LATE = 1.105
export const LEVEL_GROWTH_FADE = 100
/** Levels past this are not reachable: the table stops here. */
export const MAX_LEVEL = 1200

const LEVEL_TABLE = (() => {
  const table = new Float64Array(MAX_LEVEL + 1)
  let need = LEVEL_BASE
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    table[level] = table[level - 1] + need
    const growth = LEVEL_GROWTH_LATE + (LEVEL_GROWTH_EARLY - LEVEL_GROWTH_LATE) * Math.exp(-level / LEVEL_GROWTH_FADE)
    need *= growth
  }
  return table
})()

/** Two significant figures: level thresholds read cleanly (2,300, not 2,317). */
const round2 = (n) => {
  if (n < 100) return Math.round(n)
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

export const healthForLevel = (level) => (level <= 1 ? 0 : round2(LEVEL_TABLE[Math.min(MAX_LEVEL, level)]))

// --- Rebirth ----------------------------------------------------------------------

/** Max level by rebirth count: R0 = 15, R1 = 23, then +8 per rebirth. */
export const levelCap = (rebirths) => Math.min(MAX_LEVEL, 15 + 8 * Math.max(0, rebirths))

/** Health multiplier from rebirths, as in the reference: R0 = x1, R1 = x2, R2 = x3 ... */
export const rebirthMultiplier = (rebirths) => 1 + Math.max(0, rebirths)

/** Skipping straight to a rebirth costs this many max-level rolls' worth of Wins. */
export const REBIRTH_SKIP_ROLLS = 10

// --- Training pads ----------------------------------------------------------------

/**
 * Training pads, south to north in world.js order. Standing on one gains Health every
 * TRAIN_INTERVAL. `rebirths` = rebirths needed; `product` = the SHOP pass that unlocks
 * it instead.
 */
export const PADS = [
  { id: 'starter', name: 'Starter Pad', mult: 1, rebirths: 0 },
  { id: 'speed', name: 'Speed Pad', mult: 2, rebirths: 1 },
  { id: 'turbo', name: 'Turbo Pad', mult: 4, rebirths: 2 },
  { id: 'nitro', name: 'Nitro Pad', mult: 10, rebirths: 4 },
  { id: 'rocket', name: 'Rocket Pad', mult: 20, rebirths: 6 },
  { id: 'diamond', name: 'Diamond Pad', mult: 40, product: 'padVeryOp', tag: 'VERY OP!' },
  { id: 'galaxy', name: 'Galaxy Pad', mult: 100, product: 'padBest', tag: 'BEST OVERALL!' },
]

// --- Tires ------------------------------------------------------------------------

/**
 * The tires you roll. `power` is the Health every single gain is worth before
 * multipliers (the "+1" of the Worn Bicycle); `cost` is in Wins; `rarity` (RARITIES)
 * is shown on its stand. Bought in order at the showroom. Every one is made of
 * something different - wood, stone, cookie, pizza, donut, watermelon, silver, gold,
 * platinum, gems, diamond, rainbow, unicorn, galaxy, dragon... - and the further up the
 * list, the crazier and shinier it gets. About x2.6 power for x2.8-x3.3 the Wins each.
 */
export const TIRES = [
  { id: 'bicycle', name: 'Worn Bicycle', power: 1, cost: 0, rarity: 'common' },
  // Cheap enough to buy with the Wins from your very first roll.
  { id: 'mountain', name: 'Mountain Bike', power: 3, cost: 1, rarity: 'common' },
  { id: 'wood', name: 'Wooden Wheel', power: 5, cost: 15, rarity: 'common' },
  { id: 'stone', name: 'Stone Wheel', power: 12, cost: 75, rarity: 'uncommon' },
  { id: 'cookie', name: 'Cookie Tire', power: 30, cost: 300, rarity: 'uncommon' },
  { id: 'pizza', name: 'Pizza Tire', power: 75, cost: 1200, rarity: 'rare' },
  { id: 'donut', name: 'Donut Tire', power: 200, cost: 4500, rarity: 'rare' },
  { id: 'watermelon', name: 'Watermelon Tire', power: 500, cost: 16000, rarity: 'rare' },
  { id: 'monster', name: 'Monster Truck', power: 1250, cost: 55000, rarity: 'epic' },
  { id: 'mint', name: 'Peppermint Tire', power: 3500, cost: 180000, rarity: 'epic' },
  { id: 'silver', name: 'Silver Tire', power: 9000, cost: 600000, rarity: 'epic' },
  { id: 'ice', name: 'Ice Tire', power: 23000, cost: 2e6, rarity: 'epic' },
  { id: 'gold', name: 'Gold Tire', power: 60000, cost: 6e6, rarity: 'legendary' },
  { id: 'lava', name: 'Lava Tire', power: 155000, cost: 17e6, rarity: 'legendary' },
  { id: 'platinum', name: 'Platinum Tire', power: 400000, cost: 48e6, rarity: 'legendary' },
  { id: 'emerald', name: 'Emerald Tire', power: 1.05e6, cost: 135e6, rarity: 'legendary' },
  { id: 'ruby', name: 'Ruby Tire', power: 2.7e6, cost: 380e6, rarity: 'mythic' },
  { id: 'diamond', name: 'Diamond Tire', power: 7e6, cost: 1.05e9, rarity: 'mythic' },
  { id: 'rainbow', name: 'Rainbow Tire', power: 1.8e7, cost: 3e9, rarity: 'mythic' },
  { id: 'unicorn', name: 'Unicorn Tire', power: 4.8e7, cost: 8.5e9, rarity: 'mythic' },
  { id: 'galaxy', name: 'Galaxy Tire', power: 1.25e8, cost: 2.4e10, rarity: 'secret' },
  { id: 'dragon', name: 'Dragon Tire', power: 3.3e8, cost: 6.8e10, rarity: 'secret' },
  { id: 'cosmic', name: 'Cosmic Tire', power: 8.6e8, cost: 1.9e11, rarity: 'secret' },
  { id: 'infinity', name: 'Infinity Tire', power: 2.2e9, cost: 5.4e11, rarity: 'secret' },
]

// --- Rolling ----------------------------------------------------------------------

/**
 * distance (m) = base + k * ln(1 + health / h0): 30 Health rolls about 180 m, the first
 * max level (2,300) about 1 km, and every rebirth adds a few hundred metres more - so
 * the track stays short and its stages short, however huge Health gets.
 */
export const ROLL_BASE = 60
export const ROLL_K = 260
export const ROLL_H0 = 50
/** Every stage is this long: a new gate every 300 m, all the way. */
export const STAGE_LENGTH = 300

/**
 * The track's forty stages, STAGE_LENGTH apart, each behind a gate with a wooden wall
 * across it. `theme` picks the stage's look (one of twenty, so the second twenty are
 * new places in familiar colours). `wall` = Health needed to smash through it (a tire
 * with less crashes into it and stops); `winsPerMeter` pays for every metre rolled in
 * the stage; `smash` is the Wins for breaking the wall on any roll, and `discover` a
 * one-off prize the first time you ever reach the stage. Each gate's wall needs a bit
 * more Health than it takes to roll up to it, so you reach a gate a little before you
 * can smash it: train a bit more, or rebirth. Generated by scripts/gen-stages.py.
 */
export const ZONES = [
  { id: 'grassy', name: 'Grassy Meadow', theme: 'grassy', start: 0, wall: 0, winsPerMeter: 0.006, smash: 0, discover: 0 },
  { id: 'autumn', name: 'Autumn Forest', theme: 'autumn', start: 300, wall: 99, winsPerMeter: 0.0108, smash: 2, discover: 5 },
  { id: 'desert', name: 'Desert Canyon', theme: 'desert', start: 600, wall: 450, winsPerMeter: 0.0194, smash: 4, discover: 9 },
  { id: 'beach', name: 'Sunny Beach', theme: 'beach', start: 900, wall: 1600, winsPerMeter: 0.035, smash: 6, discover: 16 },
  { id: 'jungle', name: 'Jungle Ruins', theme: 'jungle', start: 1200, wall: 5100, winsPerMeter: 0.063, smash: 12, discover: 29 },
  { id: 'frozen', name: 'Frozen Peaks', theme: 'frozen', start: 1500, wall: 16000, winsPerMeter: 0.113, smash: 21, discover: 52 },
  { id: 'cherry', name: 'Cherry Blossom', theme: 'cherry', start: 1800, wall: 52000, winsPerMeter: 0.204, smash: 38, discover: 94 },
  { id: 'candy', name: 'Candy Land', theme: 'candy', start: 2100, wall: 170000, winsPerMeter: 0.367, smash: 68, discover: 170 },
  { id: 'mushroom', name: 'Mushroom Valley', theme: 'mushroom', start: 2400, wall: 530000, winsPerMeter: 0.661, smash: 120, discover: 310 },
  { id: 'volcano', name: 'Lava Volcano', theme: 'volcano', start: 2700, wall: 1.7e6, winsPerMeter: 1.19, smash: 220, discover: 550 },
  { id: 'swamp', name: 'Lily Swamp', theme: 'swamp', start: 3000, wall: 5.3e6, winsPerMeter: 2.14, smash: 400, discover: 990 },
  { id: 'crystal', name: 'Crystal Caves', theme: 'crystal', start: 3300, wall: 1.7e7, winsPerMeter: 3.86, smash: 710, discover: 1800 },
  { id: 'ocean', name: 'Coral Reef', theme: 'ocean', start: 3600, wall: 5.3e7, winsPerMeter: 6.94, smash: 1300, discover: 3200 },
  { id: 'neon', name: 'Neon City', theme: 'neon', start: 3900, wall: 1.7e8, winsPerMeter: 12.5, smash: 2300, discover: 5800 },
  { id: 'sky', name: 'Cloud Kingdom', theme: 'sky', start: 4200, wall: 5.3e8, winsPerMeter: 22.5, smash: 4200, discover: 10000 },
  { id: 'rainbow', name: 'Rainbow Road', theme: 'rainbow', start: 4500, wall: 1.7e9, winsPerMeter: 40.5, smash: 7500, discover: 19000 },
  { id: 'moon', name: 'Moon Base', theme: 'moon', start: 4800, wall: 5.4e9, winsPerMeter: 72.9, smash: 13000, discover: 34000 },
  { id: 'aurora', name: 'Aurora Tundra', theme: 'aurora', start: 5100, wall: 1.7e10, winsPerMeter: 131, smash: 24000, discover: 61000 },
  { id: 'space', name: 'Outer Space', theme: 'space', start: 5400, wall: 5.4e10, winsPerMeter: 236, smash: 44000, discover: 110000 },
  { id: 'cosmic', name: 'Cosmic Core', theme: 'cosmic', start: 5700, wall: 1.7e11, winsPerMeter: 425, smash: 79000, discover: 200000 },
  { id: 'hills', name: 'Green Hills', theme: 'grassy', start: 6000, wall: 5.4e11, winsPerMeter: 765, smash: 140000, discover: 350000 },
  { id: 'maple', name: 'Maple Woods', theme: 'autumn', start: 6300, wall: 1.7e12, winsPerMeter: 1380, smash: 250000, discover: 640000 },
  { id: 'dunes', name: 'Dune Sea', theme: 'desert', start: 6600, wall: 5.5e12, winsPerMeter: 2480, smash: 460000, discover: 1.1e6 },
  { id: 'island', name: 'Palm Island', theme: 'beach', start: 6900, wall: 1.7e13, winsPerMeter: 4460, smash: 830000, discover: 2.1e6 },
  { id: 'temple', name: 'Lost Temple', theme: 'jungle', start: 7200, wall: 5.5e13, winsPerMeter: 8030, smash: 1.5e6, discover: 3.7e6 },
  { id: 'glacier', name: 'Glacier Pass', theme: 'frozen', start: 7500, wall: 1.7e14, winsPerMeter: 14500, smash: 2.7e6, discover: 6.7e6 },
  { id: 'sakura', name: 'Sakura Garden', theme: 'cherry', start: 7800, wall: 5.5e14, winsPerMeter: 26000, smash: 4.8e6, discover: 1.2e7 },
  { id: 'sweets', name: 'Sweet Valley', theme: 'candy', start: 8100, wall: 1.7e15, winsPerMeter: 46800, smash: 8.7e6, discover: 2.2e7 },
  { id: 'fungi', name: 'Fungi Forest', theme: 'mushroom', start: 8400, wall: 5.5e15, winsPerMeter: 84300, smash: 1.6e7, discover: 3.9e7 },
  { id: 'magma', name: 'Magma Core', theme: 'volcano', start: 8700, wall: 1.8e16, winsPerMeter: 152000, smash: 2.8e7, discover: 7e7 },
  { id: 'marsh', name: 'Green Marsh', theme: 'swamp', start: 9000, wall: 5.6e16, winsPerMeter: 273000, smash: 5.1e7, discover: 1.3e8 },
  { id: 'gems', name: 'Gem Mines', theme: 'crystal', start: 9300, wall: 1.8e17, winsPerMeter: 492000, smash: 9.1e7, discover: 2.3e8 },
  { id: 'deep', name: 'Deep Ocean', theme: 'ocean', start: 9600, wall: 5.6e17, winsPerMeter: 885000, smash: 1.6e8, discover: 4.1e8 },
  { id: 'cyber', name: 'Cyber City', theme: 'neon', start: 9900, wall: 1.8e18, winsPerMeter: 1.59e6, smash: 2.9e8, discover: 7.4e8 },
  { id: 'castle', name: 'Sky Castle', theme: 'sky', start: 10200, wall: 5.6e18, winsPerMeter: 2.87e6, smash: 5.3e8, discover: 1.3e9 },
  { id: 'prism', name: 'Prism Path', theme: 'rainbow', start: 10500, wall: 1.8e19, winsPerMeter: 5.16e6, smash: 9.6e8, discover: 2.4e9 },
  { id: 'lunar', name: 'Lunar Craters', theme: 'moon', start: 10800, wall: 5.7e19, winsPerMeter: 9.29e6, smash: 1.7e9, discover: 4.3e9 },
  { id: 'lights', name: 'Northern Lights', theme: 'aurora', start: 11100, wall: 1.8e20, winsPerMeter: 1.67e7, smash: 3.1e9, discover: 7.7e9 },
  { id: 'galaxy', name: 'Galaxy Rift', theme: 'space', start: 11400, wall: 5.7e20, winsPerMeter: 3.01e7, smash: 5.6e9, discover: 1.4e10 },
  { id: 'infinity', name: 'Infinity', theme: 'cosmic', start: 11700, wall: 1.8e21, winsPerMeter: 5.42e7, smash: 1e10, discover: 2.5e10 },
]

/** A tire that can't break a wall stops this far short of it, bounced back off it. */
export const WALL_STOP = 2.5

/** Wins pickups down the track: first at 40 m, then every 80 m. */
export const TROPHY_FIRST = 40
export const TROPHY_SPACING = 80
/** A trophy is worth this many metres of its zone's Wins (at least 1). */
export const TROPHY_METERS = 80

/** Seconds from pressing ROLL to the tire setting off: it pops out and you push it. */
export const ROLL_LAUNCH = 0.8
/**
 * Seconds a roll of `distance` metres takes, launch included. Logarithmic: long rolls
 * stay short.
 */
export const rollDuration = (distance) => ROLL_LAUNCH + 3 + 2.2 * Math.log(1 + distance / 60)
/** The result popup after you stop, before you're back at the start. */
export const ROLL_RECOVERY = 2.2

// --- Pets & eggs ------------------------------------------------------------------

export const RARITIES = {
  common: { name: 'Common', color: '#b9c3cf', order: 0 },
  uncommon: { name: 'Uncommon', color: '#4ade80', order: 1 },
  rare: { name: 'Rare', color: '#38bdf8', order: 2 },
  epic: { name: 'Epic', color: '#b15cff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffc41f', order: 4 },
  mythic: { name: 'Mythic', color: '#ff3b6b', order: 5 },
  secret: { name: 'Secret', color: '#ff5bd8', order: 6 },
}

/** `mult` multiplies Health gains. Equipped pets stack additively (see logic.js). */
export const PETS = {
  cat: { name: 'Cat', rarity: 'common', mult: 1.1 },
  dog: { name: 'Dog', rarity: 'common', mult: 1.15 },
  bunny: { name: 'Bunny', rarity: 'uncommon', mult: 1.25 },
  bear: { name: 'Bear', rarity: 'rare', mult: 1.5 },
  cow: { name: 'Cow', rarity: 'uncommon', mult: 1.4 },
  parrot: { name: 'Parrot', rarity: 'rare', mult: 1.7 },
  fox: { name: 'Fox', rarity: 'epic', mult: 2.2 },
  tiger: { name: 'Tiger', rarity: 'legendary', mult: 3 },
  flamingo: { name: 'Flamingo', rarity: 'uncommon', mult: 2.5 },
  turtle: { name: 'Turtle', rarity: 'rare', mult: 3.2 },
  owl: { name: 'Owl', rarity: 'epic', mult: 4.5 },
  phoenix: { name: 'Phoenix', rarity: 'legendary', mult: 7 },
  pony: { name: 'Pony', rarity: 'rare', mult: 5 },
  unicorn: { name: 'Unicorn', rarity: 'epic', mult: 8 },
  pegasus: { name: 'Pegasus', rarity: 'legendary', mult: 13 },
  salamander: { name: 'Salamander', rarity: 'rare', mult: 10 },
  firebird: { name: 'Fire Bird', rarity: 'epic', mult: 16 },
  golem: { name: 'Magma Golem', rarity: 'legendary', mult: 26 },
  inferno: { name: 'Inferno Wolf', rarity: 'mythic', mult: 45 },
  dragon: { name: 'Dragon', rarity: 'epic', mult: 2.5 },
  crab: { name: 'Lucky Crab', rarity: 'uncommon', mult: 1.2 },
  sphinx: { name: 'Sphinx', rarity: 'secret', mult: 80 },
}

/**
 * Eggs, bought with Wins. `pets` are [petId, weight] - weights are percentages and
 * sum to 100. Each egg is priced at about the Wins of a few rolls at the stage of the
 * game whose pets it beats.
 */
export const EGGS = {
  basic: { name: 'Basic', cost: { wins: 15 }, pets: [['cat', 45], ['dog', 30], ['bunny', 20], ['bear', 5]] },
  meadow: { name: 'Grass', cost: { wins: 120 }, pets: [['cow', 45], ['parrot', 30], ['fox', 20], ['tiger', 5]] },
  sunset: { name: 'Sunset', cost: { wins: 1200 }, pets: [['flamingo', 45], ['turtle', 30], ['owl', 20], ['phoenix', 5]] },
  unicorn: { name: 'Unicorn', cost: { wins: 12000 }, pets: [['pony', 50], ['unicorn', 35], ['pegasus', 15]] },
  volcano: { name: 'Volcano', cost: { wins: 90000 }, pets: [['salamander', 50], ['firebird', 30], ['golem', 15], ['inferno', 5]] },
}

export const MAX_EQUIPPED_PETS = 3
export const MAX_PET_INVENTORY = 60
/** Multi-hatch opens this many at once, for that many times the cost. */
export const MULTI_HATCH = 3

// --- Items, boosts, rewards -------------------------------------------------------

export const POTION_DURATION_MS = 5 * 60 * 1000

export const ITEMS = {
  potionHealth: { name: 'x2 Health Potion', kind: 'potion', boost: 'health', durationMs: POTION_DURATION_MS },
  potionWins: { name: 'x2 Wins Potion', kind: 'potion', boost: 'wins', durationMs: POTION_DURATION_MS },
  eggMeadow: { name: 'Grass Egg', kind: 'egg', egg: 'meadow' },
  eggSunset: { name: 'Sunset Egg', kind: 'egg', egg: 'sunset' },
  eggUnicorn: { name: 'Unicorn Egg', kind: 'egg', egg: 'unicorn' },
  eggVolcano: { name: 'Volcano Egg', kind: 'egg', egg: 'volcano' },
}

/** 7-day cycle; day N unlocks N x 24h after the cycle started. */
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DAILY_REWARDS = [
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Dragon', icon: 'pet:dragon', sub: 'x1', grant: { pet: 'dragon' } },
  { label: 'x2 Health', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'Unicorn Egg', icon: 'egg:unicorn', sub: 'x1', grant: { item: 'eggUnicorn' } },
  { label: 'x2 Health', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Volcano Egg', icon: 'egg:volcano', sub: 'x1', grant: { item: 'eggVolcano' } },
]

/**
 * Claimable once each per session, after this many minutes played: something to look
 * forward to every few minutes for the first hour.
 */
export const PLAYTIME_REWARDS = [
  { minutes: 3, label: '+10 Wins', icon: 'trophy', grant: { wins: 10 } },
  { minutes: 8, label: 'x2 Health', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 15, label: 'Grass Egg', icon: 'egg:meadow', grant: { item: 'eggMeadow' } },
  { minutes: 25, label: 'x2 Wins', icon: 'potionWins', grant: { item: 'potionWins' } },
  { minutes: 35, label: '+250 Wins', icon: 'trophy', grant: { wins: 250 } },
  { minutes: 45, label: 'Sunset Egg', icon: 'egg:sunset', grant: { item: 'eggSunset' } },
  { minutes: 60, label: 'x2 Health', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 90, label: 'Unicorn Egg', icon: 'egg:unicorn', grant: { item: 'eggUnicorn' } },
]

/** The stand by spawn: a pet the first time, a potion on later sessions. */
export const FREE_REWARD = { firstTime: { pet: 'crab' }, repeat: { item: 'potionHealth' } }

/** Offline training: a quarter of your pad's rate, for up to 8 hours away. */
export const OFFLINE_RATE = 0.25
export const OFFLINE_MAX_MS = 8 * 60 * 60 * 1000
export const OFFLINE_MIN_MS = 60 * 1000

/**
 * The world portal (placed by PORTALS in world.js): its name, and the Wins needed to
 * step through. Stepping through earns the badge of the same id.
 */
export const WORLD_PORTALS = {
  world2: { name: 'World 2', wins: 25000 },
}

// --- Shop -------------------------------------------------------------------------

/**
 * The shop. Wins are the game's only currency: everything here, like tires and eggs,
 * is bought with them. `pass` = permanent unlock; `consumable` = grants every time.
 */
export const SHOP = {
  healthX2: { name: 'x2 Health', price: 400, kind: 'pass' },
  winsX2: { name: 'x2 Wins', price: 2500, kind: 'pass' },
  autoRoll: { name: 'Auto Roll', price: 150, kind: 'pass' },
  padVeryOp: { name: 'VERY OP! Pad', price: 150000, kind: 'pass' },
  padBest: { name: 'BEST OVERALL! Pad', price: 2500000, kind: 'pass' },
  sphinx: { name: 'Sphinx', price: 2500000, kind: 'consumable', grant: { pet: 'sphinx' }, stock: 1000 },
}

/**
 * Boxity Gems products, by sku. Prices live in Boxity's catalog, never here: the game
 * only names the sku and, once Boxity confirms the sale, grants what it says. Wins
 * packs grow with you: `winsRolls` max-level rolls' worth of Wins.
 */
export const GEM_PRODUCTS = {
  wins_small: { name: 'Pile of Wins', blurb: '10 max-level rolls of Wins', icon: 'trophy', grant: { winsRolls: 10 } },
  wins_big: { name: 'Mountain of Wins', blurb: '60 max-level rolls of Wins', icon: 'trophy', grant: { winsRolls: 60 } },
  potion_bundle: { name: 'Potion Bundle', blurb: '3 x2 Health + 3 x2 Wins potions', icon: 'potionHealth', grant: { items: { potionHealth: 3, potionWins: 3 } } },
  volcano_eggs: { name: '3 Volcano Eggs', blurb: 'The best pets in the game', icon: 'egg:volcano', grant: { items: { eggVolcano: 3 } } },
  auto_roll: { name: 'Auto Roll', blurb: 'Rolls for you on the Roll Zone', icon: 'tire', grant: { pass: 'autoRoll' } },
  health_x2: { name: 'x2 Health', blurb: 'Double every Health gain, forever', icon: 'heart', grant: { pass: 'healthX2' } },
  wins_x2: { name: 'x2 Wins', blurb: 'Double every roll’s Wins, forever', icon: 'trophy', grant: { pass: 'winsX2' } },
  pad_best: { name: 'Galaxy Pad', blurb: 'Unlocks the x100 Galaxy Pad', icon: 'portal', grant: { pass: 'padBest' } },
}

/**
 * Rewarded ads (Boxity): watch one to earn this. Placement names are lowercase, digits
 * and hyphens. `cooldownMs` keeps a player from chaining them.
 */
export const AD_REWARDS = {
  'health-potion': { label: 'x2 Health Potion', icon: 'potionHealth', grant: { item: 'potionHealth' }, cooldownMs: 3 * 60 * 1000 },
  'wins-potion': { label: 'x2 Wins Potion', icon: 'potionWins', grant: { item: 'potionWins' }, cooldownMs: 3 * 60 * 1000 },
}

/** Sphinx stock shown before the server reports the live count. */
export const SPHINX_STOCK_DEFAULT = 954

/**
 * The three Health packs under the level bar. They grow with you: each gives `share`
 * of the Health your next level needs, for `rolls` rolls' worth of Wins at that Health.
 * Packs aren't held back by the level cap.
 */
export const HEALTH_PACKS = [
  { share: 1, rolls: 1 },
  { share: 5, rolls: 4 },
  { share: 20, rolls: 12 },
]

// --- Tutorial & badges ------------------------------------------------------------

/**
 * The guide for new players, as in the reference: train, roll, spend the Wins on a
 * tire, roll further, rebirth. Each step completes when its event fires (and, with
 * `health`, once you have that much); after the last the guide is done.
 */
export const TUTORIAL = [
  { text: 'Hop on a training pad to gain Health', event: 'train', target: 'pad0', health: 30 },
  { text: 'Roll your tire to earn Wins', event: 'roll', target: 'roll' },
  { text: 'Buy the Mountain Bike tire at the showroom!', event: 'buyTire', target: 'tires' },
  { text: 'Roll again - go further!', event: 'roll', target: 'roll' },
  { text: 'Rebirth for x2 gains!', event: 'rebirth', target: null },
]

export const BADGES = {
  firstRoll: { name: 'First Roll' },
  firstRebirth: { name: 'First Rebirth' },
  firstPet: { name: 'Pet Owner' },
  firstWall: { name: 'Wall Smasher' },
  kilometer: { name: 'Kilometre Club' },
  space: { name: 'Space Roller' },
  cosmic: { name: 'Cosmic Champion' },
  world2: { name: 'World Traveller' },
}
