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
export const LEVEL_GROWTH_LATE = 1.097
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

/**
 * From Rebirth 15, every 5th rebirth (15, 20, 25...) comes with a gift of eggs: late in
 * the game, when each rebirth takes longest, there's always one coming up. One more egg
 * every 10 rebirths, up to 6.
 */
export const REBIRTH_GIFT_FROM = 15
export const REBIRTH_GIFT_EVERY = 5
export function rebirthGift(rebirths) {
  if (rebirths < REBIRTH_GIFT_FROM || (rebirths - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY !== 0) return null
  const amount = Math.min(6, 3 + Math.floor((rebirths - REBIRTH_GIFT_FROM) / 10))
  return { rebirths, item: 'eggVolcano', amount, label: `${amount} Volcano Eggs` }
}
/** The next rebirth after `rebirths` that brings a gift, and the gift. */
export function nextRebirthGift(rebirths) {
  const from = Math.max(REBIRTH_GIFT_FROM, rebirths + 1)
  const at = from + ((REBIRTH_GIFT_EVERY - ((from - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY)) % REBIRTH_GIFT_EVERY)
  return rebirthGift(at)
}

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
  { id: 'diamond', name: 'Diamond', mult: 40, product: 'padVeryOp', tag: 'VERY OP!' },
  { id: 'galaxy', name: 'Galaxy Planet', mult: 100, product: 'padBest', tag: 'BEST OVERALL!' },
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
  { id: 'bicycle', name: 'Orange Slice', power: 1, cost: 0, rarity: 'common' },
  // Cheap enough to buy with the Wins from your very first roll.
  { id: 'mountain', name: 'Lime Slice', power: 3, cost: 1, rarity: 'common' },
  { id: 'wood', name: 'Wooden Wheel', power: 5, cost: 15, rarity: 'common' },
  { id: 'stone', name: 'Stone Wheel', power: 12, cost: 75, rarity: 'uncommon' },
  { id: 'cookie', name: 'Giant Cookie', power: 30, cost: 300, rarity: 'uncommon' },
  { id: 'pizza', name: 'Pizza Wheel', power: 75, cost: 1200, rarity: 'rare' },
  { id: 'donut', name: 'Donut', power: 200, cost: 4500, rarity: 'rare' },
  { id: 'watermelon', name: 'Watermelon', power: 500, cost: 16000, rarity: 'rare' },
  { id: 'monster', name: 'Cheese Wheel', power: 1250, cost: 55000, rarity: 'epic' },
  { id: 'mint', name: 'Peppermint Candy', power: 3500, cost: 180000, rarity: 'epic' },
  { id: 'silver', name: 'Silver Coin', power: 9000, cost: 600000, rarity: 'epic' },
  { id: 'ice', name: 'Ice Cream', power: 23000, cost: 2e6, rarity: 'epic' },
  { id: 'gold', name: 'Gold Coin', power: 60000, cost: 6e6, rarity: 'legendary' },
  { id: 'lava', name: 'Lava Rock', power: 155000, cost: 17e6, rarity: 'legendary' },
  { id: 'platinum', name: 'Sushi Roll', power: 400000, cost: 48e6, rarity: 'legendary' },
  { id: 'emerald', name: 'Slime Ball', power: 1.05e6, cost: 135e6, rarity: 'legendary' },
  { id: 'ruby', name: 'Burger', power: 2.7e6, cost: 380e6, rarity: 'mythic' },
  { id: 'diamond', name: 'Diamond Tire', power: 7e6, cost: 1.05e9, rarity: 'mythic' },
  { id: 'rainbow', name: 'Rainbow Candy', power: 1.8e7, cost: 3e9, rarity: 'mythic' },
  { id: 'unicorn', name: 'Unicorn Cloud', power: 4.8e7, cost: 8.5e9, rarity: 'mythic' },
  { id: 'galaxy', name: 'Galaxy Tire', power: 1.25e8, cost: 2.4e10, rarity: 'secret' },
  { id: 'dragon', name: 'Dragon Scale', power: 3.3e8, cost: 6.8e10, rarity: 'secret' },
  { id: 'cosmic', name: 'Birthday Cake', power: 8.6e8, cost: 1.9e11, rarity: 'secret' },
  { id: 'infinity', name: 'Infinity Crystal', power: 2.2e9, cost: 5.4e11, rarity: 'secret' },
]

// --- Rolling ----------------------------------------------------------------------

/**
 * How far a tire rolls: 0 Health still rolls ROLL_BASE metres, and the first gate is
 * reached with the Health its wall needs, less WALL_MARGIN; between gates distance
 * follows Health (in log terms) from one gate's mark to the next. So the gates' Health
 * sets the pace, and their spacing - each stage a little longer than the last - is just
 * how it looks. See logic.rollReach.
 */
export const ROLL_BASE = 60
export const ROLL_H0 = 50
/** A gate's wall needs this many times the Health that just reaches it. */
export const WALL_MARGIN = 1.3

/**
 * The track's sixty stages, each behind a gate with a wooden wall across it, each a
 * little longer than the one before (100 m, 106 m, 112 m ... about 450 m). `theme` picks
 * the stage's look (one of twenty, so later stages are new places in familiar colours).
 * `wall` = Health needed to smash through it (a tire with less crashes into it and
 * breaks); each needs about twice the last, a touch more further on. `winsPerMeter`
 * pays for every metre rolled in the stage; `smash` is the Wins for breaking the wall on
 * any roll, and `discover` a one-off prize the first time you ever reach the stage.
 * Generated by scripts/gen-stages.py.
 */
export const ZONES = [
  { id: 'grassy', name: 'Grassy Meadow', theme: 'grassy', start: 0, wall: 0, winsPerMeter: 0.006, smash: 0, discover: 0 },
  { id: 'autumn', name: 'Autumn Forest', theme: 'autumn', start: 100, wall: 11, winsPerMeter: 0.0072, smash: 2, discover: 5 },
  { id: 'desert', name: 'Desert Canyon', theme: 'desert', start: 200, wall: 21, winsPerMeter: 0.00984, smash: 3, discover: 7 },
  { id: 'beach', name: 'Sunny Beach', theme: 'beach', start: 306, wall: 41, winsPerMeter: 0.0135, smash: 4, discover: 9 },
  { id: 'jungle', name: 'Jungle Ruins', theme: 'jungle', start: 418, wall: 79, winsPerMeter: 0.0185, smash: 5, discover: 13 },
  { id: 'frozen', name: 'Frozen Peaks', theme: 'frozen', start: 536, wall: 150, winsPerMeter: 0.0255, smash: 7, discover: 18 },
  { id: 'cherry', name: 'Cherry Blossom', theme: 'cherry', start: 660, wall: 300, winsPerMeter: 0.0351, smash: 10, discover: 24 },
  { id: 'candy', name: 'Candy Land', theme: 'candy', start: 790, wall: 590, winsPerMeter: 0.0486, smash: 13, discover: 34 },
  { id: 'mushroom', name: 'Mushroom Valley', theme: 'mushroom', start: 926, wall: 1200, winsPerMeter: 0.0673, smash: 19, discover: 47 },
  { id: 'volcano', name: 'Lava Volcano', theme: 'volcano', start: 1068, wall: 2300, winsPerMeter: 0.0934, smash: 26, discover: 65 },
  { id: 'swamp', name: 'Lily Swamp', theme: 'swamp', start: 1216, wall: 4600, winsPerMeter: 0.13, smash: 36, discover: 90 },
  { id: 'crystal', name: 'Crystal Caves', theme: 'crystal', start: 1370, wall: 9200, winsPerMeter: 0.181, smash: 50, discover: 130 },
  { id: 'ocean', name: 'Coral Reef', theme: 'ocean', start: 1530, wall: 18000, winsPerMeter: 0.253, smash: 70, discover: 180 },
  { id: 'neon', name: 'Neon City', theme: 'neon', start: 1696, wall: 37000, winsPerMeter: 0.355, smash: 99, discover: 250 },
  { id: 'sky', name: 'Cloud Kingdom', theme: 'sky', start: 1868, wall: 75000, winsPerMeter: 0.498, smash: 140, discover: 350 },
  { id: 'rainbow', name: 'Rainbow Road', theme: 'rainbow', start: 2046, wall: 150000, winsPerMeter: 0.7, smash: 190, discover: 490 },
  { id: 'moon', name: 'Moon Base', theme: 'moon', start: 2230, wall: 310000, winsPerMeter: 0.987, smash: 270, discover: 690 },
  { id: 'aurora', name: 'Aurora Tundra', theme: 'aurora', start: 2420, wall: 640000, winsPerMeter: 1.39, smash: 390, discover: 970 },
  { id: 'space', name: 'Outer Space', theme: 'space', start: 2616, wall: 1.3e6, winsPerMeter: 1.97, smash: 550, discover: 1400 },
  { id: 'cosmic', name: 'Cosmic Core', theme: 'cosmic', start: 2818, wall: 2.7e6, winsPerMeter: 2.8, smash: 780, discover: 1900 },
  { id: 'hills', name: 'Green Hills', theme: 'grassy', start: 3026, wall: 5.7e6, winsPerMeter: 3.98, smash: 1100, discover: 2800 },
  { id: 'maple', name: 'Maple Woods', theme: 'autumn', start: 3240, wall: 1.2e7, winsPerMeter: 5.66, smash: 1600, discover: 3900 },
  { id: 'dunes', name: 'Dune Sea', theme: 'desert', start: 3460, wall: 2.5e7, winsPerMeter: 8.08, smash: 2200, discover: 5600 },
  { id: 'island', name: 'Palm Island', theme: 'beach', start: 3686, wall: 5.3e7, winsPerMeter: 11.6, smash: 3200, discover: 8000 },
  { id: 'temple', name: 'Lost Temple', theme: 'jungle', start: 3918, wall: 1.1e8, winsPerMeter: 16.6, smash: 4600, discover: 12000 },
  { id: 'glacier', name: 'Glacier Pass', theme: 'frozen', start: 4156, wall: 2.4e8, winsPerMeter: 23.8, smash: 6600, discover: 17000 },
  { id: 'sakura', name: 'Sakura Garden', theme: 'cherry', start: 4400, wall: 5.1e8, winsPerMeter: 34.2, smash: 9500, discover: 24000 },
  { id: 'sweets', name: 'Sweet Valley', theme: 'candy', start: 4650, wall: 1.1e9, winsPerMeter: 49.3, smash: 14000, discover: 34000 },
  { id: 'fungi', name: 'Fungi Forest', theme: 'mushroom', start: 4906, wall: 2.3e9, winsPerMeter: 71.3, smash: 20000, discover: 50000 },
  { id: 'magma', name: 'Magma Core', theme: 'volcano', start: 5168, wall: 5e9, winsPerMeter: 103, smash: 29000, discover: 72000 },
  { id: 'marsh', name: 'Green Marsh', theme: 'swamp', start: 5436, wall: 1.1e10, winsPerMeter: 150, smash: 42000, discover: 100000 },
  { id: 'gems', name: 'Gem Mines', theme: 'crystal', start: 5710, wall: 2.4e10, winsPerMeter: 218, smash: 60000, discover: 150000 },
  { id: 'deep', name: 'Deep Ocean', theme: 'ocean', start: 5990, wall: 5.2e10, winsPerMeter: 317, smash: 88000, discover: 220000 },
  { id: 'cyber', name: 'Cyber City', theme: 'neon', start: 6276, wall: 1.1e11, winsPerMeter: 462, smash: 130000, discover: 320000 },
  { id: 'castle', name: 'Sky Castle', theme: 'sky', start: 6568, wall: 2.5e11, winsPerMeter: 676, smash: 190000, discover: 470000 },
  { id: 'prism', name: 'Prism Path', theme: 'rainbow', start: 6866, wall: 5.6e11, winsPerMeter: 990, smash: 270000, discover: 690000 },
  { id: 'lunar', name: 'Lunar Craters', theme: 'moon', start: 7170, wall: 1.2e12, winsPerMeter: 1450, smash: 400000, discover: 1e6 },
  { id: 'lights', name: 'Northern Lights', theme: 'aurora', start: 7480, wall: 2.8e12, winsPerMeter: 2140, smash: 590000, discover: 1.5e6 },
  { id: 'galaxy', name: 'Galaxy Rift', theme: 'space', start: 7796, wall: 6.2e12, winsPerMeter: 3150, smash: 870000, discover: 2.2e6 },
  { id: 'infinity', name: 'Infinity', theme: 'cosmic', start: 8118, wall: 1.4e13, winsPerMeter: 4650, smash: 1.3e6, discover: 3.2e6 },
  { id: 'sunflower', name: 'Sunflower Fields', theme: 'grassy', start: 8446, wall: 3.2e13, winsPerMeter: 6870, smash: 1.9e6, discover: 4.8e6 },
  { id: 'harvest', name: 'Harvest Valley', theme: 'autumn', start: 8780, wall: 7.2e13, winsPerMeter: 10200, smash: 2.8e6, discover: 7.1e6 },
  { id: 'oasis', name: 'Golden Oasis', theme: 'desert', start: 9120, wall: 1.6e14, winsPerMeter: 15100, smash: 4.2e6, discover: 1e7 },
  { id: 'lagoon', name: 'Blue Lagoon', theme: 'beach', start: 9466, wall: 3.7e14, winsPerMeter: 22500, smash: 6.2e6, discover: 1.6e7 },
  { id: 'canopy', name: 'Treetop Canopy', theme: 'jungle', start: 9818, wall: 8.6e14, winsPerMeter: 33500, smash: 9.3e6, discover: 2.3e7 },
  { id: 'yeti', name: 'Yeti Mountain', theme: 'frozen', start: 10176, wall: 2e15, winsPerMeter: 50000, smash: 1.4e7, discover: 3.5e7 },
  { id: 'lantern', name: 'Lantern Garden', theme: 'cherry', start: 10540, wall: 4.6e15, winsPerMeter: 74800, smash: 2.1e7, discover: 5.2e7 },
  { id: 'cupcake', name: 'Cupcake Kingdom', theme: 'candy', start: 10910, wall: 1.1e16, winsPerMeter: 112000, smash: 3.1e7, discover: 7.8e7 },
  { id: 'glowcap', name: 'Glowcap Grotto', theme: 'mushroom', start: 11286, wall: 2.5e16, winsPerMeter: 168000, smash: 4.7e7, discover: 1.2e8 },
  { id: 'inferno', name: 'Inferno Peak', theme: 'volcano', start: 11668, wall: 5.8e16, winsPerMeter: 253000, smash: 7e7, discover: 1.8e8 },
  { id: 'bayou', name: 'Firefly Bayou', theme: 'swamp', start: 12056, wall: 1.4e17, winsPerMeter: 382000, smash: 1.1e8, discover: 2.7e8 },
  { id: 'geode', name: 'Geode Valley', theme: 'crystal', start: 12450, wall: 3.2e17, winsPerMeter: 576000, smash: 1.6e8, discover: 4e8 },
  { id: 'atlantis', name: 'Atlantis', theme: 'ocean', start: 12850, wall: 7.6e17, winsPerMeter: 872000, smash: 2.4e8, discover: 6.1e8 },
  { id: 'arcade', name: 'Arcade Avenue', theme: 'neon', start: 13256, wall: 1.8e18, winsPerMeter: 1.3e6, smash: 3.7e8, discover: 9.2e8 },
  { id: 'islands', name: 'Sky Islands', theme: 'sky', start: 13668, wall: 4.3e18, winsPerMeter: 2e6, smash: 5.6e8, discover: 1.4e9 },
  { id: 'unicorn', name: 'Unicorn Trail', theme: 'rainbow', start: 14086, wall: 1e19, winsPerMeter: 3e6, smash: 8.5e8, discover: 2.1e9 },
  { id: 'mars', name: 'Red Planet', theme: 'moon', start: 14510, wall: 2.5e19, winsPerMeter: 4.7e6, smash: 1.3e9, discover: 3.2e9 },
  { id: 'comet', name: 'Comet Ice', theme: 'aurora', start: 14940, wall: 6e19, winsPerMeter: 7.1e6, smash: 2e9, discover: 4.9e9 },
  { id: 'nebula', name: 'Nebula', theme: 'space', start: 15376, wall: 1.5e20, winsPerMeter: 1.1e7, smash: 3e9, discover: 7.5e9 },
  { id: 'beyond', name: 'The Beyond', theme: 'cosmic', start: 15818, wall: 3.5e20, winsPerMeter: 1.7e7, smash: 4.6e9, discover: 1.2e10 },
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
  sunset: { name: 'Sunset', cost: { wins: 750 }, pets: [['flamingo', 45], ['turtle', 30], ['owl', 20], ['phoenix', 5]] },
  unicorn: { name: 'Unicorn', cost: { wins: 6000 }, pets: [['pony', 50], ['unicorn', 35], ['pegasus', 15]] },
  volcano: { name: 'Volcano', cost: { wins: 35000 }, pets: [['salamander', 50], ['firebird', 30], ['golem', 15], ['inferno', 5]] },
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

// --- Worlds -----------------------------------------------------------------------

/**
 * World 2, through the portal once you hold WORLD_PORTALS.world2.wins: the same track
 * and gates, stage for stage, renamed and repainted in a new order (it opens in Candy
 * Land), and every metre, trophy, smash and first-visit prize on it pays `wins` times
 * as much. Its gates need the same Health as World 1's - a harder World 2 would pay
 * less than World 1 right after each rebirth - so going over is always worth it, and
 * coming back (the same portal) costs nothing.
 */
export const WORLDS = [
  { id: 'world1', name: 'World 1', wins: 1 },
  { id: 'world2', name: 'World 2', wins: 3 },
]

/** World 2's stages: [id, name, theme], one for each of World 1's. */
const WORLD2_STAGES = [
  ['w2-lollipop', 'Lollipop Lane', 'candy'],
  ['w2-rainbow-bridge', 'Rainbow Bridge', 'rainbow'],
  ['w2-balloon', 'Balloon Skies', 'sky'],
  ['w2-gem-garden', 'Gem Garden', 'crystal'],
  ['w2-pixel', 'Pixel Park', 'neon'],
  ['w2-blossom', 'Blossom Bay', 'cherry'],
  ['w2-toadstool', 'Toadstool Town', 'mushroom'],
  ['w2-bubble', 'Bubble Lagoon', 'ocean'],
  ['w2-polar', 'Polar Lights', 'aurora'],
  ['w2-moonbounce', 'Moonbounce', 'moon'],
  ['w2-dragon-den', "Dragon's Den", 'volcano'],
  ['w2-monkey', 'Monkey Jungle', 'jungle'],
  ['w2-froggy', 'Froggy Pond', 'swamp'],
  ['w2-penguin', 'Penguin Slopes', 'frozen'],
  ['w2-pirate', 'Pirate Cove', 'beach'],
  ['w2-pharaoh', 'Pharaoh Dunes', 'desert'],
  ['w2-acorn', 'Acorn Woods', 'autumn'],
  ['w2-bunny', 'Bunny Hills', 'grassy'],
  ['w2-rocket', 'Rocket Run', 'space'],
  ['w2-star-factory', 'Star Factory', 'cosmic'],
  ['w2-gumdrop', 'Gumdrop Hills', 'candy'],
  ['w2-unicorn-meadow', 'Unicorn Meadow', 'rainbow'],
  ['w2-floating', 'Floating Isles', 'sky'],
  ['w2-amethyst', 'Amethyst Hollow', 'crystal'],
  ['w2-robot', 'Robot City', 'neon'],
  ['w2-tea', 'Tea Garden', 'cherry'],
  ['w2-fairy', 'Fairy Ring', 'mushroom'],
  ['w2-shark', 'Shark Reef', 'ocean'],
  ['w2-snow-owl', 'Snow Owl Peak', 'aurora'],
  ['w2-crater', 'Crater Camp', 'moon'],
  ['w2-fire-falls', 'Fire Falls', 'volcano'],
  ['w2-tiger', 'Tiger Temple', 'jungle'],
  ['w2-gator', 'Gator Bayou', 'swamp'],
  ['w2-yeti', 'Yeti Cave', 'frozen'],
  ['w2-treasure', 'Treasure Island', 'beach'],
  ['w2-cactus', 'Cactus Canyon', 'desert'],
  ['w2-maple', 'Maple Mill', 'autumn'],
  ['w2-windmill', 'Windmill Farm', 'grassy'],
  ['w2-asteroid', 'Asteroid Belt', 'space'],
  ['w2-supernova', 'Supernova', 'cosmic'],
  ['w2-chocolate', 'Chocolate River', 'candy'],
  ['w2-prism', 'Prism Palace', 'rainbow'],
  ['w2-thunder', 'Thunder Clouds', 'sky'],
  ['w2-diamond-depths', 'Diamond Depths', 'crystal'],
  ['w2-hologram', 'Hologram Highway', 'neon'],
  ['w2-dragon-garden', 'Dragon Garden', 'cherry'],
  ['w2-glow-forest', 'Glow Forest', 'mushroom'],
  ['w2-kraken', 'Kraken Deep', 'ocean'],
  ['w2-frost-crown', 'Frost Crown', 'aurora'],
  ['w2-saturn', 'Saturn Rings', 'moon'],
  ['w2-magma-throne', 'Magma Throne', 'volcano'],
  ['w2-dino', 'Dino Valley', 'jungle'],
  ['w2-lotus', 'Lotus Marsh', 'swamp'],
  ['w2-ice-palace', 'Ice Palace', 'frozen'],
  ['w2-mermaid', 'Mermaid Shores', 'beach'],
  ['w2-sphinx-sands', 'Sphinx Sands', 'desert'],
  ['w2-golden-grove', 'Golden Grove', 'autumn'],
  ['w2-clover', 'Clover Kingdom', 'grassy'],
  ['w2-black-hole', 'Black Hole', 'space'],
  ['w2-multiverse', 'The Multiverse', 'cosmic'],
]

const worldZones = (world) =>
  ZONES.map((zone, i) => {
    const mult = WORLDS[world].wins
    const [id, name, theme] = world === 1 ? WORLD2_STAGES[i] : [zone.id, zone.name, zone.theme]
    return {
      ...zone,
      id,
      name,
      theme,
      winsPerMeter: zone.winsPerMeter * mult,
      smash: zone.smash * mult,
      discover: zone.discover * mult,
    }
  })

/** Each world's stages, as ZONES: `WORLD_ZONES[profile.world]`. */
export const WORLD_ZONES = [ZONES, worldZones(1)]
export const zonesOf = (world) => WORLD_ZONES[world] ?? ZONES

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
  { text: 'Buy a new tire with your Wins!', event: 'buyTire', target: 'tires' },
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
