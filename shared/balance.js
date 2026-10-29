/**
 * Every tunable number in the game. Rules live in logic.js; this file is only data,
 * so balancing never means touching code.
 *
 * Shared by client (display) and server (authority): both always agree on costs and
 * multipliers because they read the same table.
 */

// --- Slide and levels ---------------------------------------------------------------

/** Seconds between gains while running on a treadmill. */
export const TRAIN_INTERVAL = 0.6
/** Seconds between the "+1" gains you get while sliding down the hill. */
export const SLIDE_TICK = 1
/** Slide one gain is worth before any multiplier: the "+1". */
export const BASE_GAIN = 1
/**
 * Walking around the lobby earns Slide too: one "+1" gain for every WALK_STEP metres
 * walked (about one a second at a walk). Less than a treadmill, so training still pays.
 */
export const WALK_STEP = 8

/**
 * Your level comes from your Slide: reaching level L takes slideForLevel(L) Slide. Each
 * level needs about 15% more than the last (level 13 = 200, 14 = 237, 15 = 280).
 */
export const LEVEL_BASE = 46.08
export const LEVEL_GROWTH = 1.15
export const slideForLevel = (level) => (level <= 1 ? 0 : Math.round(LEVEL_BASE * (LEVEL_GROWTH ** (level - 1) - 1)))

// --- Rebirth ----------------------------------------------------------------------

/** Max level by rebirth count: R0 = 15, R1 = 23, then +8 per rebirth. */
export const levelCap = (rebirths) => 15 + 8 * Math.max(0, rebirths)

/** Slide multiplier from rebirths: R0 = x1, R1 = x1.5, R2 = x2 ... */
export const rebirthMultiplier = (rebirths) => 1 + 0.5 * Math.max(0, rebirths)

/** Skipping straight to a rebirth costs this many max-level slides' worth of Wins. */
export const REBIRTH_SKIP_SLIDES = 8

// --- Treadmills -------------------------------------------------------------------

/**
 * Training treadmills, south to north in world.js order. Standing on one gains Slide
 * every TRAIN_INTERVAL. `rebirths` = rebirths needed; `product` = the SHOP pass that
 * unlocks it instead.
 */
export const TREADMILLS = [
  { id: 'blue', name: 'Basic Treadmill', mult: 1, rebirths: 0 },
  { id: 'green', name: 'Green Treadmill', mult: 2, rebirths: 1 },
  { id: 'fire', name: 'Fire Treadmill', mult: 4, rebirths: 2 },
  { id: 'toxic', name: 'Toxic Treadmill', mult: 8, rebirths: 4 },
  { id: 'gold', name: 'Gold Treadmill', mult: 15, rebirths: 7 },
  { id: 'ice', name: 'Ice Treadmill', mult: 30, product: 'treadVeryOp', tag: 'VERY OP!' },
  { id: 'galaxy', name: 'Galaxy Treadmill', mult: 60, product: 'treadBest', tag: 'BEST OVERALL!' },
]

// --- Boards -----------------------------------------------------------------------

/**
 * The boards you slide on. `mult` multiplies every Slide gain; `cost` is in Wins.
 * Bought in order from the shop.
 */
