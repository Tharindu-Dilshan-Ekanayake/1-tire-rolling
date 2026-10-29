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

/**
 * The big green SLIDE! button, shown while standing on the SLIDE ZONE: pressing it (or
 * E / Enter) sends you down the hill. The board hovering in front of you is the hint.
 */
export function SlideButton() {
  const visible = useGame((s) => s.zone.slideZone && !s.slide && !s.slideResult && !s.panel)
  const lastPress = useRef(-Infinity)

  const press = useCallback(() => {
    const now = performance.now()
    if (now - lastPress.current < PRESS_COOLDOWN_MS) return
    lastPress.current = now
    sfx.click()
    actions.slide()
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

  if (!visible) return null
  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(300) }}>
      <Icon name="arrowDown" size={u(80)} className="pp-bounce" style={{ marginBottom: u(8) }} />
      <ChunkyButton gradient={GRADIENTS.greenButton} onClick={press} title="Slide!" radius={26} border={6} className="pp-slide-btn" style={{ width: u(360), height: u(112), gap: u(10) }}>
        <Icon name="slide" size={u(92)} />
        <span style={{ fontSize: u(76) }}>
          <StrokeText stroke={u(14)}>SLIDE!</StrokeText>
        </span>
      </ChunkyButton>
    </div>
  )
}

export default SlideButton
