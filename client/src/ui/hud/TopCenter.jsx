import { TUTORIAL } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from './style'

const BANNER_GRADIENT = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 45%, #ffa000 100%)'
const PANEL_GRADIENT = 'linear-gradient(180deg, #ffe45c 0%, #ffc21f 55%, #ff9a12 100%)'

/**
 * The tutorial for brand-new players: train, roll, buy a tire - then it's gone for good.
 * A small strip, "1/3" and the step with its progress ("(16/30)"), so the world stays in
 * view; the 3D arrows (TutorialArrows) show where to go.
 */
function TutorialBanner({ step }) {
  const current = TUTORIAL[step]
  const health = useGame((s) => s.profile.health)
  const onZone = useGame((s) => s.zone.rollZone)
  let text = current.text
  if (current.health) text += ` (${formatNumber(Math.min(health, current.health))}/${formatNumber(current.health)})`
  if (current.event === 'roll' && onZone) text = 'Press ROLL!'
  return (
    <div
      className="flex items-center"
      style={{
        gap: u(14),
        padding: `${u(6)} ${u(22)} ${u(6)} ${u(8)}`,
        borderRadius: u(30),
        border: `${u(4)} solid #111`,
        background: PANEL_GRADIENT,
        boxShadow: `0 ${u(4)} 0 rgba(0,0,0,0.3), inset 0 ${u(4)} 0 rgba(255,255,255,0.45)`,
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ minWidth: u(64), height: u(44), borderRadius: u(22), background: '#111', fontSize: u(26) }}
      >
        <StrokeText stroke={u(5)} gradient={BANNER_GRADIENT}>
          {step + 1}/{TUTORIAL.length}
        </StrokeText>
      </span>
      <span style={{ fontSize: u(34) }}>
        <StrokeText stroke={u(7)} style={{ whiteSpace: 'normal' }}>
          {text}
        </StrokeText>
      </span>
    </div>
  )
}

/**
 * Top centre: the tutorial while there is one, and nothing after it, so the screen
 * belongs to the game. (The playtime gift lives on the left menu: GiftTile.)
 */
export function TopCenter() {
  const step = useGame((s) => s.profile.tutorialStep)
  if (!TUTORIAL[step]) return null
  return (
    <div className="hud-topcenter pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ width: 'max-content', maxWidth: '90vw' }}>
      <TutorialBanner step={step} />
    </div>
  )
}

export default TopCenter