export const BOARDS = [
  { id: 'wood', name: 'Wooden Board', mult: 1, cost: 0 },
  // Cheap enough to buy with the Wins from your very first slide (7).
  { id: 'sky', name: 'Sky Board', mult: 1.2, cost: 3 },
  { id: 'sunny', name: 'Sunny Board', mult: 1.4, cost: 45 },
  { id: 'cherry', name: 'Cherry Board', mult: 1.65, cost: 120 },
  { id: 'racer', name: 'Racer Board', mult: 2, cost: 300 },
  { id: 'wave', name: 'Wave Board', mult: 2.5, cost: 750 },
  { id: 'jungle', name: 'Jungle Board', mult: 3, cost: 1800 },
  { id: 'royal', name: 'Royal Board', mult: 4, cost: 4500 },
  { id: 'crystal', name: 'Crystal Board', mult: 5, cost: 11000 },
  { id: 'golden', name: 'Golden Board', mult: 6.5, cost: 27000 },
  // The second shelf: same curve, each about 2.5x the Wins.
  { id: 'candy', name: 'Candy Board', mult: 8, cost: 65000 },
  { id: 'ice', name: 'Ice Board', mult: 10, cost: 160000 },
  { id: 'lava', name: 'Lava Board', mult: 13, cost: 400000 },
  { id: 'thunder', name: 'Thunder Board', mult: 16, cost: 1000000 },
  { id: 'neon', name: 'Neon Board', mult: 20, cost: 2500000 },
  { id: 'galaxy', name: 'Galaxy Board', mult: 25, cost: 6000000 },
  { id: 'dragon', name: 'Dragon Board', mult: 32, cost: 15000000 },
  { id: 'rainbow', name: 'Rainbow Board', mult: 40, cost: 38000000 },
  { id: 'diamond', name: 'Diamond Board', mult: 50, cost: 95000000 },
  { id: 'cosmic', name: 'Cosmic Board', mult: 65, cost: 240000000 },
]

// --- Sliding ----------------------------------------------------------------------

/** distance (m) = base + k * sqrt(slide): 0 Slide still rolls 60 m, 280 about 1 km. */
export const SLIDE_BASE = 60
export const SLIDE_K = 58

/** Themed stretches of the hill. `start` in metres; later zones pay more Wins per metre. */
export const ZONES = [
  { id: 'grassy', name: 'Grassy Hills', start: 0, winsPerMeter: 0.08 },
  { id: 'desert', name: 'Sunny Desert', start: 450, winsPerMeter: 0.12 },
  { id: 'frozen', name: 'Frozen Peaks', start: 1050, winsPerMeter: 0.18 },
  { id: 'autumn', name: 'Autumn Woods', start: 1800, winsPerMeter: 0.27 },
  { id: 'candy', name: 'Candy Land', start: 2800, winsPerMeter: 0.4 },
  { id: 'volcano', name: 'Lava Volcano', start: 4200, winsPerMeter: 0.6 },
  { id: 'crystal', name: 'Crystal Caves', start: 6200, winsPerMeter: 0.9 },
  { id: 'space', name: 'Outer Space', start: 9000, winsPerMeter: 1.35 },
]

/** Trophy pickups down the slide: first at 15 m, then every 30 m. */
export const TROPHY_FIRST = 15
export const TROPHY_SPACING = 30
/** A trophy is worth this many metres of its zone's Wins. */
export const TROPHY_METERS = 10

/** Seconds from pressing SLIDE to pushing off: the board pops out and you dive onto it. */
export const SLIDE_LAUNCH = 0.8
/**
 * Seconds a slide of `distance` metres takes, launch included. Logarithmic: long
 * slides stay short.
 */
export const slideDuration = (distance) => SLIDE_LAUNCH + 3 + 2.2 * Math.log(1 + distance / 60)
/** The result popup after you stop, before you're back at the top. */
export const SLIDE_RECOVERY = 2.2

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

