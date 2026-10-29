import { TIRES } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { sfx } from '../audio/sfx'
import { burst, queueTrainFx } from '../game/fx/fxQueue'
import { runtime } from '../game/runtime'
import { beginRoll, roll } from '../game/roll/rollControl'
import { getGame } from '../store/game'

/** A point above wherever you're watching: you in the lobby, or your rolling tire. */
const atPlayer = (dy = 1.2) => {
  const p = roll.active ? roll.position : runtime.player.position
  return { x: p.x, y: p.y + dy, z: p.z }
}

/**
 * Applies one authority event to the client: updates the store and kicks off any
 * visual effect. The same handler serves the Colyseus connection and offline mode.
 */
export function handleServerEvent(type, payload) {
  const game = getGame()
  switch (type) {
    case 'profile': {
      const before = game.profile
      game.setProfile(payload.profile, payload.session)
      // Celebrate the big moments, whatever caused them.
      if (game.profileLoaded && payload.profile.rebirths > before.rebirths) {
        sfx.rebirth()
        burst({ ...atPlayer(), count: 60, speed: 9 })
      } else if (game.profileLoaded && payload.profile.ownedTires.length > before.ownedTires.length) {
        // A new tire: a shower of confetti and its name up in lights.
        sfx.buy()
        sfx.wins()
        burst({ ...atPlayer(2.5), count: 60, palette: 'confetti', speed: 9 })
        const tire = TIRES.find((t) => t.id === payload.profile.equippedTire)
        if (tire) game.showToast(`NEW TIRE: ${tire.name}!`)
      }
      break
    }

    case 'train':
      game.patchProfile({
        health: payload.health,
        level: payload.level,
        // Gains from rolling and walking aren't pad training.
        ...(payload.source === 'pad' ? { lastPad: payload.pad } : {}),
      })
      queueTrainFx(payload)
      if (payload.leveledUp) {
        sfx.levelUp()
        burst({ ...atPlayer(1.8), count: 24, palette: 'power', speed: 6 })
      }
      break

    case 'roll':
      sfx.tirePop()
      beginRoll(payload)
      break

    case 'pack':
      sfx.buy()
      burst({ ...atPlayer(2), count: 30, palette: 'power', speed: 7 })
      break

    case 'hatch':
      game.setHatch({ eggId: payload.eggId, pets: payload.pets, id: Date.now() })
      if (payload.eggId) {
        setTimeout(sfx.crack, 1100)
        setTimeout(sfx.reveal, 1250)
      } else {
        sfx.reveal()
      }
      break

    case 'offline':
      game.openPanel('offline', payload)
      break

    case 'badge':
      sfx.wins()
      break

    case 'reward':
      // A rewarded ad or a Gems purchase landed.
      sfx.buy()
      burst({ ...atPlayer(2), count: 40, palette: 'gold', speed: 8 })
      game.showToast(`${payload.label}${payload.wins ? ` +${formatNumber(payload.wins)} Wins` : ''}!`)
      break

    default:
      break
  }
}
