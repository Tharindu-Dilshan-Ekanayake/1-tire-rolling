import { useCallback, useEffect, useRef } from 'react'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/** A press is ignored this soon after the last, while the authority answers. */
const PRESS_COOLDOWN_MS = 1200
/** With Auto Roll on, the next roll goes this long after you're back on the zone. */
const AUTO_DELAY_MS = 700

/**
 * The big green ROLL! button, shown while standing on the ROLL ZONE: pressing it (or
 * E / Enter) sends your tire down the track. The tire waiting in front of you is the
 * hint. With the Auto Roll pass, a toggle under it rolls for you every time you're
 * back.
 */
export function RollButton() {
  const visible = useGame((s) => s.zone.rollZone && !s.roll && !s.rollResult && !s.panel)
  const ownsAuto = useGame((s) => Boolean(s.profile.passes.autoRoll))
  const autoOn = useGame((s) => Boolean(s.profile.passes.autoRoll && s.profile.settings.autoRoll))
  const lastPress = useRef(-Infinity)

  const press = useCallback(() => {
    const now = performance.now()
    if (now - lastPress.current < PRESS_COOLDOWN_MS) return
    lastPress.current = now
    sfx.click()
    actions.roll()
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    const onKey = (e) => {
      if (e.repeat) return
      if (e.code === 'KeyE' || e.code === 'Enter') press()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, press])

  // Auto Roll: roll again as soon as you're back on the zone.
  useEffect(() => {
    if (!visible || !autoOn) return undefined
    const id = setTimeout(press, AUTO_DELAY_MS)
    return () => clearTimeout(id)
  }, [visible, autoOn, press])

  if (!visible) return null
  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(300) }}>
      <Icon name="arrowDown" size={u(80)} className="pp-bounce" style={{ marginBottom: u(8) }} />
      <ChunkyButton gradient={GRADIENTS.greenButton} onClick={press} title="Roll!" radius={12} border={6} className="pp-roll-btn" style={{ width: u(360), height: u(104), gap: u(10) }}>
        <Icon name="tire" size={u(84)} />
        <span style={{ fontSize: u(76) }}>
          <StrokeText stroke={u(14)}>Roll!</StrokeText>
        </span>
      </ChunkyButton>
      {ownsAuto && (
        <ChunkyButton
          gradient={autoOn ? GRADIENTS.goldButton : GRADIENTS.greyButton}
          onClick={() => actions.setSetting('autoRoll', !autoOn)}
          title="Auto Roll"
          radius={10}
          border={4}
          style={{ height: u(56), padding: `0 ${u(20)}`, marginTop: u(12) }}
        >
          <span style={{ fontSize: u(32) }}>
            <StrokeText stroke={u(7)}>Auto Roll: {autoOn ? 'ON' : 'OFF'}</StrokeText>
          </span>
        </ChunkyButton>
      )}
    </div>
  )
}

export default RollButton
