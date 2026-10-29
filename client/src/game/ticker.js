import { isTreadmillUnlocked } from '@shared/logic'
import {
  deckRect,
  eggStandNear,
  FREE_REWARD,
  inSlideZone,
  padAt,
  portalAt,
  SPHINX_STAND,
  TREADMILL_COUNT,
  treadmillAt,
} from '@shared/world'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame, useGame } from '../store/game'
import { treadmillLabelSpec } from './labels/lobbyLabels'
import { updateWorldLabel } from './labels/registry'
import { runtime } from './runtime'

const TICK_MS = 100

function sameZone(a, b) {
  return (
    a.treadmill === b.treadmill &&
    a.treadmillNear === b.treadmillNear &&
    a.sphinx === b.sphinx &&
    a.slideZone === b.slideZone &&
    a.pad === b.pad &&
    a.egg === b.egg &&
    a.portal === b.portal &&
    a.freeReward === b.freeReward
  )
}

/** Locked treadmills become solid walls for the controller; their signs say what's open. */
function syncTreadmills(profile) {
  const walls = []
  for (let i = 0; i < TREADMILL_COUNT; i += 1) {
    const unlocked = isTreadmillUnlocked(profile, i)
    if (!unlocked) walls.push(deckRect(i))
    updateWorldLabel(`tread-${i}`, treadmillLabelSpec(i, unlocked))
  }
  runtime.dynamicColliders = walls
}

/** What syncTreadmills depends on, so it only runs when that changes. */
const treadmillKey = (profile) => `${profile.rebirths}:${profile.passes.treadVeryOp ? 1 : 0}${profile.passes.treadBest ? 1 : 0}`

/**
 * The 10 Hz bridge between the frame-rate world and the UI: works out which zone the
 * player stands in, tells the authority about treadmill changes, and
 * keeps locked-treadmill walls in step with the profile. This - not the render loop - is
 * what writes zone state into the store, and only when something actually changed.
 *
 * @returns {() => void} stop
 */
export function startGameTicker() {
  let lastTreadmill = -1
  let lastKey = treadmillKey(getGame().profile)

  syncTreadmills(getGame().profile)
  const unsubscribe = useGame.subscribe((state, prev) => {
    if (state.profile === prev.profile) return
    const key = treadmillKey(state.profile)
    if (key === lastKey) return
    lastKey = key
    syncTreadmills(state.profile)
  })

  const tick = () => {
    const game = getGame()
    const p = runtime.player.position
    const egg = eggStandNear(p.x, p.z)
    const zone = {
      treadmill: treadmillAt(p.x, p.z, -0.2),
      // Standing at a treadmill's edge (a locked one's wall stops you there).
      treadmillNear: treadmillAt(p.x, p.z, 1.6),
      sphinx: Math.hypot(p.x - SPHINX_STAND.x, p.z - SPHINX_STAND.z) < 5.5,
      slideZone: inSlideZone(p.x, p.z),
      pad: padAt(p.x, p.z),
      egg: egg ? egg.eggId : null,
      portal: portalAt(p.x, p.z)?.id ?? null,
      freeReward: Math.hypot(p.x - FREE_REWARD.x, p.z - FREE_REWARD.z) < FREE_REWARD.radius,
    }
    if (!sameZone(zone, game.zone)) {
      if (zone.portal && zone.portal !== game.zone.portal) actions.portal()
      game.setZone(zone)
    }
    if (zone.treadmill !== lastTreadmill) {
      if (zone.treadmill >= 0 && isTreadmillUnlocked(game.profile, zone.treadmill)) {
        actions.enterTreadmill(zone.treadmill)
        sfx.treadmillEnter()
      } else if (lastTreadmill >= 0) actions.leaveTreadmill()
      lastTreadmill = zone.treadmill
    }
  }

  const id = setInterval(tick, TICK_MS)
  return () => {
    clearInterval(id)
    unsubscribe()
  }
}
