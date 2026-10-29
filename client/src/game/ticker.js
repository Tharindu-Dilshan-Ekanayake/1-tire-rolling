import { isPadUnlocked } from '@shared/logic'
import { eggStandNear, FREE_REWARD, inRollZone, PAD_COUNT, padAt, padRect, portalAt, SPHINX_STAND, standAt } from '@shared/world'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame, useGame } from '../store/game'
import { padLabelSpec } from './labels/lobbyLabels'
import { updateWorldLabel } from './labels/registry'
import { runtime } from './runtime'

const TICK_MS = 100

function sameZone(a, b) {
  return (
    a.pad === b.pad &&
    a.padNear === b.padNear &&
    a.sphinx === b.sphinx &&
    a.rollZone === b.rollZone &&
    a.stand === b.stand &&
    a.egg === b.egg &&
    a.portal === b.portal &&
    a.freeReward === b.freeReward
  )
}

/** Locked pads become solid walls for the controller; their signs say what's open. */
function syncPads(profile) {
  const walls = []
  for (let i = 0; i < PAD_COUNT; i += 1) {
    const unlocked = isPadUnlocked(profile, i)
    if (!unlocked) walls.push(padRect(i))
    updateWorldLabel(`pad-${i}`, padLabelSpec(i, unlocked))
  }
  runtime.dynamicColliders = walls
}

/** What syncPads depends on, so it only runs when that changes. */
const padKey = (profile) => `${profile.rebirths}:${profile.passes.padVeryOp ? 1 : 0}${profile.passes.padBest ? 1 : 0}`

/**
 * The 10 Hz bridge between the frame-rate world and the UI: works out which zone the
 * player stands in, tells the authority about pad changes, and
 * keeps locked-pad walls in step with the profile. This - not the render loop - is
 * what writes zone state into the store, and only when something actually changed.
 *
 * @returns {() => void} stop
 */
export function startGameTicker() {
  let lastPad = -1
  let lastKey = padKey(getGame().profile)

  syncPads(getGame().profile)
  const unsubscribe = useGame.subscribe((state, prev) => {
    if (state.profile === prev.profile) return
    const key = padKey(state.profile)
    if (key === lastKey) return
    lastKey = key
    syncPads(state.profile)
  })

  const tick = () => {
    const game = getGame()
    const p = runtime.player.position
    const egg = eggStandNear(p.x, p.z)
    const zone = {
      pad: padAt(p.x, p.z, -0.2),
      // Standing at a pad's edge (a locked one's wall stops you there).
      padNear: padAt(p.x, p.z, 1.8),
      sphinx: Math.hypot(p.x - SPHINX_STAND.x, p.z - SPHINX_STAND.z) < 5.5,
      rollZone: inRollZone(p.x, p.z),
      stand: standAt(p.x, p.z),
      egg: egg ? egg.eggId : null,
      portal: portalAt(p.x, p.z)?.id ?? null,
      freeReward: Math.hypot(p.x - FREE_REWARD.x, p.z - FREE_REWARD.z) < FREE_REWARD.radius,
    }
    if (!sameZone(zone, game.zone)) {
      if (zone.portal && zone.portal !== game.zone.portal) actions.portal()
      game.setZone(zone)
    }
    if (zone.pad !== lastPad) {
      if (zone.pad >= 0 && isPadUnlocked(game.profile, zone.pad)) {
        actions.enterPad(zone.pad)
        sfx.treadmillEnter()
      } else if (lastPad >= 0) actions.leavePad()
      lastPad = zone.pad
    }
  }

  const id = setInterval(tick, TICK_MS)
  return () => {
    clearInterval(id)
    unsubscribe()
  }
}
