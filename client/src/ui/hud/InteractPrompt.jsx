import { useEffect } from 'react'

import { BOARDS, SHOP, TREADMILLS, WORLD_PORTALS } from '@shared/balance'
import { formatMultiplier, formatNumber } from '@shared/format'
import { isTreadmillUnlocked } from '@shared/logic'

import { padState } from '../../game/labels/lobbyLabels'
import { actions } from '../../net/actions'
import { buy } from '../../net/shop'
import { useGame } from '../../store/game'
import { u } from './style'

/**
 * What standing on the current spot lets you do, if anything: { title, action, run }.
 * One prompt at a time.
 */
function usePrompt() {
  const pad = useGame((s) => s.zone.pad)
  const owned = useGame((s) => s.profile.ownedBoards)
  const equipped = useGame((s) => s.profile.equippedBoard)
  const atFreeReward = useGame((s) => s.zone.freeReward)
  const freeTaken = useGame((s) => s.session.freeRewardTaken)
  const treadmillNear = useGame((s) => s.zone.treadmillNear)
  const treadmillLocked = useGame((s) => s.zone.treadmillNear >= 0 && !isTreadmillUnlocked(s.profile, s.zone.treadmillNear))
  const atSphinx = useGame((s) => s.zone.sphinx)
  const atPortal = useGame((s) => s.zone.portal)
  const wins = useGame((s) => s.profile.wins)

  if (atPortal) {
    const world = WORLD_PORTALS[atPortal]
    return wins >= world.wins
      ? { title: world.name, action: 'Coming soon!', run: null }
      : { title: world.name, action: `Needs ${formatNumber(world.wins)} Wins (you have ${formatNumber(wins)})`, run: null }
  }

  if (atSphinx) {
    return { title: 'Sphinx - Limited!', action: `Buy - ${formatNumber(SHOP.sphinx.price)} Wins`, run: () => buy('sphinx') }
  }

  if (treadmillLocked) {
    const treadmill = TREADMILLS[treadmillNear]
    const title = `${treadmill.name} - ${formatMultiplier(treadmill.mult)} Slide`
    if (treadmill.product) {
      return { title, action: `Unlock - ${formatNumber(SHOP[treadmill.product].price)} Wins`, run: () => buy(treadmill.product) }
    }
    const word = treadmill.rebirths === 1 ? 'Rebirth' : 'Rebirths'
    return { title, action: `Locked: needs ${treadmill.rebirths} ${word}`, run: null }
  }

  if (atFreeReward) {
    return freeTaken
      ? { title: 'Free Reward', action: 'Come back next time!', run: null }
      : { title: 'Free Reward', action: 'Claim', run: () => actions.claimFreeReward() }
  }

  if (pad >= 0) {
    const board = BOARDS[pad]
    const title = `${board.name} - ${formatMultiplier(board.mult)} Slide`
    const state = padState({ ownedBoards: owned, equippedBoard: equipped }, pad)
    if (state === 'equipped') return { title, action: 'Equipped', run: null }
    if (state === 'owned') return { title, action: 'Equip', run: () => actions.equipBoard(board.id) }
    if (state === 'locked') return { title, action: `Buy the ${BOARDS[pad - 1].name} first`, run: null }
    return { title, action: `Buy - ${formatNumber(board.cost)} Wins`, run: () => actions.buyBoard(board.id) }
  }
  return null
}

/**
 * Proximity prompt, styled like the platform's own: a dark box with the key to press.
 * E on keyboard; tap the box on touch screens.
 */
export function InteractPrompt() {
  const prompt = usePrompt()
  const busy = useGame((s) => Boolean(s.slide || s.slideResult || s.panel))
  const run = !busy ? prompt?.run : null

  useEffect(() => {
    if (!run) return undefined
    const onKey = (e) => {
      if (e.code === 'KeyE' && !e.repeat) run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  if (!prompt || busy) return null
  return (
    <button
      type="button"
      onClick={() => prompt.run?.()}
      className="pp-btn pointer-events-auto absolute flex items-center text-left text-white"
      style={{
        left: '53%',
        top: '50%',
        gap: u(14),
        padding: `${u(12)} ${u(20)} ${u(12)} ${u(12)}`,
        borderRadius: u(10),
        background: 'rgba(24, 26, 30, 0.78)',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 600,
      }}
    >
      {prompt.run && (
        <span
          className="flex items-center justify-center rounded-full"
          style={{ width: u(54), height: u(54), border: `${u(3)} solid #fff`, fontSize: u(26) }}
        >
          E
        </span>
      )}
      <span className="flex flex-col leading-tight">
        <span style={{ fontSize: u(20), opacity: 0.75 }}>{prompt.title}</span>
        <span style={{ fontSize: u(28) }}>{prompt.action}</span>
      </span>
    </button>
  )
}

export default InteractPrompt