/** `mult` multiplies Slide gains. Equipped pets stack additively (see logic.js). */
export const PETS = {
  cat: { name: 'Cat', rarity: 'common', mult: 1.2 },
  dog: { name: 'Dog', rarity: 'common', mult: 1.3 },
  bunny: { name: 'Bunny', rarity: 'uncommon', mult: 1.5 },
  bear: { name: 'Bear', rarity: 'rare', mult: 2 },
  cow: { name: 'Cow', rarity: 'uncommon', mult: 2.5 },
  parrot: { name: 'Parrot', rarity: 'rare', mult: 3 },
  fox: { name: 'Fox', rarity: 'epic', mult: 4 },
  tiger: { name: 'Tiger', rarity: 'legendary', mult: 6 },
  flamingo: { name: 'Flamingo', rarity: 'uncommon', mult: 8 },
  turtle: { name: 'Turtle', rarity: 'rare', mult: 10 },
  owl: { name: 'Owl', rarity: 'epic', mult: 14 },
  phoenix: { name: 'Phoenix', rarity: 'legendary', mult: 25 },
  pony: { name: 'Pony', rarity: 'rare', mult: 10 },
  unicorn: { name: 'Unicorn', rarity: 'epic', mult: 18 },
  pegasus: { name: 'Pegasus', rarity: 'legendary', mult: 30 },
  imp: { name: 'Imp', rarity: 'rare', mult: 20 },
  bat: { name: 'Bat', rarity: 'epic', mult: 30 },
  demon: { name: 'Demon', rarity: 'legendary', mult: 50 },
  hellhound: { name: 'Hellhound', rarity: 'mythic', mult: 80 },
  dragon: { name: 'Dragon', rarity: 'epic', mult: 6 },
  crab: { name: 'Lucky Crab', rarity: 'uncommon', mult: 1.5 },
  sphinx: { name: 'Sphinx', rarity: 'secret', mult: 150 },
}

/**
 * Eggs, bought with Wins. `pets` are [petId, weight] - weights are percentages and
 * sum to 100.
 */
export const EGGS = {
  basic: { name: 'Basic', cost: { wins: 60 }, pets: [['cat', 45], ['dog', 30], ['bunny', 20], ['bear', 5]] },
  meadow: { name: 'Grass', cost: { wins: 500 }, pets: [['cow', 45], ['parrot', 30], ['fox', 20], ['tiger', 5]] },
  sunset: { name: 'Sunset', cost: { wins: 5000 }, pets: [['flamingo', 45], ['turtle', 30], ['owl', 20], ['phoenix', 5]] },
  unicorn: { name: 'Unicorn', cost: { wins: 30000 }, pets: [['pony', 50], ['unicorn', 35], ['pegasus', 15]] },
  demon: { name: 'Demon', cost: { wins: 80000 }, pets: [['imp', 50], ['bat', 30], ['demon', 15], ['hellhound', 5]] },
}

export const MAX_EQUIPPED_PETS = 3
export const MAX_PET_INVENTORY = 60
/** Multi-hatch opens this many at once, for that many times the cost. */
export const MULTI_HATCH = 3

// --- Items, boosts, rewards -------------------------------------------------------

export const POTION_DURATION_MS = 5 * 60 * 1000

export const ITEMS = {
  potionSlide: { name: 'x2 Slide Potion', kind: 'potion', boost: 'slide', durationMs: POTION_DURATION_MS },
  potionWins: { name: 'x2 Wins Potion', kind: 'potion', boost: 'wins', durationMs: POTION_DURATION_MS },
  eggMeadow: { name: 'Grass Egg', kind: 'egg', egg: 'meadow' },
  eggSunset: { name: 'Sunset Egg', kind: 'egg', egg: 'sunset' },
  eggUnicorn: { name: 'Unicorn Egg', kind: 'egg', egg: 'unicorn' },
  eggDemon: { name: 'Demon Egg', kind: 'egg', egg: 'demon' },
}

/** 7-day cycle; day N unlocks N x 24h after the cycle started. */
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DAILY_REWARDS = [
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Dragon', icon: 'pet:dragon', sub: 'x1', grant: { pet: 'dragon' } },
  { label: 'x2 Slide', icon: 'potionSlide', sub: '5m', grant: { item: 'potionSlide' } },
  { label: 'Unicorn Egg', icon: 'egg:unicorn', sub: 'x1', grant: { item: 'eggUnicorn' } },
  { label: 'x2 Slide', icon: 'potionSlide', sub: '5m', grant: { item: 'potionSlide' } },
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Demon Egg', icon: 'egg:demon', sub: 'x1', grant: { item: 'eggDemon' } },
]

