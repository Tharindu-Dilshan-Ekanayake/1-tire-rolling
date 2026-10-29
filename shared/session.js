import { EGGS, ITEMS, MULTI_HATCH, PADS, ROLL_TICK, SHOP, TIRES, TRAIN_INTERVAL, WALK_STEP, WORLD_PORTALS, ZONES } from './balance.js'
import {
  advanceTutorial,
  applyAdReward,
  applyGemProduct,
  applyRebirth,
  applyRoll,
  applyRollTick,
  applyTrain,
  applyWalkStep,
  awardBadge,
  buyHealthPack,
  buyShopItem,
  buyTire,
  claimDaily,
  claimFreeReward,
  claimPlaytime,
  createSession,
  deletePet,
  equipBestPets,
  equipPet,
  equipTire,
  hatchEgg,
  isMaxLevel,
  isPadUnlocked,
  skipRebirth,
  unequipPet,
  usePotion,
} from './logic.js'
import { eggStandNear, FREE_REWARD, inRect, inRollZone, MAX_MOVE_SPEED, onPad, portalAt, standRect, TIRE_STANDS } from './world.js'

const TIRE_INDEX = Object.fromEntries(TIRES.map((t, i) => [t.id, i]))
/** Reaching Outer Space earns its badge; the last stage has its own. */
const SPACE_ZONE = ZONES.findIndex((z) => z.id === 'space')

/** How far off a pad still counts as "on" it (network jitter). */
const PAD_SLACK = 0.8
/** Same for the roll zone. */
const ROLL_SLACK = 1.5
/** Tires are bought by standing at their stand; allow for a little lag. */
const STAND_SLACK = 2

/**
 * One player's authoritative session: validates intents, runs the training tick and
 * reports what happened through `emit`.
 *
 * Transport-agnostic on purpose. The Colyseus room wraps one of these per client; the
 * offline mode wraps one for the local player. Either way the rules that run are
 * byte-for-byte the same.
 *
 * Events emitted (type, payload):
 * - 'profile'  { profile, session }  full state, after anything structural
 * - 'train'    { source, pad, gain, health, level, leveledUp, levels, maxed }  each
 *                Health gain; `source` is 'pad' (pad is its index), 'roll' (while your
 *                tire rolls) or 'walk' (walking round the lobby), pad -1 for both
 * - 'roll'     { distance, wins, prize, discovered, blocked, broken, duration,
 *                multiplier, best, tireId }  a roll to replay
 * - 'pack'     { amount }  a Health pack landed
 * - 'hatch'    { eggId, pets: [{ uid, id }] }  pets to reveal
 * - 'badge'    { id, name }
 * - 'reward'   { label, wins? }  an ad reward or Gems purchase landed
 *
 * `onRoll(result)` lets the host tell other players about a roll (ghost tires).
 */
export class PlayerSession {
  /**
   * @param {object} profile normalized profile (see logic.normalizeProfile)
   * @param {{ now: number, emit: (type: string, payload?: object) => void,
   *           getPosition: () => {x: number, y: number, z: number},
   *           onPurchase?: (productId: string) => boolean,
   *           onRoll?: (result: object) => void }} options
   *   `onPurchase` lets the host veto or count a shop sale (stock limits).
   */
  constructor(profile, { now, emit, getPosition, onPurchase, onRoll }) {
    this.profile = profile
    this.session = createSession(now)
    this.emit = emit
    this.getPosition = getPosition
    this.onPurchase = onPurchase
    this.onRoll = onRoll

    /** Pad the client says it's on; verified against position every tick. */
    this.pad = -1
    this.trainTimer = 0
    /** Server time until which the player's tire is out (and its result) and can't roll again. */
    this.busyUntil = 0
    /** Server time the current roll stops; Health ticks in until then. */
    this.rollingUntil = 0
    this.rollTimer = 0
    /** Metres walked towards the next walking gain, and where the player last was. */
    this.walked = 0
    this.lastX = null
    this.lastZ = 0
    this.dirty = false
  }

  // --- Plumbing --------------------------------------------------------------------

  sendProfile() {
    this.dirty = false
    this.emit('profile', { profile: this.profile, session: this.session })
  }

  badge(id) {
    const badge = awardBadge(this.profile, id)
    if (badge) {
      this.dirty = true
      this.emit('badge', badge)
    }
  }

  tutorial(event) {
    if (advanceTutorial(this.profile, event)) this.dirty = true
  }

  // --- Intents ---------------------------------------------------------------------

  /** Dispatches one client message. Unknown types are ignored. */
  handle(type, payload = {}, now) {
    const handler = this.handlers[type]
    if (!handler) return
    handler.call(this, payload || {}, now)
    if (this.dirty) this.sendProfile()
  }

