import { TUTORIAL, ZONES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isMaxLevel, nextTire, rebirthProgress, rollOutcome } from '@shared/logic'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import GiftTimer from './GiftTimer'
import { GRADIENTS, u } from './style'

const BANNER_GRADIENT = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 45%, #ffa000 100%)'
const PANEL_GRADIENT = 'linear-gradient(180deg, #ffe45c 0%, #ffc21f 55%, #ff9a12 100%)'

/**
 * The tutorial, as in the reference: "Tutorial 1/5" over a yellow panel with the step,
 * and its progress where it has one ("(16/30)"). It stays up until the step is done.
 */
function TutorialBanner({ step }) {
  const current = TUTORIAL[step]
  const health = useGame((s) => s.profile.health)
  const onZone = useGame((s) => s.zone.rollZone)
  const progress = useGame((s) => rebirthProgress(s.profile))
  const maxed = useGame((s) => isMaxLevel(s.profile))
  let text = current.text
  if (current.health) text += ` (${formatNumber(Math.min(health, current.health))}/${formatNumber(current.health)})`
  if (current.event === 'roll' && onZone) text = 'Press ROLL!'
  return (
    <div className="flex flex-col items-center">
      <div style={{ fontSize: u(42), marginBottom: u(-12), position: 'relative', zIndex: 1 }}>
        <StrokeText stroke={u(9)} gradient={BANNER_GRADIENT}>
          Tutorial {step + 1}/{TUTORIAL.length}
        </StrokeText>
      </div>
      <div
        style={{
          padding: `${u(12)} ${u(36)}`,
          borderRadius: u(12),
          border: `${u(5)} solid #111`,
          background: PANEL_GRADIENT,
          boxShadow: `0 ${u(6)} 0 rgba(0,0,0,0.35), inset 0 ${u(5)} 0 rgba(255,255,255,0.45)`,
          fontSize: u(50),
        }}
      >
        <StrokeText stroke={u(10)}>{text}</StrokeText>
      </div>
      {current.event === 'rebirth' && (
        <div
          className="relative overflow-hidden"
          style={{ width: u(700), height: u(38), border: `${u(4)} solid #111`, borderRadius: u(19), background: 'rgba(0,0,0,0.45)', marginTop: u(10) }}
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

/** After the tutorial: the best next move, as a short hint. */
function useHint() {
  const maxed = useGame((s) => isMaxLevel(s.profile))
  const tire = useGame((s) => nextTire(s.profile))
  const canBuyTire = useGame((s) => Boolean(tire && s.profile.wins >= tire.cost))
  const blocked = useGame((s) => rollOutcome(s.profile.health).blocked)
  const onZone = useGame((s) => s.zone.rollZone)
  if (onZone) return 'Press ROLL!'
  if (maxed) return 'MAX LEVEL - Rebirth now!'
  if (canBuyTire) return `Buy the ${tire.name} tire!`
  if (blocked > 0) return `Train to ${formatNumber(ZONES[blocked].wall)} Health to smash the ${ZONES[blocked].name} wall!`
  return 'Roll your tire to win more Wins!'
}

/**
 * Each new hint shows for about three seconds and fades (pp-hint), so it's never in the
 * way of playing; keyed on its text, a new one starts it again. Paused while the HUD is
 * out of sight (rolling, a panel open), so a hint is never used up unseen.
 */
function HintBanner() {
  const hint = useHint()
  const hidden = useGame((s) => Boolean(s.roll || s.rollResult) || s.panel !== null)
  return (
    <div key={hint} className="pp-hint" style={{ animationPlayState: hidden ? 'paused' : 'running', fontSize: u(60) }}>
      <StrokeText stroke={u(12)} gradient={BANNER_GRADIENT}>
        {hint}
      </StrokeText>
    </div>
  )
}

/** Top centre: the playtime gift counting down, and under it the tutorial or a hint. */
export function TopCenter() {
  const step = useGame((s) => s.profile.tutorialStep)
  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(76), gap: u(24) }}>
      {TUTORIAL[step] ? <TutorialBanner step={step} /> : <HintBanner />}
      <GiftTimer />
    </div>
  )
}

export default TopCenter
