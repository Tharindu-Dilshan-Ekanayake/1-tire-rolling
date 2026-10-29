import { levelCap, rebirthMultiplier, slideForLevel } from '@shared/balance'
import { formatMultiplier, formatNumber } from '@shared/format'
import { isMaxLevel, levelProgress, slidePacks } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame, useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from './parts'
import { u } from './style'

/** Width of the whole bar, in reference pixels: every row lines up to it. */
const WIDTH = 900

const PACK_GRADIENTS = [
  'linear-gradient(180deg, #ffe25a 0%, #ffb21e 55%, #f08a0a 100%)',
  'linear-gradient(180deg, #8ff0ff 0%, #2fb8ff 50%, #1677ff 100%)',
  'linear-gradient(180deg, #ff8a7a 0%, #ff3b3b 50%, #d4142a 100%)',
  'linear-gradient(180deg, #ff9cf4 0%, #c452ff 50%, #8a2bff 100%)',
]

const BAR_FILL = 'linear-gradient(180deg, #8fe8ff 0%, #33b6ff 45%, #1a7cf0 100%)'
const PURPLE = 'linear-gradient(180deg, #ffd6ff 0%, #e27bff 50%, #a93cf0 100%)'

/**
 * "Level 12 ... 199/214": your level and your Slide against what the next level needs.
 * At max level it reads "MAX LEVEL 15 ... Rebirth!" and opens the rebirth panel.
 */
function LevelBar() {
  const level = useGame((s) => s.profile.level)
  const slide = useGame((s) => s.profile.slide)
  const maxed = useGame((s) => isMaxLevel(s.profile))
  const fill = useGame((s) => levelProgress(s.profile))
  const cap = useGame((s) => levelCap(s.profile.rebirths))
  const openPanel = useGame((s) => s.openPanel)

  return (
    <button
      type="button"
      onClick={maxed ? () => openPanel('rebirth') : undefined}
      className={`relative w-full overflow-hidden text-left ${maxed ? 'pp-btn pointer-events-auto' : 'pointer-events-none'}`}
      style={{
        height: u(78),
        borderRadius: u(40),
        border: `${u(6)} solid #0b2a6b`,
        background: '#eef6ff',
        boxShadow: `0 ${u(5)} 0 #0b2a6b, inset 0 ${u(-6)} 0 rgba(0,0,0,0.08)`,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
        style={{ width: `${fill * 100}%`, background: BAR_FILL, borderRadius: u(34) }}
      />
      <div className="absolute" style={{ left: u(18), right: u(18), top: u(6), height: u(14), borderRadius: u(8), background: 'rgba(255,255,255,0.35)' }} />
      <div className="absolute inset-0 flex items-center justify-between" style={{ padding: `0 ${u(30)}`, fontSize: u(50) }}>
        <StrokeText stroke={u(10)}>{maxed ? `MAX LEVEL ${cap}` : `Level ${level}`}</StrokeText>
        <StrokeText stroke={u(10)}>{maxed ? 'Rebirth!' : `${formatNumber(slide)}/${formatNumber(slideForLevel(level + 1))}`}</StrokeText>
      </div>
    </button>
  )
}

/** A Slide pack: "+140 Slide" on the button, its price in Wins on a chip at the corner. */
function PackButton({ index, amount, price, afford }) {
  const buy = () => {
    if (getGame().profile.wins < price) {
      sfx.error()
      return
    }
    actions.buyPack(index)
  }
  return (
    <ChunkyButton gradient={PACK_GRADIENTS[index]} onClick={buy} title={`+${formatNumber(amount)} Slide`} radius={18} border={5} style={{ width: u(208), height: u(86) }}>
      <Icon name="slide" size={u(78)} className="absolute" style={{ opacity: 0.9, left: u(56) }} />
      <span className="relative" style={{ fontSize: u(38) }}>
        <StrokeText stroke={u(9)}>+{formatNumber(amount)} Slide</StrokeText>
      </span>
      <span className="absolute" style={{ top: u(-26), right: u(-14) }}>
        <Price amount={price} size={30} afford={afford} />
      </span>
    </ChunkyButton>
  )
}

/**
 * Bottom centre, as in the reference: "Slide: 199" and "Rebirth x1", the level bar, and
 * the four Slide packs.
 */
export function SlideBar() {
  const slide = useGame((s) => s.profile.slide)
  const rebirths = useGame((s) => s.profile.rebirths)
  const level = useGame((s) => s.profile.level)
  const wins = useGame((s) => s.profile.wins - s.pendingWins)
  const packs = slidePacks({ level, rebirths })

  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(18), width: u(WIDTH), gap: u(8) }}>
      <div className="relative flex w-full items-end justify-center" style={{ height: u(52) }}>
        <span style={{ fontSize: u(44) }}>
          <StrokeText stroke={u(9)}>Slide: {formatNumber(slide)}</StrokeText>
        </span>
        <span className="absolute" style={{ right: u(60), bottom: u(-2), fontSize: u(34) }}>
          <StrokeText stroke={u(7)} gradient={PURPLE}>
            Rebirth {formatMultiplier(rebirthMultiplier(rebirths))}
          </StrokeText>
        </span>
      </div>
      <LevelBar />
      <div className="flex w-full justify-between" style={{ marginTop: u(26), padding: `0 ${u(4)}` }}>
        {packs.map((pack, i) => (
          <PackButton key={i} index={i} amount={pack.amount} price={pack.price} afford={wins >= pack.price} />
        ))}
      </div>
    </div>
  )
}

export default SlideBar
