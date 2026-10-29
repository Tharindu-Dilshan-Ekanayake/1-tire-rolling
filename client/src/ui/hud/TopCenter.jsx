import { TUTORIAL } from '@shared/balance'
import { isMaxLevel, nextBoard, rebirthProgress } from '@shared/logic'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import GiftTimer from './GiftTimer'
import { GRADIENTS, u } from './style'

const BANNER_GRADIENT = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 45%, #ffa000 100%)'

/** What to tell the player right now: the tutorial step, else the best next move. */
function useHint() {
  const step = useGame((s) => s.profile.tutorialStep)
  const maxed = useGame((s) => isMaxLevel(s.profile))
  const board = useGame((s) => nextBoard(s.profile))
  const canBuyBoard = useGame((s) => Boolean(board && s.profile.wins >= board.cost))
  const onZone = useGame((s) => s.zone.slideZone)
  const current = TUTORIAL[step]
  if (current?.event === 'slide' && onZone) return { text: 'Press SLIDE!', rebirth: false }
  if (current) return { text: current.text, rebirth: current.event === 'rebirth' }
  if (maxed) return { text: 'MAX LEVEL - Rebirth now!', rebirth: false }
  if (canBuyBoard) return { text: `Buy the ${board.name}!`, rebirth: false }
  return { text: 'Slide to win more Wins!', rebirth: false }
}

/**
 * The big hint across the top, as in the reference, with a progress bar on the rebirth
 * step. Each new hint shows for about three seconds and fades (pp-hint), so it's never
 * in the way of playing; keyed on its text, a new one starts it again. Paused while the
 * HUD is out of sight (sliding, a panel open), so a hint is never used up unseen.
 */
function HintBanner() {
  const hint = useHint()
  const progress = useGame((s) => rebirthProgress(s.profile))
  const maxed = useGame((s) => isMaxLevel(s.profile))
  const hidden = useGame((s) => Boolean(s.slide || s.slideResult) || s.panel !== null)

  return (
    <div key={hint.text} className="pp-hint flex flex-col items-center" style={{ animationPlayState: hidden ? 'paused' : 'running' }}>
      <div style={{ fontSize: u(68) }}>
        <StrokeText stroke={u(13)} gradient={BANNER_GRADIENT}>
          {hint.text}
        </StrokeText>
      </div>
      {hint.rebirth && (
        <div
          className="relative overflow-hidden"
          style={{ width: u(700), height: u(38), border: `${u(4)} solid #111`, borderRadius: u(19), background: 'rgba(0,0,0,0.45)', marginTop: u(8) }}
        >
          <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: GRADIENTS.barFill }} />
          <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: u(22) }}>
            <StrokeText stroke={u(5)}>{maxed ? 'MAX LEVEL - REBIRTH!' : `${Math.floor(progress * 100)}% TO MAX LEVEL`}</StrokeText>
          </div>
        </div>
      )}
    </div>
  )
}

/** Top centre: the playtime gift counting down, and under it the hint. */
export function TopCenter() {
  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(76), gap: u(40) }}>
      <GiftTimer />
      <HintBanner />
    </div>
  )
}

export default TopCenter