  handlers = {
    enterPad({ pad }) {
      const index = Number(pad)
      if (!Number.isInteger(index) || !PADS[index]) return
      if (!isPadUnlocked(this.profile, index)) return
      if (this.pad !== index) {
        this.pad = index
        // The first step lands a beat after getting on, not instantly.
        this.trainTimer = TRAIN_INTERVAL * 0.5
      }
    },

    leavePad() {
      this.pad = -1
    },

    setting({ key, value }) {
      if (key === 'autoRebirth') this.profile.settings.autoRebirth = Boolean(value)
      else if (key === 'autoRoll' && this.profile.passes.autoRoll) this.profile.settings.autoRoll = Boolean(value)
      else return
      this.dirty = true
    },

    rebirth() {
      const result = applyRebirth(this.profile)
      if (result.ok) this.afterRebirth()
    },

    skipRebirth() {
      const result = skipRebirth(this.profile)
      if (result.ok) this.afterRebirth()
    },

    /** Rolls your tire: only from the ROLL ZONE, and not while one is still out. */
    roll(_payload, now) {
      if (now < this.busyUntil) return
      const p = this.getPosition()
      if (!inRollZone(p.x, p.z, ROLL_SLACK)) return
      const result = applyRoll(this.profile, now)
      this.busyUntil = now + result.cooldown * 1000
      this.rollingUntil = now + result.duration * 1000
      this.rollTimer = 0
      this.pad = -1
      this.emit('roll', {
        distance: result.distance,
        wins: result.wins,
        prize: result.prize,
        discovered: result.discovered,
        blocked: result.blocked,
        broken: result.broken,
        duration: result.duration,
        multiplier: result.multiplier,
        best: result.best,
        tireId: this.profile.equippedTire,
      })
      this.onRoll?.(result)
      // The HUD holds the new Wins back until the tire stops; the profile can go now.
      this.dirty = true
      this.tutorial('roll')
      this.badge('firstRoll')
      if (result.broken > 0) this.badge('firstWall')
      if (result.distance >= 1000) this.badge('kilometer')
      if (this.profile.stats.bestZone >= SPACE_ZONE) this.badge('space')
      if (this.profile.stats.bestZone >= ZONES.length - 1) this.badge('cosmic')
    },

    buyTire({ id }) {
      if (!this.nearStandFor(id)) return
      const result = buyTire(this.profile, id)
      if (!result.ok) return
      this.dirty = true
      if (result.bought) this.tutorial('buyTire')
    },

    equipTire({ id }) {
      const result = equipTire(this.profile, id)
      if (result.ok) this.dirty = true
    },

    buyPack({ index }) {
      const result = buyHealthPack(this.profile, Number(index))
      if (!result.ok) return
      this.dirty = true
      this.emit('pack', { amount: result.amount })
    },

    hatch({ eggId, count }) {
      const egg = EGGS[eggId]
      if (!egg) return
      const p = this.getPosition()
      if (eggStandNear(p.x, p.z)?.eggId !== eggId) return
      const n = count === MULTI_HATCH ? MULTI_HATCH : 1
      this.reveal(hatchEgg(this.profile, eggId, n))
    },

    openEggItem({ itemId }) {
      const item = ITEMS[itemId]
      if (!item || item.kind !== 'egg') return
      this.reveal(hatchEgg(this.profile, item.egg, 1, { paid: 'item' }))
    },

    equipPet({ uid }) {
      if (equipPet(this.profile, Number(uid)).ok) this.dirty = true
    },

    unequipPet({ uid }) {
      unequipPet(this.profile, Number(uid))
      this.dirty = true
    },

    equipBest() {
      equipBestPets(this.profile)
      this.dirty = true
    },

    deletePet({ uid }) {
      if (deletePet(this.profile, Number(uid)).ok) this.dirty = true
    },

    claimDaily({ day }, now) {
      const result = claimDaily(this.profile, Number(day), now)
      this.afterReward(result)
    },

    claimPlaytime({ index }, now) {
      const result = claimPlaytime(this.profile, this.session, Number(index), now)
      this.afterReward(result)
    },

    claimFreeReward() {
      const p = this.getPosition()
      if (Math.hypot(p.x - FREE_REWARD.x, p.z - FREE_REWARD.z) > FREE_REWARD.radius + 1.5) return
      const result = claimFreeReward(this.profile, this.session)
      this.afterReward(result)
    },

    portal() {
      const p = this.getPosition()
      const portal = portalAt(p.x, p.z, 2)
      if (!portal || this.profile.wins < WORLD_PORTALS[portal.id].wins) return
      this.badge(portal.id)
    },

    usePotion({ itemId }, now) {
      const result = usePotion(this.profile, itemId, now)
      if (!result.ok) return
      this.dirty = true
    },

    /** Buys a SHOP item with Wins. */
    purchase({ productId }) {
      const item = SHOP[productId]
      if (!item) return
      // Checked before the host takes stock, so a short wallet never uses up a Sphinx.
      if (this.profile.wins < item.price) return
      if (item.kind === 'pass' && this.profile.passes[productId]) return
      if (this.onPurchase && !this.onPurchase(productId)) return
      const result = buyShopItem(this.profile, productId)
      if (!result.ok) return
      this.dirty = true
      this.reveal(result)
    },
  }

