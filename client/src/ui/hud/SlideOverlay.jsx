import { useCallback } from 'react'

import { formatDistance, formatNumber } from '@shared/format'

import { setSlideHudElement } from '../../game/slide/hudLink'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

/**
 * "1,050 m" with the zone's name under it, top centre while you slide. Both are written
 * straight to the DOM from the frame loop (see hudLink), never through React.
 */
function DistanceCounter() {
  // A callback ref: registered when the element mounts, cleared when it unmounts.
  const ref = useCallback((el) => setSlideHudElement(el), [])
  return (
    <div ref={ref} className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(90) }}>
      <span className="pp-text" style={{ fontSize: u(110), lineHeight: 1 }}>
        <span data-distance aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(20) }}>
          0 m
        </span>
        <span data-distance className="pp-text-fill" style={{ color: '#ffffff' }}>
          0 m
        </span>
      </span>
      <span className="pp-text" style={{ fontSize: u(58), marginTop: u(10) }}>
        <span data-zone aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(12) }} />
        <span data-zone data-zone-fill className="pp-text-fill" style={{ WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }} />
      </span>
    </div>
  )
}

/** Once you stop: "+123 Wins!" with a trophy, and the distance - NEW BEST! if it was. */
function SlideResult({ result }) {
  return (
    // Centred by the pp-result animation's own transform.
    <div key={result.id} className="pp-result pointer-events-none absolute left-1/2 top-[50%] flex flex-col items-center">
      <div className="flex items-center" style={{ gap: u(14), fontSize: u(100) }}>
        <Icon name="trophy" size={u(140)} />
        <StrokeText stroke={u(18)} gradient={GRADIENTS.gold}>
          +{formatNumber(result.wins)} Wins!
        </StrokeText>
      </div>
      <div style={{ fontSize: u(46) }}>
        <StrokeText stroke={u(10)}>
          {formatDistance(result.distance)}
          {result.best && <span style={{ marginLeft: u(24) }}>NEW BEST!</span>}
        </StrokeText>
      </div>
    </div>
  )
}

export function SlideOverlay() {
  const sliding = useGame((s) => Boolean(s.slide || s.slideResult))
  const result = useGame((s) => s.slideResult)
  return (
    <>
      {sliding && <DistanceCounter />}
      {result && <SlideResult result={result} />}
    </>
  )
}

export default SlideOverlay
