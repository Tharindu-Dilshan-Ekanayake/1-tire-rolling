import { PLAYTIME_REWARDS } from '@shared/balance'
import { formatClock } from '@shared/format'
import { playtimeStatus } from '@shared/logic'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import RewardIcon from '../RewardIcon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/**
 * "FREE GIFT in 4:02", top centre as in the reference: the next playtime reward of this
 * session counting down, turning into a CLAIM button once it's ready. Only this ticks
 * once a second; nothing else re-renders for it.
 */
export function GiftTimer() {
  const session = useGame((s) => s.session)
  const now = useNow(1000)
  const next = playtimeStatus(session, now).find((s) => s.state !== 'claimed')
  if (!next) return null
  const reward = PLAYTIME_REWARDS[next.index]
  const ready = next.state === 'ready'

  return (
    <ChunkyButton
      gradient={ready ? GRADIENTS.greenButton : GRADIENTS.goldButton}
      onClick={ready ? () => actions.claimPlaytime(next.index) : undefined}
      title={reward.label}
      radius={40}
      border={5}
      className={ready ? 'pp-bounce' : ''}
      style={{ height: u(74), padding: `0 ${u(30)} 0 ${u(86)}`, cursor: ready ? 'pointer' : 'default' }}
    >
      <span className="absolute" style={{ left: u(-18), top: u(-16) }}>
        <RewardIcon icon={reward.icon} size={u(100)} />
      </span>
      <span style={{ fontSize: u(40) }}>
        <StrokeText stroke={u(9)}>{ready ? `CLAIM ${reward.label}!` : `FREE ${reward.label} in ${formatClock(next.unlocksIn)}`}</StrokeText>
      </span>
    </ChunkyButton>
  )
}

export default GiftTimer