  // --- Granted by the host, never by a client message --------------------------------

  /**
   * A rewarded ad the host has verified with Boxity (or, offline, that Boxity reported
   * watched). Not a handler: a client can't ask for it directly.
   */
  grantAdReward(placement, now) {
    const result = applyAdReward(this.profile, this.session, placement, now)
    if (!result.ok) return result
    this.dirty = true
    this.emit('reward', { label: result.label })
    this.sendProfile()
    return result
  }

  /** A Gems purchase Boxity has confirmed (its webhook, recorded by the host). */
  grantGemProduct(sku) {
    const result = applyGemProduct(this.profile, sku)
    if (!result.ok) return result
    this.dirty = true
    this.emit('reward', { label: result.name, wins: result.wins || 0 })
    this.sendProfile()
    return result
  }

  afterReward(result) {
    if (!result?.ok) return
    this.dirty = true
    if (result.pets?.length) this.reveal(result)
  }

  /** Sends newly gained pets to the client's hatch animation. */
  reveal(result) {
    if (!result?.ok || !result.pets?.length) return
    this.dirty = true
    this.emit('hatch', { eggId: result.eggId ?? null, pets: result.pets })
    this.tutorial('hatch')
    this.badge('firstPet')
  }

  afterRebirth() {
    this.dirty = true
    this.tutorial('rebirth')
    if (this.profile.rebirths === 1) this.badge('firstRebirth')
  }

  // --- Simulation ------------------------------------------------------------------

  /** Whether the player stands at (or right by) the stand for tire `id`. */
  nearStandFor(id) {
    const stand = TIRE_STANDS[TIRE_INDEX[id]]
    if (!stand) return false
    const p = this.getPosition()
    return inRect(standRect(stand), p.x, p.z, STAND_SLACK)
  }

  /** Whether the player is really standing on the pad they claim. */
  onClaimedPad() {
    if (this.pad < 0) return false
    const p = this.getPosition()
    return onPad(this.pad, p.x, p.z, PAD_SLACK)
  }

  /**
   * Metres walked on the ground since the last tick. A jump further than a few ticks of
   * walking could cover (a teleport, a respawn, the hop back after a roll) earns nothing;
   * the margin allows for position reports arriving in bursts.
   */
  stepWalked(dt) {
    const p = this.getPosition()
    if (this.lastX === null) {
      this.lastX = p.x
      this.lastZ = p.z
      return 0
    }
    const d = Math.hypot(p.x - this.lastX, p.z - this.lastZ)
    this.lastX = p.x
    this.lastZ = p.z
    return d > MAX_MOVE_SPEED * Math.max(dt, 0.1) * 3 ? 0 : d
  }

  /** Advances training, rolling and walking. Call at a steady rate (the room's simulation interval). */
  tick(dt, now) {
    const walked = this.stepWalked(dt)
    if (now < this.rollingUntil) {
      // Health trickles in all the way along the track.
      this.rollTimer += dt
      while (this.rollTimer >= ROLL_TICK) {
        this.rollTimer -= ROLL_TICK
        this.gain('roll', -1, applyRollTick(this.profile, now))
      }
    } else if (this.pad >= 0 && now >= this.busyUntil && this.onClaimedPad()) {
      this.trainTimer += dt
      while (this.trainTimer >= TRAIN_INTERVAL) {
        this.trainTimer -= TRAIN_INTERVAL
        this.trainOnce(now)
      }
    } else {
      this.trainTimer = Math.min(this.trainTimer, TRAIN_INTERVAL * 0.5)
      // Walking round the lobby: a gain every WALK_STEP metres.
      if (now >= this.busyUntil) {
        this.walked += walked
        while (this.walked >= WALK_STEP) {
          this.walked -= WALK_STEP
          this.gain('walk', -1, applyWalkStep(this.profile, now))
        }
      }
    }
    this.profile.stats.playtime += dt
    if (this.dirty) this.sendProfile()
  }

  /** Tells the client about a Health gain from `source` ('pad', 'roll' or 'walk'). */
  gain(source, pad, result) {
    // At max level gains stop; there's nothing to show.
    if (result.gain > 0) {
      this.emit('train', {
        source,
        pad,
        gain: result.gain,
        health: this.profile.health,
        level: this.profile.level,
        leveledUp: result.leveledUp,
        levels: result.levels,
        maxed: result.maxed,
      })
    }
    if (this.profile.settings.autoRebirth && isMaxLevel(this.profile)) {
      const rebirth = applyRebirth(this.profile)
      if (rebirth.ok) this.afterRebirth()
    }
  }

  trainOnce(now) {
    const result = applyTrain(this.profile, this.pad, now)
    if (!result.ok) {
      this.pad = -1
      return
    }
    this.gain('pad', this.pad, result)
    this.tutorial('train')
  }
}
