import { formatClock, formatNumber } from '@shared/format'

import { useGame } from '../../store/game'
import useNow from '../useNow'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

function StatRow({ icon, value, gradient }) {
  return (
    <div className="relative flex items-center" style={{ height: u(86) }}>
      <Icon name={icon} size={u(86)} className="relative" />
      <span className="relative" style={{ fontSize: u(64), marginLeft: u(8) }}>
        <StrokeText stroke={u(12)} gradient={gradient}>
          {value}
        </StrokeText>
      </span>
    </div>
  )
}

/** Active potion timers, shown under the stats while a boost runs. */
function Boosts() {
  const boosts = useGame((s) => s.profile.boosts)
  const now = useNow(1000)
  const active = [
    ['potionHealth', boosts.health],
    ['potionWins', boosts.wins],
  ].filter(([, end]) => end > now)
  if (active.length === 0) return null
  return (
    <div className="flex" style={{ gap: u(10), marginTop: u(4) }}>
      {active.map(([icon, end]) => (
        <div key={icon} className="flex items-center" style={{ fontSize: u(28) }}>
          <Icon name={icon} size={u(54)} />
          <StrokeText stroke={u(6)}>{formatClock(end - now)}</StrokeText>
        </div>
      ))}
    </div>
  )
}

/** Top-left, as in the reference: Rebirths, then Wins, with any running potions under them. */
export function StatsPanel() {
  const wins = useGame((s) => s.profile.wins - s.pendingWins)
  const rebirths = useGame((s) => s.profile.rebirths)

  return (
    <div className="pointer-events-none absolute flex flex-col" style={{ left: u(22), top: u(150) }}>
      <StatRow icon="rebirth" value={formatNumber(rebirths)} />
      <StatRow icon="trophy" value={formatNumber(wins)} gradient={GRADIENTS.gold} />
      <Boosts />
    </div>
  )
}

export default StatsPanel
