import { BOARDS, EGGS, ITEMS, MULTI_HATCH, SHOP, SLIDE_TICK, TRAIN_INTERVAL, TREADMILLS, WALK_STEP, WORLD_PORTALS } from './balance.js'
import {
  advanceTutorial,
  applyRebirth,
  applySlide,
  applySlideTick,
  applyTrain,
  applyWalkStep,
  awardBadge,
  buyBoard,
  buyShopItem,
  buySlidePack,
  claimDaily,
  claimFreeReward,
  claimPlaytime,
  createSession,
  deletePet,
  equipBestPets,
  equipBoard,
  equipPet,
  hatchEgg,
  isMaxLevel,
  isTreadmillUnlocked,
  skipRebirth,
  unequipPet,
  usePotion,
} from './logic.js'
import { BOARD_PADS, beltRect, eggStandNear, FREE_REWARD, inRect, inSlideZone, MAX_MOVE_SPEED, padRect, portalAt } from './world.js'

const BOARD_INDEX = Object.fromEntries(BOARDS.map((b, i) => [b.id, i]))

/** How far outside a belt still counts as "on" it (network jitter). */
const BELT_SLACK = 0.8
/** Same for the slide zone. */
const SLIDE_SLACK = 1.5
/** Pads are bought by standing on them; allow for a little lag. */
const PAD_SLACK = 2

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
 * - 'train'    { source, treadmill, gain, slide, level, leveledUp, maxed }  each Slide
 *                gain; `source` is 'tread' (treadmill is its index), 'slide' (sliding
 *                down the hill) or 'walk' (walking round the lobby), treadmill -1 for both
 * - 'slide'    { distance, wins, duration, multiplier, best }  a slide to replay
 * - 'pack'     { amount }  a Slide pack landed
 * - 'hatch'    { eggId, pets: [{ uid, id }] }  pets to reveal
 * - 'badge'    { id, name }
 *
 * `onSlide(result)` lets the host tell other players about a slide (ghost sliders).
 */
export class PlayerSession {
  /**
   * @param {object} profile normalized profile (see logic.normalizeProfile)
   * @param {{ now: number, emit: (type: string, payload?: object) => void,
   *           getPosition: () => {x: number, y: number, z: number},
   *           onPurchase?: (productId: string) => boolean,
   *           onSlide?: (result: object) => void }} options
   *   `onPurchase` lets the host veto or count a shop sale (stock limits).
   */
  constructor(profile, { now, emit, getPosition, onPurchase, onSlide }) {
    this.profile = profile
    this.session = createSession(now)
    this.emit = emit
    this.getPosition = getPosition
    this.onPurchase = onPurchase
    this.onSlide = onSlide

    /** Treadmill the client says it's on; verified against position every tick. */
    this.treadmill = -1
    this.trainTimer = 0
    /** Server time until which the player is on a slide (and its result) and can't start another. */
    this.busyUntil = 0
    /** Server time the current slide stops; Slide ticks in until then. */
    this.slidingUntil = 0
    this.slideTimer = 0
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
    enterTreadmill({ treadmill }) {
      const index = Number(treadmill)
      if (!Number.isInteger(index) || !TREADMILLS[index]) return
      if (!isTreadmillUnlocked(this.profile, index)) return
      if (this.treadmill !== index) {
        this.treadmill = index
        // The first step lands a beat after getting on, not instantly.
        this.trainTimer = TRAIN_INTERVAL * 0.5
      }
    },

    leaveTreadmill() {
      this.treadmill = -1
    },

    setting({ key, value }) {
      if (key !== 'autoRebirth') return
      this.profile.settings.autoRebirth = Boolean(value)
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

    /** Starts a slide: only from the SLIDE ZONE, and not while one is still going. */
    slide(_payload, now) {
      if (now < this.busyUntil) return
      const p = this.getPosition()
      if (!inSlideZone(p.x, p.z, SLIDE_SLACK)) return
      const result = applySlide(this.profile, now)
      this.busyUntil = now + result.cooldown * 1000
      this.slidingUntil = now + result.duration * 1000
      this.slideTimer = 0
      this.treadmill = -1
      this.emit('slide', {
        distance: result.distance,
        wins: result.wins,
        duration: result.duration,
        multiplier: result.multiplier,
        best: result.best,
      })
      this.onSlide?.(result)
      // The HUD holds the new Wins back until you stop; the profile can go now.
      this.dirty = true
      this.tutorial('slide')
      this.badge('firstSlide')
      if (result.distance >= 1000) this.badge('kilometer')
    },

    buyBoard({ id }) {
      if (!this.nearPadFor(id)) return
      const result = buyBoard(this.profile, id)
      if (!result.ok) return
      this.dirty = true
      if (result.bought) this.tutorial('buyBoard')
    },

    equipBoard({ id }) {
      const result = equipBoard(this.profile, id)
      if (result.ok) this.dirty = true
    },

    buyPack({ index }) {
      const result = buySlidePack(this.profile, Number(index))
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

  /** Whether the player stands on (or right by) the pad for board `id`. */
  nearPadFor(id) {
    const pad = BOARD_PADS[BOARD_INDEX[id]]
    if (!pad) return false
    const p = this.getPosition()
    return inRect(padRect(pad), p.x, p.z, PAD_SLACK)
  }

  /** Whether the player is really standing on the treadmill they claim. */
  onClaimedTreadmill() {
    if (this.treadmill < 0) return false
    const p = this.getPosition()
    return inRect(beltRect(this.treadmill), p.x, p.z, BELT_SLACK)
  }

  /**
   * Metres walked on the ground since the last tick. A jump further than a few ticks of
   * walking could cover (a teleport, a respawn, the hop back after a slide) earns nothing;
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

  /** Advances training, sliding and walking. Call at a steady rate (the room's simulation interval). */
  tick(dt, now) {
    const walked = this.stepWalked(dt)
    if (now < this.slidingUntil) {
      // The "+1": Slide trickles in all the way down the hill.
      this.slideTimer += dt
      while (this.slideTimer >= SLIDE_TICK) {
        this.slideTimer -= SLIDE_TICK
        this.gain('slide', -1, applySlideTick(this.profile, now))
      }
    } else if (this.treadmill >= 0 && now >= this.busyUntil && this.onClaimedTreadmill()) {
      this.trainTimer += dt
      while (this.trainTimer >= TRAIN_INTERVAL) {
        this.trainTimer -= TRAIN_INTERVAL
        this.trainOnce(now)
      }
    } else {
      this.trainTimer = Math.min(this.trainTimer, TRAIN_INTERVAL * 0.5)
      // Walking round the lobby: a "+1" every WALK_STEP metres.
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

  /** Tells the client about a Slide gain from `source` ('tread', 'slide' or 'walk'). */
  gain(source, treadmill, result) {
    // At max level gains stop; there's nothing to show.
    if (result.gain > 0) {
      this.emit('train', {
        source,
        treadmill,
        gain: result.gain,
        slide: this.profile.slide,
        level: this.profile.level,
        leveledUp: result.leveledUp,
        maxed: result.maxed,
      })
    }
    if (this.profile.settings.autoRebirth && isMaxLevel(this.profile)) {
      const rebirth = applyRebirth(this.profile)
      if (rebirth.ok) this.afterRebirth()
    }
  }

  trainOnce(now) {
    const result = applyTrain(this.profile, this.treadmill, now)
    if (!result.ok) {
      this.treadmill = -1
      return
    }
    this.gain('tread', this.treadmill, result)
    this.tutorial('train')
  }
}