/** Claimable once each per session, after this many minutes played. */
export const PLAYTIME_REWARDS = [
  { minutes: 5, label: '+50 Wins', icon: 'trophy', grant: { wins: 50 } },
  { minutes: 10, label: 'x2 Slide', icon: 'potionSlide', grant: { item: 'potionSlide' } },
  { minutes: 15, label: 'Grass Egg', icon: 'egg:meadow', grant: { item: 'eggMeadow' } },
  { minutes: 30, label: 'x2 Wins', icon: 'potionWins', grant: { item: 'potionWins' } },
  { minutes: 45, label: '+1K Wins', icon: 'trophy', grant: { wins: 1000 } },
  { minutes: 60, label: 'Sunset Egg', icon: 'egg:sunset', grant: { item: 'eggSunset' } },
]

/** The stand by spawn: a pet the first time, a potion on later sessions. */
export const FREE_REWARD = { firstTime: { pet: 'crab' }, repeat: { item: 'potionSlide' } }

/** Offline training: a quarter of your treadmill's rate, for up to 8 hours away. */
export const OFFLINE_RATE = 0.25
export const OFFLINE_MAX_MS = 8 * 60 * 60 * 1000
export const OFFLINE_MIN_MS = 60 * 1000

/**
 * The world portals (placed by PORTALS in world.js): their names, and the Wins needed
 * to step through. Stepping through earns the badge of the same id.
 */
export const WORLD_PORTALS = {
  world2: { name: 'World 2', wins: 15000 },
  world3: { name: 'Halloween World', wins: 50000 },
}

// --- Shop -------------------------------------------------------------------------

/**
 * The shop. Wins are the game's only currency: everything here, like boards and eggs,
 * is bought with them. `pass` = permanent unlock; `consumable` = grants every time.
 */
export const SHOP = {
  slideX2: { name: 'x2 Slide', price: 2500, kind: 'pass' },
  winsX2: { name: 'x2 Wins', price: 25000, kind: 'pass' },
  treadVeryOp: { name: 'VERY OP! Treadmill', price: 150000, kind: 'pass' },
  treadBest: { name: 'BEST OVERALL! Treadmill', price: 2000000, kind: 'pass' },
  sphinx: { name: 'Sphinx', price: 2500000, kind: 'consumable', grant: { pet: 'sphinx' }, stock: 1000 },
}

/** Sphinx stock shown before the server reports the live count. */
export const SPHINX_STOCK_DEFAULT = 954

/**
 * The four Slide packs under the level bar. They grow with you: each gives `share` of
 * the Slide your next level needs, for `slides` slides' worth of Wins at that Slide.
 * Packs aren't held back by the level cap.
 */
export const SLIDE_PACKS = [
  { share: 0.5, slides: 0.5 },
  { share: 2.5, slides: 2 },
  { share: 7, slides: 5 },
  { share: 20, slides: 12 },
]

// --- Tutorial & badges ------------------------------------------------------------

/**
 * The guide for new players: slide, spend the Wins on a board, train, and slide again
 * further. Each step completes when its event fires; after the last the guide is done.
 */
export const TUTORIAL = [
  { text: 'Slide down the hill!', event: 'slide', target: 'slide' },
  { text: 'Buy the Sky Board', event: 'buyBoard', target: 'boards' },
  { text: 'Train on the FREE Treadmill', event: 'train', target: 'tread0' },
  { text: 'Slide again - go further!', event: 'slide', target: 'slide' },
]

export const BADGES = {
  firstSlide: { name: 'First Slide' },
  firstRebirth: { name: 'First Rebirth' },
  firstPet: { name: 'Pet Owner' },
  kilometer: { name: 'Kilometre Club' },
  world2: { name: 'World Traveller' },
  world3: { name: 'Spooky Traveller' },
}
